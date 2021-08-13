## Extending

You can extend classes using the Structure.extend function

```js
const { Structure, Utils } = require("@stereo-bot/lavalink");

Structure.extend("Player", (Player) => {
  class extends Player {
    get formatted() {
      // this will return a YT time string (ex: 10:30)
      return Utils.convert(this.duration);
    }
  }
});
```

After extending you can use it like

```js
const formatted = player.formatted;
```

## Plugins

Plugins are used to extend the library even more

```js
// Creating your own
const { Plugin } = require("@stereo-bot/lavalink");

module.exports = class TestPlugin extends Plugin {
	constructor(options) {
		super();
		this.options = options;
	}

	// called when plugins are loaded
	// required function to bind the manager to this.manager
	init(manager) {
		this.manager = manager;
	}
};

// using a plugin
const { Manager } = require("@stereo-bot/lavalink");
const { TestPlugin } = require("my-plugin");

client.manager = new Manager(nodes, {
	plugins: [new TestPlugin({ foo: "bar" })],
});
```

@stereo-bot/lavalink comes with 1 plugins, Deezer and Spotify

```js
// Deezer plugin setup
const { Manager, Deezer } = require("@stereo-bot/lavalink");

client.manager = new Manager(nodes, {
	plugins: [
		new Deezer({
			// the max amount of tracks the plugin should return when a playlist is loaded
			playlistLimit: Infinity,
			// the max amount of tracks the plugin should return when an album is loaded
			albumLimit: Infinity,
			// if the plugin should fetch the track data from Lavalink or not
			// NOT RECOMMENED, this will spam YouTube and will get you ratelimited very easily
			converUnresolved: false,
		}),
	],
});

// Spotify plugin setup
const { Manager, Spotify } = require("@stereo-bot/lavalink");

client.manager = new Manager(nodes, {
	plugins: [
		new Spotify({
			// the max amount of tracks the plugin should return when a playlist is loaded
			playlistLimit: Infinity,
			// the max amount of tracks the plugin should return when an album is loaded
			albumLimit: Infinity,
			// if the plugin should fetch the track data from Lavalink or not
			// NOT RECOMMENED, this will spam YouTube and will get you ratelimited very easily
			converUnresolved: false,
			// The spotify client id, you can get them at https://developer.spotify.com/dashboard
			clientId: "spotify-client-id",
			// The spotify client id, you can get them at https://developer.spotify.com/dashboard
			// make sure to store the secret somewhere save (such as a .env file), a client secret is like a bot token
			clientSecret: "spotify-client-secret",
		}),
	],
});
```
