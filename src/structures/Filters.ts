import { FilterData } from "@lavaclient/types";
import { Player } from "./Player";

export default class Filters {
	/**
	 * The default filters
	 */
	public defaults = defaults;
	/**
	 * The enabled filter object
	 */
	public enabledValue: Partial<FilterData> | null = null;
	/**
	 * The enabled filter name
	 */
	public enabledKey: keyof typeof defaults | "custom" | null = null;

	constructor(public player: Player) {}

	/**
	 * Applies the filter
	 * @param filter
	 * @param priority
	 */
	public apply(filter: Filter, priority = false): this {
		this.enabledValue = typeof filter === "string" ? this.defaults[filter] : filter;
		this.enabledKey = typeof filter === "string" ? filter : filter === null ? null : "custom";

		this.player.socket.send({
			priority,
			data: {
				op: "filters",
				guildId: this.player.guild,
				...this.enabledValue,
			},
		});

		return this;
	}
}

type Filter = keyof typeof defaults | Partial<FilterData> | null;

const defaultBassboosts = {
	bassboostLow: {
		equalizer: Array(6)
			.fill(null)
			.map((_, i) => ({ band: i++, gain: 0.06 })),
	},
	bassboostMedium: {
		equalizer: Array(6)
			.fill(null)
			.map((_, i) => ({ band: i++, gain: 0.09 })),
	},
	bassboostHard: {
		equalizer: Array(6)
			.fill(null)
			.map((_, i) => ({ band: i++, gain: 0.14 })),
	},
	bassboostExtreme: {
		equalizer: Array(6)
			.fill(null)
			.map((_, i) => ({ band: i++, gain: 0.2 })),
	},
};

const defaultFilters = {
	timescale: {
		timescale: {
			rate: 1,
			speed: 1,
			pitch: 1,
		},
	},
	karaoke: {
		karaoke: {
			level: 1,
			monoLevel: 1,
			filterBand: 220,
			filterWidth: 100,
		},
	},
	tremolo: {
		tremolo: {
			depth: 0.5,
			frequency: 2,
		},
	},
	pop: {
		equalizer: [
			{ band: 0, gain: 0.65 },
			{ band: 1, gain: 0.45 },
			{ band: 2, gain: -0.45 },
			{ band: 3, gain: -0.65 },
			{ band: 4, gain: -0.35 },
			{ band: 5, gain: 0.45 },
			{ band: 6, gain: 0.55 },
			{ band: 7, gain: 0.6 },
			{ band: 8, gain: 0.6 },
			{ band: 9, gain: 0.6 },
			{ band: 10, gain: 0 },
			{ band: 11, gain: 0 },
			{ band: 12, gain: 0 },
			{ band: 13, gain: 0 },
		],
	},
	eightD: {
		rotation: {
			rotationHz: 0.2,
		},
	},
	slowed: {
		equalizer: [
			{ band: 1, gain: 0.3 },
			{ band: 0, gain: 0.3 },
		],
		timescale: { pitch: 1.1, rate: 0.8 },
		tremolo: { depth: 0.3, frequency: 14 },
	},
	vaporwave: {
		equalizer: [
			{ band: 1, gain: 0.3 },
			{ band: 0, gain: 0.3 },
		],
		timescale: { pitch: 0.5 },
		tremolo: { depth: 0.3, frequency: 14 },
	},
	nightcore: {
		equalizer: [
			{ band: 1, gain: 0.1 },
			{ band: 0, gain: 0.1 },
		],
		timescale: { pitch: 1.2, speed: 1.1 },
		tremolo: { depth: 0.3, frequency: 14 },
	},
	soft: {
		equalizer: [
			{ band: 0, gain: 0 },
			{ band: 1, gain: 0 },
			{ band: 2, gain: 0 },
			{ band: 3, gain: 0 },
			{ band: 4, gain: 0 },
			{ band: 5, gain: 0 },
			{ band: 6, gain: 0 },
			{ band: 7, gain: 0 },
			{ band: 8, gain: -0.25 },
			{ band: 9, gain: -0.25 },
			{ band: 10, gain: -0.25 },
			{ band: 11, gain: -0.25 },
			{ band: 12, gain: -0.25 },
			{ band: 13, gain: -0.25 },
		],
	},
};

const defaults = { ...defaultFilters, ...defaultBassboosts };
