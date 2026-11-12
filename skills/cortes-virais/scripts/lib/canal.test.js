'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const canal = require('./canal')

const ambiente = () => ({ CORTES_VIRAIS_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'canais-')) })

test('criarCanal grava o marca.json com o nome e o estilo', () => {
  const env = ambiente()
  const c = canal.criarCanal('Meu Podcast', { estilo: 'impacto' }, env)
  assert.equal(c.nome, 'meu-podcast')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(c.dir, 'marca.json'), 'utf8')), { versao: 1, nome: 'Meu Podcast', estilo: 'impacto' })
})

test('criarCanal recusa canal que já existe', () => {
  const env = ambiente()
  canal.criarCanal('A', {}, env)
  assert.throws(() => canal.criarCanal('A', {}, env), /já existe/)
})

test('criarCanal recusa estilo que não existe', () => {
  assert.throws(() => canal.criarCanal('A', { estilo: 'neon' }, ambiente()), /não existe/)
})

test('listarCanais devolve os canais em ordem', () => {
  const env = ambiente()
  canal.criarCanal('B', {}, env)
  canal.criarCanal('A', {}, env)
  assert.deepEqual(canal.listarCanais(env).map((c) => c.nome), ['a', 'b'])
})

test('escolherCanal usa o único canal sem perguntar', () => {
  const env = ambiente()
  canal.criarCanal('Único', {}, env)
  assert.equal(canal.escolherCanal(null, env).nome, 'unico')
})

test('escolherCanal pede o nome quando há mais de um', () => {
  const env = ambiente()
  canal.criarCanal('A', {}, env)
  canal.criarCanal('B', {}, env)
  assert.throws(() => canal.escolherCanal(null, env), /diga qual com --canal/)
})

test('escolherCanal sem canal manda configurar a identidade', () => {
  assert.throws(() => canal.escolherCanal(null, ambiente()), /configure a identidade primeiro/)
})

test('abrirCanal resolve a marca e lista os problemas', () => {
  const env = ambiente()
  const c = canal.criarCanal('A', {}, env)
  canal.gravarMarca(c.dir, { versao: 1, nome: 'A', legenda: { texto: 'azul' } })
  assert.match(canal.abrirCanal('a', env).problemas.join('\n'), /legenda\.texto/)
})

test('abrirCanal diz quais canais existem quando o nome não existe', () => {
  const env = ambiente()
  canal.criarCanal('A', {}, env)
  assert.throws(() => canal.abrirCanal('z', env), /os canais são: a/)
})

test('canalDoVideo lê o canal gravado na pasta do vídeo', () => {
  const env = ambiente()
  canal.criarCanal('A', {}, env)
  canal.criarCanal('B', {}, env)
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'video-'))
  canal.gravarCanalDoVideo(pasta, 'b')
  assert.equal(canal.canalDoVideo(pasta, env).nome, 'b')
})
