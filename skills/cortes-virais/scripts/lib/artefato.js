'use strict'

// Marcar "Aprovar" na mesa grava em cortes/<id>: no banco do artefato do claude.ai, ou, na mesa local, num
// JSON da pasta do vídeo. O `aprovar` lê de volta. Ver docs/adr/0004.

const fs = require('node:fs')
const path = require('node:path')

const RAIZ = path.join(__dirname, '..', '..')
const MARCA_DADOS = '<!-- CORTES -->'
const MARCADOR = '.mesa-cortes-virais'
const TIPOS_DE_FONTE = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const LIMITE_POR_ARQUIVO = 15 * 1024 * 1024
const LIMITE_POR_PUBLICACAO = 64 * 1024 * 1024

function fonteEmbutida (html, arquivo) {
  const tipo = TIPOS_DE_FONTE[path.extname(arquivo).toLowerCase()] || 'font/ttf'
  const b64 = fs.readFileSync(arquivo).toString('base64')
  return html.replace("url('{{FONTE}}')", () => `url(data:${tipo};base64,${b64})`)
}

// Na mesa local, o banco do artefato é imitado pela API do servidor local da mesa.
const RUNTIME_LOCAL = `<script>
window.claude = {
  use: async (nome) => {
    if (nome === 'db') return {
      doc: (caminho) => ({ set: async (dados) => { const r = await fetch('/api/' + caminho, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) }); if (!r.ok) throw new Error(String(r.status)) } }),
      collection: (nomeDaColecao) => ({ onSnapshot: (aoMudar, aoFalhar) => {
        const ler = () => fetch('/api/' + nomeDaColecao).then((r) => r.json()).then((docs) => aoMudar({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) })).catch(aoFalhar)
        ler()
        setInterval(ler, 3000)
      } })
    }
    if (nome === 'user') return { id: async () => 'local', profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: 'você' }])) }
    return null
  }
}
</script>`

// O JSON vai dentro de <script type="application/json">: "</" quebraria a tag.
function jsonParaPagina (valor) {
  return JSON.stringify(valor).replace(/</g, '\\u003c')
}

function dadosDaMesa (doc, { textos = {}, layouts = {} } = {}) {
  return {
    titulo: `Cortes de ${String(doc.nome || 'vídeo').replace(/-/g, ' ')}`.replace(/[<>&"]/g, ''),
    duracaoFonte: doc.duracaoFonte || null,
    visaoGeral: doc.visaoGeral || null,
    cortes: doc.cortes.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      gancho: c.gancho,
      descricao: c.descricao || '',
      hashtags: c.hashtags || [],
      nota: c.nota,
      notas: c.notas,
      tipo_gancho: c.tipo_gancho || null,
      porque: c.porque || '',
      avisos: c.avisos || [],
      duracao: c.duracao,
      cortado: c.cortado || 0,
      layout: layouts[c.id] || c.layout || 'auto',
      texto: textos[c.id] || ''
    }))
  }
}

function paginaDaMesa (dados, { fonte, local = false, raiz = RAIZ }) {
  const molde = fs.readFileSync(path.join(raiz, 'template', 'mesa.html'), 'utf8')
  if (!molde.includes(MARCA_DADOS)) throw new Error('template/mesa.html sem a marca dos cortes')
  return fonteEmbutida(molde, fonte)
    .replace('{{TITULO}}', dados.titulo)
    .replace(MARCA_DADOS, () => `<script type="application/json" id="dados-cortes">${jsonParaPagina(dados)}</script>${local ? `\n${RUNTIME_LOCAL}` : ''}`)
}

// A pasta da mesa é apagada e refeita a cada montagem: só a que ela mesma criou, para um --saida errado
// não apagar a pasta do vídeo.
function prepararDestino (destino) {
  if (fs.existsSync(destino)) {
    const conteudo = fs.readdirSync(destino)
    if (conteudo.length && !conteudo.includes(MARCADOR)) {
      throw new Error(`${destino} já existe e não é uma mesa montada por esta skill: escolha uma pasta nova ou vazia para o --saida`)
    }
    fs.rmSync(destino, { recursive: true, force: true })
  }
  fs.mkdirSync(path.join(destino, 'previas'), { recursive: true })
  fs.writeFileSync(path.join(destino, MARCADOR), '')
}

function montarPasta (doc, pastaDasPrevias, saida, extras = {}, { fonte, local = false, raiz = RAIZ }) {
  const destino = path.resolve(saida)
  prepararDestino(destino)
  const comPrevia = []
  const semPrevia = []
  const avisos = []
  let total = 0
  for (const c of doc.cortes) {
    const origem = path.join(pastaDasPrevias, `${c.id}.mp4`)
    if (!fs.existsSync(origem)) { semPrevia.push(c.id); continue }
    const tamanho = fs.statSync(origem).size
    if (tamanho > LIMITE_POR_ARQUIVO) { avisos.push(`a prévia do corte ${c.id} tem ${(tamanho / 1048576).toFixed(1)} MB, acima dos 15 MB do artefato`); semPrevia.push(c.id); continue }
    total += tamanho
    fs.copyFileSync(origem, path.join(destino, 'previas', `${c.id}.mp4`))
    comPrevia.push(c)
  }
  if (total > LIMITE_POR_PUBLICACAO) avisos.push(`as prévias somam ${(total / 1048576).toFixed(1)} MB, acima dos 64 MB de uma publicação: publique a página e depois as prévias em duas levas`)
  const dados = dadosDaMesa({ ...doc, cortes: comPrevia }, extras)
  fs.writeFileSync(path.join(destino, 'index.html'), paginaDaMesa(dados, { fonte, local, raiz }))
  const files = Object.fromEntries(comPrevia.map((c) => [`previas/${c.id}.mp4`, `previas/${c.id}.mp4`]))
  return {
    publicar: {
      root: destino,
      file_path: path.join(destino, 'index.html'),
      files,
      capabilities: { db: {}, user: { scopes: ['profile'] }, comments: { composer_only: true } }
    },
    semPrevia,
    avisos
  }
}

function hashtags (texto) {
  return String(texto || '').split(/[\s,]+/).map((h) => h.trim().replace(/^#*/, '')).filter(Boolean).map((h) => `#${h}`)
}

function documentoAprovado (doc, mesa) {
  const aprovados = []
  for (const c of doc.cortes) {
    const m = mesa[String(c.id)]
    if (!m || !m.aprovado) continue
    aprovados.push({
      ...c,
      titulo: (m.titulo || c.titulo || '').trim(),
      gancho: (m.gancho || c.gancho || '').trim(),
      descricao: m.descricao != null ? String(m.descricao).trim() : c.descricao,
      hashtags: m.hashtags != null ? hashtags(m.hashtags) : c.hashtags,
      aprovado: { por: m.por || null, em: m.em || null }
    })
  }
  if (!aprovados.length) throw new Error('nenhum corte aprovado na mesa: é só marcar "Aprovar" nos que vão para o canal')
  return { ...doc, cortes: aprovados }
}

module.exports = { montarPasta, dadosDaMesa, paginaDaMesa, documentoAprovado, hashtags }
