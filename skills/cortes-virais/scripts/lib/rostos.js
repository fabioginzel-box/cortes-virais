'use strict'

// O corte se divide em tomadas (troca de câmera da fonte e emenda de trechos) e em falas; em cada pedaço
// o recorte vai no rosto cuja boca mais mexe. Os planos ficam na linha do tempo editada.

const { linhaDoTempo } = require('./plano')
const { mediana, desvio, par, limitar } = require('./numeros')

const PRESENCA_NO_PEDACO = 0.4
const TROCA_MINIMA = 1.0
const ANTECIPA_TROCA = 0.1
const TURNO_CURTO = 2.5
const MESMO_LUGAR = 0.03
const ALTURA_DO_ROSTO = 0.22
const ZOOM_MAXIMO = 2
const ALTURA_DA_ENTREGA = 1920
const AMPLIACAO_MAXIMA = 2
const OLHOS_NA_ALTURA = 0.38
const RISO = /laugh|ris[oa]|gargalh/i

// Quem some por até 3 s volta para a mesma trilha.
function trilhas (quadros) {
  const lista = []
  for (const q of quadros) {
    const livres = new Set(lista.filter((tr) => q.t - tr.pontos[tr.pontos.length - 1].t <= 3))
    for (const f of [...(q.faces || [])].sort((a, b) => b.w * b.h - a.w * a.h)) {
      let melhor = null
      let menor = Infinity
      for (const tr of livres) {
        const u = tr.pontos[tr.pontos.length - 1]
        const dist = Math.hypot(f.cx - u.cx, (f.cy - u.cy) * 0.5)
        const razao = f.h / u.h
        if (dist < 0.12 && razao > 0.6 && razao < 1.6 && dist < menor) { menor = dist; melhor = tr }
      }
      if (!melhor) { melhor = { id: lista.length, pontos: [] }; lista.push(melhor) }
      else livres.delete(melhor)
      melhor.pontos.push({ ...f, t: q.t, te: q.te })
    }
  }
  const total = quadros.length || 1
  return lista.map((tr) => ({ ...tr, presenca: tr.pontos.length / total, cx: mediana(tr.pontos.map((p) => p.cx)), h: mediana(tr.pontos.map((p) => p.h)) }))
}

function atividadeDaBoca (tr) {
  const deltas = tr.pontos.slice(1)
    .map((p, k) => (p.boca != null && tr.pontos[k].boca != null ? Math.abs(p.boca - tr.pontos[k].boca) : null))
    .filter((x) => x != null)
  return deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null
}

function corridas (palavrasEditadas) {
  const lista = []
  for (const p of palavrasEditadas.filter((x) => !x.ev && x.f)) {
    const u = lista[lista.length - 1]
    if (u && u.f === p.f) u.e = p.e
    else lista.push({ f: p.f, s: p.s, e: p.e })
  }
  return lista
}

// Uma fala mais curta que TROCA_MINIMA não tira o plano de quem estava.
function turnos (palavrasEditadas, duracao) {
  const lista = corridas(palavrasEditadas)
  if (!lista.length) return [{ de: 0, ate: duracao, f: null }]
  const firmes = []
  lista.forEach((c, k) => {
    const prox = lista[k + 1]
    const dura = (prox ? prox.s : duracao) - c.s
    if (!firmes.length || (dura >= TROCA_MINIMA && c.f !== firmes[firmes.length - 1].f)) firmes.push({ f: c.f, de: c.s })
  })
  return firmes.map((c, k) => ({
    f: c.f,
    de: k === 0 ? 0 : Math.max(firmes[k - 1].de, c.de - ANTECIPA_TROCA),
    ate: k + 1 < firmes.length ? Math.max(0, firmes[k + 1].de - ANTECIPA_TROCA) : duracao
  })).filter((t) => t.ate > t.de)
}

// Os momentos em que os dois reagem: três falas curtas seguidas alternando entre duas pessoas, ou um riso
// de quase um segundo.
function momentosDeReacao (palavrasEditadas, duracao) {
  const janelas = []
  const lista = corridas(palavrasEditadas)
  for (let i = 0; i < lista.length; i++) {
    let j = i
    while (j + 1 < lista.length && lista[j + 1].f !== lista[j].f && lista[j + 1].e - lista[j + 1].s < TURNO_CURTO && lista[j].e - lista[j].s < TURNO_CURTO) j++
    if (j - i >= 2) { janelas.push([lista[i].s - ANTECIPA_TROCA, lista[j].e + 0.2]); i = j }
  }
  for (const p of palavrasEditadas) {
    if (p.ev && RISO.test(p.t) && p.e - p.s >= 0.8) janelas.push([p.s - 0.3, p.e + 0.3])
  }
  janelas.sort((a, b) => a[0] - b[0])
  const juntas = []
  for (const [a, b] of janelas) {
    const u = juntas[juntas.length - 1]
    if (u && a - u[1] < 0.5) u[1] = Math.max(u[1], b)
    else juntas.push([a, b])
  }
  return juntas.map(([a, b]) => [Math.max(0, a), Math.min(duracao, b)]).filter(([a, b]) => b - a >= 1.2)
}

// Rosto pequeno ganha zoom até ocupar 22% da altura, sem a entrega ampliar o recorte mais de 2x.
function recorteDoRosto (pontos, info) {
  const W = info.largura
  const H = info.altura
  const cx = mediana(pontos.map((p) => p.cx)) * W
  const cy = mediana(pontos.map((p) => p.cy)) * H
  const altRosto = mediana(pontos.map((p) => p.h)) * H
  let h = H
  const menor = Math.min(H, Math.max(H / ZOOM_MAXIMO, ALTURA_DA_ENTREGA / AMPLIACAO_MAXIMA))
  if (altRosto && altRosto < 0.14 * H) h = limitar(altRosto / ALTURA_DO_ROSTO, menor, H)
  let w = h * 9 / 16
  if (w > W) { w = W; h = Math.min(H, W * 16 / 9) }
  w = par(w); h = par(h)
  const x = Math.round(limitar(cx - w / 2, 0, W - w))
  const y = h < H ? Math.round(limitar(cy - OLHOS_NA_ALTURA * h, 0, H - h)) : 0
  return { w, h, x, y }
}

// Só muda de ponto quando a pessoa anda mais de 1% da largura.
function caminho (pontos, recorte, info, de) {
  const W = info.largura
  const xs = pontos.map((p) => p.cx * W)
  if (pontos.length < 4 || desvio(xs) < 0.05 * W) return null
  let suave = xs[0]
  const chaves = []
  pontos.forEach((p, k) => {
    suave = k === 0 ? xs[0] : 0.3 * xs[k] + 0.7 * suave
    const x = Math.round(limitar(suave - recorte.w / 2, 0, W - recorte.w))
    const t = Number((p.te - de).toFixed(3))
    if (!chaves.length || Math.abs(x - chaves[chaves.length - 1][1]) >= 0.01 * W) chaves.push([t, x])
  })
  return chaves.length > 1 ? chaves : null
}

function recorteDividido (tr, info) {
  const W = info.largura
  const H = info.altura
  const cx = tr.cx * W
  const cy = mediana(tr.pontos.map((p) => p.cy)) * H
  let h = limitar((tr.h * H) / 0.3, 0.45 * H, H)
  let w = h * 9 / 8
  if (w > W) { w = W; h = W * 8 / 9 }
  w = par(w); h = par(h)
  return { w, h, x: Math.round(limitar(cx - w / 2, 0, W - w)), y: Math.round(limitar(cy - 0.4 * h, 0, H - h)) }
}

// Um instante da fonte que toca duas vezes (a abertura no ponto alto) vale nas duas.
function quadrosEditados (quadros, lt) {
  return quadros
    .flatMap((q) => lt.todosEditados(q.t).map((te) => ({ ...q, te })))
    .sort((a, b) => a.te - b.te)
}

const noIntervalo = (lista, de, ate) => lista.filter((q) => q.te >= de && q.te < ate)
const presentes = (quadros) => trilhas(quadros.map((q) => ({ ...q, t: q.te }))).filter((tr) => tr.presenca >= PRESENCA_NO_PEDACO)

// O rosto do pedaço: o único presente, ou entre vários o de boca mais ativa; sem medida da boca, o maior.
function rostoDoPedaco (quadros) {
  const fortes = presentes(quadros)
  if (!fortes.length) return null
  if (fortes.length === 1) return fortes[0]
  const comAtividade = fortes.map((tr) => ({ tr, a: atividadeDaBoca(tr) }))
  const medidos = comAtividade.filter((x) => x.a != null).sort((x, y) => y.a - x.a)
  if (medidos.length >= 2 && medidos[0].a - medidos[1].a > 0.01) return medidos[0].tr
  return [...fortes].sort((a, b) => b.h - a.h)[0]
}

// Com o layout "rosto", o corte fica num rosto só: o de boca mais ativa no corte inteiro e, sem ele por
// perto (outra câmera), o do pedaço anterior, procurados pela posição; sem nenhum dos dois, o do pedaço.
function rostoFixo (quadros, alvos) {
  const fortes = presentes(quadros)
  for (const alvo of alvos.filter(Boolean)) {
    const perto = fortes.map((tr) => ({ tr, d: Math.abs(tr.cx - alvo.cx) })).sort((a, b) => a.d - b.d)[0]
    if (perto && perto.d < 0.15) return perto.tr
  }
  return rostoDoPedaco(quadros)
}

// O pedaço curto que caiu entre dois quadros analisados fica com o plano do vizinho mais perto, o de
// antes primeiro: herdar o do começo do corte mostraria outra pessoa por um instante.
function maisPerto (pedacos, k) {
  for (let d = 1; d < pedacos.length; d++) {
    for (const v of [pedacos[k - d], pedacos[k + d]]) if (v && !v.herda) return v
  }
  return null
}

function fronteiras (lt, cortesDeCena, extras) {
  const marcos = new Set([0, lt.duracao])
  lt.blocos.forEach((b) => { if (b.de > 0) marcos.add(Number(b.de.toFixed(3))) })
  for (const c of cortesDeCena) for (const te of lt.todosEditados(c)) marcos.add(te)
  for (const t of extras) marcos.add(Number(t.toFixed(3)))
  return [...marcos].filter((x) => x >= 0 && x <= lt.duracao).sort((a, b) => a - b)
}

// `quadros` em tempo da fonte; `cortesDeCena`, as trocas de câmera da fonte; `palavrasEditadas` na
// linha editada; `layout` é auto, rosto, dividido ou tela.
function planos ({ quadros, palavrasEditadas, mantidos, info, layout = 'auto', cortesDeCena = [] }) {
  const lt = linhaDoTempo(mantidos)
  const duracao = lt.duracao
  const cortesEditados = cortesDeCena.flatMap((c) => lt.todosEditados(c))
  const trocasDeCamera = cortesEditados.length
  if (layout === 'tela') return { layout: 'tela', trocasDeCamera, planos: [{ de: 0, ate: duracao, tipo: 'tela' }] }
  const editados = quadrosEditados(quadros, lt)
  const fixo = layout === 'rosto'
  const principal = fixo ? rostoDoPedaco(editados) : null
  let anterior = null
  const tomadas = fronteiras(lt, cortesDeCena, [])
  const marcos = fronteiras(lt, cortesDeCena, turnos(palavrasEditadas, duracao).map((t) => t.de))

  const pedacos = []
  for (let i = 0; i < marcos.length - 1; i++) {
    const [de, ate] = [marcos[i], marcos[i + 1]]
    if (ate - de < 0.001) continue
    const doPedaco = noIntervalo(editados, de, ate)
    const tomada = tomadas.filter((m) => m <= de).length - 1
    const camera = cortesEditados.filter((m) => m <= de).length
    if (!doPedaco.length) { pedacos.push({ de, ate, tomada, camera, herda: true }); continue }
    const tr = fixo ? rostoFixo(doPedaco, [principal, anterior]) : rostoDoPedaco(doPedaco)
    if (tr) anterior = tr
    const proprio = tr ? { tipo: 'rosto', pontos: tr.pontos, cx: tr.cx, h: tr.h } : { tipo: 'tela' }
    // Com um quadro só não se mede a boca: vale o vizinho da mesma câmera, e só sem ele o rosto do quadro.
    pedacos.push(doPedaco.length < 2 ? { de, ate, tomada, camera, herda: true, proprio } : { de, ate, tomada, camera, ...proprio })
  }
  pedacos.forEach((p, k) => {
    if (!p.herda) return
    const vizinhos = [pedacos[k - 1], pedacos[k + 1]].filter((v) => v && !v.herda)
    const daTomada = vizinhos.find((v) => v.tomada === p.tomada)
    const daCamera = p.proprio && vizinhos.find((v) => v.camera === p.camera)
    const vizinho = daTomada || daCamera || p.proprio || maisPerto(pedacos, k)
    Object.assign(p, vizinho ? { tipo: vizinho.tipo, pontos: vizinho.pontos, cx: vizinho.cx, h: vizinho.h } : { tipo: 'tela' })
  })

  const juntos = []
  for (const p of pedacos) {
    const u = juntos[juntos.length - 1]
    const mesmo = u && u.tipo === p.tipo && (p.tipo === 'tela' || (Math.abs(u.cx - p.cx) < MESMO_LUGAR && Math.abs(u.h - p.h) < 0.3 * u.h))
    if (mesmo) { u.ate = p.ate; if (p.pontos) u.pontos = u.pontos.concat(p.pontos); continue }
    juntos.push({ ...p })
  }

  const reacoes = layout === 'dividido' ? [[0, duracao]] : layout === 'auto' ? momentosDeReacao(palavrasEditadas, duracao) : []
  const comReacao = []
  for (const pl of juntos) {
    let inicio = pl.de
    for (const [a, b] of reacoes) {
      const de = Math.max(a, pl.de)
      const ate = Math.min(b, pl.ate)
      if (ate - de < 1.2) continue
      const dupla = presentes(noIntervalo(editados, de, ate)).sort((x, y) => y.presenca - x.presenca).slice(0, 2).sort((x, y) => x.cx - y.cx)
      if (dupla.length < 2) continue
      if (de > inicio) comReacao.push({ ...pl, de: inicio, ate: de })
      comReacao.push({ de, ate, tipo: 'dividido', cima: recorteDividido(dupla[0], info), baixo: recorteDividido(dupla[1], info) })
      inicio = ate
    }
    if (pl.ate > inicio) comReacao.push({ ...pl, de: inicio })
  }

  const saida = comReacao.map((pl) => {
    const intervalo = { de: Number(pl.de.toFixed(3)), ate: Number(pl.ate.toFixed(3)) }
    if (pl.tipo === 'tela') return { ...intervalo, tipo: 'tela' }
    if (pl.tipo === 'dividido') return { ...intervalo, tipo: 'dividido', cima: pl.cima, baixo: pl.baixo }
    // O pedaço que herdou do vizinho leva a mesma lista de pontos, e juntar os dois a repetiria: o caminho
    // voltaria no tempo e o render somaria os dois trechos do x.
    const pontos = [...new Map(pl.pontos.filter((p) => p.te >= pl.de && p.te < pl.ate).map((p) => [p.te, p])).values()].sort((a, b) => a.te - b.te)
    const recorte = recorteDoRosto(pontos.length ? pontos : pl.pontos, info)
    const xs = pl.ate - pl.de > 2 ? caminho(pontos, recorte, info, pl.de) : null
    return { ...intervalo, tipo: 'rosto', ...recorte, ...(xs ? { xs } : {}) }
  })
  const rostos = new Set(saida.filter((p) => p.tipo === 'rosto').map((p) => Math.round((p.x + p.w / 2) / (0.15 * info.largura))))
  // Emenda de pausa cortada não é troca de pessoa: "falantes" pede rostos em lugares diferentes, ou mais de
  // uma voz com troca de plano (closes de duas pessoas no mesmo lugar do quadro).
  const vozes = new Set(palavrasEditadas.filter((p) => !p.ev && p.f).map((p) => p.f)).size
  const variosRostos = rostos.size > 1 || (vozes > 1 && saida.length > 1)
  const tipo = saida.every((p) => p.tipo === 'tela') ? 'tela' : saida.every((p) => p.tipo === 'dividido') ? 'dividido' : layout !== 'rosto' && variosRostos ? 'falantes' : 'rosto'
  return { layout: tipo, trocasDeCamera, planos: saida }
}

function descrever (enq) {
  const reacoes = enq.planos.filter((p) => p.tipo === 'dividido').length
  const trocas = Math.max(0, enq.planos.length - 1)
  const tipo = {
    tela: 'tela inteira sobre fundo desfocado (sem rosto)',
    dividido: 'tela dividida, um rosto em cima e outro embaixo',
    falantes: `segue quem fala, ${trocas} ${trocas === 1 ? 'troca' : 'trocas'}${reacoes ? `, tela dividida em ${reacoes} ${reacoes === 1 ? 'reação' : 'reações'}` : ''}`,
    rosto: 'segue o rosto'
  }[enq.layout]
  const camera = enq.trocasDeCamera || 0
  return camera ? `${tipo}; a fonte troca de câmera ${camera} ${camera === 1 ? 'vez' : 'vezes'}` : tipo
}

module.exports = { trilhas, turnos, momentosDeReacao, recorteDoRosto, rostoDoPedaco, planos, descrever }
