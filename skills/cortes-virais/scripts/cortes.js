#!/usr/bin/env node
'use strict'

// Uso:
//   node cortes.js ambiente
//   node cortes.js canal
//   node cortes.js canal criar "<nome>" [--estilo classico|marca|impacto]
//   node cortes.js marca [<canal>] [--fonte <arquivo>] [--fonte-google "<família>"] [--logo <arquivo>] [--audio <arquivo>] [--video <arquivo>]
//   node cortes.js amostra [<canal>] [--fundo <imagem ou vídeo>]
//   node cortes.js pasta <nome> [--canal <canal>]
//   node cortes.js fonte <pasta> <arquivo ou URL do YouTube>
//   node cortes.js transcrever <pasta> [--idioma pt] [--termos "Acme,PS5"] [--falantes 2]
//   node cortes.js assistir <pasta>
//   node cortes.js conferir <pasta> [--limpeza dinamico|natural|sem] [--min 15] [--max 90] [--curto]
//   node cortes.js rostos <pasta> [--cortes 1,2]
//   node cortes.js previa <pasta> [--cortes 1,2] [--sem-finalizacao]
//   node cortes.js mesa <pasta> --saida <pasta do artefato>
//   node cortes.js mesa <pasta> --local [--minutos 120] [--sem-abrir]
//   node cortes.js aprovar <pasta> [--cortes 1,3]
//   node cortes.js render <pasta> [--cortes 1,3] [--realce] [--sem-finalizacao]
//   node cortes.js registrar <pasta> <corte> --visualizacoes N --retencao P [--continuaram P] [--curtidas N] [--inscritos N] [--url U]
//   node cortes.js aprendizado [--canal <canal>]

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { acharChrome } = require('./lib/chrome')
const { acharPrograma, rodar, lerVersao, infoDoVideo, argsProbe, partes, argsAudio, argsCopiaLeve, argsQuadros, argsCortesDeCena, lerCortesDeCena, argsYtDlp } = require('./lib/midia')
const { normalizarScribe, frases, textoParaModelo, resumo: resumoDaTranscricao, formatarTempo, aplicarCorrecoes } = require('./lib/transcricao')
const { conferirCortes, contextoDoFim, palavrasEditadas, textoDoCorte, LIMITES } = require('./lib/plano')
const { blocos, estados, trechosDasFrases, textoDaLegenda } = require('./lib/legendas')
const { planos, descrever } = require('./lib/rostos')
const render = require('./lib/render')
const gemini = require('./lib/gemini')
const { dataUrl } = require('./lib/replicate')
const historico = require('./lib/historico')
const { base, slug, nomeDaPasta, nomeDoVideo, hashDe } = require('./lib/pasta')
const { gerar, identidade } = require('./lib/arquivo')
const canais = require('./lib/canal')
const marca = require('./lib/marca')

const FPS_DOS_QUADROS = 5
const MODELO_DA_TRANSCRICAO = 'elevenlabs/scribe-v2'
const MODELO_DO_REALCE = 'topazlabs/video-upscale'

function opcoesDaLinha (args) {
  const o = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('--')) { o._.push(a); continue }
    const chave = a.slice(2)
    const prox = args[i + 1]
    if (prox == null || prox.startsWith('--')) o[chave] = true
    else { o[chave] = prox; i++ }
  }
  return o
}

const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'))
const gravarJson = (arquivo, valor) => { fs.mkdirSync(path.dirname(arquivo), { recursive: true }); fs.writeFileSync(arquivo, JSON.stringify(valor, null, 2) + '\n') }
const listaDeIds = (texto) => (typeof texto === 'string' ? texto.split(',').map((x) => x.trim()).filter(Boolean) : null)
const escolher = (cortes, ids) => (ids ? cortes.filter((c) => ids.includes(String(c.id))) : cortes)
const arquivoDoEnquadramento = (pasta, id) => path.join(pasta, 'enquadramento', `${id}.json`)
const texto = (o, chave) => (typeof o[chave] === 'string' ? o[chave] : null)

function exigir (arquivo, antes) {
  if (!fs.existsSync(arquivo)) throw new Error(`rode antes: ${antes}`)
  return lerJson(arquivo)
}

const lerOpcional = (arquivo, padrao) => (fs.existsSync(arquivo) ? lerJson(arquivo) : padrao)

function lerVideo (pasta) {
  return {
    fonte: exigir(path.join(pasta, 'fonte.json'), 'node cortes.js fonte <pasta> <arquivo ou URL>'),
    palavras: exigir(path.join(pasta, 'palavras.json'), 'node cortes.js transcrever <pasta>').palavras,
    correcoes: lerOpcional(path.join(pasta, 'correcoes.json'), []),
    canal: canais.canalDoVideo(pasta)
  }
}

function exigirMarcaSemProblema (canal) {
  if (canal.problemas.length) throw new Error(`o marca.json do canal ${canal.nome} tem problemas: ${canal.problemas.join('; ')}`)
  return canal.marca
}

const peloWinget = (id) => `winget install --id ${id} -e, e abra o Claude Code de novo`
const INSTALAR = {
  darwin: { node: 'brew install node (ou o instalador de nodejs.org)', ffmpeg: 'brew install ffmpeg', ytdlp: 'brew install yt-dlp', chrome: 'brew install --cask google-chrome (ou o instalador de google.com/chrome)' },
  win32: { node: peloWinget('OpenJS.NodeJS.LTS'), ffmpeg: peloWinget('Gyan.FFmpeg'), ytdlp: peloWinget('yt-dlp.yt-dlp'), chrome: peloWinget('Google.Chrome') },
  linux: { node: 'o Node 22 ou mais novo pelo nvm ou por nodejs.org (o do apt costuma ser velho)', ffmpeg: 'sudo apt install ffmpeg (ou o gerenciador da sua distribuição)', ytdlp: 'pipx install yt-dlp (o do apt costuma ser velho)', chrome: 'o .deb de google.com/chrome, ou sudo apt install chromium' }
}[process.platform] || {}

function programas () {
  const ffmpeg = acharPrograma('ffmpeg')
  const ffprobe = acharPrograma('ffprobe')
  if (!ffmpeg || !ffprobe) throw new Error(`não achei o ffmpeg e o ffprobe: ${INSTALAR.ffmpeg}`)
  return { ffmpeg, ffprobe, versao: lerVersao(rodar(ffmpeg, ['-version'], { saida: true }).split('\n')[0]) }
}

function cliente (pasta) {
  const { criarCliente } = require('./lib/replicate')
  return criarCliente({ registro: path.join(pasta, 'replicate.jsonl') })
}

function ambiente () {
  const major = Number(process.versions.node.split('.')[0])
  const chrome = acharChrome()
  const ffmpeg = acharPrograma('ffmpeg')
  const ffprobe = acharPrograma('ffprobe')
  const ytdlp = acharPrograma('yt-dlp')
  const google = require('./lib/gemini-google')
  let token = false
  let motivo = ''
  try { require('./lib/replicate').token(); token = true } catch (e) { motivo = e.message }
  const linhas = [
    [major >= 22, `Node ${process.version}`, `precisa do Node 22 ou mais novo: ${INSTALAR.node}`],
    [Boolean(chrome), `Chrome: ${chrome || 'não achei'}`, `${INSTALAR.chrome}; ou aponte o binário em CORTES_VIRAIS_CHROME`],
    [Boolean(ffmpeg && ffprobe), `ffmpeg e ffprobe: ${ffmpeg || 'não achei'}`, INSTALAR.ffmpeg],
    [token, 'token do Replicate', motivo.replace(/\n/g, '\n      ')]
  ]
  for (const [ok, rotulo, dica] of linhas) console.log(`${ok ? 'ok   ' : 'FALTA'} ${rotulo}${ok ? '' : ` — ${dica}`}`)
  console.log(`${ytdlp ? 'ok   ' : 'opcional'} yt-dlp: ${ytdlp || `não achei (só para baixar do YouTube: ${INSTALAR.ytdlp})`}`)
  console.log(`${google.chave() ? 'ok   ' : 'opcional'} GEMINI_API_KEY: ${google.chave() ? `o ${google.modelo()} assiste pela Gemini API` : 'sem ela, o Gemini assiste pelo Replicate'}`)
  const lista = canais.listarCanais()
  console.log(lista.length ? `canais: ${lista.map((c) => c.nome).join(', ')}` : 'canais: nenhum ainda (a identidade visual se configura no primeiro uso; ver references/marca.md)')
  console.log(`pasta dos cortes: ${base()}`)
  return major >= 22 && chrome && ffmpeg && ffprobe && token ? 0 : 1
}

function comandoCanal (o) {
  const [sub, ...resto] = o._
  if (sub === 'criar') {
    const c = canais.criarCanal(resto.join(' '), { estilo: texto(o, 'estilo') || 'classico' })
    console.log(`canal ${c.nome} criado: ${path.join(c.dir, 'marca.json')}`)
    return 0
  }
  if (sub) throw new Error('uso: node cortes.js canal | node cortes.js canal criar "<nome>" [--estilo classico|marca|impacto]')
  const lista = canais.listarCanais()
  if (!lista.length) { console.log('nenhum canal ainda: configure a identidade visual (references/marca.md) com node cortes.js canal criar "<nome>"'); return 0 }
  for (const { nome } of lista) {
    const c = canais.abrirCanal(nome)
    const m = c.marca
    console.log(`${c.nome}: "${c.bruto.nome || c.nome}", estilo ${m.estilo}, fonte ${m.fonte}, finalização ${m.finalizacao.modo}${c.problemas.length ? ` — PROBLEMA: ${c.problemas.join('; ')}` : ''}\n  ${c.dir}`)
  }
  return 0
}

function copiarParaOCanal (origem, dir, tipo) {
  const arquivo = path.resolve(origem)
  if (!fs.existsSync(arquivo)) throw new Error(`não achei ${arquivo}`)
  if (!marca.EXTENSOES[tipo].includes(path.extname(arquivo).toLowerCase())) throw new Error(`${path.basename(arquivo)}: o ${tipo} tem de ser ${marca.EXTENSOES[tipo].join(', ')}`)
  const destino = path.join(dir, path.basename(arquivo))
  if (destino !== arquivo) fs.copyFileSync(arquivo, destino)
  return path.basename(arquivo)
}

async function comandoMarca (nome, o) {
  const c = nome ? canais.abrirCanal(nome) : canais.escolherCanal(null)
  const bruto = structuredClone(c.bruto)
  const final = () => { bruto.finalizacao = bruto.finalizacao || {}; return bruto.finalizacao }
  let mudou = false
  if (texto(o, 'fonte')) { bruto.fonte = copiarParaOCanal(o.fonte, c.dir, 'fonte'); mudou = true }
  if (texto(o, 'fonte-google')) {
    const { baixarFonteDoGoogle } = require('./lib/fontes-google')
    const r = await baixarFonteDoGoogle(o['fonte-google'], c.dir)
    bruto.fonte = r.arquivo
    console.log(`baixei ${o['fonte-google']} no peso ${r.peso}: ${r.arquivo}`)
    mudou = true
  }
  if (texto(o, 'logo')) { final().cartao = { ...(final().cartao || {}), logo: copiarParaOCanal(o.logo, c.dir, 'logo') }; mudou = true }
  if (texto(o, 'audio')) { final().cartao = { ...(final().cartao || {}), audio: copiarParaOCanal(o.audio, c.dir, 'audio') }; mudou = true }
  if (texto(o, 'video')) { final().video = { ...(final().video || {}), arquivo: copiarParaOCanal(o.video, c.dir, 'video') }; mudou = true }
  if (mudou) canais.gravarMarca(c.dir, bruto)
  const atual = canais.abrirCanal(c.nome)
  const { dir, ...semDir } = atual.marca
  console.log(`canal ${atual.nome} (${path.join(dir, 'marca.json')}), com o estilo ${atual.marca.estilo} já aplicado:`)
  console.log(JSON.stringify(semDir, null, 2))
  for (const p of atual.problemas) console.log(`PROBLEMA ${p}`)
  for (const a of marca.avisos(atual.marca)) console.log(`aviso: ${a}`)
  return atual.problemas.length ? 1 : 0
}

const EXTENSOES_DE_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp']
const VERTICAL = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1'

function fundoDaAmostra (ffmpeg, origem, destino) {
  if (!origem) return rodar(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'gradients=s=1080x1920:c0=0x2f4a63:c1=0xb98a63:x0=0:y0=0:x1=1080:y1=1920:d=1', '-frames:v', '1', destino])
  const arquivo = path.resolve(origem)
  if (!fs.existsSync(arquivo)) throw new Error(`não achei ${arquivo}`)
  const imagem = EXTENSOES_DE_IMAGEM.includes(path.extname(arquivo).toLowerCase())
  return rodar(ffmpeg, ['-y', '-loglevel', 'error', ...(imagem ? [] : ['-ss', '5']), '-i', arquivo, '-vf', VERTICAL, '-frames:v', '1', destino])
}

async function comandoAmostra (nome, o) {
  const c = nome ? canais.abrirCanal(nome) : canais.escolherCanal(null)
  const m = exigirMarcaSemProblema(c)
  const { ffmpeg } = programas()
  const { desenharUm } = require('./lib/desenho')
  const dir = path.join(c.dir, 'amostra')
  fs.mkdirSync(dir, { recursive: true })
  const fundo = path.join(dir, 'fundo.png')
  fundoDaAmostra(ffmpeg, texto(o, 'fundo'), fundo)
  const palavras = ['Isso', 'mudou', 'tudo'].map((t) => textoDaLegenda(t, m.legenda.caixaAlta))
  const camada = path.join(dir, 'camada.png')
  await desenharUm({ gancho: m.card.ligado ? 'Ninguém te conta isso' : null, palavras, ativa: 1, chaves: [false, false, true] }, camada, { tema: marca.temaDaLegenda(m) })
  const legenda = path.join(dir, 'legenda.png')
  rodar(ffmpeg, ['-y', '-loglevel', 'error', '-i', fundo, '-i', camada, '-filter_complex', '[0:v][1:v]overlay=0:0', '-frames:v', '1', legenda])
  fs.rmSync(camada, { force: true })
  const saidas = [`${legenda} (o card do gancho, a palavra ativa em "${palavras[1]}" e um destaque em "${palavras[2]}")`]
  if (m.finalizacao.modo === 'cartao') {
    const { desenharCartaoParado } = require('./lib/finalizacao')
    saidas.push(`${await desenharCartaoParado(m, fundo, path.join(dir, 'cartao.png'))} (o cartão final, já parado)`)
  }
  if (m.finalizacao.modo === 'video') {
    const destino = path.join(dir, 'video.png')
    const { ENCAIXE_VERTICAL } = require('./lib/finalizacao')
    rodar(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '1', '-i', marca.arquivoDoCanal(m, m.finalizacao.video.arquivo), '-filter_complex', `${ENCAIXE_VERTICAL}[v]`, '-map', '[v]', '-frames:v', '1', destino])
    saidas.push(`${destino} (um quadro do vídeo de assinatura, como ele entra no fim)`)
  }
  for (const a of marca.avisos(m)) console.log(`aviso: ${a}`)
  console.log(saidas.join('\n'))
  return 0
}

function criarPasta (nome, o) {
  if (!nome) throw new Error('diga um nome curto para o vídeo: node cortes.js pasta podcast-ep12')
  const c = canais.escolherCanal(texto(o, 'canal'))
  const pasta = path.join(base(), nomeDaPasta(nome))
  fs.mkdirSync(pasta, { recursive: true })
  canais.gravarCanalDoVideo(pasta, c.nome)
  console.log(pasta)
  if (c.problemas.length) console.error(`aviso: o marca.json do canal ${c.nome} tem problemas, e a prévia vai parar neles: ${c.problemas.join('; ')}`)
  return 0
}

function fonte (pasta, origem) {
  if (!pasta || !origem) throw new Error('uso: node cortes.js fonte <pasta> <arquivo ou URL>')
  const { ffmpeg, ffprobe } = programas()
  let arquivo
  let url = null
  if (/^https?:\/\//.test(origem)) {
    const ytdlp = acharPrograma('yt-dlp')
    if (!ytdlp) throw new Error(`para baixar do YouTube precisa do yt-dlp: ${INSTALAR.ytdlp}. Se tiver o arquivo original da gravação, use ele: sai melhor.`)
    arquivo = path.join(pasta, 'fonte.mp4')
    console.log('baixando na maior qualidade que o vídeo tem (até 4K)…')
    rodar(ytdlp, argsYtDlp(origem, arquivo, { ffmpeg, node: process.execPath }))
    url = origem
  } else {
    arquivo = path.resolve(origem)
    if (!fs.existsSync(arquivo)) throw new Error(`não achei ${arquivo}`)
  }
  const info = infoDoVideo(JSON.parse(rodar(ffprobe, argsProbe(arquivo), { saida: true })))
  if (!info.audio) throw new Error('o vídeo não tem áudio: sem fala não há transcrição nem corte')
  gravarJson(path.join(pasta, 'fonte.json'), { arquivo, url, nome: nomeDoVideo(pasta), ...info })
  console.log(`${path.basename(arquivo)}: ${info.largura}×${info.altura}, ${formatarTempo(info.duracao)}, ${info.fps} quadros/s${info.quadroVariavel ? ' (variável: a entrega sai a 30)' : ''}`)
  const ampliacao = render.ENTREGA.altura / info.altura
  if (ampliacao > 1.25) console.log(`aviso: o 9:16 vai ampliar o vídeo ${ampliacao.toFixed(1)} vezes (de ${info.altura} para ${render.ENTREGA.altura} linhas). Vale o --realce no render, ou o arquivo original em 4K.`)
  return 0
}

async function transcrever (pasta, o) {
  const f = exigir(path.join(pasta, 'fonte.json'), 'node cortes.js fonte <pasta> <arquivo ou URL>')
  const { ffmpeg } = programas()
  const audio = path.join(pasta, 'audio.m4a')
  rodar(ffmpeg, argsAudio(f.arquivo, audio))
  const rep = cliente(pasta)
  console.log(`subindo o áudio (${(fs.statSync(audio).size / 1048576).toFixed(1)} MB)…`)
  const url = await rep.enviar(audio, 'audio/mp4')
  const entrada = {
    audio: url,
    language_code: texto(o, 'idioma') || 'pt',
    diarize: true,
    tag_audio_events: true,
    timestamps_granularity: 'word',
    no_verbatim: false,
    num_speakers: Number(o.falantes) || 0
  }
  if (texto(o, 'termos')) entrada.keyterms = o.termos
  console.log(`transcrevendo no ${MODELO_DA_TRANSCRICAO} (${formatarTempo(f.duracao)} de áudio)…`)
  const p = await rep.rodar(MODELO_DA_TRANSCRICAO, entrada)
  gravarJson(path.join(pasta, 'transcricao-bruta.json'), p.output)
  const doc = normalizarScribe(p.output)
  gravarJson(path.join(pasta, 'palavras.json'), doc)
  const lista = frases(doc.palavras)
  const arquivoDasFalas = path.join(pasta, 'falas.txt')
  fs.writeFileSync(arquivoDasFalas, textoParaModelo(lista) + '\n')
  const r = resumoDaTranscricao(doc)
  console.log(`ok: ${r.palavras} palavras, ${lista.length} frases, idioma ${doc.idioma}`)
  console.log(`falantes: ${Object.entries(r.porFalante).map(([quem, n]) => `${quem} ${n} palavras`).join(', ')}`)
  if (Object.keys(r.eventos).length) console.log(`sons marcados: ${Object.entries(r.eventos).map(([e, n]) => `${e} ×${n}`).join(', ')}`)
  console.log(`leia ${arquivoDasFalas} (${fs.statSync(arquivoDasFalas).size} bytes)`)
  return 0
}

// Com a GEMINI_API_KEY, o Gemini assiste pela Gemini API; sem ela, pelo Replicate. Ver docs/adr/0001.
async function assistir (pasta) {
  const f = exigir(path.join(pasta, 'fonte.json'), 'node cortes.js fonte <pasta> <arquivo ou URL>')
  const { ffmpeg } = programas()
  const google = require('./lib/gemini-google')
  const direto = google.chave() ? google.criarClienteGoogle({ registro: path.join(pasta, 'gemini-api.jsonl') }) : null
  const rep = direto ? null : cliente(pasta)
  const lista = partes(f.duracao)
  console.log(`o ${direto ? google.modelo() : gemini.MODELO} vai assistir ${lista.length} ${lista.length > 1 ? 'partes' : 'parte'}, ${direto ? 'pela Gemini API' : 'pelo Replicate'}…`)
  const tentativas = await Promise.allSettled(lista.map(async (parte, i) => {
    const copia = path.join(pasta, 'gemini', `parte-${i + 1}.mp4`)
    fs.mkdirSync(path.dirname(copia), { recursive: true })
    rodar(ffmpeg, argsCopiaLeve(f.arquivo, parte.inicio, parte.fim, copia))
    const resposta = direto
      ? await direto.assistir(copia, gemini.prompt(parte, f.duracao, i, lista.length))
      : [].concat((await rep.rodar(gemini.MODELO, gemini.entrada(await rep.enviar(copia, 'video/mp4'), parte, f.duracao, i, lista.length))).output).join('')
    fs.writeFileSync(path.join(pasta, 'gemini', `parte-${i + 1}.txt`), resposta)
    return gemini.momentosDaParte(resposta, parte)
  }))
  const falhas = tentativas.map((t, i) => (t.status === 'rejected' ? `parte ${i + 1}: ${t.reason.message.split('\n')[0]}` : null)).filter(Boolean)
  for (const falha of falhas) console.log(`falhou ${falha}`)
  if (falhas.length === lista.length) {
    throw new Error('o Gemini não assistiu nenhuma parte. Siga só com a transcrição (os risos marcados pelo Scribe ajudam) e diga isso a quem pediu.')
  }
  const resultados = tentativas.filter((t) => t.status === 'fulfilled').map((t) => t.value)
  const momentos = gemini.juntar(resultados.map((r) => r.momentos))
  const visaoGeral = (resultados.find((r) => r.visaoGeral) || {}).visaoGeral || null
  gravarJson(path.join(pasta, 'gemini.json'), { visaoGeral, momentos })
  fs.writeFileSync(path.join(pasta, 'momentos.txt'), gemini.textoParaModelo(momentos) + '\n')
  if (visaoGeral) console.log(`visão geral: ${JSON.stringify(visaoGeral)}`)
  console.log(`ok: ${momentos.length} momentos; leia ${path.join(pasta, 'momentos.txt')}`)
  return 0
}

function frasesQueFaltam (palavras, c) {
  const editadas = palavrasEditadas(palavras, c.mantidos, { comVicios: c.limpeza === 'sem' })
  return [...(c.destaques || []), ...(c.impacto || [])].filter((frase) => !trechosDasFrases(editadas, [frase]).length)
}

function conferir (pasta, o) {
  const { fonte: f, palavras, correcoes, canal } = lerVideo(pasta)
  const corrigidas = aplicarCorrecoes(palavras, correcoes)
  const modo = texto(o, 'limpeza') || 'dinamico'
  const limites = {}
  if (o.min) limites.min = Number(o.min)
  if (o.max) limites.max = Number(o.max)
  const regua = lerOpcional(path.join(canal.dir, 'regua.json'), null)
  const candidatos = exigir(path.join(pasta, 'candidatos.json'), `escreva os candidatos em ${path.join(pasta, 'candidatos.json')} (formato em references/formato.md)`)
  const r = conferirCortes(candidatos, palavras, { duracaoFonte: f.duracao, modo, limites, regua })
  if (regua) console.log(`régua do aprendizado do canal ${canal.nome}: regua.json`)
  for (const p of r.problemas) console.log(`PROBLEMA corte ${p.id}: ${p.problemas.join('; ')}`)
  for (const d of r.descartados) console.log(`descartado corte ${d.id}: ${d.motivo}`)
  for (const c of r.cortes) {
    console.log(`\ncorte ${c.id} · nota ${c.nota} · ${c.duracao} s (${c.cortado}% de pausa e vício cortados) · ${c.tipo_gancho || 'sem tipo de gancho'} · gancho "${c.gancho}"`)
    for (const t of c.trechos) console.log(`  trecho ${formatarTempo(t.inicio)}–${formatarTempo(t.fim)} (início ${t.ajuste.inicio >= 0 ? '+' : ''}${t.ajuste.inicio} s, fim ${t.ajuste.fim >= 0 ? '+' : ''}${t.ajuste.fim} s)`)
    for (const a of c.avisos) console.log(`  aviso: ${a}`)
    for (const frase of frasesQueFaltam(corrigidas, c)) console.log(`  aviso: "${frase}" (destaque ou impacto) não está no que se ouve`)
    if (!o.curto) {
      const ctx = contextoDoFim(c, palavras)
      console.log(`  o que se ouve: ${textoDoCorte(corrigidas, c)}`)
      console.log(`  em volta do fim (${ctx.fim}): …${ctx.antes.slice(-160)} ‖ ${ctx.depois.slice(0, 160)}…`)
    }
  }
  gravarJson(path.join(pasta, 'plano.json'), {
    nome: f.nome,
    duracaoFonte: f.duracao,
    visaoGeral: lerOpcional(path.join(pasta, 'gemini.json'), {}).visaoGeral || null,
    limpeza: modo,
    limites: { ...LIMITES, ...limites },
    cortes: r.cortes,
    descartados: r.descartados
  })
  console.log(`\n${r.cortes.length} cortes no plano, ${r.descartados.length} descartados, ${r.problemas.length} com problema`)
  return r.problemas.length ? 1 : 0
}

const lerPlano = (pasta) => exigir(path.join(pasta, 'plano.json'), 'node cortes.js conferir <pasta>')

// A identidade do arquivo da fonte entra em toda chave de cache: trocar o vídeo refaz tudo.
const VERSAO_DO_ENQUADRAMENTO = 3
const chaveDoEnquadramento = (c, idFonte) => hashDe([VERSAO_DO_ENQUADRAMENTO, idFonte, c.trechos, c.mantidos, c.layout || 'auto'])
const chaveDosRostos = (c, idFonte) => hashDe([idFonte, c.trechos.map((t) => [t.inicio, t.fim]), FPS_DOS_QUADROS])

// Os rostos e as trocas de câmera só dependem dos trechos: mudar o layout ou a limpeza não os refaz.
async function rostosDoCorte (pasta, c, f) {
  const idFonte = identidade(f.arquivo)
  const arquivo = path.join(pasta, 'rostos', `${c.id}.json`)
  const guardado = lerOpcional(arquivo, null)
  if (guardado && guardado.chave === chaveDosRostos(c, idFonte) && guardado.cortesDeCena) return guardado
  const { ffmpeg } = programas()
  const { detectarRostos } = require('./lib/mediapipe')
  const cortesDeCena = c.trechos.flatMap((t) => lerCortesDeCena(rodar(ffmpeg, argsCortesDeCena(f.arquivo, t.inicio, t.fim)).stderr, t.inicio, t.fim))
  const dirQuadros = path.join(pasta, 'quadros', String(c.id))
  fs.rmSync(dirQuadros, { recursive: true, force: true })
  fs.mkdirSync(dirQuadros, { recursive: true })
  const quadros = []
  for (const [k, t] of c.trechos.entries()) {
    rodar(ffmpeg, argsQuadros(f.arquivo, t.inicio, t.fim, FPS_DOS_QUADROS, path.join(dirQuadros, `t${k}-%05d.jpg`)))
    const arquivos = fs.readdirSync(dirQuadros).filter((a) => a.startsWith(`t${k}-`)).sort()
    arquivos.forEach((a, i) => quadros.push({ t: Number((t.inicio + i / FPS_DOS_QUADROS).toFixed(3)), arquivo: path.join(dirQuadros, a) }))
  }
  const faces = await detectarRostos(quadros.map((q) => q.arquivo))
  const vistos = new Set()
  const lista = quadros.map((q, i) => ({ t: q.t, faces: faces[i] }))
    .sort((a, b) => a.t - b.t)
    .filter((q) => { const k = q.t.toFixed(2); if (vistos.has(k)) return false; vistos.add(k); return true })
  fs.rmSync(dirQuadros, { recursive: true, force: true })
  const doc = { chave: chaveDosRostos(c, idFonte), fps: FPS_DOS_QUADROS, cortesDeCena, quadros: lista }
  gravarJson(arquivo, doc)
  return doc
}

async function enquadrar (pasta, c, video) {
  const { quadros, cortesDeCena } = await rostosDoCorte(pasta, c, video.fonte)
  const enq = planos({
    quadros,
    cortesDeCena,
    palavrasEditadas: palavrasEditadas(video.palavras, c.mantidos),
    mantidos: c.mantidos,
    info: video.fonte,
    layout: c.layout || 'auto'
  })
  const doc = { chave: chaveDoEnquadramento(c, identidade(video.fonte.arquivo)), ...enq }
  gravarJson(arquivoDoEnquadramento(pasta, c.id), doc)
  return doc
}

// O enquadramento guardado só vale para a mesma fonte, os mesmos trechos, a mesma limpeza e o mesmo layout.
async function enquadramentoDe (pasta, c, video) {
  const guardado = lerOpcional(arquivoDoEnquadramento(pasta, c.id), null)
  return guardado && guardado.chave === chaveDoEnquadramento(c, identidade(video.fonte.arquivo)) ? guardado : enquadrar(pasta, c, video)
}

async function rostos (pasta, o) {
  const video = lerVideo(pasta)
  for (const c of escolher(lerPlano(pasta).cortes, listaDeIds(o.cortes))) {
    console.log(`corte ${c.id}: ${descrever(await enquadrar(pasta, c, video))}`)
  }
  return 0
}

const comoUltimo = (args, destino) => [...args.slice(0, -1), destino]

async function renderizar (pasta, c, video, { previa, realce, destino, comFinalizacao = true }) {
  const { ffmpeg, ffprobe, versao } = programas()
  const { desenharEstados, TEMPLATE } = require('./lib/desenho')
  const { prepararFinalizacao } = require('./lib/finalizacao')
  const m = exigirMarcaSemProblema(video.canal)
  const f = video.fonte
  const idFonte = identidade(f.arquivo)
  const enq = await enquadramentoDe(pasta, c, video)
  const fps = f.fpsDeEntrega
  const trabalho = path.join(pasta, 'trabalho', String(c.id))
  fs.mkdirSync(trabalho, { recursive: true })

  const comVicios = c.limpeza === 'sem'
  const legenda = palavrasEditadas(aplicarCorrecoes(video.palavras, video.correcoes), c.mantidos, { comVicios })
  const impactos = trechosDasFrases(legenda, c.impacto).map((t) => ({ de: t.de - 0.05, ate: t.ate + 0.15 }))

  const trechos = c.trechos.map((t, k) => {
    const a = render.argsTrecho(f.arquivo, t.inicio, t.fim, fps, path.join(trabalho, `t${k}-${hashDe([idFonte, t.inicio, t.fim, fps])}.mov`))
    const arquivo = gerar(a.args[a.args.length - 1], (tmp) => rodar(ffmpeg, comoUltimo(a.args, tmp)))
    return { deslocamento: a.deslocamento, arquivo }
  })
  const comRealce = realce && !previa
  const tela = comRealce ? render.telaDoRealce(enq, f) : render.ENTREGA
  const lista = render.pedacos(c, enq, trechos.map((t) => t.deslocamento), impactos, fps)
  const filtro = render.filtroDoRecorte(lista, tela)
  const chave = hashDe([filtro, trechos.map((t) => t.arquivo)])
  const recorte = gerar(path.join(trabalho, `recorte-${chave}.mov`), (tmp) => {
    const arquivoDoFiltro = path.join(trabalho, `filtro-${chave}.txt`)
    fs.writeFileSync(arquivoDoFiltro, filtro)
    rodar(ffmpeg, render.argsRecorte(trechos.map((t) => t.arquivo), arquivoDoFiltro, fps, tmp, versao))
  })

  const telas = estados(blocos(legenda, { caixaAlta: m.legenda.caixaAlta, destaques: c.destaques }), { duracao: c.duracao, fps, gancho: m.card.ligado ? 4 : 0 })
  const dirLegenda = path.join(trabalho, `legenda-${hashDe([telas.map((e) => e.chave + e.quadros), c.gancho, fs.readFileSync(TEMPLATE, 'utf8'), marca.impressao(m)])}`)
  const overlay = path.join(dirLegenda, 'overlay.mov')
  if (!fs.existsSync(overlay)) {
    const { lista: arquivoDaLista } = await desenharEstados(telas, dirLegenda, { gancho: c.gancho, fps, tema: marca.temaDaLegenda(m) })
    gerar(overlay, (tmp) => rodar(ffmpeg, render.argsOverlay(arquivoDaLista, fps, tmp)))
  }

  let imagem = recorte
  if (comRealce) {
    const entradaDoRealce = gerar(path.join(trabalho, `para-realce-${path.basename(recorte, '.mov')}.mp4`), (tmp) => rodar(ffmpeg, render.argsParaRealce(recorte, tmp)))
    imagem = await gerar(path.join(trabalho, `realce-${path.basename(recorte, '.mov')}.mp4`), async (tmp) => {
      const rep = cliente(pasta)
      console.log(`  realce no ${MODELO_DO_REALCE}, a partir de ${tela.largura}×${tela.altura} (${(fs.statSync(entradaDoRealce).size / 1048576).toFixed(0)} MB)…`)
      const p = await rep.rodar(MODELO_DO_REALCE, { video: dataUrl(entradaDoRealce, 'video/mp4'), target_resolution: '4k', target_fps: fps })
      await rep.baixar(p.output, tmp)
    })
  }

  const final = comFinalizacao
    ? await prepararFinalizacao({ marca: m, trabalho, cache: path.join(pasta, 'trabalho'), fps, ffmpeg, ffprobe, fonte: f.arquivo, fim: c.trechos[c.trechos.length - 1].fim })
    : null
  const medida = previa ? null : render.lerMedida(rodar(ffmpeg, render.argsMedirVolume(recorte)).stderr)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  rodar(ffmpeg, render.argsAcabamento({ video: imagem, audio: recorte, overlay, medida, fps, destino, previa, final, duracao: c.duracao }))
  const duracaoTotal = render.duracaoComFinalizacao(c.duracao, final)
  const problemas = render.conferirEntrega(JSON.parse(rodar(ffprobe, argsProbe(destino), { saida: true })), duracaoTotal, previa)
  const doRecorte = Number(JSON.parse(rodar(ffprobe, argsProbe(recorte), { saida: true })).format.duration)
  if (Math.abs(doRecorte - c.duracao) > 1 / fps + 0.02) problemas.push(`o recorte tem ${doRecorte.toFixed(2)} s e o plano dava ${c.duracao} s: a legenda sairia fora do tempo da fala`)
  return { enq, problemas, duracaoTotal, final }
}

async function previa (pasta, o) {
  const video = lerVideo(pasta)
  let erros = 0
  for (const c of escolher(lerPlano(pasta).cortes, listaDeIds(o.cortes))) {
    const destino = path.join(pasta, 'previas', `${c.id}.mp4`)
    const { enq, problemas } = await renderizar(pasta, c, video, { previa: true, destino, comFinalizacao: !o['sem-finalizacao'] })
    if (problemas.length) erros++
    console.log(`corte ${c.id}: ${descrever(enq)} → ${destino}${problemas.length ? ` PROBLEMA: ${problemas.join('; ')}` : ''}`)
  }
  return erros ? 1 : 0
}

function abrirNoNavegador (url) {
  const { comandoParaAbrir } = require('./lib/mesa-local')
  const [comando, args] = comandoParaAbrir(url)
  try { spawn(comando, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref() } catch {}
}

async function mesa (pasta, o) {
  const { montarPasta } = require('./lib/artefato')
  const local = Boolean(o.local)
  if (!local && !texto(o, 'saida')) throw new Error('diga onde montar o artefato (--saida <pasta de rascunho da sessão>/artefato-cortes) ou use --local para a mesa no navegador')
  const plano = lerPlano(pasta)
  const { palavras, correcoes, canal } = lerVideo(pasta)
  const corrigidas = aplicarCorrecoes(palavras, correcoes)
  const textos = {}
  const layouts = {}
  for (const c of plano.cortes) {
    textos[c.id] = textoDoCorte(corrigidas, c)
    const enq = lerOpcional(arquivoDoEnquadramento(pasta, c.id), null)
    if (enq) layouts[c.id] = enq.layout
  }
  const saida = local ? path.join(pasta, 'mesa-local') : o.saida
  const fonteDaMesa = marca.fonteDaMarca(canal.marca).arquivo
  const r = montarPasta(plano, path.join(pasta, 'previas'), saida, { textos, layouts }, { fonte: fonteDaMesa, local })
  if (r.semPrevia.length) console.error(`sem prévia, fora da mesa: cortes ${r.semPrevia.join(', ')} (rode o previa)`)
  for (const a of r.avisos.filter((x) => !local || !/MB/.test(x))) console.error(`aviso: ${a}`)
  if (!local) { console.log(JSON.stringify(r.publicar, null, 2)); return 0 }

  const { abrirMesaLocal } = require('./lib/mesa-local')
  const colecao = path.join(pasta, 'mesa', 'cortes')
  const aberta = await abrirMesaLocal({ pastaDaMesa: path.resolve(saida), pastaDaColecao: colecao, porta: Number(o.porta) || 0 })
  const minutos = Number(o.minutos) || 120
  console.log(`mesa local em ${aberta.url}`)
  console.log(`cada aprovação é gravada em ${colecao}; a mesa fica aberta por ${minutos} min ou até este comando parar`)
  if (!o['sem-abrir']) abrirNoNavegador(aberta.url)
  await new Promise((resolve) => {
    const relogio = setTimeout(resolve, minutos * 60000)
    const parar = () => { clearTimeout(relogio); resolve() }
    process.once('SIGINT', parar)
    process.once('SIGTERM', parar)
  })
  await aberta.fechar()
  console.log('mesa local fechada')
  return 0
}

function lerColecao (pasta) {
  if (!fs.existsSync(pasta)) return {}
  return Object.fromEntries(fs.readdirSync(pasta).filter((a) => a.endsWith('.json')).map((a) => [a.slice(0, -5), lerJson(path.join(pasta, a))]))
}

function aprovar (pasta, o) {
  const { documentoAprovado } = require('./lib/artefato')
  const plano = lerPlano(pasta)
  const ids = listaDeIds(o.cortes)
  const leitura = ids
    ? Object.fromEntries(ids.map((id) => [id, { aprovado: true, por: 'conversa', em: new Date().toISOString() }]))
    : lerColecao(path.join(pasta, 'mesa', 'cortes'))
  const doc = documentoAprovado(plano, leitura)
  gravarJson(path.join(pasta, 'aprovado.json'), doc)
  for (const c of doc.cortes) console.log(`corte ${c.id}: "${c.titulo}" · gancho "${c.gancho}" · ${c.duracao} s`)
  if (doc.cortes.length > 5) console.log(`aviso: ${doc.cortes.length} cortes aprovados de um vídeo só; vale espaçar a publicação para não repetir o canal`)
  return 0
}

async function renderFinal (pasta, o) {
  const video = lerVideo(pasta)
  const doc = exigir(path.join(pasta, 'aprovado.json'), 'node cortes.js aprovar <pasta>')
  const { ffmpeg } = programas()
  const conferencia = path.join(pasta, 'final', 'conferencia')
  fs.mkdirSync(conferencia, { recursive: true })
  let erros = 0
  for (const c of escolher(doc.cortes, listaDeIds(o.cortes))) {
    const nome = `${String(c.id).padStart(2, '0')}-${slug(c.titulo)}`
    const destino = path.join(pasta, 'final', `${nome}.mp4`)
    const { problemas, duracaoTotal, final } = await renderizar(pasta, c, video, { previa: false, realce: Boolean(o.realce), destino, comFinalizacao: !o['sem-finalizacao'] })
    for (const pct of [0.1, 0.5, 0.9]) rodar(ffmpeg, render.argsQuadroDeConferencia(destino, c.duracao * pct, path.join(conferencia, `${nome}-${Math.round(pct * 100)}.jpg`)))
    if (final) rodar(ffmpeg, render.argsQuadroDeConferencia(destino, duracaoTotal - 0.2, path.join(conferencia, `${nome}-finalizacao.jpg`)))
    fs.writeFileSync(path.join(pasta, 'final', `${nome}.txt`), [
      c.titulo, '', c.descricao || '', '', (c.hashtags || []).join(' '), '',
      `Trechos do original: ${c.trechos.map((t) => `${formatarTempo(t.inicio)}–${formatarTempo(t.fim)}`).join(', ')}`
    ].join('\n') + '\n')
    if (problemas.length) erros++
    console.log(`${destino}${problemas.length ? ` PROBLEMA: ${problemas.join('; ')}` : ''}`)
  }
  console.log(`quadros de conferência em ${conferencia}`)
  return erros ? 1 : 0
}

function registrar (pasta, id, o) {
  const doc = exigir(path.join(pasta, 'aprovado.json'), 'node cortes.js aprovar <pasta>')
  const c = doc.cortes.find((x) => String(x.id) === String(id))
  if (!c) throw new Error(`o corte ${id} não está no aprovado.json de ${pasta}`)
  const canal = canais.canalDoVideo(pasta)
  const linha = historico.linhaDoCorte(c, pasta, o)
  historico.registrar(path.join(canal.dir, 'historico.jsonl'), linha)
  console.log(`registrado no canal ${canal.nome}: corte ${id} "${c.titulo}" — ${JSON.stringify(linha.metricas)}`)
  return 0
}

function aprendizado (o) {
  const canal = canais.escolherCanal(texto(o, 'canal'))
  const linhas = historico.ler(path.join(canal.dir, 'historico.jsonl'))
  if (!linhas.length) { console.log(`canal ${canal.nome}: nenhum corte registrado ainda; uma semana depois de publicar, rode o registrar com os números do YouTube Studio`); return 0 }
  const r = historico.resumo(linhas)
  const tabela = (grupos) => grupos.map((g) => `  ${g.nome}: ${g.cortes} cortes, retenção mediana ${g.retencao ?? '—'}%, visualizações ${g.visualizacoes ?? '—'}${g.continuaram != null ? `, continuaram ${g.continuaram}%` : ''}`).join('\n')
  console.log(`canal ${canal.nome}: ${r.cortes} cortes registrados\npor tipo de gancho:\n${tabela(r.porGancho)}\npor duração:\n${tabela(r.porDuracao)}`)
  console.log(r.acertoDaNota == null ? 'acerto da nota: precisa de 5 cortes ou mais, com notas diferentes' : `acerto da nota (correlação de postos com a retenção): ${r.acertoDaNota}`)
  const regua = lerOpcional(path.join(canal.dir, 'regua.json'), null)
  console.log(regua ? `régua em uso: ${JSON.stringify(regua)}` : 'régua em uso: a padrão de references/escolha.md')
  return 0
}

const COMANDOS = 'ambiente | canal | marca | amostra | pasta | fonte | transcrever | assistir | conferir | rostos | previa | mesa | aprovar | render | registrar | aprendizado'

async function principal (argv) {
  const [comando, ...resto] = argv
  const o = opcoesDaLinha(resto)
  const pasta = o._[0] ? path.resolve(o._[0]) : null
  switch (comando) {
    case 'ambiente': return ambiente()
    case 'canal': return comandoCanal(o)
    case 'marca': return comandoMarca(o._[0], o)
    case 'amostra': return comandoAmostra(o._[0], o)
    case 'pasta': return criarPasta(o._[0], o)
    case 'fonte': return fonte(pasta, o._[1])
    case 'transcrever': return transcrever(pasta, o)
    case 'assistir': return assistir(pasta)
    case 'conferir': return conferir(pasta, o)
    case 'rostos': return rostos(pasta, o)
    case 'previa': return previa(pasta, o)
    case 'mesa': return mesa(pasta, o)
    case 'aprovar': return aprovar(pasta, o)
    case 'render': return renderFinal(pasta, o)
    case 'registrar': return registrar(pasta, o._[1], o)
    case 'aprendizado': return aprendizado(o)
    default:
      console.error(`comandos: ${COMANDOS}`)
      return 2
  }
}

principal(process.argv.slice(2)).then((codigo) => { process.exitCode = codigo }, (erro) => {
  console.error(`erro: ${erro.message}`)
  process.exitCode = 1
})
