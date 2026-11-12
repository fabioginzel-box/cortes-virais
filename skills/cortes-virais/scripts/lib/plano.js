'use strict'

// "Mantidos" são os pedaços da fonte que tocam, na ordem em que tocam, já sem pausa longa nem vício;
// a linha do tempo editada é a soma deles.

const { lerTempo, terminaFrase, ehVicio, formatarTempo } = require('./transcricao')

const PESOS = { gancho: 0.30, sozinho: 0.25, emocao: 0.20, valor: 0.15, desfecho: 0.10 }
const NOTA_MINIMA = 60

// Alvo de cada pausa entre palavras, por modo: [limite superior da pausa, quanto sobra dela].
// "dinamico" é o padrão dos shorts; "natural" respira mais; "sem" não mexe.
const MODOS = {
  dinamico: [[0.25, null], [1, 0.15], [3, 0.25], [Infinity, 0.3]],
  natural: [[0.3, null], [1, 0.3], [3, 0.6], [Infinity, 0.5]],
  sem: [[Infinity, null]]
}

const LIMITES = { min: 15, max: 90, faixaMin: 25, faixaMax: 60, idealMin: 30, idealMax: 45 }
const INICIO_FRACO = /^(e|mas|então|aí|daí|porque|pois|isso|ele|ela|eles|elas|esse|essa|esses|essas|aquilo|aquele|aquela|também|como eu (te )?(disse|falei)|igual eu falei)(?![\p{L}\p{N}])/iu

// O ponto de corte nunca cai num vício: ele é tratado como pausa.
const soFala = (palavras) => palavras.filter((p) => !p.ev && !ehVicio(p.t))
const vicios = (palavras) => palavras.filter((p) => !p.ev && ehVicio(p.t))

// A folga em volta do ponto de corte para no vício vizinho: o "hum" colado na frase não entra no corte.
function fimDoVizinhoAntes (palavras, t) {
  let fim = -Infinity
  for (const p of palavras) if (!p.ev && p.e <= t + 0.001 && p.e > fim) fim = p.e
  return fim
}

function inicioDoVizinhoDepois (palavras, t) {
  let inicio = Infinity
  for (const p of palavras) if (!p.ev && p.s >= t - 0.001 && p.s < inicio) inicio = p.s
  return inicio
}
const arred = (x, casas = 3) => Number(x.toFixed(casas))

function comecaForte (fala, i) {
  if (i === 0) return true
  const ant = fala[i - 1]
  return terminaFrase(ant) || fala[i].s - ant.e >= 0.6 || ant.f !== fala[i].f
}

function terminaForte (fala, i) {
  if (i === fala.length - 1) return true
  const prox = fala[i + 1]
  return terminaFrase(fala[i]) || prox.s - fala[i].e >= 0.6 || prox.f !== fala[i].f
}

// Recua até 5 s atrás de um começo de frase (ou avança até 1,5 s); andar para a frente custa o dobro,
// porque pode comer o gancho. Sem começo forte por perto, vale o início de palavra mais próximo.
function pontoDeInicio (t, palavras) {
  const fala = soFala(palavras)
  if (!fala.length) return { corte: t, deslocamento: 0 }
  const custo = (s) => (s <= t ? t - s : 2 * (s - t))
  let escolhido = -1
  for (let i = 0; i < fala.length; i++) {
    const s = fala[i].s
    if (s < t - 5 || s > t + 1.5 || !comecaForte(fala, i)) continue
    if (escolhido < 0 || custo(s) < custo(fala[escolhido].s)) escolhido = i
  }
  if (escolhido < 0) {
    for (let i = 0; i < fala.length; i++) {
      if (Math.abs(fala[i].s - t) > 1.5) continue
      if (escolhido < 0 || Math.abs(fala[i].s - t) < Math.abs(fala[escolhido].s - t)) escolhido = i
    }
  }
  if (escolhido < 0) escolhido = Math.max(0, fala.findIndex((p) => p.s >= t))
  const w = fala[escolhido]
  const antes = fimDoVizinhoAntes(palavras.filter((p) => p !== w), w.s)
  const vicioColado = vicios(palavras).some((p) => p.e <= w.s + 0.001 && p.e === antes)
  const folga = !Number.isFinite(antes) ? 0.15 : Math.min(0.15, vicioColado ? w.s - antes : (w.s - antes) / 2)
  const corte = Math.max(0, w.s - Math.max(0, folga))
  return { corte: arred(corte), palavra: w.i, deslocamento: arred(corte - t) }
}

// Avança até 8 s até o fim da frase (ou recua até 1,5 s, custando 1,5 vez). Riso logo depois da
// última palavra entra no corte: é o desfecho.
function pontoDeFim (t, palavras) {
  const fala = soFala(palavras)
  if (!fala.length) return { corte: t, deslocamento: 0 }
  const custo = (e) => (e >= t ? e - t : 1.5 * (t - e))
  let escolhido = -1
  for (let i = 0; i < fala.length; i++) {
    const e = fala[i].e
    if (e < t - 1.5 || e > t + 8 || !terminaForte(fala, i)) continue
    if (escolhido < 0 || custo(e) < custo(fala[escolhido].e)) escolhido = i
  }
  if (escolhido < 0) {
    for (let i = 0; i < fala.length; i++) {
      if (Math.abs(fala[i].e - t) > 1.5) continue
      if (escolhido < 0 || Math.abs(fala[i].e - t) < Math.abs(fala[escolhido].e - t)) escolhido = i
    }
  }
  if (escolhido < 0) {
    const antes = fala.filter((p) => p.e <= t)
    escolhido = antes.length ? fala.indexOf(antes[antes.length - 1]) : 0
  }
  const w = fala[escolhido]
  const prox = fala[escolhido + 1]
  let fim = w.e
  const riso = palavras.find((p) => p.ev && p.s >= w.e - 0.1 && p.s <= w.e + 0.6)
  if (riso && (!prox || riso.e <= prox.s)) fim = Math.max(fim, riso.e)
  const depois = inicioDoVizinhoDepois(palavras.filter((p) => p !== w && !(riso && p === riso)), fim)
  const vicioColado = vicios(palavras).some((p) => p.s === depois)
  const folga = !Number.isFinite(depois) ? 0.25 : Math.min(0.25, Math.max(0, vicioColado ? depois - fim : (depois - fim) / 2))
  const corte = fim + folga
  return { corte: arred(corte), palavra: w.i, deslocamento: arred(corte - t) }
}

function alvoDaPausa (pausa, modo) {
  for (const [limite, alvo] of MODOS[modo] || MODOS.dinamico) if (pausa < limite) return alvo
  return null
}

// Pausa com riso não se corta, e pausa depois de pergunta guarda até 0,5 s: é o tempo do suspense.
function mantidos (a, b, palavras, modo = 'dinamico') {
  const dentro = palavras.filter((p) => p.s >= a - 0.05 && p.e <= b + 0.05)
  if (modo === 'sem' || !dentro.length) return [[arred(a), arred(b)]]
  const itens = dentro.filter((p) => p.ev || !ehVicio(p.t))
  const cortes = []
  for (let k = 0; k < itens.length - 1; k++) {
    const x = itens[k]
    const y = itens[k + 1]
    const pausa = y.s - x.e
    const vicio = dentro.some((p) => !p.ev && ehVicio(p.t) && p.s >= x.e - 0.01 && p.e <= y.s + 0.01)
    if (x.ev || y.ev) continue
    let alvo = alvoDaPausa(pausa, modo)
    if (vicio) alvo = Math.min(alvo == null ? 0.15 : alvo, 0.15)
    if (alvo == null || alvo >= pausa) continue
    if (terminaFrase(x) && /\?["')\]]*$/.test(x.t)) alvo = Math.max(alvo, Math.min(pausa, 0.5))
    if (alvo >= pausa) continue
    cortes.push([x.e + alvo / 2, y.s - alvo / 2])
  }
  const falas = itens.filter((p) => !p.ev)
  const naBorda = (de, ate) => palavras.filter((p) => !p.ev && ehVicio(p.t) && p.e > de + 0.001 && p.s < ate - 0.001)
  let inicio = a
  let fim = b
  if (falas.length) {
    const antes = naBorda(a, falas[0].s)
    if (antes.length) inicio = Math.max(a, falas[0].s - 0.12, ...antes.map((p) => Math.min(p.e, falas[0].s)))
    const depois = naBorda(falas[falas.length - 1].e, b)
    if (depois.length) fim = Math.min(b, falas[falas.length - 1].e + 0.2, ...depois.map((p) => Math.max(p.s, falas[falas.length - 1].e)))
  }
  const lista = []
  for (const [c1, c2] of cortes) {
    if (c1 - inicio > 0.04) lista.push([arred(inicio), arred(c1)])
    inicio = c2
  }
  if (fim - inicio > 0.04) lista.push([arred(inicio), arred(fim)])
  return lista
}

function linhaDoTempo (lista) {
  let acumulado = 0
  const blocos = lista.map(([a, b]) => {
    const bloco = { a, b, de: acumulado }
    acumulado += b - a
    return bloco
  })
  return {
    duracao: arred(acumulado),
    blocos,
    paraEditado (t) {
      const bl = blocos.find((x) => t >= x.a && t <= x.b)
      return bl ? arred(bl.de + (t - bl.a)) : null
    },
    // Na abertura no ponto alto o mesmo instante da fonte toca duas vezes.
    todosEditados (t) {
      return blocos.filter((x) => t >= x.a && t <= x.b).map((x) => arred(x.de + (t - x.a)))
    },
    paraFonte (t) {
      const bl = blocos.find((x) => t >= x.de && t <= x.de + (x.b - x.a)) || blocos[blocos.length - 1]
      return arred(bl.a + Math.min(t - bl.de, bl.b - bl.a))
    }
  }
}

// Uma palavra pertence ao bloco que contém o meio dela.
function palavrasEditadas (palavras, lista, { comVicios = false } = {}) {
  const saida = []
  let acumulado = 0
  for (const [a, b] of lista) {
    for (const p of palavras) {
      const meio = (p.s + p.e) / 2
      if (meio < a || meio > b) continue
      if (!p.ev && !comVicios && ehVicio(p.t)) continue
      saida.push({ ...p, s: arred(acumulado + Math.max(0, p.s - a)), e: arred(acumulado + Math.min(b, p.e) - a) })
    }
    acumulado += b - a
  }
  return saida
}

function notaDoCorte (notas, pesos = PESOS, minima = NOTA_MINIMA) {
  let soma = 0
  for (const [chave, peso] of Object.entries(pesos)) soma += peso * Number(notas[chave])
  const nota = Math.round(soma)
  return Number(notas.gancho) < minima ? Math.min(nota, minima - 1) : nota
}

// A régua pode ser ajustada pelo aprendizado do canal (regua.json); os pesos têm de somar 1.
function lerRegua (doc) {
  if (!doc) return { pesos: PESOS, minima: NOTA_MINIMA }
  const pesos = { ...PESOS, ...(doc.pesos || {}) }
  const soma = Object.values(pesos).reduce((a, b) => a + Number(b), 0)
  if (Object.keys(pesos).some((k) => !(k in PESOS))) throw new Error(`regua.json: as notas são ${Object.keys(PESOS).join(', ')}`)
  if (Math.abs(soma - 1) > 0.001) throw new Error(`regua.json: os pesos somam ${soma.toFixed(2)}, e não 1`)
  return { pesos, minima: Number(doc.nota_minima) || NOTA_MINIMA }
}

function cobertura (lista) {
  return lista.reduce((t, [a, b]) => t + (b - a), 0)
}

function sobreposicao (l1, l2) {
  let total = 0
  for (const [a1, b1] of l1) for (const [a2, b2] of l2) total += Math.max(0, Math.min(b1, b2) - Math.max(a1, a2))
  return total
}

function problemasDoCandidato (c, duracaoFonte) {
  const p = []
  if (c.id == null) p.push('sem id')
  if (!c.titulo || !String(c.titulo).trim()) p.push('sem título')
  else if ([...String(c.titulo)].length > 100) p.push('título com mais de 100 caracteres (o limite do YouTube)')
  if (!c.gancho || !String(c.gancho).trim()) p.push('sem o texto do gancho (o card de abertura)')
  else if ([...String(c.gancho)].length > 60) p.push('gancho com mais de 60 caracteres: não cabe em duas linhas')
  if (!Array.isArray(c.trechos) || !c.trechos.length) p.push('sem trechos')
  for (const chave of Object.keys(PESOS)) {
    const v = c.notas && c.notas[chave]
    if (typeof v !== 'number' || v < 0 || v > 100) p.push(`notas.${chave} tem de ser um número de 0 a 100`)
  }
  for (const campo of ['destaques', 'impacto']) {
    const v = c[campo]
    if (v != null && (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim()))) p.push(`${campo} tem de ser uma lista de frases ditas no corte`)
  }
  for (const [k, t] of (c.trechos || []).entries()) {
    let a, b
    try { a = lerTempo(t.inicio); b = lerTempo(t.fim) } catch (e) { p.push(`trecho ${k + 1}: ${e.message}`); continue }
    if (!(b > a)) p.push(`trecho ${k + 1}: o fim vem antes do início`)
    if (duracaoFonte && b > duracaoFonte + 0.5) p.push(`trecho ${k + 1}: passa do fim do vídeo (${formatarTempo(duracaoFonte)})`)
  }
  return p
}

function avisosDoCorte (corte, palavrasDoCorte, limites, outros, minima = NOTA_MINIMA) {
  const avisos = []
  const fala = palavrasDoCorte.filter((p) => !p.ev)
  const texto = fala.map((p) => p.t).join(' ')
  if (INICIO_FRACO.test(texto)) avisos.push(`começa com "${fala.slice(0, 3).map((p) => p.t).join(' ')}": confira se faz sentido sem o que veio antes`)
  const ultima = fala[fala.length - 1]
  if (ultima && !terminaFrase(ultima)) avisos.push(`termina em "${ultima.t}", sem fechar a frase`)
  if (corte.duracao < limites.faixaMin || corte.duracao > limites.faixaMax) {
    avisos.push(`${Math.round(corte.duracao)} s, fora da faixa de ${limites.faixaMin} a ${limites.faixaMax} s (o ideal é de ${limites.idealMin} a ${limites.idealMax} s)`)
  }
  if ([...String(corte.gancho || '')].length > 40) avisos.push('gancho com mais de 40 caracteres: tende a quebrar em três linhas')
  if ((corte.hashtags || []).length > 5) avisos.push('mais de 5 hashtags: o YouTube mostra 3 acima do título')
  if (corte.nota < minima) avisos.push(`nota ${corte.nota}, abaixo de ${minima}`)
  for (const o of outros) {
    const perto = corte.fonte.some(([a, b]) => o.fonte.some(([c, d]) => Math.max(a, c) - Math.min(b, d) < 120))
    if (perto) { avisos.push(`a menos de 2 min do corte ${o.id} na fonte: veja se não repete o assunto`); break }
  }
  return avisos
}

function conferirCortes (doc, palavras, { duracaoFonte = null, modo = 'dinamico', limites = {}, regua = null } = {}) {
  const lim = { ...LIMITES, ...limites }
  const { pesos, minima } = lerRegua(regua)
  const comVicios = modo === 'sem'
  const problemas = []
  const planos = []
  for (const c of (doc && doc.cortes) || []) {
    const erros = problemasDoCandidato(c, duracaoFonte)
    if (erros.length) { problemas.push({ id: c.id, problemas: erros }); continue }
    const trechos = c.trechos.map((t) => {
      const a = lerTempo(t.inicio)
      const b = lerTempo(t.fim)
      const ini = pontoDeInicio(a, palavras)
      const fim = pontoDeFim(b, palavras)
      return { inicio: ini.corte, fim: Math.max(fim.corte, ini.corte + 0.5), pedido: { inicio: a, fim: b }, ajuste: { inicio: ini.deslocamento, fim: fim.deslocamento } }
    })
    const lista = trechos.flatMap((t) => mantidos(t.inicio, t.fim, palavras, modo))
    const duracao = arred(cobertura(lista), 2)
    const bruto = trechos.reduce((s, t) => s + (t.fim - t.inicio), 0)
    const plano = {
      ...c,
      trechos: trechos.map(({ inicio, fim, ajuste }) => ({ inicio, fim, ajuste })),
      mantidos: lista,
      fonte: trechos.map((t) => [t.inicio, t.fim]),
      duracao,
      cortado: bruto > 0 ? Math.round(100 * (1 - duracao / bruto)) : 0,
      nota: notaDoCorte(c.notas, pesos, minima),
      limpeza: modo
    }
    if (duracao < lim.min || duracao > lim.max) {
      problemas.push({ id: c.id, problemas: [`${duracao} s depois da limpeza, fora do limite de ${lim.min} a ${lim.max} s`] })
      continue
    }
    planos.push(plano)
  }

  planos.sort((x, y) => y.nota - x.nota)
  const ficam = []
  const descartados = []
  for (const p of planos) {
    const igual = ficam.find((f) => sobreposicao(p.fonte, f.fonte) > 0.5 * cobertura(p.fonte))
    if (igual) descartados.push({ id: p.id, motivo: `repete mais da metade do corte ${igual.id}, que tem nota maior` })
    else ficam.push(p)
  }
  for (const p of ficam) {
    p.avisos = avisosDoCorte(p, palavrasEditadas(palavras, p.mantidos, { comVicios }), lim, ficam.filter((o) => o !== p && o.nota >= p.nota), minima)
  }
  return { cortes: ficam, descartados, problemas }
}

function textoDoCorte (palavras, plano) {
  return palavrasEditadas(palavras, plano.mantidos, { comVicios: plano.limpeza === 'sem' }).filter((p) => !p.ev).map((p) => p.t).join(' ')
}

function contextoDoFim (plano, palavras, janela = 10) {
  const fim = plano.trechos[plano.trechos.length - 1].fim
  const fala = soFala(palavras)
  const texto = (lista) => lista.map((p) => p.t).join(' ')
  return {
    fim: formatarTempo(fim),
    antes: texto(fala.filter((p) => p.e <= fim && p.s >= fim - janela)),
    depois: texto(fala.filter((p) => p.s >= fim && p.s <= fim + janela))
  }
}

module.exports = {
  LIMITES,
  pontoDeInicio, pontoDeFim, mantidos, linhaDoTempo, palavrasEditadas, notaDoCorte, lerRegua, conferirCortes, textoDoCorte, contextoDoFim
}
