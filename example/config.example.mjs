// @ts-check
/** @type {import('./config.mjs').default} */
const config = {
	botToken: '12345:abcde',
	rcApiUrl: 'https://zh.wikipedia.org/w/api.php',
	globalBlackListUsers: [
		'BadBot1'
	],
	sendFilters: [
		{
			page: 'Wikipedia:沙盒',
			blackListUsers: [
				'BadBot2'
			],
			dist: -100123456789
		},
		{
			/**
			 * @param {import('mwn').Mwn} mwbot
			 * @param {import('@sunafterrainwm/mediawiki-recentchange').RecentChangeEvent.EditEvent} event
			 */
			testFunction(mwbot, event) {
				return new mwbot.Page(event.title).getNamespaceId() === 2;
			},
			dist: -100234567890
		}
	]
};
export default config;
