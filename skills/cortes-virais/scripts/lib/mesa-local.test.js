'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { abrirMesaLocal, lerColecao, comandoParaAbrir, hostLocal } = require('./mesa-local')

function montar () {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-local-'))
  const pastaDaMesa = path.join(base, 'mesa-local')
  fs.mkdirSync(path.join(pastaDaMesa, 'previas'), { recursive: true })
  fs.writeFileSync(path.join(pastaDaMesa, 'index.html'), '<h1>mesa</h1>')
  fs.writeFileSync(path.join(pastaDaMesa, 'previas', '1.mp4'), Buffer.from('0123456789'))
  return { pastaDaMesa, pastaDaColecao: path.join(base, 'mesa', 'cortes') }
}

async function comMesa (fazer) {
  const pastas = montar()
  const mesa = await abrirMesaLocal(pastas)
  try { return await fazer(mesa, pastas) } finally { await mesa.fechar() }
}

test('a mesa local serve a página', async () => {
  await comMesa(async (mesa) => {
    assert.equal(await (await fetch(mesa.url)).text(), '<h1>mesa</h1>')
  })
})

test('a mesa local serve um pedaço da prévia para o vídeo poder pular', async () => {
  await comMesa(async (mesa) => {
    const r = await fetch(`${mesa.url}previas/1.mp4`, { headers: { Range: 'bytes=2-5' } })
    assert.deepEqual([r.status, await r.text(), r.headers.get('content-range')], [206, '2345', 'bytes 2-5/10'])
  })
})

test('a mesa local grava o corte na pasta do vídeo', async () => {
  await comMesa(async (mesa, pastas) => {
    const r = await fetch(`${mesa.url}api/cortes/3`, { method: 'PUT', body: JSON.stringify({ aprovado: true, por: 'local' }) })
    assert.equal(r.status, 204)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pastas.pastaDaColecao, '3.json'), 'utf8')), { aprovado: true, por: 'local' })
  })
})

test('a mesa local devolve a coleção no formato do banco do artefato', async () => {
  await comMesa(async (mesa) => {
    await fetch(`${mesa.url}api/cortes/1`, { method: 'PUT', body: JSON.stringify({ aprovado: false }) })
    assert.deepEqual(await (await fetch(`${mesa.url}api/cortes`)).json(), [{ id: '1', data: { aprovado: false } }])
  })
})

test('a mesa local recusa id com caminho', async () => {
  await comMesa(async (mesa) => {
    const r = await fetch(`${mesa.url}api/cortes/..%2F..%2Fx`, { method: 'PUT', body: '{}' })
    assert.equal(r.status, 404)
  })
})

test('a mesa local recusa documento que não é objeto', async () => {
  await comMesa(async (mesa) => {
    const r = await fetch(`${mesa.url}api/cortes/1`, { method: 'PUT', body: '[1]' })
    assert.equal(r.status, 400)
  })
})

test('a mesa local não serve arquivo fora da pasta da mesa', async () => {
  await comMesa(async (mesa) => {
    assert.equal((await fetch(`${mesa.url}previas/..%2Findex.html`)).status, 404)
  })
})

test('lerColecao de pasta que não existe é vazia', () => {
  assert.deepEqual(lerColecao(path.join(os.tmpdir(), 'nao-existe-mesa')), [])
})

test('comandoParaAbrir usa o open no Mac', () => {
  assert.deepEqual(comandoParaAbrir('http://x', 'darwin'), ['open', ['http://x']])
})

test('comandoParaAbrir usa o start no Windows', () => {
  assert.deepEqual(comandoParaAbrir('http://x', 'win32'), ['cmd', ['/c', 'start', '', 'http://x']])
})

test('comandoParaAbrir usa o xdg-open no Linux', () => {
  assert.deepEqual(comandoParaAbrir('http://x', 'linux'), ['xdg-open', ['http://x']])
})

function pedirComHost (url, host) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    http.get({ hostname: u.hostname, port: u.port, path: '/api/cortes', headers: { Host: host } }, (r) => { r.resume(); resolve(r.statusCode) }).on('error', reject)
  })
}

test('a mesa local recusa pedido com o Host de outro site', async () => {
  await comMesa(async (mesa) => {
    assert.equal(await pedirComHost(mesa.url, 'evil.example'), 403)
  })
})

test('hostLocal aceita o 127.0.0.1 com a porta', () => {
  assert.equal(hostLocal('127.0.0.1:53327'), true)
})

test('hostLocal aceita o localhost', () => {
  assert.equal(hostLocal('localhost:8080'), true)
})

test('hostLocal recusa outro domínio', () => {
  assert.equal(hostLocal('evil.example:53327'), false)
})
