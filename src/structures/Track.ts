import { Manager } from "./Manager";

export class Track {
	/** The base64 encoded track. */
	public track?: string;
	/** The title of the track */
	public title?: string;
	/** The external title if any, this could be a Spotify or Deezer title for example */
	public externalTitle?: string;
	/** The author of the track */
	public author?: string;
	/** The YouTube URL of the track */
	public uri?: string;
	/** The external uri if any, this could be a Spotify or Deezer uri for example */
	public externalUri?: string;
	/** The identifier of the track */
	public identifier?: string;
	/** The duration of the track. */
	public duration?: number;
	/** If the track is a stream. */
	public isStream?: boolean;
	/** If the track is seekable or not. */
	public isSeekable?: boolean;
	/** The id of the user that requested the track. */
	public requester: string;

	constructor(data: Partial<LoadedTrack>) {
		if (!data.requester || typeof data.requester !== "string")
			throw new RangeError("requester must be a non-empty string");
		if ("author" in data && typeof data.author !== "string")
			throw new RangeError("author must be a non-empty string");
		if ("title" in data && typeof data.title !== "string")
			throw new RangeError("title must be a non-empty string");
		if ("isStream" in data && typeof data.isStream !== "boolean")
			throw new RangeError("isStream must be a boolean");
		if ("isSeekable" in data && typeof data.isSeekable !== "boolean")
			throw new RangeError("isStream must be a boolean");
		if ("duration" in data && typeof data.duration !== "number")
			throw new RangeError("duration must be number");
		if ("uri" in data && typeof data.uri !== "string")
			throw new RangeError("uri must be a non-empty string");
		if ("track" in data && typeof data.track !== "string")
			throw new RangeError("track must be a non-empty string");
		if ("identifier" in data && typeof data.identifier !== "string")
			throw new RangeError("identifier must be a non-empty string");
		if ("externalUri" in data && typeof data.externalUri !== "string")
			throw new RangeError("externalUri must be a non-empty string");
		if (!data.title && !data.uri)
			throw new RangeError("A partial track must atleast have a title as property");

		this.requester = data.requester;
		this.track = data.track ?? undefined;
		this.uri = data.uri ?? undefined;
		this.title = data.title ?? undefined;
		this.isStream = data.isStream ?? undefined;
		this.isSeekable = data.isSeekable ?? undefined;
		this.identifier = data.identifier ?? undefined;
		this.externalUri = data.externalUri ?? undefined;
		this.duration = data.duration ?? undefined;
		this.author = data.author ?? undefined;
	}

	/** Displays the track thumbnail if the track is from YouTube with optional size. */
	public displayThumbnail(size: thumbnailSize = "default"): string | null {
		return this.uri && this.uri.includes("youtube")
			? `https://img.youtube.com/vi/${this.identifier}/${size}.jpg`
			: null;
	}

	/** checks if the track is a LoadedTrack or not (typeguards it) */
	public isNormal(): this is LoadedTrack {
		return !!this.track;
	}

	/** Transforms the track to a LoadedTrack */
	public async resolve(manager: Manager): Promise<boolean> {
		if (this.isNormal()) return true;

		const query = this.uri || (this.author ? `${this.title} - ${this.author}` : this.title ?? "");
		const res = await manager.search(query, this.requester, "yt");

		if (!res.tracks.length) return false;

		if (res.exception) return false;

		let track!: Track;
		switch (res.loadType) {
			case "TRACK_LOADED":
			case "SEARCH_RESULT":
				track =
					(this.duration ? res.tracks.find((t) => t.duration === this.duration) : res.tracks[0]) ??
					res.tracks[0];
				break;
			default:
				return false;
		}

		this.author = track.author;
		this.duration = track.duration;
		this.identifier = track.identifier;
		this.isSeekable = track.isSeekable;
		this.isStream = track.isStream;
		this.title = track.title;
		this.track = track.track;
		this.uri = track.uri;

		return true;
	}
}

/* -- Interfaces -- */
export type thumbnailSize =
	| "0"
	| "1"
	| "2"
	| "3"
	| "default"
	| "mqdefault"
	| "hqdefault"
	| "maxresdefault";

export interface LoadedTrack {
	/** The base64 encoded track. */
	readonly track: string;
	/** The title of the track */
	readonly title: string;
	/** The external title if any, this could be a Spotify or Deezer title for example */
	readonly externalTitle?: string;
	/** The author of the track */
	readonly author: string;
	/** The YouTube URL of the track */
	readonly uri: string;
	/** The external uri if any, this could be a Spotify or Deezer uri for example */
	readonly externalUri?: string;
	/** The identifier of the track */
	readonly identifier: string;
	/** The duration of the track. */
	readonly duration: number;
	/** If the track is a stream. */
	readonly isStream: boolean;
	/** If the track is seekable or not. */
	readonly isSeekable: boolean;
	/** The id of the user that requested the track. */
	readonly requester: string;
	/** Displays the track thumbnail with optional size. */
	displayThumbnail(size?: thumbnailSize): string;
	isNormal(): this is LoadedTrack;
	/** The resolve function of the track */
	resolve(manager: Manager): Promise<boolean>;
}
