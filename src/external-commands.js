// Description:
//   Run programs from a specified directory as commands
//
// Dependencies:
//   None
//
// Configuration:
//   HUBOT_EXTERNAL_COMMANDS_DIR - directory of executables (default: ./shell)
//   HUBOT_EXTERNAL_COMMANDS_TIMEOUT - seconds a command may run before it's stopped (default: 300)
//
// Commands:
//   hubot refresh-commands - rescan and load external commands
//
// Notes:
//   Every executable file in the directory whose name has no "." becomes a
//   command. An optional <command>.desc lists its help lines, each starting
//   with the command name (e.g. "sprint left - Display time left in sprint").
//   Output (stdout, and stderr prefixed "stderr: ") is sent to the room. On
//   Slack, output that is a JSON object is posted as a chat.postMessage
//   payload, so a command can send Block Kit messages.
//   Commands run without a shell. Arguments are split on spaces, and the
//   characters ` | ' " ; & $ ! { } < > are removed from them.
//
// Author:
//   rick, stahnma
//
// Category: workflow

'use strict'

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const UNSAFE = /[`|'";&$!{}<>]/g

module.exports = (robot) => {
  const dir = () => path.resolve(process.env.HUBOT_EXTERNAL_COMMANDS_DIR || './shell')
  const timeoutMs = () => (Number(process.env.HUBOT_EXTERNAL_COMMANDS_TIMEOUT) || 300) * 1000

  let commands = new Set()
  let helpLines = []

  const isExecutableFile = (file) => {
    try {
      if (!fs.statSync(file).isFile()) return false
      fs.accessSync(file, fs.constants.X_OK)
      return true
    } catch (err) {
      return false
    }
  }

  // The help lines for a command: its .desc lines, or just its name. They
  // start with "hubot", which help scripts replace with the bot's alias or
  // name.
  const helpFor = (command) => {
    const desc = path.join(dir(), `${command}.desc`)
    let lines = []
    if (fs.existsSync(desc)) {
      lines = fs.readFileSync(desc, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith(command))
    }
    return (lines.length ? lines : [command]).map(line => `hubot ${line}`)
  }

  const refresh = () => {
    let names = []
    try {
      names = fs.readdirSync(dir())
    } catch (err) {
      robot.logger.error(`external commands: can't read ${dir()}: ${err.message}`)
    }
    commands = new Set(
      names
        .filter(name => !name.includes('.'))
        .filter(name => isExecutableFile(path.join(dir(), name)))
        .map(name => name.toLowerCase())
    )

    // Replace this script's lines in robot.helpStrings rather than adding
    // duplicates.
    robot.helpStrings = robot.helpStrings.filter(line => !helpLines.includes(line))
    helpLines = [...commands].flatMap(helpFor)
    robot.helpStrings.push(...helpLines)

    robot.logger.info(`loaded ${commands.size} external commands from ${dir()}: ${[...commands].join(', ')}`)
    return commands.size
  }

  // On Slack, a JSON object on stdout is a message payload (e.g. Block Kit).
  const postPayload = (msg, output) => {
    const web = robot.adapter && robot.adapter.client && robot.adapter.client.web
    if (!web || !/slack/i.test(robot.adapterName)) return false
    let payload
    try {
      payload = JSON.parse(output)
    } catch (err) {
      return false
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
    payload.channel = msg.message.room
    if (msg.message.thread_ts) payload.thread_ts = msg.message.thread_ts
    robot.logger.info('Sending JSON payload via slack API')
    Promise.resolve(web.chat.postMessage(payload)).catch(err => {
      robot.logger.error(`external commands: postMessage failed: ${err.message}`)
      msg.send(output)
    })
    return true
  }

  const run = (msg, command, args) => {
    const argv = args.replace(UNSAFE, '').split(' ').filter(Boolean)
    robot.logger.info(`spawning ${command} with args: ${argv.join(' ')}`)

    let output = ''
    // Its own process group, so a timeout stops anything it started too.
    const child = spawn(path.join(dir(), command), argv, { env: process.env, detached: true })
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch (err) {
        child.kill('SIGTERM')
      }
    }, timeoutMs())
    child.stdout.on('data', data => { output += data.toString() })
    child.stderr.on('data', data => { output += 'stderr: ' + data.toString() })
    child.on('error', err => {
      clearTimeout(timer)
      robot.logger.error(`external commands: ${command}: ${err.message}`)
      msg.send(`I couldn't run ${command}: ${err.message}`)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (signal) output += `\n[stopped: ${signal}]\n`
      else if (code !== 0) output += `\n[exit: ${code}]\n`
      if (output.trim() === '') return
      if (!postPayload(msg, output)) msg.send(output)
    })
  }

  // Help lines as shown to users, with "hubot" replaced by the alias or name.
  const scriptHelp = () => {
    const name = robot.alias || robot.name
    return robot.helpCommands().map(line =>
      name.length === 1 ? line.replace(/^hubot\s*/i, name) : line.replace(/^hubot/i, name))
  }

  // Hubot 14's built-in help command only lists commands registered with
  // robot.commands (the CommandBus), so help lines from scripts, including
  // ours from .desc files, never show up. It also ignores "help <query>".
  // Wrap its handler to list script help lines too and to filter on a query.
  const extendBuiltInHelp = () => {
    const bus = robot.commands
    const help = bus && typeof bus.getCommand === 'function' && bus.getCommand('help')
    if (!help || help.includesScriptHelp) return
    const original = help.handler
    const escape = s => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
    const names = [robot.name, robot.alias].filter(Boolean).map(escape).join('|')
    const addressed = new RegExp(`^\\s*@?(?:${names})[:,]?\\s*`, 'i')

    help.handler = async (ctx) => {
      const text = (ctx.context && ctx.context.message && ctx.context.message.text) || ''
      const query = (ctx.args && ctx.args.query) ||
        text.replace(addressed, '').replace(/^help\b\s*/i, '').trim()
      if (query.startsWith('search ')) return original(ctx)

      if (!query) {
        const lines = scriptHelp()
        const builtIn = await original(ctx)
        return lines.length ? `${builtIn}\n\nScript commands:\n${lines.join('\n')}` : builtIn
      }

      const pattern = new RegExp(escape(query), 'i')
      const matches = bus.listCommands()
        .filter(cmd => pattern.test(cmd.id) || pattern.test(cmd.description))
        .map(cmd => `${cmd.id} - ${cmd.description}`)
        .concat(scriptHelp().filter(line => pattern.test(line)))
      return matches.length ? matches.join('\n') : `No available commands match ${query}`
    }
    help.includesScriptHelp = true
  }

  refresh()
  extendBuiltInHelp()

  robot.respond(/refresh-commands\s*$/i, (msg) => {
    msg.send(`external commands refreshed: ${refresh()} total`)
  })

  robot.respond(/([\w-]+) ?(.*?)$/i, (msg) => {
    const command = msg.match[1].toLowerCase()
    if (commands.has(command)) run(msg, command, msg.match[2] || '')
  })
}
