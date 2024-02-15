# hubot-external-commands

# Purpose

This is a hubot extension designed to allow you to break free from node, coffeescript, and javascript and still have all the chat operations you'd like.

You load executable commands in the `HUBOT_EXTERNAL_COMMANDS_DIR` directory. Hubot then loads each file that has executable permissions as a command. Optionally if you have a `<command>.desc` along side the `<command>` executable file, it will read in the lines from the desc onto the help menu.


# Setup

# Install & Configure

    npm install --save hubot-external-commands

edit  your `external-scripts.json` file  and add `hubot-external-commands` to it.

Set `HUBOT_EXTERNAL_COMMANDS_DIR`. (In this example it's set to `$HUBOT_HOME/shell`.

	shell/
	├── foo
	├── sprint
	└── sprint.desc


When loading, hubot will process the command foo with no help string. Sprint will be processed and the sprint.desc will be read for the help strings.

# The contents of sprint.desc

	sprint help - Display help message
	sprint left - Display time left in sprint
	sprint progress - Display sprint remaining information
	sprint scope - Display scope change information


# After loading

	> !help foo
	!botsnack - give the bot a food
	!foo
	> !help sprint
	!sprint
	!sprint help - Display help message
	!sprint left - Display time left in sprint
	!sprint progress - Display sprint remaining information
	!sprint scope - Display scope change information

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
