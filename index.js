'use strict'

const fs = require('fs')
const path = require('path')

// Loaded by hubot from external-scripts.json. scripts, if given, limits which
// files in src/ are loaded ('*' loads them all).
module.exports = async (robot, scripts) => {
  const scriptsPath = path.resolve(__dirname, 'src')
  for (const script of fs.readdirSync(scriptsPath)) {
    if (scripts && !scripts.includes('*') && !scripts.includes(script)) continue
    await robot.loadFile(scriptsPath, script)
  }
}
