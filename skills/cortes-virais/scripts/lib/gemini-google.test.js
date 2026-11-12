'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { MODELO_PADRAO, chave, modelo, pedidoDeConteudo, criarBuscarLongo, criarClienteGoogle } = require('./gemini-google')
const { Recusa } = require('./replicate')

const CHAVE = 'AIza-chave-de-teste'
const UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=u1&upload_protocol=resumable'
const URI = 'https://generativelanguage.googleapis.com/v1beta/files/abc'

const resposta = (status, corpo, cabecalhos = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => cabecalhos[k.toLowerCase()] ?? null },
  text: async () => (corpo == null ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
})

function falso (respostas) {
  const chamadas = []
  const buscar = async (url, opcoes = {}) => {
    chamadas.push({ url, metodo: opcoes.method || 'GET', cabecalhos: opcoes.headers || {}, corpo: opcoes.body })
    const r = respostas.shift()
    if (!r) throw new Error(`chamada a mais: ${url}`)
    return r
  }
  return { buscar, chamadas }
}

const inicio = () => resposta(200, null, { 'x-goog-upload-url': UPLOAD })
const subido = (state = 'ACTIVE') => resposta(200, { file: { name: 'files/abc', uri: URI, mimeType: 'video/mp4', state } })
const estado = (state, extra = {}) => resposta(200, { name: 'files/abc', uri: URI, mimeType: 'video/mp4', state, ...extra })
const apagado = () => resposta(200, {})
const gerado = (parts, extra = {}) => resposta(200, {
  candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 120000, candidatesTokenCount: 900, thoughtsTokenCount: 4000, totalTokenCount: 124900 },
  ...extra
})
const fluxo = (...meio) => [inicio(), subido(), ...meio, apagado()]

function video (t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cortes-google-'))
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }))
  const arquivo = path.join(pasta, 'parte-1.mp4')
  fs.writeFileSync(arquivo, Buffer.from('abcdef'))
  return { pasta, arquivo }
}

const cliente = (buscar, extra = {}) => criarClienteGoogle({ chave: CHAVE, buscar, pausa: 0, ...extra })

test('chave lê a GEMINI_API_KEY aparada', () => {
  assert.equal(chave({ GEMINI_API_KEY: '  AIza123 \n' }), 'AIza123')
})

test('chave devolve null sem a variável', () => {
  assert.equal(chave({}), null)
})

test('chave trata a variável em branco como ausente', () => {
  assert.equal(chave({ GEMINI_API_KEY: '   ' }), null)
})

test('modelo usa a CORTES_VIRAIS_GEMINI_MODELO', () => {
  assert.equal(modelo({ CORTES_VIRAIS_GEMINI_MODELO: 'gemini-4-carbon' }), 'gemini-4-carbon')
})

test('modelo cai no padrão sem a variável', () => {
  assert.equal(modelo({}), MODELO_PADRAO)
  assert.equal(MODELO_PADRAO, 'gemini-3.1-pro-preview')
})

test('criarClienteGoogle sem chave recusa com o endereço para criar uma', () => {
  assert.throws(() => criarClienteGoogle({ chave: null, buscar: async () => {} }), (e) => e instanceof Recusa && /aistudio\.google\.com\/apikey/.test(e.message))
})

test('o início do upload resumable leva os cabeçalhos da Files API e a chave no x-goog-api-key', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(gerado([{ text: '{}' }])))
  await cliente(buscar).assistir(arquivo, 'assista')
  const c = chamadas[0]
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/upload/v1beta/files')
  assert.equal(c.metodo, 'POST')
  assert.deepEqual(c.cabecalhos, {
    'x-goog-api-key': CHAVE,
    'X-Goog-Upload-Protocol': 'resumable',
    'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': '6',
    'X-Goog-Upload-Header-Content-Type': 'video/mp4',
    'Content-Type': 'application/json'
  })
  assert.deepEqual(JSON.parse(c.corpo), { file: { display_name: 'parte-1.mp4' } })
})

test('o envio dos bytes vai ao endereço devolvido, com offset 0 e upload, finalize', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(gerado([{ text: '{}' }])))
  await cliente(buscar).assistir(arquivo, 'assista')
  const c = chamadas[1]
  assert.equal(c.url, UPLOAD)
  assert.deepEqual(c.cabecalhos, { 'Content-Length': '6', 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' })
  assert.equal(Buffer.from(c.corpo).toString(), 'abcdef')
})

test('nenhuma URL leva a chave', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(gerado([{ text: '{}' }])))
  await cliente(buscar).assistir(arquivo, 'assista')
  assert.equal(chamadas.length, 4)
  assert.ok(chamadas.every((c) => !c.url.includes(CHAVE) && !/[?&]key=/.test(c.url)))
})

test('assistir consulta o arquivo até ele ficar ACTIVE', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso([inicio(), subido('PROCESSING'), estado('PROCESSING'), estado('ACTIVE'), gerado([{ text: '{}' }]), apagado()])
  await cliente(buscar).assistir(arquivo, 'assista')
  const consultas = chamadas.filter((c) => c.metodo === 'GET')
  assert.equal(consultas.length, 2)
  assert.equal(consultas[0].url, 'https://generativelanguage.googleapis.com/v1beta/files/abc')
  assert.equal(consultas[0].cabecalhos['x-goog-api-key'], CHAVE)
  assert.match(chamadas[4].url, /:generateContent$/)
})

test('o arquivo FAILED vira erro com o motivo', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso([inicio(), subido('PROCESSING'), estado('FAILED', { error: { message: 'codec não suportado' } }), apagado()])
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /FAILED.*codec não suportado/)
})

test('o generateContent leva o vídeo, o texto e a configuração pedida', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(gerado([{ text: '{}' }])))
  await cliente(buscar).assistir(arquivo, 'liste os momentos', { modelo: 'gemini-3.1-pro-preview' })
  const c = chamadas[2]
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent')
  assert.equal(c.cabecalhos['x-goog-api-key'], CHAVE)
  assert.deepEqual(JSON.parse(c.corpo), {
    contents: [{ role: 'user', parts: [{ file_data: { mime_type: 'video/mp4', file_uri: URI } }, { text: 'liste os momentos' }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 16384, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'high' } }
  })
})

test('pedidoDeConteudo deixa o nível de raciocínio de fora antes do Gemini 3', () => {
  const corpo = pedidoDeConteudo({ mimeType: 'video/mp4', uri: URI }, 'oi', 'gemini-2.5-pro')
  assert.equal(corpo.generationConfig.thinkingConfig, undefined)
})

test('assistir junta o texto das parts e deixa o raciocínio de fora', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso(fluxo(gerado([{ text: 'pensando…', thought: true }, { text: '{"momentos": ' }, { text: '[]}' }])))
  assert.equal(await cliente(buscar).assistir(arquivo, 'assista'), '{"momentos": []}')
})

test('o pedido bloqueado vira erro com o motivo', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso(fluxo(resposta(200, { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /bloqueou o pedido \(PROHIBITED_CONTENT\)/)
})

test('a resposta interrompida por segurança vira erro com o motivo', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso(fluxo(resposta(200, { candidates: [{ content: { parts: [{ text: '{' }] }, finishReason: 'SAFETY' }] })))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /interrompeu a resposta \(SAFETY\)/)
})

test('a resposta cortada no limite de tokens vira erro claro', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso(fluxo(resposta(200, { candidates: [{ content: { parts: [{ text: '{"momentos": [' }] }, finishReason: 'MAX_TOKENS' }] })))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /cortada.*MAX_TOKENS/)
})

test('a resposta vazia vira erro', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso(fluxo(gerado([])))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /resposta vazia \(STOP\)/)
})

test('o 429 espera e tenta de novo', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(resposta(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }), gerado([{ text: '{}' }])))
  assert.equal(await cliente(buscar).assistir(arquivo, 'assista'), '{}')
  assert.equal(chamadas.filter((c) => /:generateContent$/.test(c.url)).length, 2)
})

test('o 503 espera e tenta de novo', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(resposta(503, { error: { code: 503, status: 'UNAVAILABLE' } }), gerado([{ text: '{}' }])))
  assert.equal(await cliente(buscar).assistir(arquivo, 'assista'), '{}')
  assert.equal(chamadas.filter((c) => /:generateContent$/.test(c.url)).length, 2)
})

test('o 429 que não passa depois das tentativas explica a cota do nível gratuito', async (t) => {
  const { arquivo } = video(t)
  const cota = () => resposta(429, { error: { code: 429, message: 'You exceeded your current quota' } })
  const { buscar, chamadas } = falso(fluxo(cota(), cota(), cota(), cota(), cota()))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), (e) => e instanceof Recusa && /nível gratuito tem limite por minuto e por dia/.test(e.message))
  assert.equal(chamadas.filter((c) => /:generateContent$/.test(c.url)).length, 5)
})

test('o 429 com limit: 0 não repete', async (t) => {
  const { arquivo } = video(t)
  const corpo = { error: { code: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro' } }
  const { buscar, chamadas } = falso(fluxo(resposta(429, corpo)))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /cota da Gemini API acabou/)
  assert.equal(chamadas.filter((c) => /:generateContent$/.test(c.url)).length, 1)
})

test('a chave inválida (400) pede para conferir a GEMINI_API_KEY', async (t) => {
  const { arquivo } = video(t)
  const corpo = { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }
  const { buscar } = falso([resposta(400, corpo)])
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), (e) => e instanceof Recusa && /confira a GEMINI_API_KEY.*aistudio\.google\.com\/apikey/.test(e.message))
})

test('a chave sem permissão (403) pede para conferir a GEMINI_API_KEY', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso([resposta(403, { error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' } })])
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /recusou a chave \(403\): confira a GEMINI_API_KEY/)
})

test('outro erro traz o status e o começo do corpo', async (t) => {
  const { arquivo } = video(t)
  const longo = 'x'.repeat(600)
  const { buscar } = falso(fluxo(resposta(404, longo)))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), (e) => /respondeu 404: x+$/.test(e.message) && e.message.endsWith('x'.repeat(400)) && !e.message.includes('x'.repeat(401)))
})

test('assistir apaga o arquivo subido no fim', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(gerado([{ text: '{}' }])))
  await cliente(buscar).assistir(arquivo, 'assista')
  const ultima = chamadas.at(-1)
  assert.equal(ultima.metodo, 'DELETE')
  assert.equal(ultima.url, 'https://generativelanguage.googleapis.com/v1beta/files/abc')
  assert.equal(ultima.cabecalhos['x-goog-api-key'], CHAVE)
})

test('assistir apaga o arquivo mesmo quando a resposta falha', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso(fluxo(resposta(200, { promptFeedback: { blockReason: 'SAFETY' } })))
  await assert.rejects(cliente(buscar).assistir(arquivo, 'assista'), /SAFETY/)
  assert.equal(chamadas.at(-1).metodo, 'DELETE')
})

test('a remoção que falha não derruba a resposta', async (t) => {
  const { arquivo } = video(t)
  const { buscar } = falso([inicio(), subido(), gerado([{ text: '{}' }]), resposta(500, 'erro')])
  assert.equal(await cliente(buscar).assistir(arquivo, 'assista'), '{}')
})

test('o registro anota provedor, modelo, status e tokens, sem a chave', async (t) => {
  const { pasta, arquivo } = video(t)
  const registro = path.join(pasta, 'registro.jsonl')
  const { buscar } = falso(fluxo(gerado([{ text: '{}' }])))
  await cliente(buscar, { registro }).assistir(arquivo, 'assista', { modelo: 'gemini-3.1-pro-preview' })
  const conteudo = fs.readFileSync(registro, 'utf8')
  const linha = JSON.parse(conteudo.trim())
  assert.equal(linha.provedor, 'google')
  assert.equal(linha.modelo, 'gemini-3.1-pro-preview')
  assert.equal(linha.status, 'STOP')
  assert.equal(linha.tokens.totalTokenCount, 124900)
  assert.ok(!conteudo.includes(CHAVE))
})

function transporteMudo () {
  const pedidos = []
  const destruidos = []
  const pedir = (url, opcoes) => {
    const req = new EventEmitter()
    req.end = (corpo) => { pedidos.push({ url, opcoes, corpo }) }
    req.destroy = () => { destruidos.push(url) }
    return req
  }
  return { pedir, pedidos, destruidos }
}

function transporteQueResponde (statusCode, headers, pedacos) {
  const pedir = (url, opcoes, aoResponder) => {
    const req = new EventEmitter()
    req.end = () => {
      const res = new EventEmitter()
      res.statusCode = statusCode
      res.headers = headers
      aoResponder(res)
      for (const p of pedacos) res.emit('data', Buffer.from(p))
      res.emit('end')
    }
    req.destroy = () => {}
    return req
  }
  return pedir
}

test('o buscarLongo desiste com erro claro quando o prazo estoura', async () => {
  const { pedir, destruidos } = transporteMudo()
  const buscarLongo = criarBuscarLongo({ prazo: 20, pedir })
  await assert.rejects(buscarLongo('https://exemplo.test/x', { method: 'POST', body: '{}' }),
    (e) => e.code === 'PRAZO_ESTOURADO' && /não terminou de responder em 0\.02 s/.test(e.message))
  assert.deepEqual(destruidos, ['https://exemplo.test/x'])
})

test('o buscarLongo devolve status, ok, headers.get e text()', async () => {
  const buscarLongo = criarBuscarLongo({ prazo: 1000, pedir: transporteQueResponde(200, { 'content-type': 'application/json' }, ['{"a"', ':1}']) })
  const r = await buscarLongo('https://exemplo.test/x', { method: 'POST', body: '{}' })
  assert.equal(r.status, 200)
  assert.equal(r.ok, true)
  assert.equal(r.headers.get('Content-Type'), 'application/json')
  assert.equal(await r.text(), '{"a":1}')
})

test('o buscarLongo passa método, cabeçalhos e corpo ao transporte, sem o agente compartilhado', async () => {
  const { pedir, pedidos } = transporteMudo()
  const buscarLongo = criarBuscarLongo({ prazo: 10, pedir })
  await assert.rejects(buscarLongo('https://exemplo.test/x', { method: 'POST', headers: { a: 'b' }, body: '{"c":1}' }))
  assert.deepEqual(pedidos[0], { url: 'https://exemplo.test/x', opcoes: { method: 'POST', headers: { a: 'b' }, agent: false }, corpo: '{"c":1}' })
})

test('o generateContent vai pelo buscarLongo e o resto pelo buscar', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso([inicio(), subido(), apagado()])
  const longo = falso([gerado([{ text: '{}' }])])
  await criarClienteGoogle({ chave: CHAVE, buscar, buscarLongo: longo.buscar, pausa: 0 }).assistir(arquivo, 'assista')
  assert.deepEqual(longo.chamadas.map((c) => c.url), ['https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent'])
  assert.ok(chamadas.every((c) => !/:generateContent$/.test(c.url)))
})

test('assistir com o prazo estourado diz qual parte falhou, não repete e apaga o arquivo', async (t) => {
  const { arquivo } = video(t)
  const { buscar, chamadas } = falso([inicio(), subido(), apagado()])
  const { pedir, pedidos } = transporteMudo()
  const c = criarClienteGoogle({ chave: CHAVE, buscar, buscarLongo: criarBuscarLongo({ prazo: 20, pedir }), pausa: 0 })
  await assert.rejects(c.assistir(arquivo, 'assista'), /^Error: pedir ao gemini-3\.1-pro-preview que assista parte-1\.mp4: a Gemini API não terminou de responder/)
  assert.equal(pedidos.length, 1)
  assert.equal(chamadas.at(-1).metodo, 'DELETE')
})
