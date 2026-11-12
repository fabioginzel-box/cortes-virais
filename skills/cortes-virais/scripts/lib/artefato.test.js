'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { montarPasta, paginaDaMesa, dadosDaMesa, documentoAprovado, hashtags } = require('./artefato')

const FONTE = path.join(__dirname, '..', '..', 'assets', 'fontes', 'Montserrat-ExtraBold.ttf')
const corte = (id, extra = {}) => ({ id, titulo: `T${id}`, gancho: 'G', descricao: 'D', hashtags: ['#a'], nota: 70, notas: {}, duracao: 40, ...extra })

test('hashtags põe o # e separa por espaço ou vírgula', () => {
  assert.deepEqual(hashtags('podcast, #economia  dinheiro'), ['#podcast', '#economia', '#dinheiro'])
})

test('paginaDaMesa escreve os cortes sem deixar "</" quebrar a tag', () => {
  const html = paginaDaMesa(dadosDaMesa({ nome: 'x', cortes: [corte(1, { porque: '</script>' })] }), { fonte: FONTE })
  assert.match(html, /\\u003c\/script>/)
  assert.doesNotMatch(html, /<!-- CORTES -->/)
})

test('paginaDaMesa embute a fonte do canal', () => {
  const html = paginaDaMesa(dadosDaMesa({ nome: 'x', cortes: [] }), { fonte: FONTE })
  assert.match(html, /url\(data:font\/ttf;base64,/)
})

test('paginaDaMesa da mesa local troca o banco do artefato pela API local', () => {
  const html = paginaDaMesa(dadosDaMesa({ nome: 'x', cortes: [] }), { fonte: FONTE, local: true })
  assert.match(html, /fetch\('\/api\/' \+ caminho/)
})

test('paginaDaMesa do artefato não leva a API local', () => {
  const html = paginaDaMesa(dadosDaMesa({ nome: 'x', cortes: [] }), { fonte: FONTE })
  assert.doesNotMatch(html, /\/api\//)
})

test('montarPasta deixa de fora o corte sem prévia', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-'))
  fs.mkdirSync(path.join(base, 'previas'))
  fs.writeFileSync(path.join(base, 'previas', '1.mp4'), 'x')
  const r = montarPasta({ nome: 'x', cortes: [corte(1), corte(2)] }, path.join(base, 'previas'), path.join(base, 'artefato'), {}, { fonte: FONTE })
  assert.deepEqual([Object.keys(r.publicar.files), r.semPrevia], [['previas/1.mp4'], [2]])
})

test('montarPasta recusa apagar uma pasta que não é mesa', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-'))
  fs.writeFileSync(path.join(base, 'fonte.json'), '{}')
  assert.throws(() => montarPasta({ nome: 'x', cortes: [] }, path.join(base, 'previas'), base, {}, { fonte: FONTE }), /não é uma mesa montada/)
  assert.equal(fs.existsSync(path.join(base, 'fonte.json')), true)
})

test('montarPasta refaz a mesa que ela mesma montou', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-'))
  const saida = path.join(base, 'artefato')
  montarPasta({ nome: 'x', cortes: [] }, path.join(base, 'previas'), saida, {}, { fonte: FONTE })
  assert.doesNotThrow(() => montarPasta({ nome: 'x', cortes: [] }, path.join(base, 'previas'), saida, {}, { fonte: FONTE }))
})

test('documentoAprovado leva as edições da mesa para o corte aprovado', () => {
  const r = documentoAprovado({ cortes: [corte(1), corte(2)] }, { 1: { aprovado: true, titulo: 'Novo', hashtags: 'x y' } })
  assert.deepEqual(r.cortes.map((c) => [c.id, c.titulo, c.hashtags]), [[1, 'Novo', ['#x', '#y']]])
})

test('documentoAprovado recusa quando nada foi aprovado', () => {
  assert.throws(() => documentoAprovado({ cortes: [corte(1)] }, { 1: { aprovado: false } }), /nenhum corte aprovado/)
})

test('documentoAprovado recusa o gancho editado na mesa que não cabe no card', () => {
  assert.throws(() => documentoAprovado({ cortes: [corte(1)] }, { 1: { aprovado: true, gancho: 'g'.repeat(61) } }), /gancho do corte 1 tem 61 caracteres/)
})

test('documentoAprovado recusa o título editado acima de 100 caracteres', () => {
  assert.throws(() => documentoAprovado({ cortes: [corte(1)] }, { 1: { aprovado: true, titulo: 't'.repeat(101) } }), /título do corte 1 tem 101 caracteres/)
})

test('documentoAprovado aceita o gancho editado no limite do card', () => {
  const r = documentoAprovado({ cortes: [corte(1)] }, { 1: { aprovado: true, gancho: 'g'.repeat(60) } })
  assert.equal(r.cortes[0].gancho.length, 60)
})

test('montarPasta refaz a mesa dela que foi aberta no Finder', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-'))
  const saida = path.join(base, 'artefato')
  montarPasta({ nome: 'x', cortes: [] }, path.join(base, 'previas'), saida, {}, { fonte: FONTE })
  fs.writeFileSync(path.join(saida, '.DS_Store'), 'x')
  assert.doesNotThrow(() => montarPasta({ nome: 'x', cortes: [] }, path.join(base, 'previas'), saida, {}, { fonte: FONTE }))
})

test('montarPasta recusa a pasta com só um index.html que não é desta skill', () => {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'))
  fs.writeFileSync(path.join(saida, 'index.html'), '<h1>outro site</h1>')
  assert.throws(() => montarPasta({ nome: 'x', cortes: [] }, path.join(saida, 'previas'), saida, {}, { fonte: FONTE }), /não é uma mesa/)
})
