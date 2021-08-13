/* eslint-disable no-useless-escape */
import { Track as LavalinkTrack } from "@lavaclient/types";
import { LoadedTrack, Track } from "./Track";
import { Structure } from "../Structure";

/** The Utils class is a toolbox full of useful functions */
export abstract class Utils {
	/**
	 * Converts the input to a YT Time string (ex: 10:30).
	 *
	 * @param {Number} input
	 * @return {String}
	 */
	static convert(input: number): string;
	/**
	 * Converts a YT Time string (ex: 10:30) to ms.
	 *
	 * @param {String} input
	 * @return {Number}
	 */
	static convert(input: string): number;
	static convert(input: unknown): unknown {
		const s = 1e3;
		const m = s * 60;
		const h = m * 60;

		if (typeof input === "string") {
			const numbers = input.split(/:/g);
			if (
				typeof Number(numbers[0]) !== "number" ||
				typeof Number(numbers[1]) !== "number" ||
				typeof Number(numbers[2]) !== "number"
			)
				throw new TypeError(`expected yt string input (ex: 10:30) but received ${input}`);

			switch (numbers.length) {
				case 2: {
					const minutes = Number(numbers[0]) * m;
					const seconds = Number(numbers[1]) * s;
					return minutes + seconds;
				}
				case 3: {
					const hours = Number(numbers[0]) * h;
					const minutes = Number(numbers[1]) * m;
					const seconds = Number(numbers[2]) * s;
					return hours + minutes + seconds;
				}
				default:
					return null;
			}
		} else if (typeof input === "number") {
			const hours = Math.floor((input / h) % 60);
			const minutes = Math.floor(input / m - hours * 60);
			const seconds = ((input % m) / s).toFixed(0);

			return `${hours ? `${hours}:` : ""}${minutes.toString().padStart(2, "0")}:${seconds
				.toString()
				.padStart(2, "0")}`;
		}

		throw new TypeError(`Expected string | number, received ${typeof input}`);
	}

	/**
	 * Checks if the provided parameter is a valid url
	 * @param uri
	 */
	static isValidUri(uri: string): boolean {
		return /^https?:\/\//.test(uri);
	}

	/**
	 * Builds the track from lavalink track data
	 * @param track
	 * @param requester
	 */
	static buildTrack(track: LavalinkTrack, requester: string): Track {
		const options: Partial<LoadedTrack> = {
			requester,
			...track.info,
			track: track.track,
		};

		return new (Structure.get("Track"))(options);
	}
}

/* -- Interfaces -- */
export type PlayerEvents =
	| TrackStartEvent
	| TrackEndEvent
	| TrackStuckEvent
	| TrackExceptionEvent
	| WebSocketClosedEvent;

export type PlayerEventType =
	| "TrackStartEvent"
	| "TrackEndEvent"
	| "TrackExceptionEvent"
	| "TrackStuckEvent"
	| "WebSocketClosedEvent";

export type TrackEndReason = "FINISHED" | "LOAD_FAILED" | "STOPPED" | "REPLACED" | "CLEANUP";

export type Severity = "COMMON" | "SUSPICIOUS" | "FAULT";

export interface PlayerEvent {
	op: "event";
	type: PlayerEventType;
	guildId: string;
}

export interface Exception {
	severity: Severity;
	message: string;
	cause: string;
}

export interface TrackStartEvent extends PlayerEvent {
	type: "TrackStartEvent";
	track: string;
}

export interface TrackEndEvent extends PlayerEvent {
	type: "TrackEndEvent";
	track: string;
	reason: TrackEndReason;
}

export interface TrackExceptionEvent extends PlayerEvent {
	type: "TrackExceptionEvent";
	exception?: Exception;
	error: string;
}

export interface TrackStuckEvent extends PlayerEvent {
	type: "TrackStuckEvent";
	thresholdMs: number;
}

export interface WebSocketClosedEvent extends PlayerEvent {
	type: "WebSocketClosedEvent";
	code: number;
	byRemote: boolean;
	reason: string;
}
