'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { pastaDoCache, ARQUIVOS } = require('./mediapipe')

const semFalse = process.platform === 'win32' || !fs.existsSync('/usr/bin/false')

// O Chrome que sai na hora (o /usr/bin/false no lugar dele) não pode deixar o servidor local aberto,
// segurando o processo até o tempo limite de quem chamou.
test('detectarRostos não deixa o processo preso quando o Chrome não abre', { skip: semFalse && 'sem o /usr/bin/false' }, () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'mediapipe-'))
  const versao = pastaDoCache({ CORTES_VIRAIS_CACHE_DIR: cache })
  for (const a of Object.keys(ARQUIVOS)) {
    fs.mkdirSync(path.dirname(path.join(versao, a)), { recursive: true })
    fs.writeFileSync(path.join(versao, a), 'x')
  }
  const quadro = path.join(cache, 'q.jpg')
  fs.writeFileSync(quadro, 'x')
  const codigo = `require(${JSON.stringify(path.join(__dirname, 'mediapipe'))}).detectarRostos([${JSON.stringify(quadro)}]).catch(() => {})`
  const r = spawnSync(process.execPath, ['-e', codigo], { env: { ...process.env, CORTES_VIRAIS_CHROME: '/usr/bin/false', CORTES_VIRAIS_CACHE_DIR: cache }, timeout: 10000 })
  assert.deepEqual([r.signal, r.status], [null, 0])
})
