/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Manager, reconnectOptions } from "./Manager";
import { OutgoingMessage, StatsData } from "@lavaclient/types";
import { PlayerEvents, PlayerEvent } from "./Utils";
import axios, { AxiosPromise, AxiosRequestConfig } from "axios";
import WebSocket from "ws";

export class Socket {
	/**
	 * The status of this lavalink node
	 */
	public status: Status = "IDLE";
	/**
	 * The timeout for reconnecting.
	 */
	private reconnectTimeout: NodeJS.Timeout | null = null;
	/**
	 * The resumeKey
	 */
	public resumeKey: string | undefined;
	/**
	 * Number of remaining reconnect tries
	 */
	public remaining: number;
	/**
	 * The performance stats of this player
	 */
	public stats: StatsData = {
		cpu: {
			cores: 0,
			lavalinkLoad: 0,
			systemLoad: 0,
		},
		frameStats: {
			deficit: 0,
			nulled: 0,
			sent: 0,
		},
		memory: {
			allocated: 0,
			free: 0,
			reservable: 0,
			used: 0,
		},
		players: 0,
		playingPlayers: 0,
		uptime: 0,
	};

	/**
	 * the Websocket instance
	 */
	private ws?: WebSocket;

	private readonly queue: string[] = [];

	/**
	 * @param manager
	 * @param data
	 */
	constructor(public readonly manager: Manager, public readonly options: SocketOptions) {
		this.options.password = options.password ?? "youshallnotpass";
		this.resumeKey = this.manager.options.resume?.key;

		this.remaining = Number(manager.options.reconnect?.amount ?? 5);
	}

	/**
	 * The reconnection options
	 */
	public get reconnectOptions(): reconnectOptions | undefined {
		return this.manager.options.reconnect;
	}

	/**
	 * If this node to Lavalink is connected or not
	 */
	public get connected(): boolean {
		return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN;
	}

	/**
	 * Gets the adress of the lavalink
	 * @private
	 */
	private address(ws = false): string {
		const base = `${this.options.host}${this.options.port ? `:${this.options.port}` : ""}`;
		return ws
			? `ws${this.options.secure ? "s" : ""}://${base}`
			: `http${this.options.secure ? "s" : ""}://${base}`;
	}

	public makeRequest<T>(endpoint: string, options?: AxiosRequestConfig): AxiosPromise<T> {
		return axios(this.address() + endpoint, {
			...options,
			headers: { ...options?.headers, Authorization: this.options.password },
		});
	}

	/**
	 * Get the total strike count for this node.
	 */
	public get strikes(): number {
		const cpu = Math.pow(1.05, 1e2 * this.stats.cpu.systemLoad) * 10 - 10;
		let deficit = 0;
		let nulled = 0;

		if (this.stats.frameStats?.deficit !== -1) {
			deficit = Math.pow(1.03, 5e2 * ((this.stats.frameStats?.deficit ?? 0) / 3e3)) * 6e2 - 6e2;
			nulled = (Math.pow(1.03, 5e2 * ((this.stats.frameStats?.nulled ?? 0) / 3e3)) * 6e2 - 6e2) * 2;
			nulled *= 2;
		}

		return cpu + deficit + nulled;
	}

	/**
	 * Send a message to lavalink
	 * @param options.data the data to send to lavalink
	 * @param options.priority If this message should be first in the queue, defaults to false
	 */
	public send({ data, priority }: { data: OutgoingMessage; priority?: boolean }): void {
		const json = JSON.stringify(data);
		this.queue[priority ? "unshift" : "push"](json);

		if (this.connected) this.process();
	}

	/**
	 * Disconnects and deletes the websocket
	 */
	public disconnect(status = 1000): void {
		this.reset();
		this.ws?.close(status);

		this.ws = undefined;
	}

	/**
	 * Connects to lavalink
	 */
	public connect(): void {
		if (this.status !== "RECONNECTING") this.status = "CONNECTING";
		if (this.connected) this.disconnect(1012);

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		const headers: Record<string, string | number> = {
			Authorization: this.options.password as string,
			"Num-Shards": this.manager.options.shards ?? 1,
			"User-Id": this.manager.options.userId as string,
			"Client-Name": "@stereo/lavalink",
		};

		if (this.resumeKey) headers["resume-key"] = this.resumeKey;
		this.ws = new WebSocket(this.address(true), { headers });

		this.ws.on("open", this.open.bind(this));
		this.ws.on("message", this.message.bind(this));
		this.ws.on("close", this.close.bind(this));
		this.ws.on("error", this.error.bind(this));
	}

	/**
	 * Reconnect to lavalink
	 */
	public reconnect(): void {
		if (this.remaining <= 0) {
			this.status = "DISCONNECTED";
			this.manager.emit("socketError", {
				socket: this,
				error: new Error("Ran out of reconnect tries"),
			});
			return;
		}

		this.remaining -= 1;
		this.status = "RECONNECTING";

		try {
			this.connect();
		} catch (error) {
			this.manager.emit("socketError", { socket: this, error });

			const amount = this.reconnectOptions?.amount ?? 1e4;
			this.reconnectTimeout = setTimeout(this.reconnect.bind(this), amount);
		}
	}

	/** Destroys the socket and removes all the players connected to it */
	public destroy(): void {
		const players = [...this.manager.players.values()].filter((p) => p.socket === this);
		if (players.length) players.forEach((p) => p.destroy());

		this.disconnect();

		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
		this.manager.emit("socketDestroy", this);
	}

	/**
	 * Configures the resuming option of Lavalink
	 * @private
	 */
	private configureResuming(): void {
		if (!this.manager.options.resume) return;
		this.resumeKey = this.manager.options.resume?.key ?? Math.random().toString(32);

		return this.send({
			priority: true,
			data: {
				op: "configureResuming",
				timeout: this.manager.options.resume.timeout ?? 6e4,
				key: this.resumeKey,
			},
		});
	}

	/**
	 * Handles websocket open events
	 * @private
	 */
	private open(): void {
		this.manager.emit(this.status === "RECONNECTING" ? "socketReconnect" : "socketConnect", this);

		this.process();
		this.configureResuming();

		this.status = "CONNECTED";
	}

	/**
	 * Handles messages received via the websocket
	 * @private
	 */
	private async message(data: WebSocket.Data): Promise<void> {
		if (data instanceof ArrayBuffer) data = Buffer.from(data);
		else if (Array.isArray(data)) data = Buffer.concat(data);

		if (!data) return;

		const payload = JSON.parse(data.toString());
		switch (payload.op) {
			case "stats":
				this.stats = payload;
				break;
			case "playerUpdate":
				{
					const player = this.manager.players.get(payload.guildId);
					if (player) player.position = payload.state.position ?? 0;
				}
				break;
			case "event":
				this.event(payload);
				break;
			default:
				break;
		}
	}

	/** Handles track & websocketClose */
	private event(payload: PlayerEvent & PlayerEvents): void {
		if (!payload.guildId) return;

		const player = this.manager.players.get(payload.guildId);
		if (!player) return;

		const track = player.queue.current;

		if (payload.type === "TrackStartEvent") {
			player.playing = true;
			player.paused = false;
			this.manager.emit("trackStart", { player, track, payload });
		}

		if (payload.type === "TrackEndEvent") return player.queue.nextSong();

		if (payload.type === "TrackStuckEvent") {
			this.manager.emit("trackStuck", { player, track, payload });
			player.stop();
			return;
		}

		if (payload.type === "TrackExceptionEvent") {
			this.manager.emit("trackError", { player, track, payload });
			player.stop();
			return;
		}

		if (payload.type === "WebSocketClosedEvent") {
			this.manager.emit("playerConnectionClosed", { player, payload });
			return;
		}
	}

	/**
	 * Handles the websocket close event
	 * @private
	 */
	private close(event: WebSocket.CloseEvent): void {
		if (this.remaining === this.reconnectOptions?.amount)
			this.manager.emit("socketDisconnect", { socket: this, event });
		if (event.code !== 1000 && event.reason !== "destroy") this.reconnect();
	}

	/**
	 * Handles the websocket error event
	 * @private
	 */
	private error(event: WebSocket.ErrorEvent): void {
		const error = event.error ?? event.message ?? "unknown";
		this.manager.emit("socketError", { socket: this, error });
	}

	/**
	 * Processes the items in the queue
	 * @private
	 */
	private process(): void {
		if (this.queue.length === 0) return;

		while (this.queue.length > 0) {
			const payload = this.queue.shift();
			if (!payload) return;

			this.ws?.send(payload, (error) => {
				if (error) this.manager.emit("socketError", { socket: this, error });
			});
		}
	}

	/**
	 * Resets the websocket listeners
	 * @private
	 */
	private reset(): void {
		if (this.ws) this.ws.removeAllListeners();
	}
}

/* -- Interfaces -- */
export type Status = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "RECONNECTING" | "IDLE";

export interface SocketOptions {
	/** The host for the socket. */
	host: string;
	/** The port for the socket. */
	port?: number;
	/** The password for the socket. */
	password?: string;
	/** Whether the host uses SSL. */
	secure?: boolean;
	/** The id of the socket. */
	id: string;
}
