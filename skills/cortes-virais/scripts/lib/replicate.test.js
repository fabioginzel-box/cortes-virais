'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { token, criarCliente, Recusa, dataUrl } = require('./replicate')

const resposta = (status, corpo, cabecalhos = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => cabecalhos[k] || null },
  text: async () => (corpo == null ? '' : JSON.stringify(corpo)),
  arrayBuffer: async () => new ArrayBuffer(0)
})

function falso (respostas) {
  const chamadas = []
  const buscar = async (url, opcoes = {}) => {
    chamadas.push({ url, metodo: opcoes.method || 'GET', corpo: opcoes.body })
    const r = respostas.shift()
    if (!r) throw new Error(`chamada a mais: ${url}`)
    return r
  }
  return { buscar, chamadas }
}

async function semEspera (t, fazer) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let pronto = false
  const feito = fazer().finally(() => { pronto = true })
  for (let i = 0; i < 100 && !pronto; i++) { t.mock.timers.tick(60000); await new Promise(setImmediate) }
  return feito
}

test('token usa a variável de ambiente antes do Keychain', () => {
  assert.equal(token({ REPLICATE_API_TOKEN: 'r8_x' }, () => { throw new Error('não devia chamar') }), 'r8_x')
})

test('token lê do Keychain no Mac', () => {
  assert.equal(token({}, () => ({ status: 0, stdout: 'r8_k\n' }), 'darwin'), 'r8_k')
})

test('token lê do secret-tool no Linux', () => {
  const chamadas = []
  token({}, (cmd, args) => { chamadas.push([cmd, ...args]); return { status: 0, stdout: 'r8_l' } }, 'linux')
  assert.deepEqual(chamadas[0], ['secret-tool', 'lookup', 'service', 'cortes-virais-replicate'])
})

test('token explica como guardar no Keychain quando o item não existe no Mac', () => {
  assert.throws(() => token({}, () => ({ status: 44, stdout: '' }), 'darwin'), /security add-generic-password -s cortes-virais-replicate/)
})

test('token explica a variável do usuário no Windows', () => {
  assert.throws(() => token({}, () => { throw new Error('não devia chamar') }, 'win32'), /SetEnvironmentVariable\('REPLICATE_API_TOKEN'/)
})

test('token sem chaveiro no Linux explica o secret-tool', () => {
  assert.throws(() => token({}, () => ({ error: new Error('ENOENT') }), 'linux'), /secret-tool store/)
})

test('token pede para nunca colar o token na conversa', () => {
  assert.throws(() => token({}, () => ({ status: 1 }), 'darwin'), /Nunca cole o token na conversa/)
})

test('rodar cria pelo nome do modelo e espera até terminar', async () => {
  const { buscar, chamadas } = falso([
    resposta(201, { id: 'p1', status: 'starting' }),
    resposta(200, { id: 'p1', status: 'processing' }),
    resposta(200, { id: 'p1', status: 'succeeded', output: { text: 'oi' } })
  ])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  const p = await c.rodar('elevenlabs/scribe-v2', { audio: 'u' })
  assert.equal(p.output.text, 'oi')
  assert.equal(chamadas[0].url, 'https://api.replicate.com/v1/models/elevenlabs/scribe-v2/predictions')
})

test('criar cai para a versão quando o modelo não aceita a predição pelo nome', async () => {
  const { buscar, chamadas } = falso([
    resposta(404, { detail: 'not found' }),
    resposta(200, { latest_version: { id: 'v9' } }),
    resposta(201, { id: 'p2', status: 'starting' })
  ])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  await c.criar('dono/modelo', {})
  assert.deepEqual(JSON.parse(chamadas[2].corpo), { version: 'v9', input: {} })
})

test('a conta sem crédito vira recusa com o caminho para comprar', async () => {
  const { buscar } = falso([resposta(402, { detail: 'Insufficient credit' })])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  await assert.rejects(c.criar('a/b', {}), (e) => e instanceof Recusa && /billing/.test(e.message))
})

test('a predição que falha vira erro com o motivo', async () => {
  const { buscar } = falso([resposta(201, { id: 'p3', status: 'starting' }), resposta(200, { id: 'p3', status: 'failed', error: 'arquivo inválido' })])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  await assert.rejects(c.rodar('a/b', {}), /arquivo inválido/)
})

test('o 429 espera e tenta de novo', async () => {
  const { buscar, chamadas } = falso([resposta(429, null, { 'retry-after': '0' }), resposta(201, { id: 'p4', status: 'succeeded' })])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  await c.rodar('a/b', {})
  assert.equal(chamadas.length, 2)
})

test('dataUrl leva o arquivo inteiro dentro da URL, com o tipo', (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cortes-teste-'))
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }))
  const arquivo = path.join(pasta, 'v.mp4')
  fs.writeFileSync(arquivo, Buffer.from('abc'))
  assert.equal(dataUrl(arquivo, 'video/mp4'), 'data:video/mp4;base64,YWJj')
})

test('a resposta com caractere de controle cru numa string ainda é lida', async () => {
  const quebrada = { status: 200, ok: true, headers: { get: () => null }, text: async () => '{"id":"p1","status":"succeeded","output":"linha\u0001com\tcontrole"}' }
  const { buscar } = falso([resposta(201, { id: 'p1', status: 'starting' }), quebrada])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  const p = await c.rodar('google/gemini-3.1-pro', {})
  assert.equal(p.output, 'linha com controle')
})

test('a consulta de andamento que chega cortada é repetida', async (t) => {
  const cortada = { status: 200, ok: true, headers: { get: () => null }, text: async () => '{"id":"p1","status":"proc' }
  const { buscar, chamadas } = falso([resposta(201, { id: 'p1', status: 'starting' }), cortada, resposta(200, { id: 'p1', status: 'succeeded', output: 'ok' })])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  const p = await semEspera(t, () => c.rodar('google/gemini-3.1-pro', {}))
  assert.equal(p.output, 'ok')
  assert.equal(chamadas.length, 3)
})

test('a consulta de andamento que cai no meio da leitura é repetida', async (t) => {
  const caiu = { status: 200, ok: true, headers: { get: () => null }, text: async () => { throw new TypeError('terminated') } }
  const { buscar, chamadas } = falso([resposta(201, { id: 'p1', status: 'starting' }), caiu, resposta(200, { id: 'p1', status: 'succeeded', output: 'ok' })])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  const p = await semEspera(t, () => c.rodar('google/gemini-3.1-pro', {}))
  assert.equal(p.output, 'ok')
  assert.equal(chamadas.length, 3)
})

test('a criação com resposta ilegível não é repetida, para não cobrar duas predições', async () => {
  const cortada = { status: 201, ok: true, headers: { get: () => null }, text: async () => '{"id":"p1","sta' }
  const { buscar, chamadas } = falso([cortada])
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  await assert.rejects(c.criar('google/gemini-3.1-pro', {}), /resposta do Replicate ilegível/)
  assert.equal(chamadas.length, 1)
})

test('a consulta de andamento espera a pausa pedida ao cliente', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { buscar, chamadas } = falso([resposta(201, { id: 'p1', status: 'starting' }), resposta(200, { id: 'p1', status: 'succeeded' })])
  const c = criarCliente({ chave: 'k', buscar, pausa: 10000 })
  const feito = c.rodar('google/gemini-3.1-pro', {})
  const andar = async (ms) => { t.mock.timers.tick(ms); for (let i = 0; i < 5; i++) await new Promise(setImmediate) }
  await andar(0)
  await andar(9999)
  assert.equal(chamadas.length, 1)
  await andar(1)
  await feito
  assert.equal(chamadas.length, 2)
})

test('a criação que perde a conexão não é repetida e diz o que fazia', async () => {
  let chamadas = 0
  const buscar = async () => { chamadas++; throw new TypeError('fetch failed') }
  const c = criarCliente({ chave: 'k', buscar, pausa: 0 })
  await assert.rejects(c.criar('google/gemini-3.1-pro', {}), /criar a predição de google\/gemini-3\.1-pro: a conexão com o Replicate caiu \(fetch failed\)/)
  assert.equal(chamadas, 1)
})
