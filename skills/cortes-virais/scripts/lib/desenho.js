'use strict'

// Um PNG transparente por estado da tela; estado repetido usa o mesmo PNG.

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { abrir } = require('./chrome')
const { listaDoConcat } = require('./legendas')

const TEMPLATE = path.join(__dirname, '..', '..', 'template', 'legenda.html')

async function desenharEstados (lista, pasta, { gancho, fps = 30, tema, versao = 99 }) {
  if (!tema) throw new Error('desenharEstados precisa do tema da marca')
  fs.mkdirSync(pasta, { recursive: true })
  const pagina = await abrir({ tempoLimite: 60000 })
  const porChave = new Map()
  try {
    await pagina.transparente()
    await pagina.tamanho(1080, 1920)
    await pagina.carregar(pathToFileURL(TEMPLATE).href)
    await pagina.avaliar(`window.LEGENDA.tema(${JSON.stringify(tema)})`)
    const arquivos = []
    for (const e of lista) {
      if (!porChave.has(e.chave)) {
        const destino = path.join(pasta, `e${String(porChave.size).padStart(4, '0')}.png`)
        const dados = { ...e.dados, gancho: e.dados.gancho ? gancho : null }
        await pagina.avaliar(`window.LEGENDA.montar(${JSON.stringify(dados)})`)
        fs.writeFileSync(destino, await pagina.capturar(1080, 1920))
        porChave.set(e.chave, destino)
      }
      arquivos.push(porChave.get(e.chave))
    }
    const arquivoDaLista = path.join(pasta, 'lista.txt')
    fs.writeFileSync(arquivoDaLista, listaDoConcat(lista, arquivos, fps, { versao }))
    return { lista: arquivoDaLista, desenhos: porChave.size }
  } finally {
    await pagina.fechar()
  }
}

// Um quadro só, para a amostra da identidade.
async function desenharUm (estado, destino, { tema }) {
  const pagina = await abrir({ tempoLimite: 60000 })
  try {
    await pagina.transparente()
    await pagina.tamanho(1080, 1920)
    await pagina.carregar(pathToFileURL(TEMPLATE).href)
    await pagina.avaliar(`window.LEGENDA.tema(${JSON.stringify(tema)})`)
    await pagina.avaliar(`window.LEGENDA.montar(${JSON.stringify(estado)})`)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, await pagina.capturar(1080, 1920))
    return destino
  } finally {
    await pagina.fechar()
  }
}

module.exports = { TEMPLATE, desenharEstados, desenharUm }
