'use strict'

// O WebAssembly do MediaPipe não carrega de file://, e imagem de outra origem não entra no detector:
// por isso o Chrome lê de um servidor em 127.0.0.1.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.otf': 'font/otf'
}

// `rotas` liga um prefixo de URL a uma pasta, como { '/mp/': '/cache/mediapipe', '/': '/template' }.
function servir (rotas) {
  const lista = Object.entries(rotas).sort((a, b) => b[0].length - a[0].length)
  const servidor = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const rota = lista.find(([prefixo]) => url.startsWith(prefixo))
    if (!rota) { res.writeHead(404).end(); return }
    const [prefixo, pasta] = rota
    const arquivo = path.resolve(pasta, '.' + path.sep + url.slice(prefixo.length))
    if (!arquivo.startsWith(path.resolve(pasta)) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' })
    fs.createReadStream(arquivo).pipe(res)
  })
  return new Promise((resolve, reject) => {
    servidor.once('error', reject)
    servidor.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${servidor.address().port}`, fechar: () => new Promise((r) => servidor.close(r)) })
    })
  })
}

module.exports = { servir }
