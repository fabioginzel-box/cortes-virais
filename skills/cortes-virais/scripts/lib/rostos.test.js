'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { trilhas, turnos, momentosDeReacao, recorteDoRosto, rostoDoPedaco, planos, descrever } = require('./rostos')

const info = { largura: 1920, altura: 1080 }
const rosto = (cx, boca = 0, h = 0.3) => ({ cx, cy: 0.4, w: 0.15, h, boca })

// Dois rostos fixos, à esquerda (0,3) e à direita (0,7). A boca de quem fala abre e fecha a cada
// quadro; a de quem cala fica parada.
function conversa (quemFala) {
  const quadros = []
  for (let k = 0; k < 100; k++) {
    const t = k * 0.2
    const f = quemFala(t)
    const mexe = k % 2 ? 0.6 : 0.1
    quadros.push({ t, faces: [rosto(0.3, f === 'S1' ? mexe : 0.05), rosto(0.7, f === 'S2' ? mexe : 0.05)] })
  }
  return quadros
}

function falasDe (quemFala, ate = 20) {
  const lista = []
  for (let s = 0; s < ate; s += 0.5) lista.push({ t: 'x', s, e: s + 0.4, f: quemFala(s) })
  return lista
}

test('trilhas separa duas pessoas paradas em duas trilhas', () => {
  const lista = trilhas(conversa(() => 'S1'))
  assert.deepEqual(lista.map((t) => Math.round(t.presenca * 100)), [100, 100])
})

test('trilhas junta o rosto que some por pouco tempo na mesma trilha', () => {
  const quadros = [{ t: 0, faces: [rosto(0.5)] }, { t: 1, faces: [] }, { t: 2, faces: [rosto(0.52)] }]
  assert.equal(trilhas(quadros).length, 1)
})

test('rostoDoPedaco escolhe o rosto cuja boca mexe', () => {
  const quadros = conversa(() => 'S2').map((q) => ({ ...q, te: q.t }))
  assert.ok(rostoDoPedaco(quadros).cx > 0.5)
})

test('rostoDoPedaco fica com o maior rosto quando nenhuma boca mexe', () => {
  const quadros = Array.from({ length: 10 }, (_, k) => ({ t: k * 0.2, te: k * 0.2, faces: [rosto(0.3, 0, 0.2), rosto(0.7, 0, 0.35)] }))
  assert.ok(rostoDoPedaco(quadros).cx > 0.5)
})

test('turnos ignora a interrupção mais curta que 1 s', () => {
  const palavras = [{ t: 'a', s: 0, e: 3, f: 'S1' }, { t: 'b', s: 3.1, e: 3.5, f: 'S2' }, { t: 'c', s: 3.6, e: 8, f: 'S1' }]
  assert.deepEqual(turnos(palavras, 8).map((t) => t.f), ['S1'])
})

test('turnos troca um pouco antes da primeira palavra de quem entra', () => {
  const palavras = [{ t: 'a', s: 0, e: 3, f: 'S1' }, { t: 'b', s: 4, e: 8, f: 'S2' }]
  assert.deepEqual(turnos(palavras, 8).map((t) => [t.f, t.de, t.ate]), [['S1', 0, 3.9], ['S2', 3.9, 8]])
})

test('recorteDoRosto faz o 9:16 na altura inteira, centrado no rosto', () => {
  assert.deepEqual(recorteDoRosto([{ cx: 0.5, cy: 0.4, h: 0.3 }], info), { w: 608, h: 1080, x: 656, y: 0 })
})

test('recorteDoRosto encosta na borda quando o rosto está no canto', () => {
  assert.equal(recorteDoRosto([{ cx: 0.02, cy: 0.4, h: 0.3 }], info).x, 0)
})

test('recorteDoRosto dá zoom no rosto pequeno de um vídeo 4K sem passar de 2x', () => {
  const r = recorteDoRosto([{ cx: 0.5, cy: 0.5, h: 0.05 }], { largura: 3840, altura: 2160 })
  assert.deepEqual([r.w, r.h], [608, 1080])
})

test('recorteDoRosto quase não dá zoom num vídeo 1080p, para a entrega não ampliar mais de 2x', () => {
  const r = recorteDoRosto([{ cx: 0.5, cy: 0.5, h: 0.05 }], info)
  assert.deepEqual([r.w, r.h], [540, 960])
})

test('planos mostra quem fala com corte seco na troca', () => {
  const quem = (t) => (t < 10 ? 'S1' : 'S2')
  const r = planos({ quadros: conversa(quem), palavrasEditadas: falasDe(quem), mantidos: [[0, 20]], info })
  assert.deepEqual(r.planos.map((p) => [p.de, p.x < 960 ? 'esquerda' : 'direita']), [[0, 'esquerda'], [9.9, 'direita']])
})

test('planos com o layout rosto fica no rosto de quem mais fala, sem trocar', () => {
  const quem = (t) => (t < 14 ? 'S1' : 'S2')
  const r = planos({ quadros: conversa(quem), palavrasEditadas: falasDe(quem), mantidos: [[0, 20]], info, layout: 'rosto' })
  assert.deepEqual(r.planos.map((p) => [p.de, p.x < 960 ? 'esquerda' : 'direita']), [[0, 'esquerda']])
})

test('planos com o layout rosto diz que segue um rosto', () => {
  const quem = (t) => (t < 14 ? 'S1' : 'S2')
  const r = planos({ quadros: conversa(quem), palavrasEditadas: falasDe(quem), mantidos: [[0, 20]], info, layout: 'rosto' })
  assert.equal(r.layout, 'rosto')
})

test('planos usa a tela inteira quando não há rosto', () => {
  const quadros = Array.from({ length: 20 }, (_, k) => ({ t: k, faces: [] }))
  const r = planos({ quadros, palavrasEditadas: [], mantidos: [[0, 20]], info })
  assert.equal(r.layout, 'tela')
})

test('planos divide a tela quando pedido', () => {
  const quem = (t) => (t < 10 ? 'S1' : 'S2')
  const r = planos({ quadros: conversa(quem), palavrasEditadas: falasDe(quem), mantidos: [[0, 20]], info, layout: 'dividido' })
  assert.equal(r.planos[0].tipo, 'dividido')
})

test('planos divide a tela no trecho em que a conversa troca de voz a todo momento', () => {
  const quem = (t) => (t >= 8 && t < 14 ? (Math.floor(t / 1.5) % 2 ? 'S2' : 'S1') : (t < 8 ? 'S1' : 'S2'))
  const r = planos({ quadros: conversa(quem), palavrasEditadas: falasDe(quem), mantidos: [[0, 20]], info })
  const dividido = r.planos.find((p) => p.tipo === 'dividido')
  assert.ok(dividido && dividido.de >= 6 && dividido.ate <= 15)
})

test('planos divide a tela durante o riso', () => {
  const quem = (t) => (t < 10 ? 'S1' : 'S2')
  const editadas = [...falasDe(quem), { t: '(laughter)', s: 12, e: 13.5, ev: true }]
  const r = planos({ quadros: conversa(quem), palavrasEditadas: editadas, mantidos: [[0, 20]], info })
  assert.deepEqual(r.planos.filter((p) => p.tipo === 'dividido').map((p) => [p.de, p.ate]), [[11.7, 13.8]])
})

test('planos acha o rosto no trecho que toca duas vezes na abertura no ponto alto', () => {
  const quem = () => 'S1'
  const quadros = Array.from({ length: 50 }, (_, k) => ({ t: k * 0.2, faces: [rosto(0.3 + 0.008 * k, k % 2 ? 0.5 : 0.1)] }))
  const r = planos({ quadros, palavrasEditadas: falasDe(quem, 12), mantidos: [[8, 10], [0, 10]], info })
  const historia = r.planos.find((p) => p.de === 2)
  assert.ok(historia.xs.some(([t]) => t > 8))
})

test('planos troca o recorte na troca de câmera da fonte', () => {
  const quem = () => 'S1'
  const quadros = Array.from({ length: 100 }, (_, k) => ({ t: k * 0.2, faces: [k * 0.2 < 10 ? rosto(0.3, k % 2 ? 0.5 : 0.1) : rosto(0.75, k % 2 ? 0.5 : 0.1, 0.5)] }))
  const r = planos({ quadros, palavrasEditadas: falasDe(quem), mantidos: [[0, 20]], info, cortesDeCena: [10] })
  assert.deepEqual(r.planos.map((p) => [p.de, p.x < 960 ? 'esquerda' : 'direita']), [[0, 'esquerda'], [10, 'direita']])
})

test('momentosDeReacao ignora a troca de voz devagar', () => {
  const editadas = [{ t: 'a', s: 0, e: 4, f: 'S1' }, { t: 'b', s: 4.2, e: 8, f: 'S2' }, { t: 'c', s: 8.2, e: 12, f: 'S1' }]
  assert.deepEqual(momentosDeReacao(editadas, 12), [])
})

test('descrever conta as trocas e as reações', () => {
  const enq = { layout: 'falantes', trocasDeCamera: 3, planos: [{ tipo: 'rosto' }, { tipo: 'dividido' }, { tipo: 'rosto' }] }
  assert.equal(descrever(enq), 'segue quem fala, 2 trocas, tela dividida em 1 reação; a fonte troca de câmera 3 vezes')
})

test('planos com uma pessoa só e pausas cortadas diz que segue o rosto', () => {
  const quadros = Array.from({ length: 100 }, (_, k) => ({ t: k * 0.2, faces: [rosto(0.5, k % 2 ? 0.6 : 0.1)] }))
  const r = planos({ quadros, palavrasEditadas: falasDe(() => 'S1', 16), mantidos: [[0, 6], [7, 12], [13, 18]], info })
  assert.equal(r.layout, 'rosto')
})

test('planos dá ao pedaço curto sem quadro o rosto do vizinho, e não o do começo do corte', () => {
  const quem = (t) => (t < 5 ? 'S1' : 'S2')
  const r = planos({ quadros: conversa(quem), palavrasEditadas: falasDe(quem, 18), mantidos: [[0, 9.9], [10.05, 10.15], [12, 20]], info })
  const plano = r.planos.find((p) => p.de <= 9.95 && p.ate > 9.95)
  assert.equal(plano.x < 960 ? 'esquerda' : 'direita', 'direita')
})

test('planos não repete os pontos do rosto ao juntar o pedaço que herdou do vizinho', () => {
  const quadros = Array.from({ length: 61 }, (_, k) => {
    const t = Number((k * 0.2).toFixed(3))
    return { t, faces: [{ cx: t < 5.7 ? 0.3 + 0.3 * (t / 5) : 0.8, cy: 0.4, w: 0.15, h: 0.25, boca: 0.2 }] }
  })
  const r = planos({ quadros, cortesDeCena: [5.79], palavrasEditadas: falasDe(() => 'S1', 11), mantidos: [[0, 5.01], [5.62, 12]], info })
  const tempos = r.planos.filter((p) => p.xs).map((p) => p.xs.map((k) => k[0]))
  assert.ok(tempos.length && tempos.every((ts) => ts.every((t, i) => i === 0 || t > ts[i - 1])))
})

test('planos não mostra o ouvinte no pedaço de um quadro só', () => {
  const quadros = Array.from({ length: 61 }, (_, k) => ({ t: Number((k * 0.2).toFixed(3)), faces: [rosto(0.3, 0.1, 0.3), rosto(0.7, k % 2 ? 0.4 : 0.1, 0.2)] }))
  const r = planos({ quadros, palavrasEditadas: falasDe(() => 'S2', 11), mantidos: [[0, 4.9], [5.5, 5.8], [6.3, 12]], info })
  assert.deepEqual(r.planos.map((p) => (p.x < 960 ? 'esquerda' : 'direita')), ['direita'])
})

test('planos deixa o pedaço de um quadro numa câmera própria com o rosto dela', () => {
  const quadros = Array.from({ length: 51 }, (_, k) => {
    const t = Number((k * 0.2).toFixed(3))
    return { t, faces: [t > 5.1 && t < 5.3 ? rosto(0.7) : rosto(0.3)] }
  })
  const r = planos({ quadros, palavrasEditadas: falasDe(() => 'S1', 10), mantidos: [[0, 10]], cortesDeCena: [5.1, 5.3], info })
  const plano = r.planos.find((p) => p.de <= 5.2 && p.ate > 5.2)
  assert.equal(plano.x < 960 ? 'esquerda' : 'direita', 'direita')
})
