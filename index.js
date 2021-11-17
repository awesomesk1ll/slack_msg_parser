require('dotenv').config();
const http = require('http');
// const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)
const { CLUSTERS, Queue, get_headers, format, getRows, setInfo } = require('./utils');
const { clearInterval } = require('timers');
const { lastIndexOf } = require('./utils/clusters');
let CAMPUS;
let browser, map_sheet, map, info_sheet, info, save_process_handle, map_process_handle, events, log_counter;
let launchOptions = { headless: true, args: ['--no-sandbox', "--disable-setuid-sandbox", "--disable-gpu", '--start-maximized'] }; //args: ['--start-maximized']
if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) {
  launchOptions.executablePath = '/usr/bin/chromium';
}

if (!process.env.LOGIN || !process.env.PASSWORD || !process.env.SPREADSHEET_ID || !process.env.GOOGLE_KEY || !process.env.GOOGLE_MAIL || !process.env.MAP_SHEET_NAME) {
  console.error('Please setup map parser .env variables.');
  process.exit();
}

console.log('Parser started.');

const { LOGIN, PASSWORD: PASS } = process.env;
const SAVE_QUEUE_TIMER = +process.env.SAVE_QUEUE_TIMER || 1050;
const PARSE_TIMER = +process.env.PARSE_TIMER || 60000;
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
  map_sheet = g_sheet.sheetsByTitle[process.env.MAP_SHEET_NAME];
  map = await getRows(map_sheet);
  console.log('// loaded map info');
  info_sheet = g_sheet.sheetsByTitle[process.env.INFO_SHEET_NAME];
  info = await getRows(info_sheet);
  console.log('// loaded services info');

  save_process_handle = setInterval(users_save_queue_handler, SAVE_QUEUE_TIMER);
  map_process_handle = setInterval(map_process, PARSE_TIMER);
  map_process();
};

/**
* Обработчик очереди на сохранение.
*/
const users_save_queue_handler = () => {
  let index = Queue.shift();
  if (index != undefined) {
    if (map[index]?._history?.length) {
      map[index].history = JSON.stringify(map[index]._history);
    }
    map[index].save();
  }
}

/**
* Функция обновления юзера на карте, если требуется
*/
const mapRowUpdate = (user, index) => {
  let historyObj;
  if (user.place) {
    if (!CAMPUS[user.nick]) {  // юзер разлогинился
      historyObj = { seat: user.place, from: +user.changed, to: (new Date).getTime() };
      user.place = '';
      user.changed = historyObj.to;
      user.last_uptime = historyObj.to - historyObj.from;
      user._history = [historyObj, ...user._history];
      Queue.push(index);
    } else if (user.place !== CAMPUS[user.nick].seat) {  // юзер пересел за другую тачку
      historyObj = { seat: user.place, from: +user.changed, to: (new Date).getTime() - 5000 };
      user.exp = CAMPUS[user.nick].exp;
      user.level = CAMPUS[user.nick].level;
      user.place = CAMPUS[user.nick].seat;
      user.changed = historyObj.to + 5000;
      user.last_uptime = historyObj.to - historyObj.from;
      user._history = [historyObj, ...user._history];
      Queue.push(index);
    }
  } else {
    if (CAMPUS[user.nick]) {  // залогинился
      user.exp = CAMPUS[user.nick].exp;
      user.level = CAMPUS[user.nick].level;
      user.place = CAMPUS[user.nick].seat;
      user.changed = +(new Date).getTime();
      Queue.push(index);
    }
  }
}

/**
* Основной воркер парсинга.
*/
const map_process = async () => {
  let got_clusters_count;
  if (info[1].status === 'ok') {
    got_clusters_count = await getMapInfo('https://edu.21-school.ru/calendar/events');

    if (log_counter) {
      log_counter--;
    } else {
      console.log('got clusters', got_clusters_count, 'peers', Object.keys(CAMPUS).length);
      console.log('IN_CAMPUS', CAMPUS);
      log_counter = 15;
    }

    if (got_clusters_count === 9) {
      map.forEach(mapRowUpdate);
      setInfo(info, true, events);
    } else {
      setInfo(info, false, events);
    }
  }
}

/**
* Получает содержимое элемента по селектору и форматирует его, если нужно
*/
async function getData(page, selector, format) {
  const element = await page.waitForSelector(selector);
  const value = await element.evaluate(el => el.textContent);
  // console.log("returning value", value);
  return format ? format(value) : value;
}

/**
* Получает информацию по карте, возвращает количество спаршенных кластеров
*/
async function getMapInfo (url) {
  const page = await browser.newPage();
  
  await page.goto(url);

  const current = await page.url();
  let counter = 0;

  if (current.includes("https://auth.sberclass.ru/auth/realms/")) {
    await page.type("input[name='username']", LOGIN); // {delay: 70}
    await page.type("input[name='password']", PASS); // {delay: 60}
    page.keyboard.press('Enter');
    await page.waitForNavigation();
  }

  await page.waitForSelector('footer');   // ("h5[data-test-id='Components.Campus.ListItem.title']");

  try {
    events = await getData(page, 'h5');
  } catch (err) {
    events = 'fail';
  }

  await Promise.all(CLUSTERS.map(async (cluster) => {
    const evalVar = get_headers(cluster.id);
    try {
      cluster.students = await page.evaluate((evalVar) => {
        console.log('v', evalVar);
        return fetch("https://edu.21-school.ru/services/graphql", evalVar)
                .then(res => res.json())
                .then(answer => answer?.data?.student?.getClusterPlanStudentsByClusterId?.occupiedPlaces);
      }, evalVar);
    } catch (err) {
      console.error(err);
      return false;
    }
  }));

  CAMPUS = {};

  CLUSTERS.forEach(cluster => {
    if (Array.isArray(cluster.students)) {
      // cluster.students.forEach(stud => {
      //   console.log('stud', stud);
      // });
      cluster.students = cluster.students.map((student) => format(cluster.code, student));
      counter++;
      cluster.students.forEach((student) => {
        CAMPUS[student.nick] = student;
      });
    }
    // console.log('students in', cluster.code, '\n', cluster.students);
  });

  await page.close();
  return counter;
}

init()
