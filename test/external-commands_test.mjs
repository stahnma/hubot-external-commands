// src/external-commands.js turns executables in HUBOT_EXTERNAL_COMMANDS_DIR
// into chat commands. These tests use a throwaway directory of small shell
// scripts and a robot with an adapter that records what it sends.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Robot, Adapter, TextMessage, User } from 'hubot'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubot-external-'))
const write = (name, body, mode = 0o755) =>
  fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode })

class RecordingAdapter extends Adapter {
  constructor (robot) {
    super(robot)
    this.name = 'Recording'
    this.sent = []
  }

  async send (envelope, ...strings) { this.sent.push(...strings) }
  async reply (envelope, ...strings) { this.sent.push(...strings) }
  async run () { this.emit('connected') }
  close () {}
}

describe('external commands', () => {
  let robot, previousDir, previousTimeout
  const user = new User('1', { name: 'tester', room: 'C123' })

  // Sends text to the robot and returns what it sent back within wait ms.
  const say = async (text, { wait = 300, room = 'C123' } = {}) => {
    robot.adapter.sent = []
    await robot.receive(new TextMessage(user, text, `${Date.now()}`, { room }))
    await new Promise(resolve => setTimeout(resolve, wait))
    return robot.adapter.sent
  }

  before(async () => {
    write('greet', 'echo "hello $1 ($#)"')
    fs.writeFileSync(
      path.join(dir, 'greet.desc'),
      'greet <name> - Say hello\nunrelated line\ngreet loudly - Shout\n'
    )
    write('fail', 'echo oops >&2; exit 3')
    write('blocks', `echo '{"text":"hi","blocks":[]}'`)
    write('slow', 'sleep 5')
    write('notexec', 'echo no', 0o644)
    write('has.dot', 'echo no')

    previousDir = process.env.HUBOT_EXTERNAL_COMMANDS_DIR
    previousTimeout = process.env.HUBOT_EXTERNAL_COMMANDS_TIMEOUT
    process.env.HUBOT_EXTERNAL_COMMANDS_DIR = dir
    process.env.HUBOT_EXTERNAL_COMMANDS_TIMEOUT = '1'

    robot = new Robot({ use: robot => new RecordingAdapter(robot) }, false, 'hubot')
    await robot.loadAdapter()
    await robot.run()
    const loadExternalScripts = (await import(path.join(root, 'index.js'))).default
    await loadExternalScripts(robot)
  })

  after(() => {
    robot.shutdown()
    for (const [key, value] of [
      ['HUBOT_EXTERNAL_COMMANDS_DIR', previousDir],
      ['HUBOT_EXTERNAL_COMMANDS_TIMEOUT', previousTimeout]
    ]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('runs an executable with its arguments, without a shell', async () => {
    assert.deepStrictEqual(await say('hubot greet world'), ['hello world (1)\n'])
    assert.deepStrictEqual(await say('hubot greet a;b $(id) `id`'), ['hello ab (3)\n'])
  })

  it('only loads executable files without a dot in the name', async () => {
    assert.deepStrictEqual(await say('hubot notexec'), [])
    assert.deepStrictEqual(await say('hubot has'), [])
  })

  it('adds .desc lines, or the bare name, to help', () => {
    const help = robot.helpCommands()
    assert.ok(help.includes('hubot refresh-commands - rescan and load external commands'))
    assert.ok(help.includes('hubot greet <name> - Say hello'))
    assert.ok(help.includes('hubot greet loudly - Shout'))
    assert.ok(!help.some(line => line.includes('unrelated line')))
    assert.ok(help.includes('hubot fail'))
    assert.ok(!help.includes('hubot greet'))
  })

  it("lists script help lines in hubot's built-in help", async () => {
    const [reply] = await say('hubot help', { wait: 50 })
    assert.match(reply, /Available commands:/)
    assert.match(reply, /^hubot greet loudly - Shout$/m)
    assert.match(reply, /^hubot refresh-commands - rescan and load external commands$/m)
  })

  it('filters built-in help on a query', async () => {
    assert.deepStrictEqual(await say('hubot help greet', { wait: 50 }), [
      'hubot greet <name> - Say hello\nhubot greet loudly - Shout'
    ])
    assert.deepStrictEqual(await say('hubot help nosuchthing', { wait: 50 }), [
      'No available commands match nosuchthing'
    ])
  })

  it('reports stderr and a non-zero exit', async () => {
    assert.deepStrictEqual(await say('hubot fail'), ['stderr: oops\n\n[exit: 3]\n'])
  })

  it('stops a command that runs too long', async () => {
    assert.deepStrictEqual(await say('hubot slow', { wait: 1500 }), ['\n[stopped: SIGTERM]\n'])
  })

  it('sends JSON output as text outside Slack', async () => {
    assert.deepStrictEqual(await say('hubot blocks'), ['{"text":"hi","blocks":[]}\n'])
  })

  it('posts JSON output as a message payload on Slack', async () => {
    const posted = []
    const { adapterName } = robot
    robot.adapterName = 'slack'
    robot.adapter.client = { web: { chat: { postMessage: async p => posted.push(p) } } }
    try {
      assert.deepStrictEqual(await say('hubot blocks'), [])
      assert.deepStrictEqual(posted, [{ text: 'hi', blocks: [], channel: 'C123' }])
    } finally {
      robot.adapterName = adapterName
      delete robot.adapter.client
    }
  })

  it('picks up new commands on refresh-commands', async () => {
    write('later', 'echo later')
    assert.deepStrictEqual(await say('hubot later'), [])
    assert.deepStrictEqual(await say('hubot refresh-commands', { wait: 50 }), [
      'external commands refreshed: 5 total'
    ])
    assert.deepStrictEqual(await say('hubot later'), ['later\n'])
    // The help lines are replaced, not duplicated.
    assert.strictEqual(
      robot.helpStrings.filter(line => line === 'hubot greet loudly - Shout').length,
      1
    )
  })
})
