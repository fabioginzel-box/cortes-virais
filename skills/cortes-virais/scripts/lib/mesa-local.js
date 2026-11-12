'use strict'

// A mesa de aprovação sem o claude.ai: a mesma página, servida em 127.0.0.1, gravando cada corte em
// <pasta do vídeo>/mesa/cortes/<id>.json, onde o `aprovar` lê. Ver docs/adr/0004.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const TIPOS = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4' }
const LIMITE_DO_CORPO = 64 * 1024
const ID = /^[A-Za-z0-9_-]{1,40}$/

function lerColecao (pasta) {
  if (!fs.existsSync(pasta)) return []
  return fs.readdirSync(pasta).filter((a) => a.endsWith('.json')).sort()
    .map((a) => ({ id: a.slice(0, -5), data: JSON.parse(fs.readFileSync(path.join(pasta, a), 'utf8')) }))
}

function gravarDoc (pasta, id, dados) {
  fs.mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, `${id}.json`)
  fs.writeFileSync(`${arquivo}.parcial`, JSON.stringify(dados, null, 2) + '\n')
  fs.renameSync(`${arquivo}.parcial`, arquivo)
}

// O <video> pede o arquivo em pedaços (Range) para poder pular para qualquer ponto da prévia.
function servirArquivo (req, res, arquivo) {
  const tamanho = fs.statSync(arquivo).size
  const tipo = TIPOS[path.extname(arquivo)] || 'application/octet-stream'
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (!m) {
    res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': tamanho, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(arquivo).pipe(res)
    return
  }
  const inicio = m[1] === '' ? Math.max(0, tamanho - Number(m[2])) : Number(m[1])
  const fim = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1
  if (inicio > fim || inicio >= tamanho) { res.writeHead(416, { 'Content-Range': `bytes */${tamanho}` }).end(); return }
  res.writeHead(206, { 'Content-Type': tipo, 'Content-Length': fim - inicio + 1, 'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`, 'Accept-Ranges': 'bytes' })
  fs.createReadStream(arquivo, { start: inicio, end: fim }).pipe(res)
}

function lerCorpo (req) {
  return new Promise((resolve, reject) => {
    let corpo = ''
    req.setEncoding('utf8')
    req.on('data', (parte) => {
      corpo += parte
      if (corpo.length > LIMITE_DO_CORPO) { reject(new Error('corpo grande demais')); req.destroy() }
    })
    req.on('end', () => resolve(corpo))
    req.on('error', reject)
  })
}

function criarServidor ({ pastaDaMesa, pastaDaColecao }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      const caminho = decodeURIComponent(url.pathname)
      if (req.method === 'GET' && (caminho === '/' || caminho === '/index.html')) return servirArquivo(req, res, path.join(pastaDaMesa, 'index.html'))
      const previa = /^\/previas\/([A-Za-z0-9_-]+\.mp4)$/.exec(caminho)
      if (req.method === 'GET' && previa) {
        const arquivo = path.join(pastaDaMesa, 'previas', previa[1])
        if (!fs.existsSync(arquivo)) { res.writeHead(404).end(); return }
        return servirArquivo(req, res, arquivo)
      }
      if (req.method === 'GET' && caminho === '/api/cortes') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(lerColecao(pastaDaColecao)))
        return
      }
      const doc = /^\/api\/cortes\/([^/]+)$/.exec(caminho)
      if (req.method === 'PUT' && doc && ID.test(doc[1])) {
        const dados = JSON.parse(await lerCorpo(req))
        if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('o documento tem de ser um objeto')
        gravarDoc(pastaDaColecao, doc[1], dados)
        res.writeHead(204).end()
        return
      }
      res.writeHead(404).end()
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(e.message)
    }
  })
}

// Só em 127.0.0.1: a mesa local não fica visível na rede.
function abrirMesaLocal ({ pastaDaMesa, pastaDaColecao, porta = 0 }) {
  const servidor = criarServidor({ pastaDaMesa, pastaDaColecao })
  return new Promise((resolve, reject) => {
    servidor.once('error', reject)
    servidor.listen(porta, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${servidor.address().port}/`, fechar: () => new Promise((r) => servidor.close(r)) })
    })
  })
}

function comandoParaAbrir (url, plataforma = process.platform) {
  if (plataforma === 'darwin') return ['open', [url]]
  if (plataforma === 'win32') return ['cmd', ['/c', 'start', '', url]]
  return ['xdg-open', [url]]
}

module.exports = { abrirMesaLocal, criarServidor, lerColecao, gravarDoc, comandoParaAbrir }
