'use strict'

// A identidade visual de um canal: um dos estilos prontos mais o que a pessoa trocou nele, guardado no
// marca.json da pasta do canal. Ver docs/adr/0002 e references/marca.md.

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const PASTA_DAS_FONTES = path.join(__dirname, '..', '..', 'assets', 'fontes')

const FONTES = {
  montserrat: { arquivo: 'Montserrat-ExtraBold.ttf', peso: 800 },
  poppins: { arquivo: 'Poppins-ExtraBold.ttf', peso: 800 },
  anton: { arquivo: 'Anton-Regular.ttf', peso: 400 }
}

const TAMANHOS = { P: { maximo: 76, minimo: 52 }, M: { maximo: 92, minimo: 60 }, G: { maximo: 108, minimo: 70 } }

const ESTILOS = {
  classico: {
    fonte: 'montserrat',
    legenda: { texto: '#FFFFFF', contorno: '#000000', ativa: { estilo: 'fundo', fundo: ['#FFD60A'], texto: '#000000' }, destaque: '#4ADE80', caixaAlta: true, tamanho: 'M' },
    card: { ligado: true, fundo: '#FFFFFF', texto: '#000000' }
  },
  marca: {
    fonte: 'poppins',
    legenda: { texto: '#FFFFFF', contorno: null, ativa: { estilo: 'fundo', fundo: ['#7C3AED', '#DB2777'], texto: '#FFFFFF' }, destaque: '#F0ABFC', caixaAlta: true, tamanho: 'M' },
    card: { ligado: true, fundo: '#7C3AED', texto: '#FFFFFF' }
  },
  impacto: {
    fonte: 'anton',
    legenda: { texto: '#FFFFFF', contorno: '#000000', ativa: { estilo: 'cor', fundo: [], texto: '#B6FF3B' }, destaque: '#5CE1E6', caixaAlta: true, tamanho: 'G' },
    card: { ligado: true, fundo: '#B6FF3B', texto: '#000000' }
  }
}

const FINALIZACAO = {
  modo: 'nenhuma',
  cartao: { titulo: 'Gostou?', botao: 'Segue o canal', apoio: '', logo: null, audio: null, duracao: 2.5, cores: {} },
  video: { arquivo: null }
}

const MODOS = ['nenhuma', 'cartao', 'video']
const ATIVAS = ['fundo', 'cor', 'sem']
const EXTENSOES = {
  fonte: ['.ttf', '.otf', '.woff', '.woff2'],
  logo: ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'],
  video: ['.mp4', '.mov', '.m4v', '.webm', '.mkv']
}
const COR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const ehObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

function mesclar (base, extra) {
  if (!ehObjeto(extra)) return extra === undefined ? structuredClone(base) : extra
  const saida = ehObjeto(base) ? structuredClone(base) : {}
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) continue
    saida[k] = ehObjeto(v) && ehObjeto(saida[k]) ? mesclar(saida[k], v) : structuredClone(v)
  }
  return saida
}

function resolver (bruto = {}, dir = null) {
  const estilo = bruto.estilo || 'classico'
  if (!ESTILOS[estilo]) throw new Error(`marca.json: o estilo "${estilo}" não existe; use ${Object.keys(ESTILOS).join(', ')}`)
  const proprio = {}
  for (const k of ['fonte', 'legenda', 'card', 'finalizacao']) if (bruto[k] !== undefined) proprio[k] = bruto[k]
  const m = mesclar({ ...ESTILOS[estilo], finalizacao: FINALIZACAO }, proprio)
  const cores = m.finalizacao.cartao.cores || {}
  m.finalizacao.cartao.cores = {
    fundo: cores.fundo || '#0E0E12',
    titulo: cores.titulo || m.legenda.texto,
    botao: cores.botao || m.card.fundo,
    botaoTexto: cores.botaoTexto || m.card.texto
  }
  return { ...m, nome: bruto.nome || null, estilo, dir }
}

function arquivoDoCanal (m, relativo) {
  if (!relativo) return null
  return path.isAbsolute(relativo) ? relativo : path.resolve(m.dir || '.', relativo)
}

function fonteDaMarca (m) {
  const embutida = FONTES[String(m.fonte).toLowerCase()]
  if (embutida) return { arquivo: path.join(PASTA_DAS_FONTES, embutida.arquivo), peso: embutida.peso, embutida: true }
  return { arquivo: arquivoDoCanal(m, m.fonte), peso: 800, embutida: false }
}

function luminancia (hex) {
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((x) => x + x).join('')
  const canais = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2]
}

function contraste (a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

function conferirArquivo (m, rel, tipo, rotulo, problemas) {
  if (!rel) return
  const arquivo = arquivoDoCanal(m, rel)
  if (!EXTENSOES[tipo].includes(path.extname(arquivo).toLowerCase())) problemas.push(`${rotulo}: "${rel}" tem de ser ${EXTENSOES[tipo].join(', ')}`)
  else if (!fs.existsSync(arquivo)) problemas.push(`${rotulo}: não achei ${arquivo}`)
}

function problemas (m) {
  const lista = []
  const cor = (valor, rotulo, nulo = false) => {
    if (nulo && valor === null) return
    if (typeof valor !== 'string' || !COR.test(valor)) lista.push(`${rotulo}: "${valor}" não é uma cor em hexadecimal, como #FFD60A`)
  }
  const l = m.legenda || {}
  cor(l.texto, 'legenda.texto')
  cor(l.contorno, 'legenda.contorno', true)
  cor(l.destaque, 'legenda.destaque')
  if (!ATIVAS.includes(l.ativa && l.ativa.estilo)) lista.push(`legenda.ativa.estilo: use ${ATIVAS.join(', ')}`)
  else {
    if (l.ativa.estilo !== 'sem') cor(l.ativa.texto, 'legenda.ativa.texto')
    if (l.ativa.estilo === 'fundo') {
      if (!Array.isArray(l.ativa.fundo) || l.ativa.fundo.length < 1 || l.ativa.fundo.length > 2) lista.push('legenda.ativa.fundo: uma cor, ou duas para o degradê, numa lista')
      else l.ativa.fundo.forEach((c, i) => cor(c, `legenda.ativa.fundo[${i}]`))
    }
  }
  if (typeof l.caixaAlta !== 'boolean') lista.push('legenda.caixaAlta: true ou false')
  if (!TAMANHOS[l.tamanho]) lista.push('legenda.tamanho: P, M ou G')
  const card = m.card || {}
  if (typeof card.ligado !== 'boolean') lista.push('card.ligado: true ou false')
  cor(card.fundo, 'card.fundo')
  cor(card.texto, 'card.texto')

  const fonte = fonteDaMarca(m)
  if (!fonte.embutida) conferirArquivo(m, m.fonte, 'fonte', 'fonte', lista)

  const f = m.finalizacao || {}
  if (!MODOS.includes(f.modo)) lista.push(`finalizacao.modo: use ${MODOS.join(', ')}`)
  const ct = f.cartao || {}
  if (f.modo === 'cartao') {
    if (!String(ct.titulo || '').trim() && !String(ct.botao || '').trim() && !ct.logo) lista.push('finalizacao.cartao: precisa de título, botão ou logo')
    if ([...String(ct.titulo || '')].length > 28) lista.push('finalizacao.cartao.titulo: até 28 caracteres')
    if ([...String(ct.botao || '')].length > 24) lista.push('finalizacao.cartao.botao: até 24 caracteres')
    if ([...String(ct.apoio || '')].length > 40) lista.push('finalizacao.cartao.apoio: até 40 caracteres')
    const d = Number(ct.duracao)
    if (!(d >= 1.5 && d <= 8)) lista.push('finalizacao.cartao.duracao: de 1,5 a 8 segundos')
    for (const [k, v] of Object.entries(ct.cores || {})) cor(v, `finalizacao.cartao.cores.${k}`)
    conferirArquivo(m, ct.logo, 'logo', 'finalizacao.cartao.logo', lista)
    conferirArquivo(m, ct.audio, 'audio', 'finalizacao.cartao.audio', lista)
  }
  if (f.modo === 'video') {
    if (!f.video || !f.video.arquivo) lista.push('finalizacao.video.arquivo: o vídeo de assinatura do canal')
    else conferirArquivo(m, f.video.arquivo, 'video', 'finalizacao.video.arquivo', lista)
  }
  return lista
}

// Só avisa: a cor é escolha de quem configura, mas legenda ilegível derruba a retenção.
function avisos (m) {
  const lista = []
  const l = m.legenda
  if (l.ativa.estilo === 'fundo' && contraste(l.ativa.texto, l.ativa.fundo[0]) < 3) lista.push('a palavra ativa tem pouco contraste com o fundo dela')
  if (m.card.ligado && contraste(m.card.texto, m.card.fundo) < 4.5) lista.push('o texto do card tem pouco contraste com o fundo do card')
  if (m.finalizacao.modo === 'cartao') {
    const c = m.finalizacao.cartao.cores
    if (contraste(c.botaoTexto, c.botao) < 3) lista.push('o texto do botão do cartão tem pouco contraste com o botão')
  }
  if (!fonteDaMarca(m).embutida) lista.push('fonte própria: ela vai embutida na mesa de aprovação; confira se a licença dela permite')
  return lista
}

function fundoDaAtiva (fundo) {
  return fundo.length > 1 ? `linear-gradient(135deg, ${fundo[0]}, ${fundo[1]})` : fundo[0]
}

function temaDaLegenda (m) {
  const l = m.legenda
  const fonte = fonteDaMarca(m)
  return {
    fonte: { url: pathToFileURL(fonte.arquivo).href, peso: fonte.peso },
    cores: {
      texto: l.texto,
      contorno: l.contorno || 'transparent',
      ativaFundo: l.ativa.estilo === 'fundo' ? fundoDaAtiva(l.ativa.fundo) : 'transparent',
      ativaTexto: l.ativa.estilo === 'sem' ? l.texto : l.ativa.texto,
      destaque: l.destaque,
      cardFundo: m.card.fundo,
      cardTexto: m.card.texto
    },
    contorno: Boolean(l.contorno),
    ativa: l.ativa.estilo,
    tamanho: TAMANHOS[l.tamanho]
  }
}

// A chave de cache muda quando muda a marca ou o arquivo da fonte.
function impressao (m) {
  const fonte = fonteDaMarca(m)
  let estado = null
  try { const s = fs.statSync(fonte.arquivo); estado = [s.size, Math.round(s.mtimeMs)] } catch {}
  return [temaDaLegenda(m), estado]
}

module.exports = { ESTILOS, FONTES, TAMANHOS, MODOS, EXTENSOES, resolver, mesclar, problemas, avisos, contraste, fonteDaMarca, arquivoDoCanal, temaDaLegenda, impressao }
