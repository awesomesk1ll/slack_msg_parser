/*
Парсинх чата в слаке

Левое окно:
дисплей нейм юзера
[...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")][0].firstChild.firstChild.innerText
айди юзера который написал сообщение
[...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")][0].firstChild.firstChild.href.split('/')[4]
полная ссылка на сообщение
[...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")][0].children[1].href
время сообщения
[...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")][0].children[1].innerText
текст сообщения
[...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")][0].children[3].innerText

кнопка треда (которой может не быть) если есть, у неё класс .c-message__reply_bar
[...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")][0].lastChild
количество ответов (строка)
[...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")][0].lastChild.children[2].innerText.split(" ")[0]
*/

let messages = [];
function parse_message(msgElem) {
	let name = msgElem.firstChild.firstChild.innerText;
	let id = msgElem.firstChild.firstChild.href?.split('/')[4]
	let link = msgElem.children[1].href;
	let text = msgElem.children[3].innerText;
	let time = msgElem.children[1].innerText;
    let epoch = msgElem.children[1].dataset.ts.split(".")[0];
	let threadElemOpener = msgElem.querySelector("div:last-child.c-message_kit__thread_replies > a");
	let threadCounter = threadElemOpener && +threadElemOpener.innerText?.split(" ")[0];
	let msg = {name, id, link, text, time, epoch, time, threadElemOpener, threadCounter};
	return msg;
}
async function enrich_thread(data) {
    if (data.threadElemOpener) {
        console.log('пробуем открыть панельку с тредом');
        data.threadElemOpener.click();
        await new Promise(r => setTimeout(r, 3000));
        console.log('Открыли');
        data.thread = [...document.querySelectorAll(".p-workspace__secondary_view .c-message_kit__gutter__right[data-qa='message_content']")].map(parse_message);
        console.log('Сняли, закрываем тред');
        document.querySelector("button[aria-label='Закрыть правую боковую панель']")?.click();
        await new Promise(r => setTimeout(r, 1000));
    }
    return data;
}
async function parse() {
    const messages = [...document.querySelectorAll("div[role='application'] .c-message_kit__gutter__right[data-qa='message_content']")].map(parse_message);
  
    for (let msg of messages) {
      msg = await enrich_thread(msg);
    }
    console.log(messages);
    return messages;
}
parse();