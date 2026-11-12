'use strict'

// Caminho opcional ao Replicate, cujo Gemini recusou toda mídia (E001): com a GEMINI_API_KEY, o vídeo
// vai direto à Gemini API do Google AI Studio.

const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')
const { Recusa } = require('./replicate')

const API = 'https://generativelanguage.googleapis.com'
const MODELO_PADRAO = 'gemini-3.1-pro-preview'
const TENTATIVAS = 4
const ESPERA_MAXIMA = 60 * 1000
const LIMITE_DO_PROCESSAMENTO = 10 * 60 * 1000
const PRAZO_DA_RESPOSTA = 20 * 60 * 1000
const FINS_NORMAIS = new Set([undefined, 'STOP', 'FINISH_REASON_UNSPECIFIED'])

const duracao = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${ms / 1000} s`)

// O fetch do Node desiste se o cabeçalho não chega em 300 s, e o raciocínio alto sobre 20 min de
// vídeo pode demorar mais: o generateContent vai pelo https, só com o prazo total.
function criarBuscarLongo ({ prazo = PRAZO_DA_RESPOSTA, pedir = https.request } = {}) {
  return (url, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    let req = null
    const relogio = setTimeout(() => {
      reject(Object.assign(new Error(`a Gemini API não terminou de responder em ${duracao(prazo)}; rode de novo ou use partes menores do vídeo`), { code: 'PRAZO_ESTOURADO' }))
      if (req) req.destroy()
    }, prazo)
    const falhar = (e) => { clearTimeout(relogio); reject(e) }
    req = pedir(url, { method, headers, agent: false }, (res) => {
      const pedacos = []
      res.on('data', (c) => pedacos.push(Buffer.from(c)))
      res.on('error', falhar)
      res.on('end', () => {
        clearTimeout(relogio)
        const corpo = Buffer.concat(pedacos).toString('utf8')
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: {
            get: (k) => {
              const v = res.headers[String(k).toLowerCase()]
              return v == null ? null : [].concat(v).join(', ')
            }
          },
          text: async () => corpo
        })
      })
    })
    req.on('error', falhar)
    req.end(body)
  })
}

function chave (env = process.env) {
  return String(env.GEMINI_API_KEY || '').trim() || null
}

function modelo (env = process.env) {
  return String(env.CORTES_VIRAIS_GEMINI_MODELO || '').trim().replace(/^models\//, '') || MODELO_PADRAO
}

// O thinkingLevel só existe do Gemini 3 em diante; nos anteriores a API responde com erro.
function aceitaNivelDeRaciocinio (nome) {
  const m = /^gemini-(\d+)/.exec(String(nome))
  return Boolean(m) && Number(m[1]) >= 3
}

function pedidoDeInicio (bytes, mime, nome) {
  return {
    url: `${API}/upload/v1beta/files`,
    cabecalhos: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json'
    },
    corpo: { file: { display_name: nome } }
  }
}

function pedidoDeEnvio (bytes) {
  return { 'Content-Length': String(bytes), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }
}

function pedidoDeConteudo (arquivo, textoDoPrompt, nome) {
  const generationConfig = { temperature: 0.4, maxOutputTokens: 16384, responseMimeType: 'application/json' }
  if (aceitaNivelDeRaciocinio(nome)) generationConfig.thinkingConfig = { thinkingLevel: 'high' }
  return {
    contents: [{ role: 'user', parts: [{ file_data: { mime_type: arquivo.mimeType, file_uri: arquivo.uri } }, { text: textoDoPrompt }] }],
    generationConfig
  }
}

function motivoDaResposta (resposta) {
  const bloqueio = resposta && resposta.promptFeedback && resposta.promptFeedback.blockReason
  if (bloqueio) return bloqueio
  const candidata = resposta && resposta.candidates && resposta.candidates[0]
  return candidata ? candidata.finishReason || 'STOP' : 'SEM_CANDIDATA'
}

function textoDaResposta (resposta) {
  const bloqueio = resposta && resposta.promptFeedback && resposta.promptFeedback.blockReason
  if (bloqueio) throw new Error(`a Gemini API bloqueou o pedido (${bloqueio})`)
  const candidata = resposta && resposta.candidates && resposta.candidates[0]
  if (!candidata) throw new Error('a Gemini API não devolveu nenhuma resposta')
  const fim = candidata.finishReason
  if (fim === 'MAX_TOKENS') throw new Error('a resposta da Gemini API veio cortada no limite de 16384 tokens de saída, que inclui o raciocínio (MAX_TOKENS)')
  if (!FINS_NORMAIS.has(fim)) throw new Error(`a Gemini API interrompeu a resposta (${fim})`)
  const partes = (candidata.content && candidata.content.parts) || []
  const texto = partes.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('')
  if (!texto.trim()) throw new Error(`a Gemini API devolveu a resposta vazia (${fim || 'sem motivo'})`)
  return texto
}

function mensagemDoGoogle (corpo) {
  try {
    const doc = JSON.parse(corpo)
    if (doc && doc.error && doc.error.message) return String(doc.error.message).replace(/\s+/g, ' ').slice(0, 300)
  } catch {}
  return String(corpo).replace(/\s+/g, ' ').slice(0, 300)
}

function erroDaApi (status, corpo, onde) {
  if (status === 401 || status === 403 || (status === 400 && /API_KEY|API key/i.test(corpo))) {
    return new Recusa(`a Gemini API recusou a chave (${status}): confira a GEMINI_API_KEY ou crie outra em aistudio.google.com/apikey. ${mensagemDoGoogle(corpo)}`)
  }
  if (status === 429) {
    return new Recusa('a cota da Gemini API acabou (429): o nível gratuito tem limite por minuto e por dia, e o Gemini 3.1 Pro, o padrão, nem entra nele; ' +
      `espere e rode de novo, ou ative o faturamento do projeto da chave em aistudio.google.com. ${mensagemDoGoogle(corpo)}`)
  }
  return new Error(`${onde}: a Gemini API respondeu ${status}: ${String(corpo).slice(0, 400)}`)
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function criarClienteGoogle ({ chave: segredo = chave(), buscar: buscarPassado, buscarLongo: longoPassado, prazo = PRAZO_DA_RESPOSTA, registro = null, pausa = 3000 } = {}) {
  if (!segredo) throw new Recusa('falta a GEMINI_API_KEY: crie uma chave em aistudio.google.com/apikey e exporte-a antes de rodar')
  const buscar = buscarPassado || fetch
  const buscarLongo = longoPassado || buscarPassado || criarBuscarLongo({ prazo })
  const comChave = (extra = {}) => ({ 'x-goog-api-key': segredo, ...extra })
  const semSegredo = (texto) => String(texto).split(segredo).join('***')

  function esperaDaCota (r, texto, k) {
    const cabecalho = r.headers.get('retry-after')
    const atraso = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(texto)
    const segundos = cabecalho != null ? Number(cabecalho) : atraso ? Number(atraso[1]) : NaN
    return Math.min(ESPERA_MAXIMA, Number.isFinite(segundos) ? segundos * 1000 : pausa * (k + 1))
  }

  async function pedir (url, opcoes, onde, transporte = buscar) {
    for (let k = 0; ; k++) {
      let r
      try {
        r = await transporte(url, opcoes)
      } catch (e) {
        const motivo = e.code === 'PRAZO_ESTOURADO' ? e.message : `não consegui falar com a Gemini API (${(e.cause && e.cause.code) || e.code || e.message})`
        throw new Error(`${onde}: ${semSegredo(motivo)}`)
      }
      const texto = semSegredo(await r.text())
      // "limit: 0" é modelo fora do nível da chave: repetir só gastaria tempo.
      if (r.status === 429 && k < TENTATIVAS && !/limit:\s*0\b/.test(texto)) { await esperar(esperaDaCota(r, texto, k)); continue }
      if (r.status >= 500 && k < TENTATIVAS) { await esperar(pausa * (k + 1)); continue }
      if (!r.ok) throw erroDaApi(r.status, texto, onde)
      return { r, texto }
    }
  }

  const lerJson = (texto) => (texto ? JSON.parse(texto) : {})

  async function subir (arquivo, mime) {
    const dados = fs.readFileSync(arquivo)
    const nome = path.basename(arquivo)
    const inicio = pedidoDeInicio(dados.length, mime, nome)
    const { r } = await pedir(inicio.url, { method: 'POST', headers: comChave(inicio.cabecalhos), body: JSON.stringify(inicio.corpo) }, `subir ${nome}`)
    const destino = r.headers.get('x-goog-upload-url')
    if (!destino) throw new Error(`subir ${nome}: a Gemini API não devolveu o endereço do upload (x-goog-upload-url)`)
    const { texto } = await pedir(destino, { method: 'POST', headers: pedidoDeEnvio(dados.length), body: dados }, `subir ${nome}`)
    const doc = lerJson(texto)
    const subido = doc.file || doc
    if (!subido.name || !subido.uri) throw new Error(`subir ${nome}: a Gemini API não devolveu o nome e a URI do arquivo`)
    return subido
  }

  async function aguardarAtivo (subido, nome) {
    const inicio = Date.now()
    let atual = subido
    while (atual.state !== 'ACTIVE') {
      if (atual.state === 'FAILED') {
        throw new Error(`a Gemini API não conseguiu processar ${nome} (FAILED): ${(atual.error && atual.error.message) || 'sem detalhe'}`)
      }
      if (Date.now() - inicio > LIMITE_DO_PROCESSAMENTO) {
        throw new Error(`${nome} passou de ${LIMITE_DO_PROCESSAMENTO / 60000} min em ${atual.state || 'processamento'} na Gemini API`)
      }
      await esperar(pausa)
      const { texto } = await pedir(`${API}/v1beta/${subido.name}`, { method: 'GET', headers: comChave() }, `acompanhar ${nome}`)
      atual = { ...subido, ...lerJson(texto) }
    }
    return atual
  }

  async function apagar (subido) {
    try {
      await buscar(`${API}/v1beta/${subido.name}`, { method: 'DELETE', headers: comChave() })
    } catch {}
  }

  function anotar (nome, resposta, inicio) {
    if (!registro) return
    const linha = {
      provedor: 'google',
      modelo: nome,
      status: motivoDaResposta(resposta),
      tokens: resposta.usageMetadata || null,
      criada: new Date(inicio).toISOString(),
      segundos: Number(((Date.now() - inicio) / 1000).toFixed(1))
    }
    fs.appendFileSync(registro, JSON.stringify(linha) + '\n')
  }

  async function assistir (arquivo, textoDoPrompt, { mime = 'video/mp4', modelo: escolhido } = {}) {
    const nome = escolhido || modelo()
    const rotulo = path.basename(arquivo)
    const subido = await subir(arquivo, mime)
    try {
      const ativo = await aguardarAtivo({ mimeType: mime, ...subido }, rotulo)
      const inicio = Date.now()
      const { texto } = await pedir(`${API}/v1beta/models/${nome}:generateContent`, {
        method: 'POST',
        headers: comChave({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(pedidoDeConteudo(ativo, textoDoPrompt, nome))
      }, `pedir ao ${nome} que assista ${rotulo}`, buscarLongo)
      const resposta = lerJson(texto)
      anotar(nome, resposta, inicio)
      return textoDaResposta(resposta)
    } finally {
      await apagar(subido)
    }
  }

  return { assistir }
}

module.exports = {
  API,
  MODELO_PADRAO,
  PRAZO_DA_RESPOSTA,
  chave,
  modelo,
  aceitaNivelDeRaciocinio,
  pedidoDeInicio,
  pedidoDeEnvio,
  pedidoDeConteudo,
  textoDaResposta,
  criarBuscarLongo,
  criarClienteGoogle
}
