'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { gerar, temporario, identidade, renomear } = require('./arquivo')

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'arquivo-'))

test('gerar grava no temporário e renomeia no fim', () => {
  const alvo = path.join(pasta(), 'a.mov')
  let gravadoEm = null
  gerar(alvo, (tmp) => { gravadoEm = tmp; fs.writeFileSync(tmp, 'x') })
  assert.equal(gravadoEm, temporario(alvo))
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'x')
})

test('gerar mantém a extensão no nome temporário', () => {
  assert.equal(path.extname(temporario('/x/recorte-1.mov')), '.mov')
})

test('gerar não refaz o que já existe', () => {
  const alvo = path.join(pasta(), 'a.mov')
  fs.writeFileSync(alvo, 'velho')
  gerar(alvo, () => { throw new Error('não devia gerar') })
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'velho')
})

test('gerar não deixa o alvo quando o processo falha no meio', () => {
  const alvo = path.join(pasta(), 'a.mov')
  assert.throws(() => gerar(alvo, (tmp) => { fs.writeFileSync(tmp, 'meio'); throw new Error('ffmpeg falhou') }), /ffmpeg falhou/)
  assert.equal(fs.existsSync(alvo), false)
})

test('gerar refaz por cima de um temporário que sobrou', () => {
  const alvo = path.join(pasta(), 'a.mov')
  fs.writeFileSync(temporario(alvo), 'sobra')
  gerar(alvo, (tmp) => fs.writeFileSync(tmp, 'novo'))
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'novo')
})

test('gerar espera a geração assíncrona', async () => {
  const alvo = path.join(pasta(), 'q')
  await gerar(alvo, async (tmp) => { fs.mkdirSync(tmp); fs.writeFileSync(path.join(tmp, 'q0001.png'), 'x') })
  assert.equal(fs.existsSync(path.join(alvo, 'q0001.png')), true)
})

test('identidade muda quando o arquivo muda de tamanho', () => {
  const a = path.join(pasta(), 'f.mp4')
  fs.writeFileSync(a, 'x')
  const antes = JSON.stringify(identidade(a))
  fs.writeFileSync(a, 'xy')
  assert.notEqual(JSON.stringify(identidade(a)), antes)
})

test('renomear tenta de novo quando o Windows segura o arquivo', () => {
  let vezes = 0
  renomear('a', 'b', { pausa: 1, mover: () => { if (++vezes < 3) { const e = new Error('ocupado'); e.code = 'EBUSY'; throw e } } })
  assert.equal(vezes, 3)
})

test('renomear não insiste em erro que não é de arquivo ocupado', () => {
  let vezes = 0
  assert.throws(() => renomear('a', 'b', { pausa: 1, mover: () => { vezes++; const e = new Error('sumiu'); e.code = 'ENOENT'; throw e } }), /sumiu/)
  assert.equal(vezes, 1)
})
