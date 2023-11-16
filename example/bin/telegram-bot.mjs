// @ts-check
import { Bot } from "grammy";
import { RecentChanges } from "@sunafterrainwm/mediawiki-recentchange";

import config from "../config.mjs";

/** @typedef {import("@sunafterrainwm/mediawiki-recentchange").RecentChangeEvent.NewEvent|import("@sunafterrainwm/mediawiki-recentchange").RecentChangeEvent.EditEvent} AllowEvent */

const bot = new Bot(config.botToken);
const rc = RecentChanges.fromSite(config.rcApiUrl);

const globalBlackListUsers = config.globalBlackListUsers || [];

class NoNeedEscape {
	/** @type {string} */
	text;

	constructor(/** @type {string} */text) {
		this.text = text;
	}

	toString() {
		return this.text;
	}
}

function escapeHtml(/** @type {string} */text,) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function tEscapeHtml(
	/** @type {readonly string[]} */ rawTexts,
	/** @type {(string | NoNeedEscape | undefined)[]} */ ...escapes
) {
	const copyRawTexts = Array.from(rawTexts);
	const copyEscapes = Array.from(escapes);
	let result = '';
	while (copyEscapes.length > 0) {
		result += copyRawTexts.shift();
		const cur = copyEscapes.shift();
		result += cur instanceof NoNeedEscape ? cur.text : escapeHtml(cur || '');
	}
	return result + copyRawTexts.join('');
}

function makeLink(/** @type {string} */url, /** @type {string|NoNeedEscape} */text = url) {
	return new NoNeedEscape(tEscapeHtml`<a href="${encodeURI(url)}">${text}</a>`);
}

function num2str(/** @type {number} */num) {
	return num === 0 ? '0' : (num > 0 ? '+' + String(num) : String(num));
}

function formatRecentChange(/** @type {AllowEvent} */event) {
	return tEscapeHtml`${event.user} ${event.type === 'new' ? '建立' : '編輯'}了頁面[[${event.title}]]。\n`
		+ tEscapeHtml`連結：[${num2str(event.newlen - event.oldlen)}] ${makeLink(`${config.rcApiUrl.replace(/\/api\.php$/, '/index.php')}?diff=${String(event.revid)}`)}\n`
		+ `標籤：${event.tags.map(v => tEscapeHtml`${v}`).join('、') || '無'}\n`
		+ tEscapeHtml`編輯摘要：${event.comment}`;
}

function sendToTelegram(/** @type {AllowEvent} */event, /** @type {string|number} */dist) {
	bot.api.sendMessage(dist, formatRecentChange(event), {
		parse_mode: 'HTML'
	}).catch(error => {
		console.error(error);
	});
}

rc.addProcessFunction((event) => {
	return event.type === 'edit' && !globalBlackListUsers.includes(event.user)
}, (/** @type {AllowEvent} */ event) => {
	for (const sendFilter of config.sendFilters) {
		if (
			'testFunction' in sendFilter
		) {
			if (sendFilter.testFunction(rc.mwbot, event)) {
				sendToTelegram(event, sendFilter.dist);
			}
		} else {
			if (event.title === sendFilter.page && !(sendFilter.blackListUsers || []).includes(event.user)) {
				sendToTelegram(event, sendFilter.dist);
			}
		}
	}
});
rc.catch((_type, error) => {
	console.error(error);
});
rc.start();
