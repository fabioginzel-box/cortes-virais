'use strict'

// Pela API, com um token, e não pelo conector do claude.ai: ver docs/adr/0001.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const API = 'https://api.replicate.com/v1'
const SERVICO = 'cortes-virais-replicate'
const FINAIS = new Set(['succeeded', 'failed', 'canceled'])
const TENTATIVAS = 4

class Recusa extends Error {}

const COMO_GUARDAR = {
  darwin: 'guarde no Keychain, num terminal seu, uma vez:\n' +
    `  security add-generic-password -s ${SERVICO} -a cortes-virais -w\n` +
    'e cole o token quando o comando pedir. Se o sandbox do Claude Code barrar o Keychain, rode fora dele.',
  win32: 'guarde na variável do seu usuário, num PowerShell seu, uma vez:\n' +
    "  $t = Read-Host 'Token do Replicate'; [Environment]::SetEnvironmentVariable('REPLICATE_API_TOKEN', $t, 'User')\n" +
    'e feche e abra o Claude Code. A variável fica em texto aberto no seu usuário do Windows.',
  linux: 'guarde no chaveiro do sistema, num terminal seu, uma vez (pacote libsecret-tools):\n' +
    `  secret-tool store --label='Replicate (cortes-virais)' service ${SERVICO}\n` +
    'ou ponha `export REPLICATE_API_TOKEN=...` no seu ~/.profile (fica em texto aberto).'
}

function comoGuardar (plataforma = process.platform) {
  return 'não achei o token do Replicate. Crie um em replicate.com/account/api-tokens e ' +
    (COMO_GUARDAR[plataforma] || COMO_GUARDAR.linux) + '\nNunca cole o token na conversa.'
}

function lerDoChaveiro (plataforma, rodar) {
  const comando = plataforma === 'darwin'
    ? ['security', ['find-generic-password', '-s', SERVICO, '-w']]
    : plataforma === 'linux' ? ['secret-tool', ['lookup', 'service', SERVICO]] : null
  if (!comando) return null
  const r = rodar(comando[0], comando[1], { encoding: 'utf8' })
  const valor = String((r && r.stdout) || '').trim()
  return !r || r.error || r.status !== 0 || !valor ? null : valor
}

function token (env = process.env, rodar = spawnSync, plataforma = process.platform) {
  if (env.REPLICATE_API_TOKEN && env.REPLICATE_API_TOKEN.trim()) return env.REPLICATE_API_TOKEN.trim()
  const valor = lerDoChaveiro(plataforma, rodar)
  if (valor) return valor
  throw new Recusa(comoGuardar(plataforma))
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function erroDaApi (status, corpo, onde) {
  if (status === 401) return new Recusa(`o Replicate recusou o token (401): confira o REPLICATE_API_TOKEN ou o item ${SERVICO} do chaveiro`)
  if (status === 402) return new Recusa('a conta do Replicate está sem crédito (402): compre crédito em replicate.com/account/billing')
  return new Error(`${onde}: o Replicate respondeu ${status}: ${String(corpo).slice(0, 400)}`)
}

function criarCliente ({ chave = token(), buscar = fetch, registro = null, pausa = 3000 } = {}) {
  const cabecalho = { Authorization: `Bearer ${chave}` }

  async function chamar (metodo, url, corpo, onde) {
    for (let k = 0; ; k++) {
      const r = await buscar(url, {
        method: metodo,
        headers: corpo instanceof FormData ? cabecalho : { ...cabecalho, 'Content-Type': 'application/json' },
        body: corpo == null ? undefined : corpo instanceof FormData ? corpo : JSON.stringify(corpo)
      })
      const texto = await r.text()
      if (r.status === 429 && k < TENTATIVAS) { await esperar(Number(r.headers.get('retry-after') || 5) * 1000); continue }
      if (r.status >= 500 && k < TENTATIVAS) { await esperar(2000 * (k + 1)); continue }
      if (!r.ok) throw erroDaApi(r.status, texto, onde)
      return texto ? JSON.parse(texto) : null
    }
  }

  function anotar (p, modelo) {
    if (!registro) return
    const linha = { modelo, id: p.id, status: p.status, criada: p.created_at, segundos: p.metrics && p.metrics.predict_time }
    fs.appendFileSync(registro, JSON.stringify(linha) + '\n')
  }

  async function enviar (arquivo, tipo = 'application/octet-stream') {
    const dados = fs.readFileSync(arquivo)
    const form = new FormData()
    form.append('content', new Blob([dados], { type: tipo }), path.basename(arquivo))
    const r = await chamar('POST', `${API}/files`, form, `subir ${path.basename(arquivo)}`)
    if (!r || !r.urls || !r.urls.get) throw new Error('o Replicate não devolveu a URL do arquivo enviado')
    return r.urls.get
  }

  // Modelo oficial aceita a predição pelo nome; o da comunidade pede a versão, que vem do modelo.
  async function criar (modelo, input) {
    try {
      return await chamar('POST', `${API}/models/${modelo}/predictions`, { input }, `criar a predição de ${modelo}`)
    } catch (e) {
      if (e instanceof Recusa || !/respondeu (404|422)/.test(e.message)) throw e
      const m = await chamar('GET', `${API}/models/${modelo}`, null, `ler o modelo ${modelo}`)
      if (!m.latest_version) throw e
      return chamar('POST', `${API}/predictions`, { version: m.latest_version.id, input }, `criar a predição de ${modelo}`)
    }
  }

  async function aguardar (p, modelo, { limite = 60 * 60 * 1000 } = {}) {
    const inicio = Date.now()
    let atual = p
    while (!FINAIS.has(atual.status)) {
      if (Date.now() - inicio > limite) throw new Error(`a predição ${atual.id} de ${modelo} passou de ${Math.round(limite / 60000)} min`)
      await esperar(pausa)
      atual = await chamar('GET', `${API}/predictions/${atual.id}`, null, `acompanhar ${atual.id}`)
    }
    anotar(atual, modelo)
    if (atual.status !== 'succeeded') throw new Error(`a predição ${atual.id} de ${modelo} terminou ${atual.status}: ${atual.error || 'sem detalhe'}`)
    return atual
  }

  async function rodar (modelo, input, opcoes) {
    return aguardar(await criar(modelo, input), modelo, opcoes)
  }

  // A saída some uma hora depois: baixar logo.
  async function baixar (url, destino) {
    const r = await buscar(url, { headers: url.startsWith(API) ? cabecalho : {} })
    if (!r.ok) throw new Error(`não consegui baixar a saída (${r.status}): ela vale uma hora depois de gerada`)
    fs.mkdirSync(path.dirname(path.resolve(destino)), { recursive: true })
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()))
    return destino
  }

  return { enviar, criar, aguardar, rodar, baixar }
}

// Modelo que repassa o arquivo a um serviço de fora (a Topaz) não lê a URL do Files API, que exige o
// token (401); o data URL vai dentro da própria predição.
const dataUrl = (arquivo, tipo) => `data:${tipo};base64,${fs.readFileSync(arquivo).toString('base64')}`

module.exports = { Recusa, SERVICO, token, comoGuardar, criarCliente, dataUrl }
