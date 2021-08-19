import { Structure } from "../Structure";
import { Filters } from "./Filters";
import { Manager, SearchResult } from "./Manager";
import { Queue } from "./Queue";
import { Socket } from "./Socket";
import { LoadedTrack } from "./Track";
import { Utils } from "./Utils";

export class Player {
	/** The queue for this player */
	public queue: Queue;
	/** The filters manager */
	public filters: Filters;
	/** The time the player is in the track */
	public position = 0;
	/** Whether the player is playing */
	public playing = false;
	/** Whether the player is paused */
	public paused = false;
	/** Whether the player is playing */
	public volume: number;
	/** The guild the player */
	public guild: string;
	/** The channels for the player. */
	public channels = {
		text: null as null | string,
		voice: null as null | string,
	};
	/** The voice options for the player */
	public voiceOptions: VoiceOptions;
	/** If the player is connected or not. */
	public connected: boolean;
	/** The equalizer bands array. */
	public bands = new Array<number>(15).fill(0.0);
	/** The voice state object from Discord. */
	public voiceState: VoiceState = Object.assign({});

	constructor(
		public manager: Manager,
		public socket: Socket,
		{
			voiceOptions,
			guild,
			volume,
		}: { voiceOptions?: Partial<VoiceOptions>; guild: string; volume?: number }
	) {
		if (volume && (typeof volume !== "number" || volume < 1 || volume > 1000))
			this.error("constructor", "volume must be between 1 and 1000");
		if (typeof guild !== "string" || !guild.length)
			this.error("constructor", "guild must be a non-empty strign");

		if (voiceOptions) {
			if (typeof voiceOptions.deafened !== "boolean")
				this.error("constructor", "voiceOptions.deafened must be boolean");
			if (typeof voiceOptions.muted !== "boolean")
				this.error("constructor", "voiceOptions.muted must be boolean");
		}

		this.volume = volume ?? 100;
		this.guild = guild;
		this.connected = false;
		this.voiceOptions = { deafened: true, muted: false, ...voiceOptions };

		this.queue = new (Structure.get("Queue"))(this);
		this.filters = new (Structure.get("Filters"))(this);

		this.manager.emit("playerCreate", this);
	}

	/** Starts the queue
	 * @param options
	 */
	public async play(options?: PlayOptions): Promise<void> {
		if (!this.queue.current) return;
		if (!this.queue.current.track) {
			const boolean = await this.queue.current.resolve(this.manager);
			if (!boolean) return this.queue.nextSong();
		}

		if (options) {
			if (typeof options.noReplace !== "boolean")
				return this.error("play", "options.noReplace is not a boolean");
			if (typeof options.endTime !== "number")
				return this.error("play", "options.endTime is not a number");
			if (typeof options.startTime !== "number")
				return this.error("play", "options.startTime is not a number");
		}

		if (this.manager.options.playTimeout)
			setTimeout(
				() =>
					this.socket.send({
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						data: { op: "play", guildId: this.guild, track: this.queue.current!.track, ...options },
					}),
				this.manager.options.playTimeout
			);
		else
			this.socket.send({
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				data: { op: "play", guildId: this.guild, track: this.queue.current!.track, ...options },
			});
	}

	/**
	 * Searches with the enabled sources for the query
	 * @param query
	 * @param requester
	 * @param type
	 */
	public search(query: string, requester: string, type?: "sc" | "yt"): Promise<SearchResult> {
		return this.manager.search(query, requester, type);
	}

	/**
	 * Changes the player volume
	 * @param volume
	 */
	public setVolume(volume: number): this {
		if (typeof volume !== "number" || volume > 1000 || volume < 1)
			this.error("id", "volume must be between 1 and 1000");

		this.socket.send({ data: { op: "volume", guildId: this.guild, volume } });
		return this;
	}

	/**
	 * Stops the player
	 */
	public stop(): this {
		this.socket.send({ data: { op: "stop", guildId: this.guild } });
		this.playing = false;
		return this;
	}

	/**
	 * skips an amount of tracks
	 * @param amount default = 1
	 */
	public skip(amount = 1): this {
		if (typeof amount !== "number") this.error("skip", "amount is not a number");
		if (!this.queue.current) return this;
		if (this.queue.repeatSong) return this.seek(0);

		this.stop();
		if (amount === 1) {
			this.queue.nextSong();
			return this;
		}

		if (!this.queue.repeatQueue && amount > this.queue.size) {
			this.queue.reset();
			this.manager.emit("queueEmpty", this);
			return this;
		}

		this.queue[this.queue.repeatQueue ? "next" : "previous"].push(this.queue.current);
		this.queue[this.queue.repeatQueue ? "next" : "previous"].push(
			...this.queue.next.splice(0, amount - 1)
		);

		this.queue.current = this.queue.next.shift() as LoadedTrack;
		this.play();

		return this;
	}

	/** Pauses the player
	 * @param pause defaults to the opposite of this.paused
	 */
	public pause(pause = !this.paused): this {
		if (this.paused === pause) return this;

		this.socket.send({ data: { op: "pause", guildId: this.guild, pause } });
		if (pause) {
			this.paused = true;
			this.playing = false;
		} else {
			this.paused = false;
			this.playing = true;
		}

		return this;
	}

	/** Seeks to the given position in the current track
	 * @param position
	 */
	public seek(position: number): this;
	/** Converts a YT time string (ex: 10:30) to a number and seeks to the given position in the current track
	 * @param input
	 */
	public seek(input: string): this;
	public seek(input: string | number): this {
		if (!this.queue.current) return this;

		let parsed = typeof input === "number" ? input : Utils.convert(input);
		if (parsed < 0) parsed = 0;

		this.position = parsed;
		this.socket.send({
			data: {
				op: "seek",
				guildId: this.guild,
				position: parsed,
			},
		});

		return this;
	}

	/** Disconnects from the voice channel */
	public disconnect(): void {
		if (!this.channels.voice) return;

		this.manager.options.send(this.guild, {
			op: 4,
			d: {
				channel_id: null,
				guild_id: this.guild,
				self_deaf: false,
				self_mute: false,
			},
		});

		this.channels.voice = null;
		this.connected = false;
		this.pause(true);
	}

	/** Connects to the voice channel */
	public connect(): void {
		if (typeof this.channels.voice !== "string" || !this.channels.voice.length)
			this.error("connect", "No valid voiceChannel set");

		this.manager.options.send(this.guild, {
			op: 4,
			d: {
				channel_id: this.channels.voice,
				guild_id: this.guild,
				self_deaf: this.voiceOptions.deafened,
				self_mute: this.voiceOptions.muted,
			},
		});

		this.connected = true;
	}

	/** Destroys the player */
	public destroy(): void {
		this.disconnect();

		this.socket.send({ priority: true, data: { op: "destroy", guildId: this.guild } });

		this.manager.emit("playerDestroy", this);
		this.manager.players.delete(this.guild);
	}

	/** Sets the player voice channel
	 * @param id
	 */
	public setVoice(id: string): this {
		this.channels.voice = id;
		return this;
	}

	/** Sets the player text channel
	 * @param id
	 */
	public setText(id: string): this {
		this.channels.text = id;
		return this;
	}

	private error(id: string, message: string): void {
		throw new Error(`${this.guild} => ${id}(): ${message}`);
	}
}

/* -- Interfaces -- */
export interface PlayOptions {
	/** The position to start playing. */
	readonly startTime?: number;
	/** The position to stop playing. */
	readonly endTime?: number;
	/** Whether to not replace the track if a play payload is sent. */
	readonly noReplace?: boolean;
}

export interface VoiceOptions {
	deafened: boolean;
	muted: boolean;
}

export interface VoiceState {
	op: "voiceUpdate";
	guildId: string;
	event: VoiceEvent;
	sessionId: string;
}

export interface VoiceEvent {
	token: string;
	guild_id: string;
	endpoint: string;
}
