# hubot-external-commands

This is a hubot extension designed to allow you to break free from node and javascript and still have all the chat operations you'd like.

You load executable commands in the `HUBOT_EXTERNAL_COMMANDS_DIR` directory. Hubot then loads each file that has executable permissions as a command. Optionally if you have a `<command>.desc` along side the `<command>` executable file, it will read in the lines from the desc onto the help menu.

# Setup

## Install & Configure

    npm install --save hubot-external-commands

edit  your `external-scripts.json` file  and add `hubot-external-commands` to it.

Requires hubot 11 or later and Node.js 18 or later.

## Configuration

  * `HUBOT_EXTERNAL_COMMANDS_DIR` - directory of executables. Defaults to `./shell`, relative to the bot's working directory.
  * `HUBOT_EXTERNAL_COMMANDS_TIMEOUT` - seconds a command may run before it (and any processes it started) is stopped with `SIGTERM`. Defaults to `300`.

In this example `HUBOT_EXTERNAL_COMMANDS_DIR` is set to `$HUBOT_HOME/shell`.

	shell/
	├── foo
	├── sprint
	└── sprint.desc


When loading, hubot will process the command foo with no help string. Sprint will be processed and the sprint.desc will be read for the help strings. Only lines in a `.desc` file that start with the command name are used. Run `hubot refresh-commands` to rescan the directory after adding or removing commands.

## The contents of sprint.desc

	sprint help - Display help message
	sprint left - Display time left in sprint
	sprint progress - Display sprint remaining information
	sprint scope - Display scope change information


## After loading

	> !help foo
	!botsnack - give the bot a food
	!foo
	> !help sprint
	!sprint help - Display help message
	!sprint left - Display time left in sprint
	!sprint progress - Display sprint remaining information
	!sprint scope - Display scope change information

On hubot 14 and later, the built-in `help` command only lists commands registered with hubot's `CommandBus`, so this package extends it: `hubot help` also lists help lines from scripts (including the `.desc` lines above), and `hubot help <query>` filters both. Help scripts such as `hubot-help` show the `.desc` lines on any version.

# Running commands

Commands are run directly by full path, not through a shell. Arguments are split on spaces, and the characters `` ` | ' " ; & $ ! { } < > `` are removed from them.

stdout is sent to the room. Any stderr is included too, with each chunk prefixed `stderr: `. If the command exits non-zero, `[exit: N]` is appended, and if it was stopped for running too long, `[stopped: SIGTERM]`.

# Rich Text and Slack Blocks

This plugin now has initial support for [Slack blocks](https://api.slack.com/block-kit/building). The plugin will only work with slack blocks if it detects slack as the adapter in play with hubot. (e.g. it won't attempt blocks if using discord, irc, or shell adapters).

To use slack blocks, you can test them out using the [Slack Block Kit Builder](https://app.slack.com/block-kit-builder/).

The stdout of the external program you write needs to emit the full JSON document that will be send via the bot. The bot will then add channel information (and the thread, if the command was run in a thread) and send the payload through the Slack adapter's web client without additional modification.

:warning: If you want to send an image, that is not yet supported, however linking to existing image is via block kit.

The default mode is strings on stdout. If those strings contain URIs, slack will make them links even without doing a full JSON block.

# Caveats

  * You cannot use a file with a dot "." in the filename. This breaks several the command/help processing subsystem.
  * Executables/scripts must be executable and have ownership open to the hubot user
  * Placing scripts in subdirectories of `HUBOT_EXTERNAL_COMMANDS_DIR` will not work.
  * The bot must be addressed directly to use the command. (respond vs hear). This may change in the future.


# Development

    npm install
    npm test        # runs test/ with node --test
    npm run lint
    npm run dev     # shell adapter with the commands in fixtures/shell and alias "!"

# Contributors

  * [rick](https://github.com/rick)
  * [stahnma](https://github.com/stahnma)

# License

MIT
