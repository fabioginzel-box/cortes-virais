'use strict'

// Todo intermediário que o cache reaproveita nasce num nome temporário e só ganha o nome final quando
// termina: um ffmpeg interrompido não deixa um arquivo pela metade que valeria para sempre.

const fs = require('node:fs')
const path = require('node:path')

const temporario = (alvo) => path.join(path.dirname(alvo), `.parcial-${path.basename(alvo)}`)

function concluir (tmp, alvo) {
  if (!fs.existsSync(tmp)) throw new Error(`não gerou ${path.basename(alvo)}`)
  fs.renameSync(tmp, alvo)
  return alvo
}

// `fazer(tmp)` grava em `tmp` (arquivo ou pasta, com a mesma extensão do alvo); pode ser assíncrono.
function gerar (alvo, fazer) {
  if (fs.existsSync(alvo)) return alvo
  fs.mkdirSync(path.dirname(alvo), { recursive: true })
  const tmp = temporario(alvo)
  fs.rmSync(tmp, { recursive: true, force: true })
  const r = fazer(tmp)
  if (r && typeof r.then === 'function') return r.then(() => concluir(tmp, alvo))
  return concluir(tmp, alvo)
}

function identidade (arquivo) {
  const s = fs.statSync(arquivo)
  return [path.resolve(arquivo), s.size, Math.round(s.mtimeMs)]
}

module.exports = { gerar, temporario, identidade }
