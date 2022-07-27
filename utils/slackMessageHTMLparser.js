const reg = /\/|\?|\&|\=/;

const formatDLlink = (url) => {
    const parts = url.split(reg);
    const filename = parts[6];
    const file_id = parts[5];
    const workspace = parts[8];
    return `https://files.slack.com/files-pri/${workspace}-${file_id}/download/${filename}`;
}

const getTextRootType = (classes) => {
    const arr = classes ? [...classes] : [];
    if (arr.includes('p-rich_text_section')) return 'section';
    if (arr.includes('p-rich_text_list__bullet')) return 'ul';
    if (arr.includes('p-rich_text_list__ordered')) return 'ol';
    if (arr.includes('c-mrkdwn__quote')) return 'quote';
    if (arr.includes('c-mrkdwn__pre')) return 'pre';
}

const parseTextFormat = (elem) => {
    let res = { type: 'formatted', formats: {}, data: elem.textContent };
    res.formats[elem.tagName.toLowerCase()] = true;
    const first = (elem.childNodes[0]?.constructor?.name === 'HTMLElement') ? elem.childNodes[0] : null;
    const second = (first && first.childNodes[0]?.constructor?.name === 'HTMLElement') ? first.childNodes[0] : null;
    const third = (second && second.childNodes[0]?.constructor?.name === 'HTMLElement') ? second.childNodes[0] : null;
    const last = ((third || second || first || elem)?.childNodes[0]);
    const link = (last?.constructor?.name === 'HTMLAnchorElement') ? last : null;
    if (link) {
        const href = link.href;
        const linkText = link.textContent;
        res.data = `[${linkText}](${href})`;
    }
    [elem, first, second, third].filter((el) => el).forEach((bubble) => {
        res.formats[bubble.tagName.toLowerCase()] = true;
    });
    return res;
}

const parseText = (elem) => {
    const { name } = elem.constructor;
    if (name === 'HTMLBRElement') return { type: 'br' };
    if (name === 'Text') return { type: 'simple', data: elem.textContent };
    if (name === 'HTMLElement') return parseTextFormat(elem);
    if (name === 'HTMLAnchorElement') return {
        type: 'a',
        link: elem.href,
        data: [...elem.childNodes].map(parseText)
    }
    if (name === 'HTMLImageElement') return {
        type: 'img',
        link: elem.src,
        data: elem.alt
    }
    if (name === 'HTMLSpanElement') {
        const spanContent = elem.childNodes[0];
        if (elem.classList.contains('c-message__edited_label')) {
            return { type: 'edited' };
        } else if (elem.classList.contains('c-mrkdwn__broadcast')) {
            return { type: 'broadcast', data: elem.textContent };
        } else if (elem.classList.contains('c-mrkdwn__br')) {
            return { type: 'br2' };
        } else if (elem.classList.contains('c-emoji')) {
            return parseText(spanContent);
        } else if (elem.classList.contains('c-link')) {
            return parseText(spanContent);
        } else if (spanContent && spanContent.classList && spanContent.classList.contains('c-link')) {
            return parseText(spanContent);
        } else if (elem.outerHTML.includes('(opens in new tab)') || elem.outerHTML.includes('(открывается в новой вкладке)')){
            return { type: 'empty' };
        } else if (spanContent) {
            return parseText(spanContent);
        } else {
            console.log('span element', elem.outerHTML);
            console.log('spanContent', spanContent, elem.classList.contains('c-message__edited_label'));
            console.error('unknown span content', spanContent);
            throw new Error('unknown span content');
        }
    }
    if (name === 'HTMLLIElement') return {
        type: 'li',
        data: [...elem.childNodes].map(parseText)
    }
    if (name === 'HTMLPreElement') return {
        type: 'pre',
        data: elem.textContent
    }
}

const parseHTML = (frag) => {
    let text;
    let files;
    let attachment;

    // text data
    let textData = frag.querySelector('div.c-message_kit__blocks--rich_text');
    let systemData = frag.querySelector('span.c-message__body--automated');
    let systemData2 = frag.querySelector('span.c-message_kit__text');

    if (textData) {
        const data = textData.querySelector('div.p-rich_text_block');
        if (data) {
            text = [...data.childNodes].map((node) => {
            const type = getTextRootType(node.classList)
            const data = [...node.childNodes].map((content) => {
                // console.log('elem', content.outerHTML);
                let parsed = parseText(content);
                // console.log('parsed', parsed);
                return parsed;
            });
            if (type === undefined) {
                console.log('unknown type');
                console.log(node.outerHTML);
                console.log('data', data);
            }
            return {type, data};
            });
        }
    } else if (systemData) {
        text = [{ type: 'system', data: systemData.textContent }];
    } else if (systemData2) {
        text = [{ type: 'system2', data: [...systemData2.childNodes].map(parseText) }];
    }

    // files
    let filesData = frag.querySelector('div.c-files_container');
    if (filesData) {
        files = {};
        let imagesContent = [...filesData.querySelectorAll('a.c-link.p-file_image_thumbnail__wrapper')].map((img) => ({
            mini: img.href,
            full: img.querySelector('img.p-file_image_thumbnail__image').src
        }));

        let filesContent = [...filesData.querySelectorAll('a.c-pillow_file__header--fsfv')].map((file) => ({
            org: file.href,
            dl: formatDLlink(file.href),
            title: file.querySelector('span.c-pillow_file__title').textContent
        }));

        let attachmentContent = [...frag.querySelectorAll('div.c-message_attachment__row span[data-qa="attachment-footer-permalink"] > a')].map((attachmentLink) => ({
            link: attachmentLink.href
        }));

        let pillowsContent = [...filesData.querySelectorAll('div.c-pillow_file_container')].map((pillow) => {
            const title = pillow.querySelector("div.c-pillow_file__description > span") || pillow.querySelector("span.c-message_kit__file__meta__text > span");
            let result;
            if (title) result = {
                title: title.textContent,
                link: pillow.querySelector("div.c-file__actions > a").href
            }
            return result;
        }).filter((file) => file);

        if (imagesContent.length) files.images = imagesContent;
        if (filesContent.length) files.docs = filesContent;
        if (attachmentContent.length) files.attachments = attachmentContent;
        if (pillowsContent.length) files.pillows = pillowsContent;

        if (files.images == undefined && files.docs == undefined && files.attachments == undefined && files.pillows == undefined) {
            console.log('undefined files', filesData.outerHTML, frag.innerHTML);
            files = undefined;
        }
    }

// console.log('frag', frag);
return { text, files };
}

module.exports = parseHTML;