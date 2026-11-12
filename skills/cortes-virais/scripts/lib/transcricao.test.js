'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizarScribe, frases, textoParaModelo, formatarTempo, lerTempo, ehVicio, chave, aplicarCorrecoes } = require('./transcricao')

const w = (text, start, end, speaker = 'speaker_0', type = 'word') => ({ text, start, end, speaker_id: speaker, type })

test('normalizarScribe descarta os espaços e numera os falantes na ordem em que aparecem', () => {
  const doc = normalizarScribe({ words: [w('Oi', 0, 0.3, 'speaker_1'), w(' ', 0.3, 0.4, 'speaker_1', 'spacing'), w('tudo', 0.4, 0.7, 'speaker_0')] })
  assert.deepEqual(doc.palavras.map((p) => [p.t, p.f]), [['Oi', 'S1'], ['tudo', 'S2']])
})

test('normalizarScribe marca o evento de áudio e o põe entre parênteses', () => {
  const doc = normalizarScribe({ words: [w('laughter', 1, 2, 'speaker_0', 'audio_event')] })
  assert.deepEqual(doc.palavras[0], { i: 0, t: '(laughter)', s: 1, e: 2, f: 'S1', ev: true })
})

test('normalizarScribe ignora a palavra sem tempo', () => {
  const doc = normalizarScribe({ words: [w('nada', null, null)] })
  assert.equal(doc.palavras.length, 0)
})

test('frases quebra na pontuação final', () => {
  const doc = normalizarScribe({ words: [w('Oi.', 0, 0.3), w('Tudo', 0.4, 0.6), w('bem?', 0.6, 0.9)] })
  assert.deepEqual(frases(doc.palavras).map((f) => f.texto), ['Oi.', 'Tudo bem?'])
})

test('frases quebra na troca de falante', () => {
  const doc = normalizarScribe({ words: [w('Então', 0, 0.3, 'a'), w('olha', 0.4, 0.6, 'b')] })
  assert.equal(frases(doc.palavras).length, 2)
})

test('frases quebra numa pausa de 0,8 s ou mais', () => {
  const doc = normalizarScribe({ words: [w('primeiro', 0, 0.5), w('depois', 1.4, 1.8)] })
  assert.equal(frases(doc.palavras).length, 2)
})

test('frases mantém o riso dentro da frase em que aconteceu', () => {
  const doc = normalizarScribe({ words: [w('olha', 0, 0.3), w('laughter', 0.3, 0.9, 'speaker_0', 'audio_event'), w('isso.', 1.0, 1.3)] })
  assert.deepEqual(frases(doc.palavras).map((f) => f.texto), ['olha (laughter) isso.'])
})

test('textoParaModelo escreve início, fim e falante em cada linha', () => {
  const doc = normalizarScribe({ words: [w('Oi.', 65.2, 65.9)] })
  assert.equal(textoParaModelo(frases(doc.palavras)), '[0:01:05.2–0:01:05.9] S1: Oi.')
})

test('formatarTempo sempre traz a hora', () => {
  assert.equal(formatarTempo(3725.46), '1:02:05.5')
})

test('lerTempo aceita segundos', () => {
  assert.equal(lerTempo(12.5), 12.5)
})

test('lerTempo aceita h:mm:ss.d', () => {
  assert.equal(lerTempo('1:02:05.5'), 3725.5)
})

test('lerTempo aceita mm:ss', () => {
  assert.equal(lerTempo('02:05'), 125)
})

test('lerTempo recusa texto que não é tempo', () => {
  assert.throws(() => lerTempo('dois minutos'), /tempo inválido/)
})

test('ehVicio reconhece "hum" com vírgula', () => {
  assert.equal(ehVicio('hum,'), true)
})

test('ehVicio reconhece "éé" alongado', () => {
  assert.equal(ehVicio('Éé...'), true)
})

test('ehVicio não marca o verbo "é"', () => {
  assert.equal(ehVicio('é'), false)
})

test('ehVicio não marca "né"', () => {
  assert.equal(ehVicio('né'), false)
})

test('chave tira caixa, acento e pontuação', () => {
  assert.equal(chave('Ação!'), 'acao')
})

test('aplicarCorrecoes junta as palavras da grafia errada numa só', () => {
  const lista = aplicarCorrecoes([{ t: 'a', s: 0, e: 0.2 }, { t: 'Ác', s: 0.3, e: 0.5 }, { t: 'mi', s: 0.5, e: 0.8 }, { t: 'tech', s: 0.8, e: 0.9 }, { t: 'lab.', s: 0.9, e: 1.2 }], [{ de: 'ac mi tech lab', para: 'AcmeTechLab' }])
  assert.deepEqual(lista.map((p) => [p.t, p.s, p.e]), [['a', 0, 0.2], ['AcmeTechLab.', 0.3, 1.2]])
})

test('aplicarCorrecoes troca uma palavra só', () => {
  const lista = aplicarCorrecoes([{ t: 'Ékme,', s: 0, e: 0.3 }], [{ de: 'ekme', para: 'Acme' }])
  assert.equal(lista[0].t, 'Acme,')
})

test('normalizarScribe tira os colchetes do som marcado', () => {
  const doc = normalizarScribe({ words: [w('[risos]', 1, 2, 'speaker_0', 'audio_event')] })
  assert.equal(doc.palavras[0].t, '(risos)')
})

test('normalizarScribe descarta a palavra que é só pontuação', () => {
  const doc = normalizarScribe({ words: [w('Oi', 0, 0.3), w('.', 0.3, 0.3)] })
  assert.deepEqual(doc.palavras.map((p) => p.t), ['Oi'])
})

test('ehVicio não marca o artigo "um"', () => {
  assert.equal(ehVicio('um'), false)
})

test('ehVicio reconhece "humm"', () => {
  assert.equal(ehVicio('humm'), true)
})
