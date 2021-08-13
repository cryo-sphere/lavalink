import { Socket, SocketOptions } from "./Socket";
import { EventEmitter } from "stream";
import { Plugin } from "./Plugin";
import { Structure } from "../Structure";
import WebSocket from "ws";
import { Player, VoiceOptions } from "./Player";
import { Track } from "./Track";
import {
	TrackStartEvent,
	SearchResult as LavalinkSearchResult,
	TrackExceptionEvent,
	WebSocketClosedEvent,
} from "@lavaclient/types";
import { Utils } from "./Utils";

/** The Manager is the main class for interacting with Lavalink */
export class Manager extends EventEmitter {
	public readonly options: ManagerOptions;

	private _nodes: SocketOptions[];
	public readonly sockets = new Map<string, Socket>();

	public plugins: Plugin[] = [];
	public players: Map<string, Player> = new Map();

	private initiated = false;

	/**
	 * @param {Array} nodes An array of sockets.
	 * @param {Object} Options
	 */
	constructor(nodes: SocketOptions[], options: ManagerOptions) {
		super();

		if (!options.send || typeof options.send !== "function")
			throw new RangeError("options.send is not a function");
		if (options.shards && (typeof options.shards !== "number" || options.shards < 1))
			throw new RangeError("options.shards must 1 or greater");

		if (options.resume) {
			if (typeof options.resume.key !== "string" || !options.resume.key)
				throw new RangeError("options.resume.key must be a non-empty string");
			if (typeof options.resume.timeout !== "number" || options.resume.timeout < 1)
				throw new RangeError("options.resume.timeout must be 1 or greater");
		}

		if (options.reconnect) {
			if (typeof options.reconnect.amount !== "number" || options.reconnect.amount < 1)
				throw new RangeError("options.reconnect.amount must be 1 or greater");
			if (typeof options.reconnect.delay !== "number" || options.reconnect.delay < 1)
				throw new RangeError("options.reconnect.delay must be 1 or greater");
		}

		if (typeof options.plugins !== "undefined" && !Array.isArray(options.plugins))
			throw new RangeError("options.plugins must be an array with plugins");

		if (options.plugins)
			for (const plugin of options.plugins) {
				if (!(plugin instanceof Plugin))
					throw new RangeError(
						`options.plugins[${options.plugins?.indexOf(plugin)}] does not extend Plugin`
					);
				this.plugins.push(plugin);
			}

		this.options = options;

		for (const node of nodes) {
			const id = `nodes[${nodes.indexOf(node)}]`;
			if (!node.host || typeof node.host !== "string")
				throw new RangeError(`${id}.host is not a non-empty string`);
			if (!node.id || typeof node.id !== "string")
				throw new RangeError(`${id}.id is not a non-empty string`);
			if (
				typeof node.password !== "undefined" &&
				(typeof node.password !== "string" || node.password.length < 1)
			)
				throw new RangeError(`${id}.password is not a non-empty string`);
			if (typeof node.port !== "undefined" && typeof node.port !== "number")
				throw new RangeError(`${id}.port is not a valid number`);
			if (typeof node.secure !== "undefined" && typeof node.secure !== "boolean")
				throw new RangeError(`${id}.secure is not a valid boolean`);
		}

		this._nodes = nodes;
	}

	/**
	 * Initializes the manager and connects with all sockets
	 * @param userId The user id of the client
	 */
	public init(userId = this.options.userId): void {
		if (typeof userId !== "string" || !userId)
			throw new RangeError("Manager#init: the provided userId is not a non-empty string");

		if (this.initiated) return;
		this.initiated = true;

		this.options.userId = userId;
		this.plugins.forEach((plugin) => plugin.init(this));

		// to do: socket connection
		this._nodes.forEach((node) => {
			if (this.sockets.has(node.id)) return;
			const socket = new (Structure.get("Socket"))(this, node);

			try {
				socket.connect();
				this.sockets.set(node.id, socket);
			} catch (error) {
				this.emit("socketError", { socket, error });
			}
		});
	}

	/** Returns an array of nodes from best to worst */
	public get bestNodes(): Socket[] {
		return [...this.sockets.values()]
			.filter((node) => node.connected)
			.sort((a, b) => b.strikes - a.strikes);
	}

	/**
	 * Creates a new player for the guild
	 * @param options
	 * */
	public create(options: { voiceOptions?: VoiceOptions; guild: string; volume?: number }): Player {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (this.players.has(options.guild)) return this.players.get(options.guild)!;

		const player = new (Structure.get("Player"))(this, this.bestNodes[0], options);
		this.players.set(options.guild, player);

		return player;
	}

	/**
	 * Searches with the enabled sources for the query
	 * @param query
	 * @param requester
	 * @param type
	 */
	public async search(query: string, requester: string, type?: "sc" | "yt"): Promise<SearchResult> {
		const socket = this.bestNodes[0];
		if (!socket) throw new RangeError("No nodes available");

		let identifier = query;
		if (!Utils.isValidUri(identifier)) identifier = `${type}search:${query}`;

		const { data } = await socket.makeRequest<
			LavalinkSearchResult & {
				exception?: {
					message: string;
					severity: string;
				};
			}
		>(`/loadtracks?identifier=${encodeURIComponent(identifier)}`);
		const searchResult: SearchResult = {
			exception: data.exception,
			loadType: data.loadType,
			playlistInfo: data.playlistInfo
				? {
						name: data.playlistInfo.name,
						duration: data.tracks.reduce((a, b) => a + b.info.length, 0),
				  }
				: undefined,
			tracks: data.tracks.map((t) => Utils.buildTrack(t, requester)),
		};

		return searchResult;
	}

	/**
	 * Player getter
	 * @param id
	 * */
	public get(id: string): Player | undefined {
		return this.players.get(id);
	}

	/**
	 * Destroys the player and disconnects from the vc
	 * @param id
	 * */
	public destroy(id: string): boolean {
		const player = this.get(id);
		if (!player) return false;

		player.destroy();
		return true;
	}

	/**
	 * Creates a socket
	 * @param options
	 */
	public createSocket(options: SocketOptions): Socket {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (this.sockets.has(options.id)) return this.sockets.get(options.id)!;

		const socket = new (Structure.get("Socket"))(this, options);
		this.sockets.set(options.id, socket);
		return socket;
	}
	/**
	 * Destroys a socket if it exists
	 * @param id
	 */
	public destroySocket(id: string): void {
		const socket = this.sockets.get(id);
		if (!socket) return;

		socket.destroy();
		this.sockets.delete(id);
	}

	public loadPlugin(plugin: Plugin): this {
		plugin.init(this);
		this.plugins.push(plugin);
		return this;
	}

	/**
	 * Sends voice data to Lavalink, this is REQUIRED
	 * @param data
	 */
	public voiceStateUpdate(data: voiceStateUpdate): void {
		const player = this.players.get(data.guild_id);
		if (!player) return;

		if (data.user_id !== this.options.userId) return;

		const state = player.voiceState;
		state.sessionId = data.session_id;

		if (player.channels.voice !== data.channel_id) {
			this.emit("playerMove", {
				player,
				oldChannel: player.channels.voice,
				newChannel: data.channel_id,
			});
			data.channel_id = player.channels.voice ?? undefined;
			player.state = "CONNECTED";
		}

		player.voiceState = state;
		if (
			JSON.stringify(Object.keys(state).sort()) ===
			JSON.stringify(["event", "guildId", "op", "sessionId"])
		)
			player.socket.send({ data: state });
	}

	/**
	 * Sends voice data to Lavalink, this is REQUIRED
	 * @param data
	 */
	public voiceServerUpdate(data: voiceServerUpdate): void {
		const player = this.players.get(data.guild_id);
		if (!player) return;

		const state = player.voiceState;
		state.op = "voiceUpdate";
		state.guildId = data.guild_id;
		state.event = data;

		player.voiceState = state;
		if (
			JSON.stringify(Object.keys(state).sort()) ===
			JSON.stringify(["event", "guildId", "op", "sessionId"])
		)
			player.socket.send({ data: state });
	}
}

/* -- Interfaces -- */
export interface Manager {
	/**
	 * Emitted when a socket disconnects.
	 * @event Manager#socketDisconnect
	 */
	on(
		event: "socketDisconnect",
		// eslint-disable-next-line @typescript-eslint/no-shadow
		listener: ({ socket, event }: { socket: Socket; event: WebSocket.CloseEvent }) => void
	): this;

	/**
	 * Emitted when a socket disconnects.
	 * @event Manager#socketDisconnect
	 */
	on(
		event: "socketDestroy",
		// eslint-disable-next-line @typescript-eslint/no-shadow
		listener: (socket: Socket) => void
	): this;

	/**
	 * Emitted when a socket throws an error
	 * @event Manager#socketError
	 */
	on(
		event: "socketError",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		listener: ({ socket, error }: { socket: Socket; error: any }) => void
	): this;

	/**
	 * Emitted when a socket connects.
	 * @event Manager#socketConnect
	 */
	on(event: "socketConnect", listener: (socket: Socket) => void): this;

	/**
	 * Emitted when a socket reconnects.
	 * @event Manager#socketReconnect
	 */
	on(event: "socketReconnect", listener: (socket: Socket) => void): this;

	/**
	 * Emitted when a queue became empty
	 * @event Manager#queueEmpty
	 */
	on(event: "queueEmpty", listener: (player: Player) => void): this;

	/**
	 * Emitted when a new track is playing
	 * @event Manager#trackStart
	 */
	on(
		event: "trackStart",
		listener: ({
			player,
			track,
			payload,
		}: TrackEventParameters & { payload: TrackStartEvent }) => void
	): this;

	/**
	 * Emitted when a track is stuck
	 * @event Manager#trackStuck
	 */
	on(
		event: "trackStuck",
		listener: ({
			player,
			track,
			payload,
		}: TrackEventParameters & { payload: TrackStartEvent }) => void
	): this;

	/**
	 * Emitted when an error was received
	 * @event Manager#trackError
	 */
	on(
		event: "trackError",
		listener: ({
			player,
			track,
			payload,
		}: TrackEventParameters & { payload: TrackExceptionEvent }) => void
	): this;

	/**
	 * Emitted when a voice connection has been cut
	 * @event Manager#playerConnectionClosed
	 */
	on(
		event: "playerConnectionClosed",
		listener: ({ player, payload }: { player: Player; payload: WebSocketClosedEvent }) => void
	): this;

	/**
	 * Emitted when a player has been created
	 * @event Manager#playerCreate
	 */
	on(event: "playerCreate", listener: (player: Player) => void): this;

	/**
	 * Emitted when a player has been destroyed
	 * @event Manager#playerDestroy
	 */
	on(event: "playerDestroy", listener: (player: Player) => void): this;

	/**
	 * Emitted when a player moved to a different channel
	 * @event Manager#playerMove
	 */
	on(
		event: "playerMove",
		listener: ({
			player,
			oldChannel,
			newChannel,
		}: {
			player: Player;
			oldChannel: string;
			newChannel: string;
		}) => void
	): this;
}

export type SearchFunction = (
	query: string,
	requester: string,
	type?: "yt" | "sc"
) => Promise<SearchResult>;

export type LoadType =
	| "TRACK_LOADED"
	| "PLAYLIST_LOADED"
	| "SEARCH_RESULT"
	| "LOAD_FAILED"
	| "NO_MATCHES";

export interface SearchResult {
	/** The load type of the result. */
	loadType: LoadType;
	/** The array of tracks from the result. */
	tracks: Track[];
	/** The playlist info if the load type is PLAYLIST_LOADED. */
	playlistInfo?: {
		name: string;
		duration: number;
	};
	/** The exception when searching if one. */
	exception?: {
		/** The message for the exception. */
		message: string;
		/** The severity of exception. */
		severity: string;
	};
}

export interface voiceServerUpdate {
	token: string;
	guild_id: string;
	endpoint: string;
}

export interface voiceStateUpdate {
	channel_id?: string;
	guild_id: string;
	user_id: string;
	session_id: string;
}

export type TrackEventParameters = {
	player: Player;
	track: Track;
};

export interface ManagerOptions {
	/**
	 * A function called when data has to be sent to discord
	 * @example const guild = client.guilds.cache.get(guildId);
	 * if (guild) guild.shard.send(payload);
	 */
	send(guildId: string, payload: Payload): void;
	/**
	 * The number of shards.
	 */
	shards?: number;
	/**
	 * The id of the client (can also be provided with Manager#init)
	 */
	userId?: string;
	/**
	 * The plugins you want to use.
	 */
	plugins?: Plugin[];
	/**
	 * Resume options.
	 */
	resume?: resumeOptions;
	/**
	 * Options for reconnection.
	 */
	reconnect?: reconnectOptions;
}

export interface reconnectOptions {
	/** The amount of connection retries for the socket. */
	amount?: number;
	/** The retry delay for the socket. */
	delay?: number;
}

export interface resumeOptions {
	/** The resume key. */
	key?: string;
	/** How long it takes before the resume key is invalidated */
	timeout?: number;
}

export interface Payload {
	/** The OP code */
	op: number;
	d: {
		guild_id: string;
		channel_id: string | null;
		self_mute: boolean;
		self_deaf: boolean;
	};
}
