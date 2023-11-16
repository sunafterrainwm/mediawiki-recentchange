import assert from 'node:assert';

import { type ApiParams, Mwn, type MwnDate } from 'mwn';
import type { ApiQueryRecentChangesParams } from 'types-mediawiki/api_params';

type OneOrMore<T> = T | T[];

export declare type RecentChangeFilter = {
	type?: OneOrMore<'edit' | 'log' | 'categorize' | 'new'>;
	namespace?: OneOrMore<number>;
	title?: string;
	since?: Date | MwnDate | string;
	user?: string;
	tag?: string;
	rcprop?: OneOrMore<
		| 'comment'
		| 'flags'
		| 'ids'
		| 'loginfo'
		| 'oresscores'
		| 'parsedcomment'
		| 'patrolled'
		| 'redirect'
		| 'sha1'
		| 'sizes'
		| 'tags'
		| 'timestamp'
		| 'title'
		| 'user'
		| 'userid'
	>;
	rcshow?: OneOrMore<
		| '!anon'
		| '!autopatrolled'
		| '!bot'
		| '!minor'
		| '!oresreview'
		| '!patrolled'
		| '!redirect'
		| 'anon'
		| 'autopatrolled'
		| 'bot'
		| 'minor'
		| 'oresreview'
		| 'patrolled'
		| 'redirect'
		| 'unpatrolled'
	>;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace RecentChangeEvent {
	interface BaseEvent {
		rcid: number;
		timestamp?: string;

		/** summary */
		comment?: string;
		/** parsed-summary */
		parsedcomment?: string;
	}

	interface UserEvent {
		user: string;
		userid: number;
		bot: boolean;
	}

	interface TitleEvent {
		ns: number;
		title: string;
		pageid: number;
		revid: number;
		old_revid: number;
		oldlen: number;
		newlen: number;
		redirect?: boolean;
		minor?: boolean;
		new?: boolean;
	}

	interface RevisionEvent extends BaseEvent, UserEvent {
		ns: number;
		title: string;
		pageid: number;
		revid: number;
		old_revid: number;
		oldlen: number;
		newlen: number;
		redirect?: boolean;
		minor?: boolean;
		new?: boolean;

		tags: string[];
		sha1?: string;
	}

	interface OresScoresEvent {
		oresscores?: {
			damaging: {
				true: number;
				false: number;
			},
			goodfaith: {
				true: number;
				false: number;
			}
		};
	}

	export interface NewEvent extends RevisionEvent, OresScoresEvent {
		/**
		 * type of event
		 */
		type: 'new';
	}

	export interface EditEvent extends RevisionEvent, OresScoresEvent {
		/**
		 * type of event
		 */
		type: 'edit';

		old_revid: 0;
		oldlen: 0;
	}

	export interface CategorizeEvent extends RevisionEvent {
		/**
		 * type of event
		 */
		type: 'categorize';

		ns: 14;
	}

	export interface LogEvent extends BaseEvent, UserEvent {
		/**
		 * type of event
		 */
		type: 'log';

		logid?: number;
		logtype?: string;
		logaction?: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		logparams: any;
	}
}

export declare type RecentChangeEvent =
	| RecentChangeEvent.NewEvent
	| RecentChangeEvent.EditEvent
	| RecentChangeEvent.CategorizeEvent
	| RecentChangeEvent.LogEvent;

export declare type RCFunction<E, T> = (event: E) => T;
export declare type RCFilterFunction = RCFunction<RecentChangeEvent, boolean>;
export declare type RCProcessFunction<E = RecentChangeEvent> = RCFunction<E, void | PromiseLike<void>>;

export const enum CatchErrorType {
	RequestError,
	CallbackFail
}
export type CatchFunction = (errorType: CatchErrorType, error: Error) => void;

export class RecentChanges {
	private get _params(): ApiParams & ApiQueryRecentChangesParams {
		return Object.assign({
			action: 'query',
			list: 'recentchanges',
			...this._filter
		});
	}

	private _filter: Partial<ApiQueryRecentChangesParams> = {
		rcprop: [
			'comment', 'flags', 'ids', 'loginfo',
			'parsedcomment', 'redirect', 'sha1',
			'sizes', 'tags', 'timestamp', 'title', 'user', 'userid'
		],
		rclimit: 'max'
	};

	private readonly _processor: Map<RCFilterFunction, RCProcessFunction> = new Map();

	private readonly _fired: number[] = [];

	private _startTimestamp?: Date;

	private _abortController?: AbortController;

	private _timeout?: NodeJS.Timeout;

	private _mwbot: Mwn;

	public get mwbot(): Mwn {
		return this._mwbot;
	}

	private _catchFunction: CatchFunction;

	public constructor(mwbot: Mwn) {
		this._mwbot = mwbot;
		this._catchFunction = (_errorType, error) => {
			Promise.reject(error);
		}
	}

	public static fromSite(site: string) {
		const mwbot = new Mwn(site);
		return new this(mwbot);
	}

	public setRequestFilter(filter: RecentChangeFilter) {
		if (filter.type) {
			this._filter.rctype = filter.type;
		} else {
			delete this._filter.rctype;
		}

		if (filter.namespace) {
			this._filter.rcnamespace = filter.namespace;
		} else {
			delete this._filter.rcnamespace;
		}

		if (filter.title) {
			this._filter.rctitle = filter.title;
		} else {
			delete this._filter.rctitle;
		}

		if (filter.since) {
			this._filter.rcstart = new this._mwbot.Date(filter.since).toISOString();
		} else {
			delete this._filter.rcstart;
		}

		if (filter.user) {
			this._filter.rcuser = filter.user;
		} else {
			delete this._filter.rcuser;
		}

		if (filter.tag) {
			this._filter.rctag = filter.tag;
		} else {
			delete this._filter.rctag;
		}

		if (filter.rcprop) {
			this._filter.rcprop = ['timestamp', ...(filter.rcprop instanceof Array ? filter.rcprop : [filter.rcprop])];
			this._filter.rcprop = [...new Set(this._filter.rcprop)];
		} else {
			delete this._filter.rcprop;
		}

		if (filter.rcshow) {
			this._filter.rcshow = filter.rcshow;
		} else {
			delete this._filter.rcshow;
		}
	}

	public addProcessFunction<E extends RecentChangeEvent = RecentChangeEvent>(
		filter: RCFilterFunction,
		func: RCProcessFunction<E>
	) {
		this._processor.set(filter, func as RCProcessFunction);
	}

	public start() {
		if (this._startTimestamp) {
			throw new Error('RecentChanges.start: Already start.');
		}
		this._startTimestamp = new Date();
		this._loop();
		this._abortController = new AbortController();
	}

	public async stop() {
		if (!this._startTimestamp) {
			throw new Error('RecentChanges.stop: Not in startup state.');
		}
		delete this._startTimestamp;
		this._abortController?.abort();
		delete this._abortController;
		if (this._timeout) {
			clearTimeout(this._timeout);
		}
	}

	public catch(func: CatchFunction) {
		this._catchFunction = func;
	}

	private _loop() {
		assert(this._startTimestamp, 'Improper call to RecentChanges._loop: this._startTimestamp == null.');
		assert(this._abortController, 'Improper call to RecentChanges._loop: this._abortController == null.');
		const abortSignal = this._abortController.signal;
		delete this._timeout;
		this._request().catch((error) => {
			this._catchFunction(CatchErrorType.RequestError, error instanceof Error ? error : new Error(String(error)));
		}).finally(() => {
			if (abortSignal.aborted) {
				// killed
				return;
			}
			this._timeout = setTimeout(() => this._loop(), 5000);
		});
	}

	private async _request(): Promise<void> {
		assert(this._startTimestamp, 'Improper call to RecentChanges._request: this._startTimestamp == null.');
		assert(this._abortController, 'Improper call to RecentChanges._request: this._abortController == null.');
		try {
			this._mwbot.Title.checkData();
		} catch (e) {
			await this._mwbot.getSiteInfo();
		}

		let rccontinue: string | null = null;
		let recentchanges: RecentChangeEvent[];

		while (true) {
			[rccontinue, recentchanges] = await this._sendRequest(rccontinue);
			if (recentchanges.length) {
				for (const rc of recentchanges) {
					if (
						this._fired.includes(rc.rcid)
						|| !rc.timestamp
						|| new Date(rc.timestamp) < this._startTimestamp
					) {
						continue;
					}
					this._fired.push(rc.rcid);
					this._fire(rc);
				}
			}
			if (!rccontinue) {
				break;
			}
		}
	}

	private async _sendRequest(rccontinue?: string | null): Promise<[string | null, RecentChangeEvent[]]> {
		assert(this._startTimestamp, 'Improper call to RecentChanges._sendRequest: this._startTimestamp == null.');
		assert(this._abortController, 'Improper call to RecentChanges._sendRequest: this._abortController == null.');
		const reqParams = Object.assign({}, this._params);
		if (rccontinue) {
			reqParams.rccontinue = rccontinue;
		}
		const data = await this._mwbot.request(reqParams, {
			signal: this._abortController.signal
		});

		const continueInfo: {
			continue?: string;
			rccontinue?: string;
		} = data.continue || {};
		const recentchanges: RecentChangeEvent[] = data.query?.recentchanges || [];

		return [continueInfo.rccontinue ?? null, recentchanges];
	}

	private _fire(event: RecentChangeEvent): void {
		try {
			this._processor.forEach((func, filter) => {
				if (filter(event)) {
					let returnValue = func(event);
					if (returnValue && typeof returnValue.then === 'function') {
						new Promise(returnValue.then).catch((error) => {
							this._catchFunction(CatchErrorType.CallbackFail, error instanceof Error ? error : new Error(String(error)));
						});
					}
				}
			});
		} catch (error) {
			this._catchFunction(CatchErrorType.CallbackFail, error instanceof Error ? error : new Error(String(error)));
		}
	}
}
