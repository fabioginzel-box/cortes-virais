'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pontoDeInicio, pontoDeFim, mantidos, linhaDoTempo, palavrasEditadas, notaDoCorte, lerRegua, conferirCortes, textoDoCorte, contextoDoFim } = require('./plano')

let n = 0
const p = (t, s, e, f = 'S1', extra = {}) => ({ i: n++, t, s, e, f, ...extra })

// Duas frases: "Ninguém fala disso." (10–11,5) e "O segredo é simples." (12,5–14,2), mais uma terceira.
function falas () {
  n = 0
  return [
    p('Ninguém', 10, 10.4), p('fala', 10.5, 10.8), p('disso.', 10.9, 11.5),
    p('O', 12.5, 12.6), p('segredo', 12.7, 13.2), p('é', 13.3, 13.4), p('simples.', 13.5, 14.2),
    p('Depois', 16, 16.4), p('a', 16.5, 16.6), p('gente', 16.7, 17), p('vê.', 17.1, 17.5)
  ]
}

test('pontoDeInicio recua até o começo da frase', () => {
  const r = pontoDeInicio(13.0, falas())
  assert.equal(r.corte, 12.35)
})

test('pontoDeInicio volta ao começo da frase em vez de cortar dentro dela', () => {
  assert.equal(pontoDeInicio(10.6, falas()).corte, 9.85)
})

test('pontoDeFim avança até o fim da frase', () => {
  const r = pontoDeFim(13.25, falas())
  assert.equal(r.corte, 14.45)
})

test('pontoDeFim inclui o riso logo depois da última palavra', () => {
  const lista = falas()
  lista.splice(7, 0, p('(laughter)', 14.3, 15.4, 'S1', { ev: true }))
  const r = pontoDeFim(14.2, lista)
  assert.ok(r.corte >= 15.4)
})

test('mantidos comprime a pausa longa entre frases no modo dinâmico', () => {
  const lista = mantidos(12.35, 17.75, falas(), 'dinamico')
  assert.deepEqual(lista, [[12.35, 14.325], [15.875, 17.75]])
})

test('mantidos não mexe no trecho no modo sem', () => {
  assert.deepEqual(mantidos(12.35, 17.75, falas(), 'sem'), [[12.35, 17.75]])
})

test('mantidos tira o vício', () => {
  n = 0
  const lista = mantidos(0, 3, [p('Olha', 0.1, 0.4), p('hum', 0.6, 1.0), p('isso.', 1.3, 1.6)], 'dinamico')
  assert.equal(lista.length, 2)
  assert.ok(lista[0][1] < 0.6 && lista[1][0] > 1.0)
})

test('mantidos não corta a pausa com riso', () => {
  n = 0
  const lista = mantidos(0, 4, [p('Olha.', 0.1, 0.4), p('(laughter)', 0.5, 2.5, 'S1', { ev: true }), p('Sério.', 3.0, 3.4)], 'dinamico')
  assert.deepEqual(lista, [[0, 4]])
})

test('mantidos guarda até 0,5 s depois de uma pergunta', () => {
  n = 0
  const lista = mantidos(0, 3, [p('Sabe', 0.1, 0.3), p('quanto?', 0.4, 0.8), p('Nada.', 2.0, 2.4)], 'dinamico')
  assert.deepEqual(lista, [[0, 1.05], [1.75, 3]])
})

test('linhaDoTempo leva o tempo da fonte para a linha editada', () => {
  const lt = linhaDoTempo([[10, 12], [20, 25]])
  assert.equal(lt.paraEditado(21), 3)
})

test('linhaDoTempo devolve null para o tempo que foi cortado', () => {
  assert.equal(linhaDoTempo([[10, 12], [20, 25]]).paraEditado(15), null)
})

test('linhaDoTempo leva o tempo editado de volta para a fonte', () => {
  assert.equal(linhaDoTempo([[10, 12], [20, 25]]).paraFonte(3), 21)
})

test('palavrasEditadas repete a fala que toca duas vezes', () => {
  const lista = palavrasEditadas(falas(), [[12.4, 14.3], [10, 14.3]])
  assert.equal(lista.filter((x) => x.t === 'segredo').length, 2)
})

test('palavrasEditadas tira o vício da legenda', () => {
  n = 0
  const lista = palavrasEditadas([p('Olha', 0.1, 0.4), p('hum', 0.6, 1.0)], [[0, 2]])
  assert.deepEqual(lista.map((x) => x.t), ['Olha'])
})

test('notaDoCorte pondera as cinco notas', () => {
  assert.equal(notaDoCorte({ gancho: 80, sozinho: 70, emocao: 60, valor: 50, desfecho: 40 }), 65)
})

test('notaDoCorte segura em 59 o corte com gancho abaixo de 60', () => {
  assert.equal(notaDoCorte({ gancho: 50, sozinho: 100, emocao: 100, valor: 100, desfecho: 100 }), 59)
})

const notas = { gancho: 80, sozinho: 80, emocao: 70, valor: 70, desfecho: 70 }

function longas () {
  n = 0
  const lista = []
  for (let k = 0; k < 120; k++) lista.push(p(k % 8 === 7 ? 'fim.' : 'palavra', k * 0.5, k * 0.5 + 0.4))
  return lista
}

test('conferirCortes devolve o plano com bordas ajustadas e nota', () => {
  const r = conferirCortes({ cortes: [{ id: 1, titulo: 'T', gancho: 'G', trechos: [{ inicio: '0:00:04.1', fim: '0:00:35.0' }], notas }] }, longas())
  assert.equal(r.problemas.length, 0)
  assert.equal(r.cortes[0].nota, 76)
  assert.equal(r.cortes[0].trechos[0].inicio, 3.95)
})

test('conferirCortes aponta o candidato sem gancho', () => {
  const r = conferirCortes({ cortes: [{ id: 1, titulo: 'T', trechos: [{ inicio: 4, fim: 35 }], notas }] }, longas())
  assert.match(r.problemas[0].problemas.join(), /gancho/)
})

test('conferirCortes aponta o corte curto demais', () => {
  const r = conferirCortes({ cortes: [{ id: 1, titulo: 'T', gancho: 'G', trechos: [{ inicio: 4, fim: 10 }], notas }] }, longas())
  assert.match(r.problemas[0].problemas.join(), /fora do limite/)
})

test('conferirCortes avisa o corte fora da faixa de 25 a 60 s', () => {
  const r = conferirCortes({ cortes: [{ id: 1, titulo: 'T', gancho: 'G', trechos: [{ inicio: 4, fim: 22 }], notas }] }, longas())
  assert.match(r.cortes[0].avisos.join(), /fora da faixa de 25 a 60 s \(o ideal é de 30 a 45 s\)/)
})

test('conferirCortes não avisa o corte dentro da faixa, mesmo fora do ideal', () => {
  const r = conferirCortes({ cortes: [{ id: 1, titulo: 'T', gancho: 'G', trechos: [{ inicio: 4, fim: 54 }], notas }] }, longas())
  assert.doesNotMatch(r.cortes[0].avisos.join(), /faixa/)
})

test('conferirCortes descarta o que repete mais da metade de um corte com nota maior', () => {
  const r = conferirCortes({
    cortes: [
      { id: 1, titulo: 'A', gancho: 'G', trechos: [{ inicio: 4, fim: 35 }], notas },
      { id: 2, titulo: 'B', gancho: 'G', trechos: [{ inicio: 8, fim: 38 }], notas: { ...notas, gancho: 60 } }
    ]
  }, longas())
  assert.deepEqual(r.descartados.map((d) => d.id), [2])
})

test('contextoDoFim traz o texto em volta do ponto de corte', () => {
  const c = contextoDoFim({ trechos: [{ inicio: 10, fim: 14.45 }] }, falas())
  assert.equal(c.depois, 'Depois a gente vê.')
})

test('pontoDeInicio não começa o corte num vício', () => {
  n = 0
  const r = pontoDeInicio(0.1, [p('Hum,', 0, 0.4), p('Olha', 0.9, 1.2), p('isso.', 1.3, 1.6)])
  assert.equal(r.corte, 0.75)
})

test('mantidos tira o vício entre o começo do trecho e a primeira palavra', () => {
  n = 0
  const lista = mantidos(0, 2, [p('hum', 0.1, 0.5), p('Olha', 0.6, 0.9), p('isso.', 1.0, 1.3)], 'dinamico')
  assert.equal(lista[0][0], 0.5)
})

test('mantidos tira o vício que começa antes do trecho e encosta na primeira palavra', () => {
  n = 0
  const lista = mantidos(1.85, 4, [p('hum', 1.2, 2.0), p('Ninguém', 2.0, 2.4), p('sabia.', 2.5, 2.9)], 'dinamico')
  assert.equal(lista[0][0], 2)
})

test('mantidos tira o vício que passa do fim do trecho', () => {
  n = 0
  const lista = mantidos(0, 1.2, [p('Olha', 0.1, 0.4), p('isso.', 0.5, 0.8), p('éé', 0.9, 1.6)], 'dinamico')
  assert.equal(lista[lista.length - 1][1], 0.9)
})

test('pontoDeInicio não deixa a folga entrar no vício colado na palavra', () => {
  n = 0
  const r = pontoDeInicio(2, [p('Foi.', 0, 0.5), p('hum', 1.2, 2.0), p('Ninguém', 2.0, 2.4), p('sabia.', 2.5, 2.9)])
  assert.equal(r.corte, 2)
})

test('pontoDeFim não deixa a folga entrar no vício logo depois da frase', () => {
  n = 0
  const r = pontoDeFim(1, [p('Olha', 0.1, 0.4), p('isso.', 0.5, 0.9), p('éé', 1.0, 1.6), p('Depois', 2.5, 2.8)])
  assert.equal(r.corte, 1)
})

const candidato = (extra) => ({ id: 1, titulo: 'T', gancho: 'G', notas, ...extra })
const falaQueComecaCom = (palavra) => { const lista = longas(); lista[0] = { ...lista[0], t: palavra }; return lista }

test('o aviso de começo fraco pega o "aí"', () => {
  n = 0
  const r = conferirCortes({ cortes: [candidato({ trechos: [{ inicio: 0, fim: 30 }] })] }, falaQueComecaCom('Aí'))
  assert.match(r.cortes[0].avisos.join('\n'), /começa com "Aí/)
})

test('o aviso de começo fraco pega o "daí"', () => {
  n = 0
  const r = conferirCortes({ cortes: [candidato({ trechos: [{ inicio: 0, fim: 30 }] })] }, falaQueComecaCom('daí'))
  assert.match(r.cortes[0].avisos.join('\n'), /começa com "daí/)
})

test('mantidos tira o vício entre a última palavra e o fim do trecho', () => {
  n = 0
  const lista = mantidos(0, 2, [p('Olha', 0.1, 0.4), p('isso.', 0.5, 0.8), p('éé', 1.0, 1.6)], 'dinamico')
  assert.equal(lista[lista.length - 1][1], 1)
})

test('linhaDoTempo acha as duas vezes que um instante da fonte toca', () => {
  assert.deepEqual(linhaDoTempo([[50, 52], [40, 55]]).todosEditados(51), [1, 13])
})

test('lerRegua usa os pesos do aprendizado', () => {
  const r = lerRegua({ pesos: { gancho: 0.4, sozinho: 0.2, emocao: 0.2, valor: 0.1, desfecho: 0.1 } })
  assert.equal(r.pesos.gancho, 0.4)
})

test('lerRegua recusa pesos que não somam 1', () => {
  assert.throws(() => lerRegua({ pesos: { gancho: 0.5 } }), /somam 1.20/)
})

test('textoDoCorte mantém o vício quando a limpeza é sem', () => {
  n = 0
  const t = textoDoCorte([p('Olha', 0.1, 0.4), p('hum', 0.6, 1.0)], { mantidos: [[0, 2]], limpeza: 'sem' })
  assert.equal(t, 'Olha hum')
})

test('conferirCortes aponta destaques que não são lista de frases', () => {
  const r = conferirCortes({ cortes: [{ id: 1, titulo: 'T', gancho: 'G', trechos: [{ inicio: 4, fim: 35 }], notas, destaques: 'R$ 900' }] }, longas())
  assert.match(r.problemas[0].problemas.join(), /destaques/)
})

test('conferirCortes não deixa o fim do corte passar do fim do vídeo', () => {
  const lista = longas()
  const duracaoFonte = lista[lista.length - 1].e + 0.1
  const r = conferirCortes({ cortes: [candidato({ trechos: [{ inicio: 30, fim: duracaoFonte }] })] }, lista, { duracaoFonte })
  assert.ok(r.cortes[0].trechos[0].fim <= duracaoFonte - 0.05)
})

const seguidas = (de, ate, passo = 0.4) => {
  const lista = []
  for (let s = de; s + 0.3 <= ate + 1e-9; s += passo) lista.push(p('palavra', Number(s.toFixed(3)), Number((s + 0.3).toFixed(3))))
  lista[lista.length - 1].t = 'fim.'
  return lista
}

test('pontoDeFim não estende o corte por uma música depois da última palavra', () => {
  n = 0
  const lista = [...seguidas(10, 40), p('(music)', 40.2, 75, null, { ev: true }), ...seguidas(76, 90)]
  assert.ok(pontoDeFim(40, lista).corte < 41)
})

test('pontoDeFim estende pelo riso no máximo 3 s', () => {
  n = 0
  const lista = [...seguidas(10, 40), p('(laughter)', 40.0, 46, null, { ev: true }), ...seguidas(48, 60)]
  const fim = lista.find((x) => x.t === 'fim.').e
  assert.ok(pontoDeFim(fim, lista).corte <= fim + 3.25)
})

test('pontoDeFim ainda inclui o riso curto logo depois da frase', () => {
  n = 0
  const lista = [...seguidas(10, 40), p('(laughter)', 40.0, 41.2, null, { ev: true }), ...seguidas(43, 50)]
  const fim = lista.find((x) => x.t === 'fim.').e
  assert.ok(pontoDeFim(fim, lista).corte >= 41.2)
})

test('pontoDeFim estende pelo aplauso logo depois da frase', () => {
  n = 0
  const lista = [...seguidas(10, 40), p('(applause)', 40.0, 41.2, null, { ev: true }), ...seguidas(43, 50)]
  const fim = lista.find((x) => x.t === 'fim.').e
  assert.ok(pontoDeFim(fim, lista).corte >= 41.2)
})

test('mantidos não corta o riso entre a última palavra e o vício da borda', () => {
  n = 0
  const lista = [p('Olha', 0.1, 0.4), p('isso.', 0.5, 0.9), p('(laughter)', 0.9, 2.1, null, { ev: true }), p('ah', 2.1, 2.3)]
  const m = mantidos(0, 2.5, lista, 'dinamico')
  assert.ok(m[m.length - 1][1] >= 2.1)
})

test('mantidos não corta o riso entre o vício da borda e a primeira palavra', () => {
  n = 0
  const lista = [p('hum', 0.0, 0.3), p('(laughter)', 0.3, 1.5, null, { ev: true }), p('Então', 1.6, 1.9), p('foi.', 2.0, 2.3)]
  const m = mantidos(0, 2.5, lista, 'dinamico')
  assert.ok(m[0][0] <= 0.3)
})

const juntaNaPausa = () => {
  n = 0
  return [p('A', 8, 8.2), p('ác', 8.3, 8.6), p('mi', 9.3, 9.5), p('tech', 9.6, 9.7), p('lab.', 9.8, 10)]
}
const CORRECAO = [{ de: 'ac mi tech lab', para: 'AcmeTechLab' }]

test('palavrasEditadas aplica a correção que atravessa uma pausa cortada', () => {
  const editadas = palavrasEditadas(juntaNaPausa(), [[7.9, 8.75], [9.15, 10.1]], { correcoes: CORRECAO })
  assert.deepEqual(editadas.map((x) => x.t), ['A', 'AcmeTechLab.'])
})

test('textoDoCorte mostra a correção que atravessa uma pausa cortada', () => {
  const t = textoDoCorte(juntaNaPausa(), { mantidos: [[7.9, 8.75], [9.15, 10.1]] }, CORRECAO)
  assert.equal(t, 'A AcmeTechLab.')
})

test('conferirCortes aponta o id repetido', () => {
  const r = conferirCortes({ cortes: [candidato({ trechos: [{ inicio: 0, fim: 30 }] }), candidato({ titulo: 'Outro', trechos: [{ inicio: 31, fim: 59 }] })] }, longas())
  assert.match(r.problemas.map((x) => x.problemas.join()).join(), /id 1 repetido/)
})

test('conferirCortes não deixa o trecho tocar de novo o começo do seguinte', () => {
  const r = conferirCortes({ cortes: [candidato({ trechos: [{ inicio: 0, fim: 13.5 }, { inicio: 14, fim: 30 }] })] }, longas())
  const [a, b] = r.cortes[0].trechos
  assert.ok(a.fim <= b.inicio)
})

test('conferirCortes deixa a abertura no ponto alto repetir o trecho de propósito', () => {
  const r = conferirCortes({ cortes: [candidato({ trechos: [{ inicio: 20, fim: 24 }, { inicio: 4, fim: 30 }] })] }, longas())
  const [a, b] = r.cortes[0].trechos
  assert.ok(b.inicio < a.fim)
})

test('pontoDeInicio mantém o tempo pedido no meio de um silêncio longo', () => {
  n = 0
  const lista = [...seguidas(260, 290), ...seguidas(330, 360)]
  assert.equal(pontoDeInicio(300, lista).corte, 300)
})

test('pontoDeFim mantém o tempo pedido no meio de um silêncio longo', () => {
  n = 0
  const lista = [...seguidas(260, 290), ...seguidas(330, 360)]
  assert.equal(pontoDeFim(320, lista).corte, 320)
})

test('pontoDeInicio depois da última palavra não volta ao começo do vídeo', () => {
  n = 0
  assert.equal(pontoDeInicio(300, seguidas(10, 290)).corte, 300)
})

test('conferirCortes usa a limpeza pedida no candidato', () => {
  const r = conferirCortes({ cortes: [candidato({ limpeza: 'sem', trechos: [{ inicio: 4, fim: 35 }] })] }, longas())
  assert.deepEqual([r.cortes[0].limpeza, r.cortes[0].mantidos.length], ['sem', 1])
})

test('conferirCortes aponta a limpeza que não existe', () => {
  const r = conferirCortes({ cortes: [candidato({ limpeza: 'forte', trechos: [{ inicio: 4, fim: 35 }] })] }, longas())
  assert.match(r.problemas[0].problemas.join(), /limpeza/)
})

test('conferirCortes avisa quando passa de 3 hashtags', () => {
  const r = conferirCortes({ cortes: [candidato({ hashtags: ['#a', '#b', '#c', '#d'], trechos: [{ inicio: 4, fim: 35 }] })] }, longas())
  assert.match(r.cortes[0].avisos.join(), /mais de 3 hashtags/)
})

test('conferirCortes não avisa com 3 hashtags', () => {
  const r = conferirCortes({ cortes: [candidato({ hashtags: ['#a', '#b', '#c'], trechos: [{ inicio: 4, fim: 35 }] })] }, longas())
  assert.doesNotMatch(r.cortes[0].avisos.join(), /hashtags/)
})
