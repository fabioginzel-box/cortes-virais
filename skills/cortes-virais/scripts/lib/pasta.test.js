'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { base, slug, nomeDaPasta, nomeDoVideo, hashDe } = require('./pasta')

test('base usa a pasta da variável de ambiente', () => {
  assert.equal(base({ CORTES_VIRAIS_DIR: '/x' }), '/x')
})

test('slug tira acento e espaço', () => {
  assert.equal(slug('Episódio 12: Ação!'), 'episodio-12-acao')
})

test('slug não deixa o nome vazio', () => {
  assert.equal(slug('!!!'), 'video')
})

test('nomeDaPasta começa com a data e a hora locais', () => {
  assert.equal(nomeDaPasta('Podcast 12', new Date(2026, 10, 10, 9, 5)), '2026-11-10-0905-podcast-12')
})

test('nomeDoVideo tira a data do nome da pasta', () => {
  assert.equal(nomeDoVideo('/a/b/2026-11-10-0905-podcast-12'), 'podcast 12')
})

test('hashDe muda quando o valor muda', () => {
  assert.notEqual(hashDe([1, 2]), hashDe([1, 3]))
})
