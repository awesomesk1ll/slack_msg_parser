require('dotenv').config();
const http = require('http');
const fs = require('fs');
const { JSDOM } = require("jsdom");
// const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)
const { Queue, writeData, getRows, setInfo, parseHTML } = require('./utils');
const { send, mapping } = require('./utils/gform');
let IDS = [];
let MSGS, prevMSGS;
const CH = {};
const link_delim = /\/|\?/;
let browser, info_sheet, info, save_process_handle, slack_process_handle;
let launchOptions = { headless: true, args: ['--no-sandbox', "--disable-setuid-sandbox", "--disable-gpu", '--start-maximized'] }; //args: ['--start-maximized']
if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) {
  launchOptions.executablePath = '/usr/bin/chromium';
}

if (!process.env.LOGIN || !process.env.PASSWORD || !process.env.SPREADSHEET_ID || !process.env.GOOGLE_KEY 
  || !process.env.GOOGLE_MAIL || !process.env.MAP_SHEET_NAME || !process.env.CHANNEL_IDS || !process.env.CHANNEL_NAMES) {
  console.error('Please setup parser .env variables.');
  process.exit();
}

const chids = process.env.CHANNEL_IDS.split(" ");
const chnames = process.env.CHANNEL_NAMES.split(" ");
chids.forEach((id, index) => { CH[id] = chnames[index]; });

console.log('Parser started.');

const { LOGIN, PASSWORD: PASS } = process.env;
const GFORM_URL = process.env.GFORM_URL || '';
const SAVE_QUEUE_TIMER = +process.env.SAVE_QUEUE_TIMER || 1050;
const PARSE_TIMER = +process.env.PARSE_TIMER || 1200000;
const g_sheet = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

/**
* Получает данные из таблиц и инициализирует состояние в памяти.
* @async
*/
const init = async () => {
  console.log('// loading client');
  browser = await puppeteer.launch(launchOptions);
  console.log('// table API inits');
  const private_key = process.env.GOOGLE_KEY.replace(/\\n/g, '\n');
  const client_email = process.env.GOOGLE_MAIL;
  await g_sheet.useServiceAccountAuth({ private_key, client_email });
  await g_sheet.loadInfo();
  info_sheet = g_sheet.sheetsByTitle[process.env.INFO_SHEET_NAME];
  info = await getRows(info_sheet);
  console.log('// loaded services info');

  save_process_handle = setInterval(message_queue_handler, SAVE_QUEUE_TIMER);
  slack_process_handle = setInterval(slack_process, PARSE_TIMER);
  slack_process();
};

async function parseSlack () {
  let started = new Date(), finished;
  console.log('started new parse', started.toISOString());
  prevMSGS = MSGS;
  MSGS = { messages: 0 };

  // writeData(`./Slack_${(new Date).getTime()}_started.json`, JSON.stringify([], null, '\t'));
  console.log(CH);
  const channels = Object.keys(CH);
  for (channel of channels) {
    MSGS[CH[channel]] = { messages: 0 };
    data = await parseInfo(channel);
    MSGS.messages += (MSGS[CH[channel]]?.messages || 0);
    console.log('GOT', (MSGS[CH[channel]]?.messages || 0), 'messages in', CH[channel]);
  }

  for (channel in MSGS) { // канал
    if (channel === 'messages') continue;
    for (msg in MSGS[channel]) { // сообщение в канале
      if (msg === 'messages') continue;
      
      // channel messages
      if (!(prevMSGS && prevMSGS[channel] && prevMSGS[channel][msg])) {
        const id = MSGS[channel][msg]["id"];
        // пушим в очередь объект сообщения с оригинальным айди
        if (!info[3]._history.includes(id)) Queue.push({...MSGS[channel][msg]});
      } else if (prevMSGS[channel][msg] && MSGS[channel][msg]?.text !== prevMSGS[channel][msg]?.text) {
        const id = MSGS[channel][msg]["id"];
        // пушим в очередь объект сообщения с суффиксом редактирования
        if (!info[3]._history.includes(id)) Queue.push({...MSGS[channel][msg], id: id + 'e'});
      }

      // threads messages
      if (MSGS[channel][msg].thread) {
        for (message in MSGS[channel][msg].thread) { // сообщение в треде (кроме главного)
          if (!(prevMSGS && prevMSGS[channel] && prevMSGS[channel][msg]?.thread && prevMSGS[channel][msg]?.thread[message])) {
            const id = MSGS[channel][msg]?.thread[message]["id"];
            // пушим в очередь объект сообщения с оригинальным айди
            if (!info[3]._history.includes(id)) Queue.push({...MSGS[channel][msg]?.thread[message]});
          } else if (prevMSGS[channel][msg]?.thread && MSGS[channel][msg].thread[message]?.text !== prevMSGS[channel][msg].thread[message]?.text) {
            const id = MSGS[channel][msg]?.thread[message]["id"];
            // пушим в очередь объект сообщения с суффиксом редактирования
            if (!info[3]._history.includes(id)) Queue.push({...MSGS[channel][msg]?.thread[message], id: id + 'e'});
          }
        }
      }
    }
  }
  finished = new Date();
  console.log('finished parse', MSGS.messages, "messages,", finished.toISOString(), "- elapsed", (finished-started) / 1000, "seconds");
  // writeData(`./Slack_${(new Date).getTime()}.json`, JSON.stringify(MSGS, null, '\t'));
  return true;
}

/**
* Обработчик очереди на сохранение.
*/
const message_queue_handler = () => {
  let message = Queue.shift();
  if (message != undefined && GFORM_URL) {
    let msg = {...message};
    if (msg["id"]) {
      // console.log('msg id is', msg["id"]);
      info[3]._history = [msg["id"], ...info[3]._history];
      if (!Queue.length()) setInfo(info, true);
    }
    if (msg.thread) delete msg.thread;
    send(GFORM_URL, { id: msg["id"], data: JSON.stringify(msg) }, mapping);
  }
}

/**
* Основной воркер парсинга.
*/
const slack_process = async () => {
  if (info[3].status === 'ok') {
    const is_ok = await parseSlack();
    if (is_ok) {
      setInfo(info, true);
    } else {
      setInfo(info, false);
    }
  }
}

function simple_parse(msgElem, threadpost) {
  // https://21born2code.slack.com/archives/C02JZSHHL6A/p1638785091011700
  // https://21born2code.slack.com/archives/C02JZSHHL6A/p1638785456012200?thread_ts=1638785091.011700&cid=C02JZSHHL6A
  const link = msgElem.lastChild.children[1].href;
  const channel = link && link.split(link_delim)[4];
  const epoch = msgElem?.lastChild?.children[1]?.dataset?.ts && msgElem.lastChild.children[1].dataset.ts.split(".")[0];
  const id = link && link.split(link_delim)[5];

  if (!link || !channel || !epoch || !id) return false;

  let target = threadpost ? MSGS[CH[channel]][threadpost].thread : MSGS[CH[channel]];
  if (!target[id] && id !== threadpost) {
    target[id] = {};
    try {
      target[id].channel = channel;
      target[id].id = id;
      target[id].link = link;
      target[id].name = msgElem.lastChild.firstChild.firstChild.textContent;
      target[id].user_id = msgElem.lastChild.firstChild.firstChild.href.split('/').slice(-1)[0];
      target[id].text = msgElem.lastChild.children[3].textContent;
      target[id].html = parseHTML(JSDOM.fragment(msgElem.lastChild.outerHTML));
      target[id].avatar = msgElem.firstChild.firstChild.firstChild.src;
      // console.log('got html', target[id].html);
      if (target[id].html.text === undefined && target[id].html.files === undefined) {
        console.log('error html at', msgElem.lastChild.outerHTML);
      }
      target[id].time = msgElem.lastChild.children[1].textContent;
      target[id].epoch = epoch;
      target[id].thread_id = threadpost;
      MSGS[CH[channel]].messages++;
    } catch (err) {
      target[id].error = err;
      target[id].errorHTML = msgElem.lastChild.outerHTML;
      console.log('error parsing at', msgElem.lastChild.outerHTML);
      console.error(err);
    }
    // console.log('target[id]', target[id]);
  }
  return target[id];
}

async function parse_message(msgElem, page) {
  const { channel, id } = simple_parse(msgElem);
  if (channel && id && !MSGS[CH[channel]][id].thread) {
    let threadElemOpener = await msgElem.querySelector("div:last-child.c-message_kit__thread_replies > a");
    if (threadElemOpener) {
      if (!MSGS[CH[channel]][id].thread) MSGS[CH[channel]][id].thread = {};
      await msgElem.elm.evaluate((el) => {
        el.querySelector("div:last-child.c-message_kit__thread_replies > a").click();
        el.querySelector("div:last-child.c-message_kit__thread_replies > a").click();
      });
      const elem = await page.waitForSelector("div.p-workspace__secondary_view div.c-scrollbar__hider");
      await page.waitForSelector("div.p-workspace__secondary_view div.c-scrollbar__hider div.c-message_kit__gutter__right[data-qa='message_content'] span.c-message__sender a");
      await page.waitForTimeout(3000);
  
      const elem_html = await elem.evaluate((el) => el.innerHTML);
      const frag = JSDOM.fragment(elem_html);
      const data = frag.querySelectorAll("div.c-message_kit__gutter");
      let thread = [...data].map((msg) => simple_parse(msg, id));
  
      let scroll = await elem.evaluate((el) => el.scrollTop);
      // console.log('start scroll', scroll);
      await elem.evaluate((el) => {el.scrollTo(0, 999999);});
  
      while (scroll != await elem.evaluate((el) => el.scrollTop)) {
        await elem.evaluate((el) => {el.scrollTo(0, 999999);});
        await page.waitForTimeout(1300);
        scroll = await elem.evaluate((el) => el.scrollTop);
      }
  
      while (await elem.evaluate((el) => el.scrollTop) > 0) {
        await elem.evaluate((el) => {el.scrollTo(0, -999999);});
        await page.waitForTimeout(3000);
        const elem_html = await elem.evaluate((el) => el.innerHTML);
        const frag = JSDOM.fragment(elem_html);
        const data = frag.querySelectorAll("div.c-message_kit__gutter");
        thread = [...data].map((msg) => simple_parse(msg, id));
      }
  
      page.evaluate(() => {
        const close = document.querySelector("div.p-workspace__secondary_view > div > div > div > div.p-flexpane_header > div > button");
        if (close) close.click();
      })
      await page.waitForTimeout(500);
    }
    MSGS[CH[channel]][id].threadCount = threadElemOpener && +threadElemOpener.textContent?.split(" ")[0];
    MSGS[CH[channel]][id].threadFactCount = MSGS[CH[channel]][id].thread && Object.keys(MSGS[CH[channel]][id].thread).length;
  }
}

async function getRaw(elem, page) {
  const elem_html = await elem.evaluate((el) => el.innerHTML);
  const elements = await page.$$("div.p-workspace__primary_view div.c-message_kit__gutter");
  const datik = [...elements];
  const frag = JSDOM.fragment(elem_html);
  const data = frag.querySelectorAll("div.c-message_kit__gutter");
  const msgs_raw = [...data];
  msgs_raw.forEach((raw, index) => { raw.elm = datik[index]; });
  for (msg of msgs_raw) {
    try {
      await parse_message(msg, page);
    } catch (err) {
      console.log('error occured', err);
    }
  }
}

/**
* Получает информацию по карте, возвращает количество спаршенных кластеров
*/
async function parseInfo (channel) {
  const page = await browser.newPage();
  
  await page.goto(`https://app.slack.com/client/TE6FVDN1Y/${channel}`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const current = await page.url();
  let counter = 0;

  if (current.includes("workspace-signin")) {
    await page.type("input[data-qa='signin_domain_input'", '21born2code'); // {delay: 70}
    page.keyboard.press('Enter');
    await page.waitForNavigation();
    await page.type("input[data-qa='login_email'", LOGIN);
    await page.type("input[data-qa='login_password']", PASS); // {delay: 60}
    page.keyboard.press('Enter');
    await page.waitForNavigation();
  }

  try {
    await page.waitForSelector('span.c-message__sender');   // ("h5[data-test-id='Components.Campus.ListItem.title']");
    await page.waitForTimeout(5000);

    const elem = await page.waitForSelector("div.p-workspace__primary_view div.c-scrollbar__hider");

    await elem.evaluate((el) => {el.scrollTo(0, -999999);});
    await page.waitForTimeout(2000);
    await getRaw(elem, page);

    while (await page.$('div.p-message_pane_banner.p-message_pane_banner--persistent') === null) {
      await elem.evaluate((el) => {el.scrollTo(0, -999999);});
      await page.waitForTimeout(2000);
      await getRaw(elem, page);
    }
  } catch (err) {
    console.log('probably no messages for channel', channel);
  }
  
  await page.waitForTimeout(1000);

  await page.close();
  return counter;
}

init();
// parseHTML();
