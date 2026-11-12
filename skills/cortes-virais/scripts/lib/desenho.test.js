'use strict'

// O template da legenda de verdade no Chrome sem janela: o que se desenha tem de ficar na zona segura,
// em todo tamanho e em toda fonte.

const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { abrir, acharChrome } = require('./chrome')
const { TEMPLATE } = require('./desenho')
const { resolver, temaDaLegenda } = require('./marca')

const semChrome = !acharChrome() || typeof WebSocket === 'undefined'
const opcoes = { skip: semChrome && 'sem o Chrome nesta máquina' }
const ZONA = { esquerda: 60, direita: 930 }

// Uma fonte larga de verdade faz o papel da fonte própria do canal.
const LARGA = ['/System/Library/Fonts/Supplemental/Arial Black.ttf', 'C:\\Windows\\Fonts\\ariblk.ttf', '/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf']
  .find((f) => fs.existsSync(f))
const opcoesDaPropria = { skip: (semChrome && 'sem o Chrome nesta máquina') || (!LARGA && 'sem uma fonte larga nesta máquina') }

let pagina

before(async () => {
  if (semChrome) return
  pagina = await abrir()
  await pagina.tamanho(1080, 1920)
})

after(async () => { if (pagina) await pagina.fechar() })

// Cada tema numa página nova: duas FontFace "Marca" na mesma página deixariam a fonte em dúvida.
async function desenhar (marca, estado) {
  await pagina.carregar(pathToFileURL(TEMPLATE).href)
  await pagina.avaliar(`window.LEGENDA.tema(${JSON.stringify(temaDaLegenda(resolver(marca)))})`)
  await pagina.avaliar(`window.LEGENDA.montar(${JSON.stringify(estado)})`)
}

const bordas = (seletor) => pagina.avaliar(`(() => {
  const caixas = [...document.querySelectorAll('${seletor}')].map((e) => e.getBoundingClientRect())
  return { esquerda: Math.min(...caixas.map((c) => c.left)), direita: Math.max(...caixas.map((c) => c.right)) }
})()`)

async function legendaNaZona (marca, palavra) {
  await desenhar(marca, { palavras: [palavra], ativa: 0 })
  const b = await bordas('#legenda .p')
  assert.ok(b.esquerda >= ZONA.esquerda && b.direita <= ZONA.direita, JSON.stringify(b))
}

// O card tem 872 px com o padding, 1 px a mais de cada lado da zona, desde sempre.
async function cardNaZona (marca, gancho) {
  await desenhar(marca, { gancho, palavras: [] })
  const b = await bordas('#gancho .card')
  const dentro = await pagina.avaliar(`(() => { const c = document.querySelector('#gancho .card'); return c.scrollWidth <= c.clientWidth })()`)
  assert.ok(b.esquerda >= ZONA.esquerda - 2 && b.direita <= ZONA.direita + 2 && dentro, JSON.stringify({ ...b, dentro }))
}

test('a legenda encolhe a palavra longa até caber na zona segura no tamanho P', opcoes, async () => {
  await legendaNaZona({ estilo: 'classico', legenda: { tamanho: 'P' } }, 'EMPREENDEDORISMO')
})

test('a legenda encolhe a palavra longa até caber na zona segura no tamanho M', opcoes, async () => {
  await legendaNaZona({ estilo: 'classico', legenda: { tamanho: 'M' } }, 'EMPREENDEDORISMO')
})

test('a legenda encolhe a palavra longa até caber na zona segura no tamanho G', opcoes, async () => {
  await legendaNaZona({ estilo: 'classico', legenda: { tamanho: 'G' } }, 'EMPREENDEDORISMO')
})

test('a legenda encolhe abaixo do mínimo a palavra que não cabe nem nele', opcoes, async () => {
  await legendaNaZona({ estilo: 'classico', legenda: { tamanho: 'G' } }, 'OTORRINOLARINGOLOGISTA')
})

test('a legenda na Poppins encolhe a palavra longa até caber na zona segura', opcoes, async () => {
  await legendaNaZona({ estilo: 'marca', legenda: { tamanho: 'G' } }, 'EMPREENDEDORISMO')
})

test('a legenda na Anton encolhe a palavra longa até caber na zona segura', opcoes, async () => {
  await legendaNaZona({ estilo: 'impacto', legenda: { tamanho: 'G' } }, 'OTORRINOLARINGOLOGISTA')
})

test('a legenda na fonte própria encolhe a palavra longa até caber na zona segura', opcoesDaPropria, async () => {
  await legendaNaZona({ estilo: 'classico', fonte: LARGA, legenda: { tamanho: 'G' } }, 'EMPREENDEDORISMO')
})

test('a legenda mantém o tamanho da palavra que já cabe', opcoes, async () => {
  await desenhar({ estilo: 'classico', legenda: { tamanho: 'M' } }, { palavras: ['OLHA', 'ISSO'], ativa: 0 })
  assert.equal(await pagina.avaliar(`document.getElementById('legenda').style.fontSize`), '92px')
})

test('o card do gancho encolhe a palavra longa até caber na zona segura', opcoes, async () => {
  await cardNaZona({ estilo: 'classico' }, 'OTORRINOLARINGOLOGISTA caro')
})

test('o card do gancho na Poppins encolhe a palavra longa até caber na zona segura', opcoes, async () => {
  await cardNaZona({ estilo: 'marca' }, 'OTORRINOLARINGOLOGISTA caro')
})

test('o card do gancho na Anton encolhe a palavra longa até caber na zona segura', opcoes, async () => {
  await cardNaZona({ estilo: 'impacto' }, 'PNEUMOULTRAMICROSCOPICOSSILICOVULCANOCONIÓTICO')
})

test('o card do gancho na fonte própria encolhe a palavra longa até caber na zona segura', opcoesDaPropria, async () => {
  await cardNaZona({ estilo: 'classico', fonte: LARGA }, 'INCONSTITUCIONALISSIMAMENTE caro')
})
