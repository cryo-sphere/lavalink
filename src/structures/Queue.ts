import { Player } from "./Player";
import Track, { LoadedTrack } from "./Track";

/**
 * The player's queue, the `current` property is the track playing the guild
 */
export class Queue {
	/** The current playing track */
	public current: LoadedTrack | null = null;
	/** The list of tracks that have not been played yet */
	public next: Track[] = [];
	/** The list of tracks that have been played */
	public previous: Track[] = [];
	/** whether the queue should loop the queue or not */
	public repeatQueue = false;
	/** whether the queue should loop the song or not */
	public repeatSong = false;

	constructor(public player: Player) {}

	/**
	 * sets repeatSong to false or true
	 * @param boolean defaults to the opposite of this.repeatSong
	 */
	public setRepeatSong(boolean = !this.repeatSong): void {
		if (boolean) {
			this.repeatSong = true;
			this.repeatQueue = false;
			return;
		}

		this.repeatSong = boolean;
	}

	/**
	 * sets repeatQueue to false or true
	 * @param boolean defaults to the opposite of this.repeatQueue
	 */
	public setRepeatQueue(boolean = !this.repeatQueue): void {
		if (boolean) {
			this.repeatSong = false;
			this.repeatQueue = true;
			return;
		}

		this.repeatQueue = boolean;
	}

	/**
	 * Starts playing a new track in the queue
	 * @param toPrevious
	 */
	public nextSong(toPrevious = true): void {
		if (this.repeatSong && this.current) {
			this.player.play();
			return;
		}

		if (this.repeatQueue && this.current) {
			if (toPrevious) this.next.push(this.current as Track);
			this.current = (this.next.shift() as LoadedTrack) ?? null;
			this.player.play();
			return;
		}

		if (!this.next.length) {
			this.reset();
			this.player.manager.emit("queueEmpty", this.player);
			return;
		}

		if (this.current && toPrevious) this.previous.push(this.current);
		this.current = (this.next.shift() as LoadedTrack) ?? null;
		this.player.play();
	}

	/**
	 * Adds track(s) to the queue
	 * @param offset
	 * @param tracks
	 */
	public add(offset: number, ...tracks: Track[]): void;

	/**
	 * Adds track(s) to the queue
	 * @param tracks
	 */
	public add(...tracks: (Track | number)[]): void {
		if (typeof tracks[0] === "number") {
			const offset = tracks.shift() as number;
			const valid: Track[] = [];

			for (const track of tracks) {
				if (!(track instanceof Track))
					throw new RangeError(`tracks[${tracks.indexOf(track)}] is not an instance of Track`);
				valid.push(track);
			}

			this.next.splice(offset, 0, ...valid);
			return;
		}

		for (const track of tracks) {
			if (!(track instanceof Track))
				throw new RangeError(`tracks[${tracks.indexOf(track)}] is not an instance of Track`);
			this.next.push(track);
		}

		if (!this.current) this.current = (this.next.shift() as LoadedTrack) ?? null;
	}

	/**
	 * Removes a track from the next array, returns the removed track
	 * @param position defaults to 0
	 */
	public remove(position?: number): Track[];
	/**
	 * Removes an amount of tracks from the next array, return the removed tracks
	 * @param from
	 * @param to
	 */
	public remove(from: number, to: number): Track[];
	public remove(from = 0, to?: number): Track[] {
		if (typeof to !== "undefined") {
			if (isNaN(Number(from))) throw new RangeError("Invalid `from` parameter provided");
			else if (isNaN(Number(to))) throw new RangeError("Invalid `to` parameter provided");
			else if (from >= to) throw new RangeError("`From` can not be bigger than to.");
			else if (from >= this.next.length)
				throw new RangeError(`\`From\` can not be bigger than ${this.next.length}.`);

			return this.next.splice(from, to - from);
		}

		return this.next.splice(from, 1);
	}

	/** Gets the total duration of the queue */
	public get duration(): number {
		const current = this.current?.duration ?? 0;
		return this.next.reduce((acc: number, cur: Track) => acc + (cur.duration ?? 0), current);
	}

	/** Gets the total length of the queue */
	public get totalSize(): number {
		return this.next.length + (this.current ? 1 : 0);
	}

	/** Gets the total length of the tracks in the next array */
	public get size(): number {
		return this.next.length;
	}

	/** Resets the queue */
	public reset(): void {
		this.current = null;
		this.next = [];
		this.previous = [];
	}

	/** Shuffles the songs in the queue */
	public shuffle() {
		for (let i = this.next.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.next[i], this.next[j]] = [this.next[j], this.next[i]];
		}
	}
}
