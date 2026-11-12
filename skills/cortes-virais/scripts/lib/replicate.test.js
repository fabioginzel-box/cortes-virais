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
