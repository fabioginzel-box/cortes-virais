'use strict'

// O fim de cada corte, pelo marca.json do canal: nenhuma finalização, o cartão (desenhado no Chrome sobre a
// cena do fim do corte) ou o vídeo de assinatura do canal. As duas entram com uma fusão de 0,25 s sobre os
// últimos quadros do corte. Ver docs/adr/0003.

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { abrir } = require('./chrome')
const { hashDe } = require('./pasta')
const { rodar } = require('./midia')
const { gerar, identidade } = require('./arquivo')
const { argsMedirVolume, lerMedida, filtroDoVolume } = require('./render')
const { fonteDaMarca, arquivoDoCanal, impressao } = require('./marca')

const TEMPLATE = path.join(__dirname, '..', '..', 'template', 'cartao.html')
const FUSAO = 0.25
const CENA_ANTES_DO_FIM = 0.1
const ESTEREO = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'

const fixo = (n) => Number(n.toFixed(3))
const nomeDoQuadro = (i) => `q${String(i).padStart(4, '0')}.png`

// Com áudio, o cartão dura o áudio (de 1,5 a 8 s); sem ele, o que o marca.json diz.
function duracaoDoCartao (cartao, duracaoDoAudio = null) {
  if (duracaoDoAudio) return fixo(Math.min(8, Math.max(1.5, duracaoDoAudio)))
  return fixo(Number(cartao.duracao) || 2.5)
}

const quadrosDoCartao = (duracao, fps) => Math.round((FUSAO + duracao) * fps)

const argsQuadroDaCena = (fonte, t, destino) => ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, t)), '-i', fonte, '-frames:v', '1', destino]

const argsDuracao = (arquivo) => ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', arquivo]

function lerDuracao (json) {
  const doc = JSON.parse(json)
  return { duracao: Number(doc.format && doc.format.duration) || 0, audio: (doc.streams || []).some((s) => s.codec_type === 'audio') }
}

function argsSom ({ audio = null, duracao, destino }) {
  if (!audio) return ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(duracao), '-c:a', 'pcm_s16le', destino]
  return ['-y', '-loglevel', 'error', '-i', audio, '-vn', '-af', `${ESTEREO},apad=whole_dur=${duracao},atrim=0:${duracao}`, '-c:a', 'pcm_s16le', destino]
}

// O vídeo que não é vertical entra inteiro na largura, sobre ele mesmo desfocado, como o layout "tela".
const ENCAIXE_VERTICAL = '[0:v]split=2[fundo][frente];' +
  '[fundo]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.12[f];' +
  '[frente]scale=1080:1920:force_original_aspect_ratio=decrease[c];[f][c]overlay=(W-w)/2:(H-h)/2,setsar=1'

function argsVideoDeAssinatura (video, fps, destino) {
  return ['-y', '-loglevel', 'error', '-i', video, '-filter_complex', `${ENCAIXE_VERTICAL},fps=${fps},format=yuv420p[v]`, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', destino]
}

// O som da finalização sai em -14 LUFS como o do corte, medido e aplicado em duas passadas.
function somNormalizado (ffmpeg, { audio, duracao, destino }) {
  return gerar(destino, (tmp) => {
    const bruto = path.join(path.dirname(tmp), `.bruto-${path.basename(tmp)}`)
    rodar(ffmpeg, argsSom({ audio, duracao, destino: bruto }))
    if (!audio) { fs.renameSync(bruto, tmp); return }
    const medida = lerMedida(rodar(ffmpeg, argsMedirVolume(bruto)).stderr)
    rodar(ffmpeg, ['-y', '-loglevel', 'error', '-i', bruto, '-af', `${filtroDoVolume(medida)},${ESTEREO},apad=whole_dur=${duracao},atrim=0:${duracao}`, '-c:a', 'pcm_s16le', tmp])
    fs.rmSync(bruto, { force: true })
  })
}

function dadosDoCartao (marca, cena) {
  const c = marca.finalizacao.cartao
  const fonte = fonteDaMarca(marca)
  const logo = arquivoDoCanal(marca, c.logo)
  return {
    fonte: { url: pathToFileURL(fonte.arquivo).href, peso: fonte.peso },
    cores: c.cores,
    titulo: String(c.titulo || '').trim(),
    botao: String(c.botao || '').trim(),
    apoio: String(c.apoio || '').trim(),
    logo: logo ? pathToFileURL(logo).href : null,
    cena: cena ? pathToFileURL(cena).href : null
  }
}

// Os quadros só mudam até a animação acabar; dali em diante o último se repete como cópia.
async function desenharCartao (pasta, dados, fps, total) {
  fs.mkdirSync(pasta, { recursive: true })
  const pagina = await abrir({ tempoLimite: 60000 })
  try {
    await pagina.tamanho(1080, 1920)
    await pagina.carregar(pathToFileURL(TEMPLATE).href)
    const fim = await pagina.avaliar(`window.CARTAO.pronto(${JSON.stringify(dados)})`)
    const animados = Math.min(total, Math.ceil(fim * fps) + 1)
    for (let i = 0; i < animados; i++) {
      await pagina.avaliar(`window.CARTAO.irPara(${i / fps})`)
      fs.writeFileSync(path.join(pasta, nomeDoQuadro(i)), await pagina.capturar(1080, 1920))
    }
    for (let i = animados; i < total; i++) fs.copyFileSync(path.join(pasta, nomeDoQuadro(animados - 1)), path.join(pasta, nomeDoQuadro(i)))
  } finally {
    await pagina.fechar()
  }
}

async function desenharCartaoParado (marca, cena, destino) {
  const pagina = await abrir({ tempoLimite: 60000 })
  try {
    await pagina.tamanho(1080, 1920)
    await pagina.carregar(pathToFileURL(TEMPLATE).href)
    const fim = await pagina.avaliar(`window.CARTAO.pronto(${JSON.stringify(dadosDoCartao(marca, cena))})`)
    await pagina.avaliar(`window.CARTAO.irPara(${fim + 0.1})`)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, await pagina.capturar(1080, 1920))
    return destino
  } finally {
    await pagina.fechar()
  }
}

function lerDuracaoDe (ffprobe, arquivo) {
  return lerDuracao(rodar(ffprobe, argsDuracao(arquivo), { saida: true }))
}

async function prepararCartao ({ marca, trabalho, fps, ffmpeg, ffprobe, fonte, fim }) {
  const c = marca.finalizacao.cartao
  const audio = arquivoDoCanal(marca, c.audio)
  const duracao = duracaoDoCartao(c, audio ? lerDuracaoDe(ffprobe, audio).duracao : null)
  const instante = fim - CENA_ANTES_DO_FIM
  const cena = gerar(path.join(trabalho, `cena-${hashDe([identidade(fonte), instante])}.png`), (tmp) => rodar(ffmpeg, argsQuadroDaCena(fonte, instante, tmp)))
  const dados = dadosDoCartao(marca, cena)
  const logo = arquivoDoCanal(marca, c.logo)
  const chave = hashDe([fs.readFileSync(TEMPLATE, 'utf8'), impressao(marca), dados, logo && identidade(logo), audio && identidade(audio), fps, duracao])
  const pasta = path.join(trabalho, `cartao-${chave}`)
  const total = quadrosDoCartao(duracao, fps)
  await gerar(path.join(pasta, 'quadros'), (tmp) => desenharCartao(tmp, dados, fps, total))
  const som = somNormalizado(ffmpeg, { audio, duracao, destino: path.join(pasta, 'som.wav') })
  return { tipo: 'sequencia', entrada: path.join(pasta, 'quadros', 'q%04d.png'), som, duracao: fixo(total / fps), fusao: FUSAO }
}

function prepararVideo ({ marca, cache, fps, ffmpeg, ffprobe }) {
  const video = arquivoDoCanal(marca, marca.finalizacao.video.arquivo)
  const pasta = path.join(cache, `assinatura-${hashDe([identidade(video), fps])}`)
  const imagem = gerar(path.join(pasta, 'assinatura.mov'), (tmp) => rodar(ffmpeg, argsVideoDeAssinatura(video, fps, tmp)))
  const original = lerDuracaoDe(ffprobe, video)
  const duracao = fixo(lerDuracaoDe(ffprobe, imagem).duracao)
  const som = somNormalizado(ffmpeg, { audio: original.audio ? video : null, duracao, destino: path.join(pasta, 'som.wav') })
  return { tipo: 'video', entrada: imagem, som, duracao, fusao: FUSAO }
}

// `fim` é o instante, no vídeo de origem, em que o último trecho do corte acaba; `cache` guarda o que
// serve a todos os cortes do vídeo (o vídeo de assinatura convertido).
async function prepararFinalizacao ({ marca, trabalho, cache, fps, ffmpeg, ffprobe, fonte, fim }) {
  const modo = marca.finalizacao.modo
  if (modo === 'cartao') return prepararCartao({ marca, trabalho, fps, ffmpeg, ffprobe, fonte, fim })
  if (modo === 'video') return prepararVideo({ marca, cache, fps, ffmpeg, ffprobe })
  return null
}

module.exports = { FUSAO, ENCAIXE_VERTICAL, duracaoDoCartao, quadrosDoCartao, argsSom, argsVideoDeAssinatura, lerDuracao, dadosDoCartao, prepararFinalizacao, desenharCartaoParado, argsQuadroDaCena }
