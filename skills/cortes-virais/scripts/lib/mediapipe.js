'use strict'

// O MediaPipe roda no Chrome da máquina, numa versão fixa baixada uma vez para ~/.cortes-virais/cache.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { abrir } = require('./chrome')
const { servir } = require('./servidor')

const VERSAO = '1.1.1'
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSAO}`
const ARQUIVOS = {
  'vision_bundle.mjs': `${CDN}/vision_bundle.mjs`,
  'wasm/vision_wasm_internal.js': `${CDN}/wasm/vision_wasm_internal.js`,
  'wasm/vision_wasm_internal.wasm': `${CDN}/wasm/vision_wasm_internal.wasm`,
  'wasm/vision_wasm_nosimd_internal.js': `${CDN}/wasm/vision_wasm_nosimd_internal.js`,
  'wasm/vision_wasm_nosimd_internal.wasm': `${CDN}/wasm/vision_wasm_nosimd_internal.wasm`,
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'blaze_face_full_range.tflite': 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite'
}
const TEMPLATE = path.join(__dirname, '..', '..', 'template')
const LOTE = 40

function pastaDoCache (env = process.env) {
  return path.join(env.CORTES_VIRAIS_CACHE_DIR || path.join(os.homedir(), '.cortes-virais', 'cache'), `mediapipe-${VERSAO}`)
}

async function garantirCache (pasta = pastaDoCache()) {
  for (const [nome, url] of Object.entries(ARQUIVOS)) {
    const destino = path.join(pasta, nome)
    if (fs.existsSync(destino) && fs.statSync(destino).size > 0) continue
    const r = await fetch(url)
    if (!r.ok) throw new Error(`não consegui baixar ${url} (${r.status})`)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(`${destino}.parcial`, Buffer.from(await r.arrayBuffer()))
    fs.renameSync(`${destino}.parcial`, destino)
  }
  return pasta
}

// Os quadros são JPGs de uma pasta só.
async function detectarRostos (quadros) {
  if (!quadros.length) return []
  const cache = await garantirCache()
  const pastaDosQuadros = path.dirname(quadros[0])
  const srv = await servir({ '/mp/': cache, '/quadros/': pastaDosQuadros, '/': TEMPLATE })
  // O Chrome que não abre não pode deixar o servidor de pé: ele seguraria o processo para sempre.
  let pagina = null
  try {
    pagina = await abrir({ tempoLimite: 180000 })
    await pagina.carregar(`${srv.url}/rostos.html`)
    await pagina.avaliar('window.ROSTOS_PRONTO')
    const saida = []
    for (let i = 0; i < quadros.length; i += LOTE) {
      const urls = quadros.slice(i, i + LOTE).map((q) => `${srv.url}/quadros/${encodeURIComponent(path.basename(q))}`)
      saida.push(...await pagina.avaliar(`window.ROSTOS.analisar(${JSON.stringify(urls)})`))
    }
    return saida
  } finally {
    if (pagina) await pagina.fechar()
    await srv.fechar()
  }
}

module.exports = { detectarRostos, pastaDoCache, ARQUIVOS }
