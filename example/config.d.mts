import { Mwn } from "mwn";
import { RecentChangeEvent } from "@sunafterrainwm/mediawiki-recentchange";

interface Config {
	botToken: string;
	rcApiUrl: string;
	globalBlackListUsers?: string[];
	sendFilters: (({
		page: string;
		blackListUsers?: string[];
	} | {
		testFunction(mwbot: Mwn, event: RecentChangeEvent.NewEvent | RecentChangeEvent.EditEvent): boolean;
	}) & {
		dist: string | number;
	})[]
}

const config: Config;
export default config;
