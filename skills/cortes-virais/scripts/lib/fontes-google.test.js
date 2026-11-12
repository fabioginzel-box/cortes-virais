'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { baixarFonteDoGoogle, urlDoCss, lerCss } = require('./fontes-google')

const CSS = "@font-face { font-family: 'Bebas Neue'; src: url(https://fonts.gstatic.com/s/bebasneue/v16/x.ttf) format('truetype'); }"
const resposta = (status, corpo = '') => ({ status, ok: status < 300, text: async () => corpo, arrayBuffer: async () => Buffer.from('fonte') })

test('urlDoCss troca o espaço do nome por +', () => {
  assert.equal(urlDoCss('Bebas Neue', 800), 'https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@800')
})

test('lerCss acha o TTF do CSS', () => {
  assert.deepEqual(lerCss(CSS), { url: 'https://fonts.gstatic.com/s/bebasneue/v16/x.ttf', extensao: '.ttf' })
})

test('baixarFonteDoGoogle cai para o próximo peso quando o pedido não existe', async () => {
  const pedidos = []
  const respostas = [resposta(400), resposta(400), resposta(400), resposta(400), resposta(200, CSS), resposta(200)]
  const buscar = async (url) => { pedidos.push(url); return respostas.shift() }
  const r = await baixarFonteDoGoogle('Bebas Neue', fs.mkdtempSync(path.join(os.tmpdir(), 'gf-')), { buscar })
  assert.deepEqual(r, { arquivo: 'bebas-neue-400.ttf', peso: 400 })
})

test('baixarFonteDoGoogle grava o arquivo na pasta do canal', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-'))
  const respostas = [resposta(200, CSS), resposta(200)]
  await baixarFonteDoGoogle('Bebas Neue', pasta, { buscar: async () => respostas.shift() })
  assert.equal(fs.readFileSync(path.join(pasta, 'bebas-neue-800.ttf'), 'utf8'), 'fonte')
})

test('baixarFonteDoGoogle diz quando a família não existe', async () => {
  await assert.rejects(baixarFonteDoGoogle('Nao Existe', os.tmpdir(), { buscar: async () => resposta(400) }), /não achei "Nao Existe"/)
})
