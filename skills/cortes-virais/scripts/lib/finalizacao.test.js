'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { FUSAO, duracaoDoCartao, quadrosDoCartao, argsSom, argsVideoDeAssinatura, lerDuracao, dadosDoCartao } = require('./finalizacao')
const { resolver } = require('./marca')

test('a fusão da finalização é de um quarto de segundo', () => {
  assert.equal(FUSAO, 0.25)
})

test('duracaoDoCartao sem áudio é a do marca.json', () => {
  assert.equal(duracaoDoCartao({ duracao: 3 }), 3)
})

test('duracaoDoCartao com áudio dura o áudio', () => {
  assert.equal(duracaoDoCartao({ duracao: 3 }, 4.2), 4.2)
})

test('duracaoDoCartao segura o áudio longo em 8 s', () => {
  assert.equal(duracaoDoCartao({ duracao: 3 }, 20), 8)
})

test('duracaoDoCartao estica o áudio curto até 1,5 s', () => {
  assert.equal(duracaoDoCartao({ duracao: 3 }, 0.4), 1.5)
})

test('quadrosDoCartao conta a fusão e o cartão', () => {
  assert.equal(quadrosDoCartao(2.5, 30), 83)
})

test('argsSom sem áudio gera silêncio na duração do cartão', () => {
  const args = argsSom({ duracao: 2.5, destino: 's.wav' })
  assert.deepEqual(args.slice(args.indexOf('-i'), args.indexOf('-i') + 4), ['-i', 'anullsrc=r=48000:cl=stereo', '-t', '2.5'])
})

test('argsSom com áudio completa ou corta na duração do cartão', () => {
  const args = argsSom({ audio: 'a.mp3', duracao: 2.5, destino: 's.wav' })
  assert.match(args[args.indexOf('-af') + 1], /apad=whole_dur=2\.5,atrim=0:2\.5$/)
})

test('argsVideoDeAssinatura encaixa o vídeo no 9:16 sobre ele mesmo desfocado', () => {
  const args = argsVideoDeAssinatura('a.mp4', 30, 'b.mov')
  assert.match(args[args.indexOf('-filter_complex') + 1], /gblur=sigma=40.*overlay=\(W-w\)\/2:\(H-h\)\/2.*fps=30/)
})

test('argsVideoDeAssinatura deixa o som de fora, porque ele é normalizado à parte', () => {
  assert.ok(argsVideoDeAssinatura('a.mp4', 30, 'b.mov').includes('-an'))
})

test('lerDuracao diz se o arquivo tem áudio', () => {
  assert.deepEqual(lerDuracao(JSON.stringify({ format: { duration: '2.5' }, streams: [{ codec_type: 'video' }] })), { duracao: 2.5, audio: false })
})

test('dadosDoCartao leva os textos sem espaço sobrando', () => {
  const m = resolver({ finalizacao: { modo: 'cartao', cartao: { titulo: ' Curtiu? ', botao: 'Segue', apoio: '' } } })
  const d = dadosDoCartao(m, null)
  assert.deepEqual([d.titulo, d.botao, d.apoio, d.logo, d.cena], ['Curtiu?', 'Segue', '', null, null])
})

test('dadosDoCartao leva a fonte da marca como endereço de arquivo', () => {
  const d = dadosDoCartao(resolver({ estilo: 'impacto' }), null)
  assert.match(d.fonte.url, /^file:.*Anton-Regular\.ttf$/)
})
