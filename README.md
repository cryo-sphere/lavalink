<h1 align="center">@stereo-bot/lavalink</h1>

> An easy-to-use package for interacting with Lavalink with built-in Spotify and Deezer support (plugins must be added to the plugins array in-order to work). based off [Erela.js](https://github.com/MenuDocs/erela.js) & [Lavaclient](https://github.com/lavaclient)

- [Documentation](https://lavalink.stereo-bot.tk)

## Install

```sh
yarn add / npm install @stereo-bot/lavalink
```

## Usage

Extremely simple example

```js
const { Client } = require("discord.js");
const { Manager, Deezer, Spotify } = require("@stereo/lavalink");

const client = new Client({ intents: ["GUILD_VOICE_STATES", "GUILD_MESSAGES", "GUILDS"] });
const manager = new Manager(nodes, options);

client.on("ready", () => {
	console.log("ready");
	manager.init(client.user.id);
});

client.ws.on("VOICE_STATE_UPDATE", (data) => manager.voiceStateUpdate(data));
client.ws.on("VOICE_SERVER_UPDATE", (data) => manager.voiceServerUpdate(data));

client.on("messageCreate", async (message) => {
	if (message.content.includes("-start")) {
    const song = message.content.replace("-start", "");
		const player = manager.create({ guild: message.guild.id });
		const song = (await player.search(song, message.author.id, "yt")).tracks[0];

    if (!song) return message.reply("no song found");

		player.queue.add(song);
		player.setVoice(message.member.voice.channelId);
		player.setText(message.channelId);

    message.reply(`Successfully enqueued ${song.title}`);

		player.connect();
		player.play();

	}
);

manager.on("socketConnect", (socket) => console.log(`Socket online: ${socket.options.id}`));
manager.on("socketError", ({ socket, error }) =>
	console.log(`Socket error (${socket.options.id}): ${error.message ?? error.stack}`)
);

client.login("token");
```

## Author

👤 **DaanGamesDG**

- Website: https://daangamesdg.wtf/
- Email: <daan@daangamesdg.wtf>
- Twitter: [@DaanGamesDG](https://twitter.com/DaanGamesDG)
- Github: [@DaanGamesDG](https://github.com/DaanGamesDG)

## Donate

This will always be open source project, even if I don't receive donations. But there are still people out there that want to donate, so if you do here is the link [@PayPal](https://paypal.me/daangamesdg). Thanks in advance! I really appriciate it <3

## Lisence

Project is licensed under the © [**MIT License**](/LICENSE)

---
