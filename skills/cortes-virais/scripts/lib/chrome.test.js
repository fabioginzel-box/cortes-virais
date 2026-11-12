'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { acharChrome } = require('./chrome')

test('acharChrome não aceita uma pasta como o executável do Chrome', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'Google Chrome.app-'))
  assert.notEqual(acharChrome({ CORTES_VIRAIS_CHROME: pasta }), pasta)
})

test('acharChrome usa o arquivo apontado pela variável', () => {
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-')), 'chrome')
  fs.writeFileSync(arquivo, '')
  assert.equal(acharChrome({ CORTES_VIRAIS_CHROME: arquivo }), arquivo)
})
