/* eslint-disable no-useless-escape */
import axios, { AxiosRequestConfig } from "axios";
import { Manager, SearchFunction, SearchResult } from "../structures/Manager";
import { Plugin } from "../structures/Plugin";
import { Track } from "../structures/Track";
import { Structure } from "../Structure";

export class Spotify extends Plugin {
	protected axiosOptions: AxiosRequestConfig;
	private readonly api: string = "https://api.spotify.com/v1";
	private readonly regex =
		/(?:https:\/\/open\.spotify\.com\/|spotify:)(?:.+)?(track|playlist|album)[\/:]([A-Za-z0-9]+)/;

	public readonly functions: Record<
		string,
		(id: string, requester: string) => Promise<{ tracks: Track[]; name?: string } | null>
	>;

	public options: SpotifyOptions;
	public managerSearch!: SearchFunction;

	constructor(options: Partial<SpotifyOptions>) {
		super();

		if (options.albumLimit && (isNaN(options.albumLimit) || options.albumLimit < 0))
			throw new RangeError("options.albumLimit must be 1 or greater");
		if (options.playlistLimit && (isNaN(options.playlistLimit) || options.playlistLimit < 0))
			throw new RangeError("options.playlistLimit must be 1 or greater");
		if (typeof options.albumLimit !== "undefined" && typeof options.convertUnresolved !== "boolean")
			throw new TypeError("options.convertUnresolved is not a boolean");
		if (typeof options.clientId !== "undefined" && typeof options.clientId !== "string")
			throw new TypeError("options.clientId is not a string");
		if (typeof options.clientSecret !== "undefined" && typeof options.clientSecret !== "string")
			throw new TypeError("options.clientSecret is not a string");

		this.options = {
			playlistLimit: Infinity,
			albumLimit: Infinity,
			convertUnresolved: false,
			clientId: "",
			clientSecret: "",
			...options,
		};

		this.axiosOptions = {
			headers: {
				"Content-Type": "application/json",
			},
		};

		this.functions = {
			track: this.getTrack.bind(this),
			album: this.getAlbum.bind(this),
			playlist: this.getPlaylist.bind(this),
		};
	}

	public async search(
		query: string,
		requester: string,
		searchType?: "yt" | "sc"
	): Promise<SearchResult> {
		const [, type, id] = query.match(this.regex) ?? [];
		if (!type || !this.functions[type] || !id)
			return this.managerSearch(query, requester, searchType);

		const res = await this.functions[type](id, requester);
		if (!res)
			return {
				loadType: "NO_MATCHES",
				tracks: [],
				exception: {
					severity: "COMMON",
					message: "no track(s) found",
				},
			};

		const loadType = type === "track" ? "TRACK_LOADED" : "PLAYLIST_LOADED";

		return {
			loadType,
			tracks: res.tracks,
			playlistInfo:
				loadType === "PLAYLIST_LOADED"
					? {
							duration: res.tracks.reduce((a, b) => a + (b.duration ?? 0), 0),
							name: res.name as string,
					  }
					: undefined,
		};
	}

	protected async _renew(): Promise<number> {
		const { data } = await axios
			.post("https://accounts.spotify.com/api/token", "grant_type=client_credentials", {
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Basic ${Buffer.from(
						`${this.options.clientId}:${this.options.clientSecret}`
					).toString("base64")}`,
				},
			})
			.catch(() => ({ data: null }));
		if (!data.access_token) throw new Error("Invalid Spotify client.");

		const { access_token, expires_in } = data;

		this.axiosOptions = {
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${access_token}`,
			},
		};

		return expires_in * 1000;
	}

	private async renew(): Promise<void> {
		const time = await this._renew();
		setTimeout(() => this.renew(), time);
	}

	private async get<T>(endpoint: string) {
		const res = await axios
			.get<T>(`${this.api}${endpoint}`, this.axiosOptions)
			.catch(() => ({ data: null }));
		return res.data;
	}

	private async getTrack(id: string, requester: string) {
		const data = await this.get<SpotifyAPITrack>(`/tracks/${id}`);
		if (!data) return null;

		const track = await this.createTrack(data, requester);
		return { tracks: [track] };
	}

	private async getAlbum(id: string, requester: string) {
		const album = await this.get<SpotifyAPIAlbum>(`/albums/${id}`);
		if (!album) return null;

		const tracks = await Promise.all(
			album.tracks.items
				.slice(0, this.options.albumLimit)
				.map((track) => this.createTrack(track, requester))
		);

		let count = album.tracks.items.length;
		let next = album.tracks.next;

		while (next && count < this.options.albumLimit) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nextPage = await this.get<SpotifyAPIAlbum>(next!);
			if (!nextPage) {
				next = null;
				continue;
			}

			tracks.push(
				...(await Promise.all(
					nextPage.tracks.items.map((item) => this.createTrack(item, requester))
				))
			);

			next = nextPage.tracks.next;
			count += nextPage.tracks.items.length;
		}

		return { tracks, name: album.name };
	}

	private async getPlaylist(id: string, requester: string) {
		const playlist = await this.get<SpotifyAPIPlaylist>(`/playlists/${id}`);
		if (!playlist) return null;

		const tracks = await Promise.all(
			playlist.tracks.items.map((track) => this.createTrack(track.track, requester))
		);

		let count = playlist.tracks.items.length;
		let next = playlist.tracks.next;

		while (next && count < this.options.playlistLimit) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nextPage = await this.get<PlaylistTracks>(next!);
			if (!nextPage) {
				next = null;
				continue;
			}

			tracks.push(
				...(await Promise.all(
					nextPage.items.map((item) => this.createTrack(item.track, requester))
				))
			);

			next = nextPage.next;
			count += nextPage.items.length;
		}

		return { tracks, name: playlist.name };
	}

	private async createTrack(data: SpotifyAPITrack, requester: string) {
		const track = new (Structure.get("Track"))({
			requester,
			title: data.name,
			externalUri: data.external_urls.spotify,
			externalTitle: data.name,
			author: data.artists[0].name,
			duration: data.duration_ms,
		});

		if (this.options.convertUnresolved) await track.resolve(this.manager);
		return track;
	}

	public init(manager: Manager) {
		this.manager = manager;

		this.renew();
		this.managerSearch = manager.search.bind(manager);
		manager.search = this.search.bind(this);
	}
}

/* -- Interfaces -- */
export interface SpotifyOptions {
	/** If the plugin should resolve the track (NOT RECOMMENED) */
	convertUnresolved: boolean;
	/** The max amount of tracks a playlist should return, defaults to Infinity */
	playlistLimit: number;
	/** The max amount of tracks a album should return, defaults to Infinity */
	albumLimit: number;
	clientId: string;
	clientSecret: string;
}

export interface SpotifyAPIAlbum {
	name: string;
	tracks: SpotifyAPIAlbumTracks;
}

export interface SpotifyAPIAlbumTracks {
	items: SpotifyAPITrack[];
	next: string | null;
}

export interface SpotifyAPIPlaylist {
	tracks: PlaylistTracks;
	name: string;
}

export interface PlaylistTracks {
	items: [
		{
			track: SpotifyAPITrack;
		}
	];
	next: string | null;
}

export interface SpotifyAPITrack {
	artists: { name: string }[];
	name: string;
	duration_ms: number;
	external_urls: {
		spotify: string;
	};
}
