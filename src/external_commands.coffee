# Description:
#   Run programs from a specified directory as commands
#
# Dependencies:
#   None
#
# Configuration:
#   HUBOT_EXTERNAL_COMMANDS_DIR - path to where it should look for external commands
#
# Commands:
#   hubot refresh-commands - rescan and load external commands
#
# Author:
#   rick, stahnma
#
# Category: workflow
#

# runs external commands from hubot
util   = require 'util'
spawn = require('child_process').spawn
exec  = require('child_process').exec
env   = process.env
fs    = require 'fs'
path  = require 'path'

# Setup the Environment
if !env.HUBOT_EXTERNAL_COMMANDS_DIR
  env.HUBOT_EXTERNAL_COMMANDS_DIR = "./shell"
else
  env.HUBOT_EXTERNAL_COMMANDS_DIR = env.HUBOT_EXTERNAL_COMMANDS_DIR

env.PATH = env.HUBOT_EXTERNAL_COMMANDS_DIR + ':' + env.PATH

module.exports = (robot) ->

  robot.logger.info "HUBOT_EXTERNAL_COMMANDS_DIR: #{env.HUBOT_EXTERNAL_COMMANDS_DIR}"
  externalCommands = []

  # Helper Functions
  addCommand = (command) ->
    if command != ''
      #  command name cannot have a '.' in it
      if command.match /\/.*\./
        return
      command = command.replace /^.*\//, ''
      robot.commands.push "#{robot.name} #{command}"
      externalCommands.push(command)
      robot.commands = Array.from(new Set(robot.commands))
      findAndPushCommands(env.HUBOT_EXTERNAL_COMMANDS_DIR)

  findAndPushCommands = (directory) ->
    files = fs.readdirSync(directory)
    for file in files
      filePath = path.join(directory, file)
      if file.endsWith('.desc')
        data = fs.readFileSync(filePath, 'utf8')
        # if the <filename>.desc does not have a corresponding <filename> in
        # the same directory, skip it
        if !fs.existsSync(filePath.replace('.desc', ''))
          continue
        data.split('\n').forEach (c) ->
          # if the line does not start with the <filename>, skip it
          if !c.startsWith(file.replace('.desc', ''))
            return
          robot.commands.push "#{robot.name} " + c
      robot.commands = Array.from(new Set(robot.commands))

  findFind = (findCommandCallback) ->
    exec "find --version", (error, stdout, stderr) ->
       if error && error.code != 0
         # Find is BSD on Mac
         if /illegal/.test stderr
           findCommand = "find #{env.HUBOT_EXTERNAL_COMMANDS_DIR} -maxdepth 1 -perm +111 -not -type d -print"
           findCommandCallback(findCommand)
         else
           robot.logger.error error
           robot.logger.error "error retrieving commands from external commands:\n#{util.inspect error}"
           robot.logger.error stderr
           robot.logger.error "Error determining find version"
       else if stdout.match(/GNU findutils/)
         findCommand = "find #{env.HUBOT_EXTERNAL_COMMANDS_DIR} -maxdepth 1 -executable -not -type d -print"
         findCommandCallback(findCommand)
       else
         # Just assume is BSD find in all cases not matching GNU
         findCommand = "find #{env.HUBOT_EXTERNAL_COMMANDS_DIR} -maxdepth 1 -perm +111 -not -type d -print"
         findCommandCallback(findCommand)

  refreshCommands = (msg) ->
    robot.commands = robot.commands.filter (x) -> !(x in externalCommands)
    externalCommands = []

    findFind (findCommand) ->
      exec findCommand, (error, stdout, stderr) ->
        if error && error.code != 0
          robot.logger.error error
          robot.logger.error "error retrieving commands from external commands:\n#{util.inspect error}"
          robot.logger.error stderr
          robot.logger.error "oh well, external commands won't be available"
        else
          stdout.split("\n").forEach addCommand
          robot.logger.info "loaded #{externalCommands.length} commands from external commands: #{externalCommands.join(', ')}"
          if msg
            msg.send "external commands commands refreshed: #{externalCommands.length} total"

  # Init
  refreshCommands(null)

  robot.respond /refresh-commands\s*$/i, (msg) ->
    refreshCommands(msg)

  robot.respond /([\w-]+) ?(.*?)$/i, (msg) ->
    command = msg.match[1].toLowerCase().replace(/[`|'";&$!{}<>]/gm, '')
    args    = (msg.match[2] || '').replace(/[`|'";&$!{}<>]/gm, '')
    argv    = args.split(' ').filter (s) -> return s != '' # "

    if command in externalCommands
      childEnv = Object.create(process.env)
      robot.logger.info "spawning #{command} with args: #{args}"
      buffer = ''

      child = spawn(command, argv, env: childEnv)

      child.stdout.on 'data', (data) -> buffer += data.toString()
      child.stderr.on 'data', (data) -> buffer += 'stderr: ' + data.toString()

      child.on 'close', (code, signal) ->
        if code != 0
          buffer += "\n[exit: " + code + "]\n"
        if /slack/.test(robot.adapterName)
          try
            jsonOutput = JSON.parse(buffer)
            jsonOutput.channel = msg.message.room
            jsonOutput.as_user = true
            robot.logger.info "Sending JSON payload via slack API"
            { WebClient } = require('@slack/web-api');
            slackWebClient = new WebClient(process.env.HUBOT_SLACK_TOKEN);
            slackWebClient.chat.postMessage(jsonOutput);
          catch
            msg.send buffer

      robot.logger.info "Waiting on the child for #{command}"
    else
      return
