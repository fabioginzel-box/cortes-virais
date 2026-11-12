'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { acharChrome, lerPorta } = require('./chrome')

test('acharChrome não aceita uma pasta como o executável do Chrome', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'Google Chrome.app-'))
  assert.notEqual(acharChrome({ CORTES_VIRAIS_CHROME: pasta }), pasta)
})

test('acharChrome usa o arquivo apontado pela variável', () => {
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-')), 'chrome')
  fs.writeFileSync(arquivo, '')
  assert.equal(acharChrome({ CORTES_VIRAIS_CHROME: arquivo }), arquivo)
})

const falhaCom = (code) => () => { const e = new Error(code); e.code = code; throw e }

test('lerPorta lê a porta da primeira linha do DevToolsActivePort', () => {
  assert.equal(lerPorta('x', () => '53123\n/devtools/browser/abc'), 53123)
})

test('lerPorta trata o arquivo ainda preso pelo Chrome no Windows como ainda não pronto', () => {
  assert.equal(lerPorta('x', falhaCom('EBUSY')), null)
})

test('lerPorta trata o arquivo que ainda não existe como ainda não pronto', () => {
  assert.equal(lerPorta('x', falhaCom('ENOENT')), null)
})

test('lerPorta não esconde outro erro de leitura', () => {
  assert.throws(() => lerPorta('x', falhaCom('EISDIR')), /EISDIR/)
})
