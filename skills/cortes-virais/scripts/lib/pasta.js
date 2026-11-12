'use strict'

const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')

const base = (env = process.env) => env.CORTES_VIRAIS_DIR || path.join(os.homedir(), 'Documents', 'Cortes-Virais')

function slug (texto, max = 40) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'video'
}

const dois = (n) => String(n).padStart(2, '0')

function agora (data = new Date()) {
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}-${dois(data.getHours())}${dois(data.getMinutes())}`
}

function nomeDaPasta (nome, data = new Date()) {
  return `${agora(data)}-${slug(nome)}`
}

function nomeDoVideo (pasta) {
  return path.basename(pasta).replace(/^\d{4}-\d{2}-\d{2}-\d{4}-/, '').replace(/-/g, ' ')
}

function hashDe (valor) {
  return createHash('sha1').update(JSON.stringify(valor)).digest('hex').slice(0, 10)
}

module.exports = { base, slug, nomeDaPasta, nomeDoVideo, hashDe }
