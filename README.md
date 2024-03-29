# hubot-external-commands

This is a hubot extension designed to allow you to break free from node, coffeescript, and javascript and still have all the chat operations you'd like.

You load executable commands in the `HUBOT_EXTERNAL_COMMANDS_DIR` directory. Hubot then loads each file that has executable permissions as a command. Optionally if you have a `<command>.desc` along side the `<command>` executable file, it will read in the lines from the desc onto the help menu.

# Setup

## Install & Configure

    npm install --save hubot-external-commands

edit  your `external-scripts.json` file  and add `hubot-external-commands` to it.

Set `HUBOT_EXTERNAL_COMMANDS_DIR`. (In this example it's set to `$HUBOT_HOME/shell`.

	shell/
	├── foo
	├── sprint
	└── sprint.desc


When loading, hubot will process the command foo with no help string. Sprint will be processed and the sprint.desc will be read for the help strings.

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
	!sprint
	!sprint help - Display help message
	!sprint left - Display time left in sprint
	!sprint progress - Display sprint remaining information
	!sprint scope - Display scope change information

# Rich Text and Slack Blocks

This plugin now has initial support for [Slack blocks[(https://api.slack.com/block-kit/building). The plugin will only work with slack blocks if it detects slack as the adapter in play with hubot. (e.g. it won't attempt blocks if using discord, irc, or shell adapters).

To use slack blocks, you can test them out using the [Slack Block Kit Builder](https://app.slack.com/block-kit-builder/).

The stdout of the external program you write needs to emit the full JSON document that will be send via the bot. The bot will then add channel information and send the payload without additional modification.

:warning: If you want to send an image, that is not yet supported, however linking to existing image is via block kit.

The deafult mode is strings on stdout. If those strings contain URIs, slack will make them links even without doing a full JSON block.

# Caveats

  * You cannot use a file with a dot "." in the filename. This breaks several the command/help processing subsystem.
  * Executables/scripts must be executable and have ownership open to the hubot user
  * Placing scripts in subdirectories of `HUBOT_EXTERNAL_COMMANDS_DIR` will not work.
  * THe bot must be addressed directly to use the command. (respond vs hear). This may change in the future.


# Contributors

  * [rick](https://github.com/rick)
  * [stahnma](https://github.com/stahnma)

# License

MIT
