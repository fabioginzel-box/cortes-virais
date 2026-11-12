'use strict'

// Cada mudança do que aparece na tela (palavra, bloco, card do gancho) é um "estado", que o Chrome
// desenha uma vez e o ffmpeg segura pelo tempo certo.

const { terminaFrase, chave } = require('./transcricao')

const PADRAO = { maxPalavras: 3, maxCaracteres: 20, pausa: 0.35, sobra: 0.3, emenda: 0.6, gancho: 4 }

// Onde cada frase aparece na fala: índices na lista sem eventos e o tempo de cada ocorrência.
// A correção de grafia junta várias palavras numa só ("R$ 300"), por isso a busca é por pedaço de texto.
function trechosDasFrases (palavras, lista = []) {
  const fala = palavras.filter((p) => !p.ev)
  const pedacos = fala.flatMap((p, i) => String(p.t).split(/\s+/).map((t) => ({ k: chave(t), i })).filter((x) => x.k))
  const achados = []
  for (const frase of lista) {
    const alvo = String(frase).split(/\s+/).map(chave).filter(Boolean)
    if (!alvo.length) continue
    for (let j = 0; j + alvo.length <= pedacos.length; j++) {
      if (!alvo.every((a, k) => pedacos[j + k].k === a)) continue
      const i0 = pedacos[j].i
      const i1 = pedacos[j + alvo.length - 1].i
      achados.push({ frase, i0, i1, de: fala[i0].s, ate: fala[i1].e })
    }
  }
  return achados
}

function textoDaLegenda (t, caixaAlta) {
  const limpo = String(t).replace(/^["'“‘(]+|["'”’)]+$/g, '').replace(/[.,;:…]+$/u, '')
  return caixaAlta ? limpo.toLocaleUpperCase('pt-BR') : limpo
}

function blocos (palavras, opcoes = {}) {
  const o = { ...PADRAO, ...opcoes }
  const fala = palavras.filter((p) => !p.ev)
  const destacadas = new Set()
  for (const t of trechosDasFrases(fala, o.destaques)) for (let i = t.i0; i <= t.i1; i++) destacadas.add(i)
  const lista = []
  let atual = null
  for (const [indice, p] of fala.entries()) {
    const texto = textoDaLegenda(p.t, o.caixaAlta)
    if (!texto) continue
    const ultima = atual && atual.palavras[atual.palavras.length - 1]
    const tamanho = atual ? atual.palavras.reduce((t, x) => t + [...x.t].length + 1, 0) + [...texto].length : 0
    const quebra = !atual ||
      atual.palavras.length >= o.maxPalavras ||
      tamanho > o.maxCaracteres ||
      p.s - ultima.e >= o.pausa ||
      p.f !== atual.f ||
      terminaFrase(ultima.original)
    if (quebra) {
      atual = { f: p.f, palavras: [] }
      lista.push(atual)
    }
    atual.palavras.push({ t: texto, s: p.s, e: p.e, chave: destacadas.has(indice), original: p })
  }
  return lista.map((b, k) => {
    const de = b.palavras[0].s
    const fimDaFala = b.palavras[b.palavras.length - 1].e
    const prox = lista[k + 1]
    const ate = prox && prox.palavras[0].s - fimDaFala <= o.emenda ? prox.palavras[0].s : fimDaFala + o.sobra
    return { de, ate: prox ? Math.min(ate, prox.palavras[0].s) : ate, palavras: b.palavras.map(({ t, s, e, chave: c }) => ({ t, s, e, chave: c })) }
  })
}

// Quadro sem legenda e sem gancho também é um estado (a tela limpa): o overlay cobre o vídeo inteiro.
function estados (listaDeBlocos, { duracao, fps = 30, gancho = PADRAO.gancho } = {}) {
  const total = Math.round(duracao * fps)
  const q = (t) => Math.max(0, Math.min(total, Math.round(t * fps)))
  const fronteiras = new Set([0, total, q(gancho)])
  for (const b of listaDeBlocos) {
    fronteiras.add(q(b.de))
    fronteiras.add(q(b.ate))
    for (const p of b.palavras) fronteiras.add(q(p.s))
  }
  const marcos = [...fronteiras].filter((x) => x >= 0 && x <= total).sort((a, b) => a - b)
  const lista = []
  for (let k = 0; k < marcos.length - 1; k++) {
    const de = marcos[k]
    const ate = marcos[k + 1]
    if (ate <= de) continue
    const t = (de + 0.5) / fps
    const b = listaDeBlocos.findIndex((x) => t >= x.de && t < x.ate)
    let dados = { gancho: t < gancho, palavras: [], ativa: -1 }
    if (b >= 0) {
      const bloco = listaDeBlocos[b]
      let ativa = 0
      bloco.palavras.forEach((p, i) => { if (p.s <= t) ativa = i })
      dados = { gancho: t < gancho, palavras: bloco.palavras.map((p) => p.t), ativa }
      if (bloco.palavras.some((p) => p.chave)) dados.chaves = bloco.palavras.map((p) => Boolean(p.chave))
    }
    const chave = JSON.stringify(dados)
    const ultimo = lista[lista.length - 1]
    if (ultimo && ultimo.chave === chave) ultimo.ate = ate
    else lista.push({ de, ate, chave, dados })
  }
  return lista.map(({ de, ate, chave, dados }) => ({ de, ate, quadros: ate - de, chave, dados }))
}

// O último arquivo se repete no fim, senão o concat ignora a duração dele. Barra para a frente: o ffmpeg
// do Windows aceita, e a contrabarra seria escape. Sem o framerate, o PNG entra na base de 1/25 s.
function listaDoConcat (lista, arquivos, fps = 30) {
  const caminho = (a) => `file '${a.replace(/\\/g, '/').replace(/'/g, "'\\''")}'\noption framerate ${fps}`
  const linhas = []
  lista.forEach((e, k) => {
    linhas.push(caminho(arquivos[k]))
    linhas.push(`duration ${(e.quadros / fps).toFixed(6)}`)
  })
  if (lista.length) linhas.push(caminho(arquivos[lista.length - 1]))
  return linhas.join('\n') + '\n'
}

module.exports = { blocos, estados, listaDoConcat, textoDaLegenda, trechosDasFrases }
