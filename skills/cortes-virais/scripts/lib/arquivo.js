'use strict'

// Todo intermediário que o cache reaproveita nasce num nome temporário e só ganha o nome final quando
// termina: um ffmpeg interrompido não deixa um arquivo pela metade que valeria para sempre.

const fs = require('node:fs')
const path = require('node:path')

const temporario = (alvo) => path.join(path.dirname(alvo), `.parcial-${path.basename(alvo)}`)

const esperarSincrono = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// No Windows, antivírus e indexador seguram por um instante o arquivo recém-escrito, e o rename falha
// com EPERM ou EBUSY: tentar de novo resolve.
function renomear (de, para, { tentativas = 10, pausa = 200, mover = fs.renameSync } = {}) {
  for (let k = 0; ; k++) {
    try { return mover(de, para) } catch (e) {
      if (k >= tentativas || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e
      esperarSincrono(pausa)
    }
  }
}

function concluir (tmp, alvo) {
  if (!fs.existsSync(tmp)) throw new Error(`não gerou ${path.basename(alvo)}`)
  renomear(tmp, alvo)
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

// A fonte pode ter saído da pasta (disco cheio, HD desmontado) com o cache pronto: vale a identidade que o
// `fonte` gravou no fonte.json.
function identidadeDaFonte (f) {
  try {
    return identidade(f.arquivo)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    if (f.identidade) return f.identidade
    throw new Error(`não achei o vídeo de origem em ${f.arquivo}: devolva-o para lá ou rode o fonte de novo`)
  }
}

module.exports = { gerar, temporario, identidade, identidadeDaFonte, renomear }
