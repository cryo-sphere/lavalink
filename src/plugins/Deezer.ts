/* eslint-disable no-useless-escape */
import axios, { AxiosRequestConfig } from "axios";
import { Structure } from "../Structure";
import { Manager, SearchFunction, SearchResult } from "../structures/Manager";
import { Plugin } from "../structures/Plugin";
import { Track } from "../structures/Track";

export class Deezer extends Plugin {
	private readonly axiosOptions: AxiosRequestConfig;
	private readonly api: string = "https://api.deezer.com";
	private readonly regex =
		/(?:https:\/\/www\.deezer\.com\/|deezer:)(?:[A-Za-z]+)(?:.+)?(track|playlist|album)[\/:]([A-Za-z0-9]+)/;

	public readonly functions: Record<
		string,
		(id: string, requester: string) => Promise<{ tracks: Track[]; name?: string } | null>
	>;

	public options: DeezerOptions;
	public managerSearch!: SearchFunction;

	constructor(options?: Partial<DeezerOptions>) {
		super();

		if (options) {
			if (options.albumLimit && (isNaN(options.albumLimit) || options.albumLimit < 0))
				throw new RangeError("options.albumLimit must be 1 or greater");
			if (options.playlistLimit && (isNaN(options.playlistLimit) || options.playlistLimit < 0))
				throw new RangeError("options.playlistLimit must be 1 or greater");
			if (
				typeof options.albumLimit !== "undefined" &&
				typeof options.convertUnresolved !== "boolean"
			)
				throw new TypeError("options.convertUnresolved is not a boolean");
		}

		this.options = {
			playlistLimit: Infinity,
			albumLimit: Infinity,
			convertUnresolved: false,
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

	private async get<T>(endpoint: string) {
		const res = await axios
			.get<T>(`${this.api}${endpoint}`, this.axiosOptions)
			.catch(() => ({ data: null }));
		return res.data;
	}

	private async getTrack(id: string, requester: string) {
		const data = await this.get<DeezerAPITrack>(`/track/${id}`);
		if (!data) return null;

		const track = await this.createTrack(data, requester);
		return { tracks: [track] };
	}

	private async getAlbum(id: string, requester: string) {
		const album = await this.get<DeezerAPIAlbum>(`/album/${id}`);
		if (!album) return null;

		const tracks = await Promise.all(
			album.tracks.data
				.slice(0, this.options.albumLimit)
				.map((track) => this.createTrack(track, requester))
		);

		return { tracks, name: album.title };
	}

	private async getPlaylist(id: string, requester: string) {
		const playlist = await this.get<DeezerAPIPlaylist>(`/playlist/${id}`);
		if (!playlist) return null;

		const tracks = await Promise.all(
			playlist.tracks.data
				.slice(0, this.options.playlistLimit)
				.map((track) => this.createTrack(track, requester))
		);

		return { tracks, name: playlist.title };
	}

	private async createTrack(data: DeezerAPITrack, requester: string) {
		const track = new (Structure.get("Track"))({
			requester,
			title: data.title,
			externalTitle: data.title,
			externalUri: data.link,
			author: data.artist.name,
			duration: data.duration * 1e3,
		});

		if (this.options.convertUnresolved) await track.resolve(this.manager);
		return track;
	}

	public init(manager: Manager) {
		this.manager = manager;

		this.managerSearch = manager.search.bind(manager);
		manager.search = this.search.bind(this);
	}
}

/* -- Interfaces -- */
export interface DeezerOptions {
	/** If the plugin should resolve the track (NOT RECOMMENED) */
	convertUnresolved: boolean;
	/** The max amount of tracks a playlist should return, defaults to Infinity */
	playlistLimit: number;
	/** The max amount of tracks a album should return, defaults to Infinity */
	albumLimit: number;
}

export interface DeezerAPIContributor {
	id: number;
	name: string;
	link: string;
	share: string;
	picture: string;
	picture_small: string;
	picture_medium: string;
	picture_big: string;
	picture_xl: string;
	radio: boolean;
	tracklist: string;
	type: string;
	role: string;
}

export interface DeezerAPIArtist {
	id: number;
	name: string;
	link: string;
	share: string;
	picture: string;
	picture_small: string;
	picture_medium: string;
	picture_big: string;
	picture_xl: string;
	radio: boolean;
	tracklist: string;
	type: string;
}

export interface DeezerAPIGenres {
	data: {
		id: number;
		name: string;
		picture: string;
		type: "genre";
	}[];
}

export interface DeezerAPICreator {
	id: number;
	name: string;
	tracklist: string;
	type: "user";
}

export interface DeezerAPITrack {
	id: number;
	readable: boolean;
	title: string;
	title_short: string;
	title_version: string;
	isrc: string;
	link: string;
	share: string;
	duration: number;
	track_position: number;
	disk_number: number;
	rank: number;
	release_date: string;
	explicit_lyrics: boolean;
	explicit_content_lyrics: number;
	explicit_content_cover: number;
	preview: string;
	bpm: number;
	gain: number;
	md5_image: string;
	available_countries: string[];
	contributors: DeezerAPIContributor[];
	artist: DeezerAPIArtist;
	type: "track";
}

export interface DeezerAPIAlbum {
	id: number;
	title: string;
	upc: string;
	link: string;
	share: string;
	cover: string;
	cover_small: string;
	cover_medium: string;
	cover_big: string;
	cover_xl: string;
	md5_image: string;
	genre_id: number;
	genres: DeezerAPIGenres;
	label: string;
	nb_tracks: number;
	duration: number;
	fans: number;
	rating: number;
	release_date: string;
	record_type: string;
	available: boolean;
	tracklist: string;
	explicit_lyrics: boolean;
	explicit_content_lyrics: number;
	explicit_content_cover: number;
	contributors: DeezerAPIContributor[];
	artist: DeezerAPIArtist;
	type: "album";
	tracks: {
		data: DeezerAPITrack[];
	};
}

export interface DeezerAPIPlaylist {
	id: number;
	title: string;
	description: string;
	duration: number;
	public: boolean;
	is_loved_track: boolean;
	collaborative: boolean;
	nb_tracks: number;
	fans: number;
	link: string;
	share: string;
	picture: string;
	picture_small: string;
	picture_medium: string;
	picture_big: string;
	picture_xl: string;
	checksum: string;
	tracklist: string;
	creation_date: string;
	md5_image: string;
	picture_type: string;
	creator: DeezerAPICreator;
	tracks: {
		data: DeezerAPITrack[];
	};
}
