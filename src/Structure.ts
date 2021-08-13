import Filters from "./structures/Filters";
import { Player } from "./structures/Player";
import { Queue } from "./structures/Queue";
import { Socket } from "./structures/Socket";
import Track from "./structures/Track";

/** Gets or extends structures to extend the built in, or already extended, classes to add more functionality. */
export abstract class Structure {
	/**
	 * Extends a class.
	 * @param name
	 * @param extender
	 */
	public static extend<K extends keyof Extendable, T extends Extendable[K]>(
		name: K,
		extender: (target: Extendable[K]) => T
	): T {
		if (!structures[name]) throw new TypeError(`"${name}" is not a valid structure`);
		const extended = extender(structures[name]);
		structures[name] = extended;
		return extended;
	}

	/**
	 * Get a structure from available structures by name.
	 * @param name
	 */
	public static get<K extends keyof Extendable>(name: K): Extendable[K] {
		const structure = structures[name];
		if (!structure) throw new TypeError('"structure" must be provided.');
		return structure;
	}
}

const structures = {
	Socket,
	Queue,
	Track,
	Player,
	Filters,
};

export interface Extendable {
	Socket: typeof Socket;
	Queue: typeof Queue;
	Track: typeof Track;
	Player: typeof Player;
	Filters: typeof Filters;
}
