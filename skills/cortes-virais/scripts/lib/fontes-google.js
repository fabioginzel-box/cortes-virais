'use strict'

// Baixa uma família do Google Fonts para a pasta do canal, uma vez, no peso mais forte que ela tiver.
// Com um User-Agent antigo a API devolve um TTF só, sem os recortes por alfabeto.

const fs = require('node:fs')
const path = require('node:path')
const { slug } = require('./pasta')

const PESOS = [800, 900, 700, 600, 400]
const AGENTE = 'Mozilla/4.0'
const EXTENSOES = { truetype: '.ttf', opentype: '.otf', woff: '.woff', woff2: '.woff2' }

const urlDoCss = (familia, peso) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia.trim()).replace(/%20/g, '+')}:wght@${peso}`

function lerCss (css) {
  const m = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)\s*format\('(truetype|opentype|woff2?)'\)/.exec(css)
  return m ? { url: m[1], extensao: EXTENSOES[m[2]] } : null
}

async function baixarFonteDoGoogle (familia, pasta, { buscar = fetch } = {}) {
  if (!familia || !String(familia).trim()) throw new Error('diga o nome da família, como aparece em fonts.google.com: --fonte-google "Bebas Neue"')
  for (const peso of PESOS) {
    const r = await buscar(urlDoCss(familia, peso), { headers: { 'User-Agent': AGENTE } })
    if (r.status === 400) continue
    if (!r.ok) throw new Error(`o Google Fonts respondeu ${r.status} para "${familia}"`)
    const achado = lerCss(await r.text())
    if (!achado) throw new Error(`o Google Fonts não devolveu um arquivo de fonte para "${familia}"`)
    const arquivo = await buscar(achado.url)
    if (!arquivo.ok) throw new Error(`não consegui baixar ${achado.url} (${arquivo.status})`)
    const nome = `${slug(familia)}-${peso}${achado.extensao}`
    fs.mkdirSync(pasta, { recursive: true })
    fs.writeFileSync(path.join(pasta, nome), Buffer.from(await arquivo.arrayBuffer()))
    return { arquivo: nome, peso }
  }
  throw new Error(`não achei "${familia}" no Google Fonts: confira o nome em fonts.google.com`)
}

module.exports = { baixarFonteDoGoogle, urlDoCss, lerCss }
