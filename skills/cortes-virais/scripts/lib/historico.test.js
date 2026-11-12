'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { lerNumero, linhaDoCorte, registrar, ler, resumo, faixaDeDuracao, acertoDaNota } = require('./historico')

const corte = { id: 3, titulo: 'T', tipo_gancho: 'contrario', duracao: 42, nota: 78, notas: {} }
const linha = (tipo, duracao, nota, retencao, visualizacoes = 1000) => ({ tipo_gancho: tipo, duracao, nota, metricas: { retencao, visualizacoes } })

test('linhaDoCorte guarda o corte e os números do Studio', () => {
  const l = linhaDoCorte(corte, '/x/2026-11-10-podcast', { visualizacoes: '1500', retencao: '72.5' }, new Date('2026-11-17T12:00:00Z'))
  assert.deepEqual([l.pasta, l.tipo_gancho, l.metricas], ['2026-11-10-podcast', 'contrario', { visualizacoes: 1500, retencao: 72.5 }])
})

test('linhaDoCorte pede visualizações e retenção', () => {
  assert.throws(() => linhaDoCorte(corte, '/x', { visualizacoes: 10 }), /retencao/)
})

test('faixaDeDuracao põe 30 s na faixa mais curta', () => {
  assert.equal(faixaDeDuracao(30), 'até 30 s')
})

test('faixaDeDuracao põe 31 s na faixa de 31 a 45', () => {
  assert.equal(faixaDeDuracao(31), '31 a 45 s')
})

test('faixaDeDuracao põe 61 s na faixa mais longa', () => {
  assert.equal(faixaDeDuracao(61), 'mais de 60 s')
})

test('registrar troca os números do corte já registrado', () => {
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hist-')), 'historico.jsonl')
  registrar(arquivo, { pasta: 'p', id: 1, metricas: { retencao: 50 } })
  registrar(arquivo, { pasta: 'p', id: 1, metricas: { retencao: 70 } })
  assert.deepEqual(ler(arquivo).map((l) => l.metricas.retencao), [70])
})

test('resumo ordena os ganchos pela retenção mediana', () => {
  const r = resumo([linha('contrario', 40, 80, 70), linha('pergunta', 40, 70, 50), linha('contrario', 40, 75, 80)])
  assert.deepEqual(r.porGancho.map((g) => [g.nome, g.retencao]), [['contrario', 75], ['pergunta', 50]])
})

test('acertoDaNota precisa de pelo menos 5 cortes', () => {
  assert.equal(acertoDaNota([linha('a', 30, 80, 70)]), null)
})

test('acertoDaNota dá 1 quando a nota ordena a retenção do mesmo jeito', () => {
  const ls = [60, 65, 70, 75, 80].map((n, i) => linha('a', 30, n, 40 + i * 5))
  assert.equal(acertoDaNota(ls), 1)
})

const linhaCom = (nota, retencao) => ({ nota, metricas: { retencao } })

test('acertoDaNota não depende da ordem quando há notas empatadas', () => {
  const linhas = [linhaCom(70, 50), linhaCom(70, 60), linhaCom(80, 70), linhaCom(80, 40), linhaCom(90, 80), linhaCom(60, 30)]
  assert.equal(acertoDaNota(linhas), acertoDaNota([...linhas].reverse()))
})

test('acertoDaNota sem variação nas notas não tem resposta', () => {
  const linhas = [50, 60, 70, 40, 80, 30].map((r) => linhaCom(70, r))
  assert.equal(acertoDaNota(linhas), null)
})

test('lerNumero tira o ponto de milhar do YouTube Studio', () => {
  assert.equal(lerNumero('12.000', 'visualizacoes'), 12000)
})

test('lerNumero lê a vírgula decimal', () => {
  assert.equal(lerNumero('74,5', 'retencao'), 74.5)
})

test('lerNumero lê o número com milhar e decimal', () => {
  assert.equal(lerNumero('1.234,5', 'visualizacoes'), 1234.5)
})

test('lerNumero aceita o ponto decimal', () => {
  assert.equal(lerNumero('74.5', 'retencao'), 74.5)
})

test('lerNumero tira o sinal de porcentagem', () => {
  assert.equal(lerNumero('68%', 'continuaram'), 68)
})

test('lerNumero recusa o que não é número', () => {
  assert.throws(() => lerNumero('muito', 'visualizacoes'), /--visualizacoes "muito" não é um número/)
})

test('lerNumero lê o ponto da retenção como decimal, porque porcentagem não tem milhar', () => {
  assert.equal(lerNumero('74.125', 'retencao'), 74.125)
})

test('lerNumero lê o ponto do "continuaram" como decimal', () => {
  assert.equal(lerNumero('66.250', 'continuaram'), 66.25)
})

test('resumo diz que o acerto da nota precisa de 5 cortes quando há menos', () => {
  assert.match(resumo([linha('a', 30, 80, 70)]).semAcerto, /5 cortes/)
})

test('resumo diz que o acerto da nota não se mede quando a retenção não varia', () => {
  const linhas = [60, 65, 70, 75, 80].map((n) => linha('a', 30, n, 50))
  assert.match(resumo(linhas).semAcerto, /não variam/)
})

test('resumo não traz o porquê de não medir quando o acerto existe', () => {
  const linhas = [60, 65, 70, 75, 80].map((n, i) => linha('a', 30, n, 40 + i * 5))
  assert.equal(resumo(linhas).semAcerto, null)
})
