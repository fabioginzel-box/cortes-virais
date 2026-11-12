'use strict'

// Um canal é uma pasta em canais/<nome>/ com a identidade (marca.json), a régua (regua.json) e o
// histórico do aprendizado (historico.jsonl). Cada pasta de vídeo grava o canal dela no canal.json.

const fs = require('node:fs')
const path = require('node:path')
const { base, slug } = require('./pasta')
const marca = require('./marca')

class SemCanal extends Error {}

const pastaDosCanais = (env = process.env) => path.join(base(env), 'canais')

function listarCanais (env = process.env) {
  const dir = pastaDosCanais(env)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'marca.json')))
    .map((d) => ({ nome: d.name, dir: path.join(dir, d.name) }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
}

function criarCanal (nome, { estilo = 'classico' } = {}, env = process.env) {
  if (!nome || !String(nome).trim()) throw new Error('diga o nome do canal: node cortes.js canal criar "Meu Podcast"')
  if (!marca.ESTILOS[estilo]) throw new Error(`o estilo "${estilo}" não existe; use ${Object.keys(marca.ESTILOS).join(', ')}`)
  const id = slug(nome)
  const dir = path.join(pastaDosCanais(env), id)
  if (fs.existsSync(path.join(dir, 'marca.json'))) throw new Error(`o canal ${id} já existe em ${dir}`)
  fs.mkdirSync(dir, { recursive: true })
  gravarMarca(dir, { versao: 1, nome: String(nome).trim(), estilo })
  return { nome: id, dir }
}

function gravarMarca (dir, bruto) {
  const arquivo = path.join(dir, 'marca.json')
  fs.writeFileSync(`${arquivo}.parcial`, JSON.stringify(bruto, null, 2) + '\n')
  fs.renameSync(`${arquivo}.parcial`, arquivo)
}

function abrirCanal (nome, env = process.env) {
  const id = slug(nome)
  const dir = path.join(pastaDosCanais(env), id)
  const arquivo = path.join(dir, 'marca.json')
  if (!fs.existsSync(arquivo)) {
    const existentes = listarCanais(env).map((c) => c.nome)
    throw new SemCanal(`o canal "${nome}" não existe${existentes.length ? `; os canais são: ${existentes.join(', ')}` : ''}`)
  }
  let bruto
  try { bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8')) } catch (e) { throw new Error(`${arquivo} não é um JSON válido: ${e.message}`) }
  const m = marca.resolver(bruto, dir)
  return { nome: id, dir, bruto, marca: m, problemas: marca.problemas(m) }
}

// Com um canal só, ele é usado sem perguntar; com vários, quem chama tem de dizer qual.
function escolherCanal (pedido, env = process.env) {
  if (pedido) return abrirCanal(pedido, env)
  const lista = listarCanais(env)
  if (!lista.length) throw new SemCanal('nenhum canal configurado ainda: configure a identidade primeiro (node cortes.js canal criar "<nome>" [--estilo classico|marca|impacto])')
  if (lista.length > 1) throw new SemCanal(`há ${lista.length} canais (${lista.map((c) => c.nome).join(', ')}): diga qual com --canal <nome>`)
  return abrirCanal(lista[0].nome, env)
}

function gravarCanalDoVideo (pasta, nome) {
  fs.writeFileSync(path.join(pasta, 'canal.json'), JSON.stringify({ canal: nome }, null, 2) + '\n')
}

function canalDoVideo (pasta, env = process.env) {
  const arquivo = path.join(pasta, 'canal.json')
  if (fs.existsSync(arquivo)) return abrirCanal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).canal, env)
  return escolherCanal(null, env)
}

module.exports = { SemCanal, pastaDosCanais, listarCanais, criarCanal, gravarMarca, abrirCanal, escolherCanal, gravarCanalDoVideo, canalDoVideo }
