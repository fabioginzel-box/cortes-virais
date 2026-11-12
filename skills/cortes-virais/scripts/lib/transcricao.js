'use strict'

// A transcrição do Scribe v2 vira três coisas: a lista de palavras com tempo e falante, que o resto
// da skill usa; as frases, para cortar em fronteira de frase; e o texto que o modelo lê para escolher
// os momentos, uma linha por frase, com início, fim e falante.

const FIM_DE_FRASE = /[.?!…]["')\]]*$/
const PAUSA_DE_FRASE = 0.8
const MAX_PALAVRAS_NA_FRASE = 32

// Vício que sai do áudio e da legenda. "Um", "é", "tipo" e "né" ficam: são palavra de verdade quase sempre.
const VICIO = /^(h+u+m+|u+m{2,}|u{2,}m+|h?m{2,}|h?ã+h*|ã+|a+h+n*|é{2,}|e{3,}|u+h+|a+h+m+)$/i

function limpar (texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim()
}

function semPontuacao (texto) {
  return limpar(texto).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function ehVicio (texto) {
  const nu = semPontuacao(texto)
  return nu !== '' && VICIO.test(nu)
}

// Os ids do Scribe (speaker_0, speaker_1) viram S1, S2 na ordem em que cada voz aparece.
function normalizarScribe (saida) {
  const palavras = []
  const falantes = new Map()
  const rotulo = (id) => {
    if (id == null) return null
    if (!falantes.has(id)) falantes.set(id, `S${falantes.size + 1}`)
    return falantes.get(id)
  }
  for (const w of (saida && saida.words) || []) {
    if (w.type === 'spacing') continue
    const texto = limpar(w.text)
    if (!texto || w.start == null || w.end == null) continue
    const evento = w.type === 'audio_event'
    if (!evento && !/[\p{L}\p{N}]/u.test(texto)) continue
    palavras.push({
      i: palavras.length,
      t: evento ? `(${texto.replace(/^[[(]+|[\])]+$/g, '')})` : texto,
      s: Number(w.start),
      e: Math.max(Number(w.end), Number(w.start)),
      f: rotulo(w.speaker_id),
      ...(evento ? { ev: true } : {})
    })
  }
  return { idioma: saida && saida.language_code, duracao: saida && saida.duration_seconds, palavras, falantes: [...falantes.values()] }
}

function terminaFrase (palavra) {
  return FIM_DE_FRASE.test(palavra.t)
}

// Uma frase acaba na pontuação, numa pausa longa, na troca de falante ou no limite de palavras.
// Eventos (risos, aplausos) entram na frase onde aconteceram, sem quebrá-la.
function frases (palavras) {
  const lista = []
  let atual = null
  const fechar = () => { if (atual && atual.palavras.length) lista.push(atual); atual = null }
  for (const p of palavras) {
    if (p.ev) {
      if (atual) atual.palavras.push(p)
      else lista.push({ s: p.s, e: p.e, f: null, palavras: [p] })
      continue
    }
    const ultima = atual && [...atual.palavras].reverse().find((x) => !x.ev)
    if (atual && ultima && (p.f !== atual.f || p.s - ultima.e >= PAUSA_DE_FRASE)) fechar()
    if (!atual) atual = { s: p.s, e: p.e, f: p.f, palavras: [] }
    atual.palavras.push(p)
    atual.e = Math.max(atual.e, p.e)
    const contadas = atual.palavras.filter((x) => !x.ev).length
    if (terminaFrase(p) || contadas >= MAX_PALAVRAS_NA_FRASE) fechar()
  }
  fechar()
  return lista.map((fr) => ({ ...fr, texto: fr.palavras.map((p) => p.t).join(' ') }))
}

// h:mm:ss.d, sempre com a hora: com "01:55" o modelo confunde minuto com hora.
function formatarTempo (segundos) {
  const decimos = Math.max(0, Math.round(segundos * 10))
  const h = Math.floor(decimos / 36000)
  const m = Math.floor((decimos % 36000) / 600)
  const s = Math.floor((decimos % 600) / 10)
  const d = decimos % 10
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`
}

function lerTempo (valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  const texto = String(valor == null ? '' : valor).trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(texto)) return Number(texto)
  const partes = texto.split(':')
  if (partes.length < 2 || partes.length > 3 || partes.some((x) => !/^\d+(\.\d+)?$/.test(x))) {
    throw new Error(`tempo inválido: "${valor}" (use segundos ou h:mm:ss.d)`)
  }
  return partes.map(Number).reduce((total, x) => total * 60 + x, 0)
}

function textoParaModelo (listaDeFrases) {
  return listaDeFrases
    .map((fr) => `[${formatarTempo(fr.s)}–${formatarTempo(fr.e)}] ${fr.f ? `${fr.f}: ` : ''}${fr.texto}`)
    .join('\n')
}

// Para comparar palavras: sem caixa, sem acento e sem pontuação.
function chave (texto) {
  return semPontuacao(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Corrige a grafia antes da legenda: cada { de, para } troca a sequência de palavras de `de` por uma
// palavra só, do começo da primeira ao fim da última, com a pontuação final da última. `juntam(a, b)` diz
// se duas palavras seguidas da lista podem virar uma (na fonte, elas se seguem).
function aplicarCorrecoes (palavras, correcoes = [], { juntam = () => true } = {}) {
  let lista = palavras
  for (const c of correcoes) {
    const alvo = String(c.de || '').split(/\s+/).map(chave).filter(Boolean)
    if (!alvo.length || !c.para) continue
    const saida = []
    for (let i = 0; i < lista.length; i++) {
      const seq = lista.slice(i, i + alvo.length)
      const casa = seq.length === alvo.length && seq.every((p, k) => !p.ev && chave(p.t) === alvo[k] && (k === 0 || juntam(seq[k - 1], p)))
      if (!casa) { saida.push(lista[i]); continue }
      const ultima = seq[seq.length - 1]
      const pontuacao = (/[^\p{L}\p{N}]+$/u.exec(ultima.t) || [''])[0]
      saida.push({ ...seq[0], t: `${c.para}${pontuacao}`, e: ultima.e })
      i += alvo.length - 1
    }
    lista = saida
  }
  return lista
}

function resumo (doc) {
  const falas = doc.palavras.filter((p) => !p.ev)
  const eventos = doc.palavras.filter((p) => p.ev)
  const porFalante = {}
  for (const p of falas) porFalante[p.f || '?'] = (porFalante[p.f || '?'] || 0) + 1
  const tipos = {}
  for (const p of eventos) tipos[p.t] = (tipos[p.t] || 0) + 1
  return { palavras: falas.length, eventos: tipos, porFalante }
}

module.exports = { normalizarScribe, frases, textoParaModelo, formatarTempo, lerTempo, ehVicio, terminaFrase, chave, aplicarCorrecoes, resumo }
