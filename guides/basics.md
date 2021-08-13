## Installation

**Note: this guide assumes that you already know the basics of JavaScript and how to use Discord.js**

**Npm**
`npm install @stereo-bot/lavalink`

**Yarn**
`yarn add @stereo-bot/lavalink`

## Setting up the client

The first thing to do is setup the client. This will only show you the required options, for a full list of options, check the documentation.

```js
const { Client } = require("discord.js");
const { Manager } = require("@stereo-bot/lavalink");

const client = new Client({
	// These are the intents you need to enable in order to play music
	intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_VOICE_STATES"],
});

// required node information
const nodes = [
	{
		host: "localhost",
		password: "youshallnotpass",
		port: 2333,
		id: "main",
	},
];

client.manager = new Manager(nodes, {
	// REQUIRED, without this, your bot won't be able to play music
	send: (guildId, payload) => {
		const guild = client.guilds.cache.get(guildId);
		if (guild) guild.shard.send(payload);
	},
});

client.on("ready", () => {
	console.log(`${client.user.tag} is ready!`);
	// initializes the manager
	client.manager.init(client.user.id);
});

// some basic events
client.manager.on("socketConnect", (socket) => console.log(`${socket.id} is connected!`));
client.manager.on("socketError", ({ socket, error }) =>
	console.error(`${socket.id} encountered an error ${error.stack || error.message || "unknown"}`)
);

// discord voice events, REQUIRED, this will send voiceData to lavalink
client.ws.on("VOICE_SERVER_UPDATE", (data) => client.manager.voiceServerUpdate(data));
client.ws.on("VOICE_STATE_UPDATE", (data) => client.manager.voiceStateUpdate(data));

client.login("token");
```

## Play command

```js
// the prefix of the bot
const prefix = "!";
client.on("messageCreate", async (message) => {
	if (!message.content.startsWith(prefix) || message.author.bot || !message.guild) return;

	// gets the command and creates the arguments
	const [command, ...args] = message.content.slice(prefix.length).split(/\s+/g);

	switch (command) {
		case "play":
			// joins all the args together, this will make a string like: "my favourite song"
			const query = args.join(" ");
			if (!query) return message.reply("No search query provided.");

			// checks if the user is in a voice channel
			if (!message.member.voice.channelId) return message.reply("You aren't in a voice channel");

			// gets or creates a player
			const player =
				client.manager.get(message.guild.id) || client.manager.create({ guild: message.guild.id });

			// checks if the player vc is the same as the user vc if any
			if (player.channels.voice && player.channels.voice !== message.member.voice.channelId)
				return message.reply("You aren't in the correct voice channel");

			// searches for tracks
			const res = await player.search(query, message.author.id);
			// checks if an error was received or nothing was found
			if (res.loadType === "NO_MATCHES") return message.reply("Nothing found for your query");
			if (res.loadType === "LOAD_FAILED")
				return message.reply(`Unexpected error: ${res.exception?.message}`);

			// when a playlist is loaded...
			if (res.loadType === "PLAYLIST_LOADED") {
				player.queue.add(...res.tracks);
				message.reply(`Successfully loaded playlist ${res.playlistInfo?.name}`);
			} else {
				// will select the first track when loadType is "TRACK_LOADED" or "SEARCH_RESULT"
				player.queue.add(res.tracks[0]);
				message.reply(`Successfully loaded track ${res.tracks[0].title}`);
			}

			// connects to the vc and sets the textChannel if not connected
			if (player.state !== "CONNECTED")
				player.setVoice(message.member.voice.channelId).setText(message.channel.id).connect();
			// plays if the player is not playing and not paused
			if (!player.playing && !player.paused) player.play();
			break;
		default:
			break;
	}
});
```

## Events

You can use events to check what song is playing, if a queue is empty and what happens with the sockets.

```js
// this event will fire whenever a socket is connected to lavalink for the first time
client.manager.on("socketConnect", (socket) => console.log(`${socket.id} is connected!`));

// this event will fire whenever a socket is reconnected to lavalink
client.manager.on("socketReconnect", (socket) => console.log(`${socket.id} is reconnected!`));

// this event will fire whenever a socket encounters an error
client.manager.on("socketError", ({ socket, error }) =>
	console.log(`${socket.id} encountered an error: ${error.stack || error.message || "unknown"}`)
);

// Fired when a track started playing
// playload is the raw data received from Lavalink
client.manager.on("trackStart", ({ player, track, payload }) => {
	const channel = client.channels.cache.get(player.channels.text);
	const user = client.users.cache.get(track.requester);

	// Send a message when a new track started playing
	// Discord tag =  username#discriminator (ex: DaanGamesDG#7621)
	channel.send(`Now playing: \`${track.title}\`.\nRequested by **${user.tag}**.`);
});

// Fired when a track ends
client.manager.on("trackEnd", ({ player, track, payload }) => {
	// do whatever you want here
});

// Fired when a track was stuck
client.manager.on("trackStuck", ({ player, track, payload }) => {
	const channel = client.channels.cache.get(player.channels.text);
	message.channel.send(`The player is stuck, I will skip to the next one`);
	player.skip();
});

// Fired when a track encountered an error
client.manager.on("trackError", ({ player, track, payload }) => {
	const channel = client.channels.cache.get(player.channels.text);
	message.channel.send(
		`There was an unexpected error while playing ${track.title}, I will skip to the next one`
	);

	// logs the trackExceptionEvent
	console.error(payload);
	player.skip();
});

// Emitted when the queue ends
client.manager.on("queueEnd", (player) => {
	const channel = client.channels.cache.get(player.channels.text);
	channel.send("Queue has ended, I will destroy the player now.");
	player.destroy();
});
```
