'use strict'

const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function procurarNoPath (nome, plataforma, executar) {
  try {
    const linhas = executar(plataforma === 'win32' ? 'where' : 'which', [nome], { encoding: 'utf8', windowsHide: true })
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    // Desde o CVE-2024-27980 o Node não roda .cmd nem .bat sem shell: no Windows só serve o .exe.
    if (plataforma === 'win32') return linhas.find((l) => /\.exe$/i.test(l)) || null
    return linhas[0] || null
  } catch {
    return null
  }
}

// O winget põe o programa em WinGet\Links, mas o PATH novo só vale para o terminal aberto depois.
function linksDoWinget (nome, env) {
  const exe = `${nome}.exe`
  return [
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', exe),
    path.win32.join(env.ProgramFiles || 'C:\\Program Files', 'WinGet', 'Links', exe)
  ].filter(Boolean)
}

function acharPrograma (nome, env = process.env, plataforma = process.platform, { existe = fs.existsSync, executar = execFileSync } = {}) {
  const variavel = env[`CORTES_VIRAIS_${nome.toUpperCase().replace(/-/g, '_')}`]
  if (variavel && existe(variavel)) return variavel
  if (plataforma === 'win32') return procurarNoPath(nome, plataforma, executar) || linksDoWinget(nome, env).find((c) => existe(c)) || null
  for (const c of [`/opt/homebrew/bin/${nome}`, `/usr/local/bin/${nome}`, `/usr/bin/${nome}`]) if (existe(c)) return c
  return procurarNoPath(nome, plataforma, executar)
}

function rodar (programa, args, { saida = false } = {}) {
  const r = spawnSync(programa, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  if (r.error) throw new Error(`não consegui rodar ${programa}: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`${programa} falhou (código ${r.status}): ${(r.stderr || '').trim().slice(-800)}`)
  return saida ? r.stdout : r
}

// Build de data (as do Windows, "ffmpeg version 2026-01-02-git-…") é recente: conta como nova.
function lerVersao (texto) {
  const m = /version n?(\d+)\./.exec(String(texto))
  return m ? Number(m[1]) : 99
}

const fracao = (texto) => {
  const [a, b] = String(texto || '0/1').split('/').map(Number)
  return b ? a / b : a
}

// Quadros por segundo de entrega: o da fonte arredondado para os usuais; vídeo de quadro variável
// (celular, gravação de tela) sai a 30.
function fpsDeEntrega (fps) {
  const usuais = [24, 25, 30, 50, 60]
  const perto = usuais.find((u) => Math.abs(u - fps) < 0.6) || (Math.abs(fps - 29.97) < 0.1 ? 30 : null) || (Math.abs(fps - 59.94) < 0.1 ? 60 : null)
  return perto || 30
}

function infoDoVideo (probe) {
  const v = (probe.streams || []).find((s) => s.codec_type === 'video')
  if (!v) throw new Error('o arquivo não tem vídeo')
  const a = (probe.streams || []).find((s) => s.codec_type === 'audio')
  const rotacao = Math.abs(Number((v.tags && v.tags.rotate) || ((v.side_data_list || []).find((d) => d.rotation != null) || {}).rotation || 0)) % 180
  // Pixel não quadrado (HDV, algumas câmeras): o trecho sai em pixel quadrado, na largura de exibição.
  const sar = fracao(v.sample_aspect_ratio && v.sample_aspect_ratio.replace(':', '/'))
  const exibida = sar > 0 && Math.abs(sar - 1) > 0.001 ? Math.trunc((v.width * sar) / 2) * 2 : v.width
  const largura = rotacao === 90 ? v.height : exibida
  const altura = rotacao === 90 ? exibida : v.height
  const real = fracao(v.r_frame_rate)
  const media = fracao(v.avg_frame_rate)
  const variavel = real > 0 && media > 0 && Math.abs(real - media) / real > 0.01
  return {
    duracao: Number(probe.format && probe.format.duration) || Number(v.duration) || 0,
    largura,
    altura,
    fps: Number((media || real).toFixed(3)),
    fpsDeEntrega: variavel ? 30 : fpsDeEntrega(media || real),
    quadroVariavel: variavel,
    audio: Boolean(a),
    codec: v.codec_name,
    sar: sar > 0 ? Number(sar.toFixed(3)) : 1
  }
}

// O fonte.json de antes do pixel quadrado não tem o `sar` e guarda a largura codificada: com o vídeo na
// pasta, a medida se lê de novo. `lerProbe` é null quando o vídeo não está lá.
function fonteAtualizada (fonte, lerProbe) {
  if (fonte.sar != null || !lerProbe) return fonte
  const { largura, altura, sar } = infoDoVideo(lerProbe())
  return { ...fonte, largura, altura, sar }
}

function argsProbe (arquivo) {
  return ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', arquivo]
}

// Partes do vídeo para o Gemini: até 20 min cada, com 1 min de sobra entre elas, para um momento na
// fronteira não se perder.
function partes (duracao, tamanho = 1200, sobra = 60) {
  if (duracao <= tamanho + sobra) return [{ inicio: 0, fim: duracao }]
  const lista = []
  for (let inicio = 0; inicio < duracao; inicio += tamanho - sobra) {
    const fim = Math.min(duracao, inicio + tamanho)
    lista.push({ inicio, fim })
    if (fim >= duracao) break
  }
  return lista
}

function argsAudio (fonte, destino) {
  return ['-y', '-loglevel', 'error', '-i', fonte, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '48k', destino]
}

// 360p a 2 quadros por segundo basta para o Gemini ver expressão, gesto e o que aparece na tela.
function argsCopiaLeve (fonte, inicio, fim, destino) {
  return ['-y', '-loglevel', 'error', '-ss', inicio.toFixed(3), '-i', fonte, '-t', (fim - inicio).toFixed(3),
    '-vf', 'fps=2,scale=-2:360', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ac', '1', '-b:a', '48k', '-movflags', '+faststart', destino]
}

function argsQuadros (fonte, inicio, fim, fps, padrao) {
  return ['-y', '-loglevel', 'error', '-ss', inicio.toFixed(3), '-i', fonte, '-t', (fim - inicio).toFixed(3),
    '-vf', `fps=${fps},scale=640:-2`, '-q:v', '4', padrao]
}

// A troca de câmera da fonte, que o enquadramento usa como fronteira de tomada.
function argsCortesDeCena (fonte, inicio, fim, limiar = 0.3) {
  return ['-hide_banner', '-nostats', '-ss', inicio.toFixed(3), '-i', fonte, '-t', (fim - inicio).toFixed(3), '-an',
    '-vf', `scale=320:-2,select='gt(scene,${limiar})',showinfo`, '-f', 'null', '-']
}

function lerCortesDeCena (stderr, inicio, fim) {
  return [...String(stderr).matchAll(/pts_time:([\d.]+)/g)]
    .map((m) => Number((inicio + Number(m[1])).toFixed(3)))
    .filter((t) => t > inicio && t < fim)
}

// Sem achar o ffmpeg, o yt-dlp não junta vídeo e áudio e cai calado no arquivo único, de baixa
// resolução; e o YouTube exige um runtime de JavaScript, que pode ser o próprio Node da skill.
function argsYtDlp (url, destino, { ffmpeg = null, node = null } = {}) {
  return ['-f', 'bv*[height<=2160]+ba/b', '--merge-output-format', 'mp4', '--no-playlist', '--retries', '10',
    '--fragment-retries', '10',
    ...(ffmpeg ? ['--ffmpeg-location', ffmpeg] : []),
    ...(node ? ['--js-runtimes', `node:${node}`] : []),
    '-o', destino, url]
}

// O yt-dlp continua um download interrompido (o .part) e não baixa de novo o que já tem; o
// --force-overwrites desligaria isso. O vídeo de outro link sai antes, e o link fica anotado antes de baixar.
function prepararDownload (pasta, url) {
  const anotado = path.join(pasta, '.fonte-url')
  const anterior = fs.existsSync(anotado) ? fs.readFileSync(anotado, 'utf8').trim() : null
  if (anterior !== url) {
    for (const a of fs.readdirSync(pasta)) if (a.startsWith('fonte.mp4') || /^fonte\.f\d+\./.test(a)) fs.rmSync(path.join(pasta, a), { force: true })
  }
  fs.writeFileSync(anotado, url)
}

module.exports = { acharPrograma, rodar, lerVersao, infoDoVideo, fonteAtualizada, fpsDeEntrega, argsProbe, partes, argsAudio, argsCopiaLeve, argsQuadros, argsCortesDeCena, lerCortesDeCena, argsYtDlp, prepararDownload }
