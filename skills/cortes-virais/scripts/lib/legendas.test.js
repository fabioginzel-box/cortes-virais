'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { blocos, estados, listaDoConcat, textoDaLegenda, trechosDasFrases } = require('./legendas')
const { argsOverlay } = require('./render')
const { acharPrograma } = require('./midia')

const p = (t, s, e, f = 'S1') => ({ t, s, e, f })

test('textoDaLegenda tira a vírgula do fim', () => {
  assert.equal(textoDaLegenda('olha,'), 'olha')
})

test('textoDaLegenda tira o ponto do fim', () => {
  assert.equal(textoDaLegenda('isso.'), 'isso')
})

test('textoDaLegenda mantém a interrogação', () => {
  assert.equal(textoDaLegenda('sério?'), 'sério?')
})

test('textoDaLegenda põe em caixa alta quando pedido', () => {
  assert.equal(textoDaLegenda('ação', true), 'AÇÃO')
})

test('blocos junta no máximo três palavras', () => {
  const b = blocos([p('a', 0, 0.1), p('b', 0.1, 0.2), p('c', 0.2, 0.3), p('d', 0.3, 0.4)])
  assert.deepEqual(b.map((x) => x.palavras.length), [3, 1])
})

test('blocos quebra no fim da frase', () => {
  const b = blocos([p('Oi.', 0, 0.2), p('Tudo', 0.25, 0.4)])
  assert.equal(b.length, 2)
})

test('blocos quebra numa pausa de 0,35 s', () => {
  const b = blocos([p('um', 0, 0.2), p('dois', 0.6, 0.8)])
  assert.equal(b.length, 2)
})

test('blocos quebra na troca de falante', () => {
  const b = blocos([p('um', 0, 0.2, 'S1'), p('dois', 0.2, 0.4, 'S2')])
  assert.equal(b.length, 2)
})

test('blocos quebra quando passa de 20 caracteres', () => {
  const b = blocos([p('extraordinariamente', 0, 0.5), p('bom', 0.5, 0.7)])
  assert.equal(b.length, 2)
})

test('blocos emenda o fim de um bloco no começo do próximo quando a pausa é curta', () => {
  const b = blocos([p('a', 0, 0.1), p('b', 0.1, 0.2), p('c', 0.2, 0.3), p('d', 0.5, 0.6)])
  assert.equal(b[0].ate, 0.5)
})

test('blocos segura o último bloco 0,3 s depois da fala', () => {
  const b = blocos([p('fim', 0, 0.5)])
  assert.equal(b[0].ate, 0.8)
})

test('estados destaca a palavra que está sendo dita', () => {
  const lista = estados(blocos([p('um', 0, 0.5), p('dois', 0.5, 1)]), { duracao: 1.5, fps: 10, gancho: 0 })
  assert.deepEqual(lista.slice(0, 2).map((e) => e.dados.ativa), [0, 1])
})

test('estados cobre a duração inteira em quadros', () => {
  const lista = estados(blocos([p('um', 0.2, 0.5)]), { duracao: 2, fps: 30, gancho: 1 })
  assert.equal(lista.reduce((t, e) => t + e.quadros, 0), 60)
})

test('estados liga o card do gancho só no começo', () => {
  const lista = estados([], { duracao: 6, fps: 30, gancho: 4 })
  assert.deepEqual(lista.map((e) => [e.quadros, e.dados.gancho]), [[120, true], [60, false]])
})

test('listaDoConcat repete o último arquivo', () => {
  const texto = listaDoConcat([{ quadros: 15 }, { quadros: 30 }], ['/a.png', '/b.png'], 30)
  assert.equal(texto, "file '/a.png'\noption framerate 30\nduration 0.500000\nfile '/b.png'\noption framerate 30\nduration 1.000000\nfile '/b.png'\noption framerate 30\n")
})

test('trechosDasFrases acha a frase sem ligar para caixa, acento e pontuação', () => {
  const r = trechosDasFrases([p('Custa', 0, 0.3), p('NOVECENTOS', 0.3, 0.8), p('reais.', 0.8, 1.1)], ['novecentos reais'])
  assert.deepEqual(r.map((x) => [x.i0, x.i1, x.de, x.ate]), [[1, 2, 0.3, 1.1]])
})

test('blocos marca as palavras da frase de destaque', () => {
  const b = blocos([p('é', 0, 0.2), p('muito', 0.2, 0.5), p('caro', 0.5, 0.8)], { destaques: ['muito caro'] })
  assert.deepEqual(b[0].palavras.map((x) => x.chave), [false, true, true])
})

test('estados leva o destaque para a tela só no bloco que tem palavra-chave', () => {
  const lista = estados(blocos([p('custa', 0, 0.3), p('caro', 0.3, 0.6)], { destaques: ['caro'] }), { duracao: 1, fps: 10, gancho: 0 })
  assert.deepEqual(lista[0].dados.chaves, [false, true])
})

test('listaDoConcat troca a contrabarra do caminho do Windows pela barra', () => {
  const texto = listaDoConcat([{ quadros: 30 }], ['C:\\Users\\ana\\e0000.png'], 30)
  assert.match(texto, /^file 'C:\/Users\/ana\/e0000\.png'\n/)
})

test('trechosDasFrases acha o destaque dentro da palavra que a correção juntou', () => {
  const r = trechosDasFrases([p('cobra', 0, 0.3), p('R$ 300', 0.3, 1.0), p('por', 1.0, 1.2)], ['R$ 300'])
  assert.deepEqual(r.map((x) => [x.i0, x.i1]), [[1, 1]])
})

test('listaDoConcat abre cada PNG na cadência da entrega', () => {
  const lista = listaDoConcat([{ quadros: 2 }, { quadros: 1 }], ['a.png', 'b.png'], 25)
  assert.equal(lista.split('\n').filter((l) => l === 'option framerate 25').length, 3)
})

const ffmpeg = acharPrograma('ffmpeg')

test('o overlay da legenda segura cada estado pelo número de quadros pedido', { skip: !ffmpeg && 'sem o ffmpeg nesta máquina' }, () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'))
  const cores = ['red', 'lime', 'blue', 'yellow', 'white', 'magenta', 'orange', 'cyan']
  const quadros = [1, 2, 1, 3, 1, 1, 5, 2]
  const arquivos = cores.map((c, k) => {
    const a = path.join(pasta, `e${k}.png`)
    spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${c}:s=32x32`, '-frames:v', '1', a])
    return a
  })
  fs.writeFileSync(path.join(pasta, 'lista.txt'), listaDoConcat(quadros.map((q) => ({ quadros: q })), arquivos, 30))
  spawnSync(ffmpeg, argsOverlay(path.join(pasta, 'lista.txt'), 30, path.join(pasta, 'ov.mov')))
  const saida = spawnSync(ffmpeg, ['-hide_banner', '-i', path.join(pasta, 'ov.mov'), '-vf', 'scale=1:1,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }).stdout
  const corridas = []
  for (let i = 0; i < saida.length; i += 3) {
    const cor = saida.subarray(i, i + 3).toString('hex')
    const u = corridas[corridas.length - 1]
    if (u && u.cor === cor) u.n++
    else corridas.push({ cor, n: 1 })
  }
  assert.deepEqual(corridas.slice(0, -1).map((c) => c.n), quadros.slice(0, -1))
})

test('listaDoConcat deixa o framerate de fora no ffmpeg antigo, que não conhece a diretiva option', () => {
  const texto = listaDoConcat([{ quadros: 30 }], ['/a.png'], 30, { versao: 4 })
  assert.doesNotMatch(texto, /option/)
})

test('listaDoConcat leva o framerate a partir do ffmpeg 6', () => {
  const texto = listaDoConcat([{ quadros: 30 }], ['/a.png'], 30, { versao: 6 })
  assert.match(texto, /option framerate 30/)
})
