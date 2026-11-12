'use strict'

// A mesa.html de verdade no Chrome sem janela, com um banco falso no lugar do do artefato.

const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { abrir, acharChrome } = require('./chrome')
const { dadosDaMesa, paginaDaMesa } = require('./artefato')

const semChrome = !acharChrome() || typeof WebSocket === 'undefined'

const FONTE = path.join(__dirname, '..', '..', 'assets', 'fontes', 'Montserrat-ExtraBold.ttf')

const BANCO_FALSO = `<meta charset="utf-8"><script>
window.gravados = []
window.latencia = 0
window.claude = { use: async (nome) => {
  if (nome === 'db') return {
    doc: (caminho) => ({ set: (d) => { window.gravados.push(JSON.parse(JSON.stringify(d))); return new Promise((r) => setTimeout(r, window.latencia)) } }),
    collection: () => ({ onSnapshot: (aoMudar) => { window.aoMudar = aoMudar } })
  }
  if (nome === 'user') return { id: async () => 'eu', profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: i }])) }
  return null
} }
window.ler = (d) => window.aoMudar({ docs: [{ id: '1', data: () => d }] })
</script>`

const plano = { nome: 'teste', duracaoFonte: 600, cortes: [{ id: 1, titulo: 'Título do plano', gancho: 'Gancho do plano', descricao: 'desc', hashtags: ['#a'], nota: 80, notas: {}, duracao: 30 }] }
const daAna = (extra) => JSON.stringify({ aprovado: false, titulo: 'Título do plano', gancho: 'Gancho do plano', descricao: 'desc', hashtags: '#a', por: 'ana', em: '2026-11-10T10:00:00.000Z', ...extra })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

// O salvamento do texto espera a pessoa parar de digitar, e num CI lento os timers da página atrasam:
// espera as gravações chegarem, com prazo, em vez de um tempo fixo.
async function gravacoes (quantas, prazo = 8000) {
  const inicio = Date.now()
  for (;;) {
    const lista = await pagina.avaliar('window.gravados')
    if (lista.length >= quantas || Date.now() - inicio > prazo) return lista
    await esperar(100)
  }
}

let pagina
let endereco

before(async () => {
  if (semChrome) return
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-teste-'))
  const arquivo = path.join(pasta, 'index.html')
  fs.writeFileSync(arquivo, paginaDaMesa(dadosDaMesa(plano), { fonte: FONTE }).replace('<title>', `${BANCO_FALSO}<title>`))
  endereco = pathToFileURL(arquivo).href
  pagina = await abrir()
})

after(async () => { if (pagina) await pagina.fechar() })

async function abrirMesa () {
  await pagina.carregar(endereco)
  await pagina.avaliar('new Promise((r) => { const i = setInterval(() => { if (window.aoMudar) { clearInterval(i); r() } }, 20) })')
}

const opcoes = { skip: semChrome && 'sem o Chrome nesta máquina' }

test('a mesa não grava nada de quem só abriu a página', opcoes, async () => {
  await abrirMesa()
  await pagina.avaliar(`window.ler(${daAna({ aprovado: true, titulo: 'Título da Ana' })})`)
  await esperar(1000)
  assert.deepEqual(await pagina.avaliar('window.gravados'), [])
})

test('a mesa mostra o que outra pessoa gravou', opcoes, async () => {
  await abrirMesa()
  await pagina.avaliar(`window.ler(${daAna({ aprovado: true, titulo: 'Título da Ana' })})`)
  assert.deepEqual(await pagina.avaliar(`[document.getElementById('titulo-1').value, document.getElementById('aprovar-1').checked]`), ['Título da Ana', true])
})

test('a mesa não troca o que se acabou de digitar por uma leitura velha', opcoes, async () => {
  await abrirMesa()
  await pagina.avaliar(`(() => { const t = document.getElementById('titulo-1'); t.focus(); t.value = 'Título novo'; t.dispatchEvent(new Event('input')); document.getElementById('gancho-1').focus() })()`)
  await pagina.avaliar(`window.ler(${daAna()})`)
  const gravados = await gravacoes(1)
  assert.deepEqual([await pagina.avaliar(`document.getElementById('titulo-1').value`), gravados.length && gravados[gravados.length - 1].titulo], ['Título novo', 'Título novo'])
})

test('a mesa não desmarca a aprovação por uma leitura feita antes da gravação', opcoes, async () => {
  await abrirMesa()
  await pagina.avaliar('window.latencia = 800')
  await pagina.avaliar(`document.getElementById('aprovar-1').click()`)
  await pagina.avaliar(`window.ler(${daAna()})`)
  assert.equal(await pagina.avaliar(`document.getElementById('aprovar-1').checked`), true)
})

test('a mesa não grava a aprovação desfeita por uma leitura velha na próxima edição', opcoes, async () => {
  await abrirMesa()
  await pagina.avaliar('window.latencia = 800')
  await pagina.avaliar(`document.getElementById('aprovar-1').click()`)
  await pagina.avaliar(`window.ler(${daAna()})`)
  await pagina.avaliar(`(() => { const d = document.getElementById('descricao-1'); d.focus(); d.value = 'desc nova'; d.dispatchEvent(new Event('input')); d.blur() })()`)
  assert.deepEqual((await gravacoes(2)).map((g) => g.aprovado), [true, true])
})

test('a mesa ignora a leitura anterior à última gravação daqui', opcoes, async () => {
  await abrirMesa()
  await pagina.avaliar(`document.getElementById('aprovar-1').click()`)
  await esperar(50)
  await pagina.avaliar(`window.ler(${daAna({ em: '2000-01-01T00:00:00.000Z' })})`)
  assert.equal(await pagina.avaliar(`document.getElementById('aprovar-1').checked`), true)
})

test('a mesa grava a aprovação com o nome de quem marcou', opcoes, async () => {
  await abrirMesa()
  await pagina.avaliar(`document.getElementById('aprovar-1').click()`)
  const [gravado = {}] = await gravacoes(1)
  assert.deepEqual([gravado.aprovado, gravado.por], [true, 'eu'])
})
