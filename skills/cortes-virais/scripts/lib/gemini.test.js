'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { prompt, momentosDaParte, juntar, textoParaModelo } = require('./gemini')

const resposta = (momentos, extra = {}) => ['```json\n', JSON.stringify({ momentos, ...extra }), '\n```']

test('prompt pede a visão geral em toda parte, para ela não sumir quando a primeira falha', () => {
  assert.match(prompt({ inicio: 1140, fim: 2340 }, 3000, 1, 3), /visao_geral/)
})

test('momentosDaParte leva o tempo da parte para o original', () => {
  const r = momentosDaParte(resposta([{ inicio: '01:00', fim: '01:40', sinais: ['riso'], intensidade: 8 }]), { inicio: 1140, fim: 2340 })
  assert.deepEqual([r.momentos[0].inicio, r.momentos[0].fim], [1200, 1240])
})

test('momentosDaParte descarta o momento com tempo torto', () => {
  const r = momentosDaParte(resposta([{ inicio: '02:00', fim: '01:00', intensidade: 5 }, { inicio: 'x', fim: '01:00' }]), { inicio: 0, fim: 600 })
  assert.equal(r.momentos.length, 0)
})

test('momentosDaParte ignora o sinal fora da lista', () => {
  const r = momentosDaParte(resposta([{ inicio: '00:10', fim: '00:40', sinais: ['riso', 'meme'], intensidade: 7 }]), { inicio: 0, fim: 600 })
  assert.deepEqual(r.momentos[0].sinais, ['riso'])
})

test('momentosDaParte traz a visão geral', () => {
  const r = momentosDaParte(resposta([], { visao_geral: { pessoas: 2, tipo: 'podcast' } }), { inicio: 0, fim: 600 })
  assert.equal(r.visaoGeral.tipo, 'podcast')
})

test('momentosDaParte recusa resposta sem JSON', () => {
  assert.throws(() => momentosDaParte(['não achei nada'], { inicio: 0, fim: 600 }), /não devolveu JSON/)
})

test('juntar fica com o mais intenso do momento repetido na sobra das partes', () => {
  const r = juntar([[{ inicio: 1150, fim: 1190, intensidade: 6, sinais: [] }], [{ inicio: 1152, fim: 1192, intensidade: 9, sinais: [] }]])
  assert.deepEqual(r.map((m) => m.intensidade), [9])
})

test('textoParaModelo escreve uma linha por momento', () => {
  const t = textoParaModelo([{ inicio: 65, fim: 90, intensidade: 8, sinais: ['riso'], o_que_acontece: 'Ri da conta.', frase_chave: 'Caro?' }])
  assert.equal(t, '[0:01:05.0–0:01:30.0] 8/10 riso — Ri da conta. "Caro?"')
})

test('momentosDaParte aceita os sinais escritos como texto', () => {
  const r = momentosDaParte(resposta([{ inicio: '00:10', fim: '00:40', sinais: 'riso', intensidade: 7 }]), { inicio: 0, fim: 1200 })
  assert.deepEqual(r.momentos.map((m) => m.sinais), [['riso']])
})

test('momentosDaParte descarta o momento que começa depois do fim da parte', () => {
  const r = momentosDaParte(resposta([{ inicio: '21:00', fim: '21:30', sinais: ['riso'], intensidade: 7 }]), { inicio: 0, fim: 1200 })
  assert.deepEqual(r.momentos, [])
})
