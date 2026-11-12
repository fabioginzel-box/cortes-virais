'use strict'

// Só a entrega tem perda visível: o trecho sai em CRF 10 e o recorte em CRF 12, e recodificar com perda a
// cada passo borraria o corte.

const { par } = require('./numeros')

const ENTREGA = { largura: 1080, altura: 1920 }
const PREVIA = { largura: 360, altura: 640 }
const MARGEM_DO_TRECHO = 0.5
const FADE = 0.012
const ZOOM_DE_IMPACTO = 1.12
const OLHOS_NA_ALTURA = 0.38
const LOUDNORM = 'I=-14:TP=-1.5:LRA=11'

const n3 = (x) => Number(x.toFixed(3))

function argsTrecho (fonte, inicio, fim, fps, destino) {
  const de = Math.max(0, inicio - MARGEM_DO_TRECHO)
  return {
    deslocamento: n3(de),
    args: ['-y', '-loglevel', 'error', '-ss', de.toFixed(3), '-i', fonte, '-t', (fim + MARGEM_DO_TRECHO - de).toFixed(3),
      '-map', '0:v:0', '-map', '0:a:0?', '-vf', `fps=${fps}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10',
      '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', destino]
  }
}

// O mesmo pedaço da fonte pode estar em dois trechos (a abertura que repete uma fala): a busca anda em ordem.
function trechoDeCada (mantidos, trechos) {
  let k = 0
  return mantidos.map(([a, b]) => {
    while (k < trechos.length && !(a >= trechos[k].inicio - 0.001 && b <= trechos[k].fim + 0.001)) k++
    if (k >= trechos.length) throw new Error(`o pedaço ${a}–${b} não cabe em nenhum trecho`)
    return k
  })
}

function fatias (pl, impactos) {
  const marcos = [pl.de, pl.ate, ...impactos.flatMap((i) => [i.de, i.ate])].filter((t) => t >= pl.de && t <= pl.ate).sort((a, b) => a - b)
  const lista = []
  for (let i = 0; i < marcos.length - 1; i++) {
    const [de, ate] = [marcos[i], marcos[i + 1]]
    if (ate - de < 0.001) continue
    const meio = (de + ate) / 2
    const zoom = pl.tipo === 'rosto' && impactos.some((x) => meio >= x.de && meio < x.ate) ? ZOOM_DE_IMPACTO : 1
    lista.push({ de, ate, zoom })
  }
  return lista
}

// Cada mantido cortado nas fronteiras dos planos e das frases de impacto, em quadros inteiros: vídeo e
// áudio de cada pedaço têm a mesma duração, e as emendas não acumulam atraso na fala.
function pedacos (plano, enquadramento, deslocamentos, impactos = [], fps = 30) {
  const k = trechoDeCada(plano.mantidos, plano.trechos)
  const segmentos = enquadramento.planos.flatMap((pl) => fatias(pl, impactos).map((f) => ({ ...f, plano: pl })))
  const lista = []
  let editado = 0
  plano.mantidos.forEach(([a, b], m) => {
    const fimEditado = editado + (b - a)
    for (const sg of segmentos) {
      const de = Math.max(editado, sg.de)
      const ate = Math.min(fimEditado, sg.ate)
      if (ate <= de) continue
      const q0 = Math.round(de * fps)
      const quadros = Math.round(ate * fps) - q0
      if (quadros <= 0) continue
      const inicio = Math.round((a - deslocamentos[k[m]] + (de - editado)) * fps)
      lista.push({ entrada: k[m], inicio, quadros, fps, de: n3(inicio / fps), ate: n3((inicio + quadros) / fps), editado: n3(q0 / fps), plano: sg.plano, zoom: sg.zoom })
    }
    editado = fimEditado
  })
  return lista
}

const duracaoDosPedacos = (lista) => lista.reduce((t, pd) => t + pd.quadros, 0) / ((lista[0] && lista[0].fps) || 30)

function termosDeX (chaves, desloc) {
  const ks = chaves.map(([t, x]) => [n3(t - desloc), x])
  const termos = [`lt(t,${ks[0][0]})*${ks[0][1]}`]
  for (let i = 0; i < ks.length - 1; i++) {
    const [t0, x0] = ks[i]
    const [t1, x1] = ks[i + 1]
    const inclinacao = n3((x1 - x0) / Math.max(0.001, t1 - t0))
    termos.push(`gte(t,${t0})*lt(t,${t1})*(${x0}+(t-${t0})*${inclinacao})`)
  }
  const [tn, xn] = ks[ks.length - 1]
  termos.push(`gte(t,${tn})*${xn}`)
  return termos.join('+')
}

function expressaoX (chaves, desloc) {
  return `'${termosDeX(chaves, desloc)}'`
}

// O zoom de impacto aperta o recorte em volta do mesmo centro e mantém os olhos na mesma altura.
function recorteDoPedaco (pd) {
  const pl = pd.plano
  const zoom = pd.zoom || 1
  const w = zoom > 1 ? par(pl.w / zoom) : pl.w
  const h = zoom > 1 ? par(pl.h / zoom) : pl.h
  const dx = Math.round((pl.w - w) / 2)
  const y = pl.y + Math.round(OLHOS_NA_ALTURA * (pl.h - h))
  const x = pl.xs ? `'(${termosDeX(pl.xs, pd.editado - pl.de)})+${dx}'` : pl.x + dx
  return `crop=${w}:${h}:${x}:${y}`
}

function cadeiaDoPlano (pd, j, saida) {
  const { largura: W, altura: H } = saida
  const pl = pd.plano
  if (pl.tipo === 'dividido') {
    const c = pl.cima
    const b = pl.baixo
    return `split=2[v${j}a][v${j}b];` +
      `[v${j}a]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W}:${H / 2}:flags=lanczos,setsar=1[v${j}c];` +
      `[v${j}b]crop=${b.w}:${b.h}:${b.x}:${b.y},scale=${W}:${H / 2}:flags=lanczos,setsar=1[v${j}d];` +
      `[v${j}c][v${j}d]vstack=inputs=2`
  }
  if (pl.tipo === 'tela') {
    return `split=2[v${j}a][v${j}b];` +
      `[v${j}a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=40,eq=brightness=-0.12[v${j}c];` +
      `[v${j}b]scale=${W}:-2:flags=lanczos[v${j}d];` +
      `[v${j}c][v${j}d]overlay=(W-w)/2:(H-h)/2,setsar=1`
  }
  return `${recorteDoPedaco(pd)},scale=${W}:${H}:flags=lanczos,setsar=1`
}

// Com o realce, o recorte fica na resolução nativa do rosto, para a Topaz ampliar a partir dela.
function telaDoRealce (enquadramento, info) {
  const alturas = enquadramento.planos.filter((p) => p.tipo === 'rosto').map((p) => p.h)
  const altura = Math.floor(Math.min(ENTREGA.altura, info.altura, ...alturas) / 4) * 4
  return { largura: par(altura * 9 / 16), altura }
}

const n6 = (x) => Number(x.toFixed(6))

// O vídeo é escolhido por tempo com meia folga de quadro, para não depender de onde o primeiro quadro do
// trecho caiu; o áudio, pelo mesmo intervalo exato.
function filtroDoRecorte (lista, saida = ENTREGA) {
  const partes = []
  lista.forEach((pd, j) => {
    const q = 1 / pd.fps
    const dur = n3(pd.quadros * q)
    partes.push(`[${pd.entrada}:v]trim=start=${n6(Math.max(0, (pd.inicio - 0.5) * q))}:end=${n6((pd.inicio + pd.quadros - 0.5) * q)},setpts=PTS-STARTPTS,${cadeiaDoPlano(pd, j, saida)}[v${j}]`)
    partes.push(`[${pd.entrada}:a]atrim=start=${n6(pd.inicio * q)}:end=${n6((pd.inicio + pd.quadros) * q)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=${FADE},afade=t=out:st=${n3(Math.max(0, dur - FADE))}:d=${FADE}[a${j}]`)
  })
  partes.push(`${lista.map((_, j) => `[v${j}][a${j}]`).join('')}concat=n=${lista.length}:v=1:a=1[v][a]`)
  return partes.join(';\n')
}

// O filtro vai por arquivo: na linha de comando ele passaria do limite de 32 mil caracteres do Windows.
// O ffmpeg 7 trocou o -filter_complex_script pelo -/filter_complex, e o 9 tirou o antigo.
function argsRecorte (entradas, arquivoDoFiltro, fps, destino, versao = 99) {
  const filtro = versao >= 7 ? ['-/filter_complex', arquivoDoFiltro] : ['-filter_complex_script', arquivoDoFiltro]
  return ['-y', '-loglevel', 'error', ...entradas.flatMap((e) => ['-i', e]), ...filtro,
    '-map', '[v]', '-map', '[a]', '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p',
    '-c:a', 'pcm_s16le', '-ar', '48000', destino]
}

function argsMedirVolume (arquivo) {
  return ['-hide_banner', '-nostats', '-i', arquivo, '-vn', '-af', `loudnorm=${LOUDNORM}:print_format=json`, '-f', 'null', '-']
}

function lerMedida (stderr) {
  const blocos = String(stderr).match(/\{[^{}]*"input_i"[^{}]*\}/g)
  if (!blocos) throw new Error('o ffmpeg não devolveu a medida do volume')
  const m = JSON.parse(blocos[blocos.length - 1])
  return { I: m.input_i, TP: m.input_tp, LRA: m.input_lra, limiar: m.input_thresh, ajuste: m.target_offset }
}

function filtroDoVolume (medida) {
  if (!medida || !Number.isFinite(Number(medida.I))) return `loudnorm=${LOUDNORM}`
  return `loudnorm=${LOUDNORM}:measured_I=${medida.I}:measured_TP=${medida.TP}:measured_LRA=${medida.LRA}` +
    `:measured_thresh=${medida.limiar}:offset=${medida.ajuste}:linear=true`
}

const ms = (s) => Math.round(s * 1000)

// A finalização entra com uma fusão sobre os últimos `fusao` segundos do corte; o vídeo publicado tem o
// corte até ali e a finalização inteira.
const duracaoComFinalizacao = (duracao, final) => (final ? n3(duracao - final.fusao + final.duracao) : duracao)

// `video` é o recorte ou o realce dele; o áudio vem sempre do recorte.
function argsAcabamento ({ video, audio, overlay, medida, fps, destino, previa = false, final = null, duracao = null }) {
  const { largura: W, altura: H } = previa ? PREVIA : ENTREGA
  const entradas = ['-i', video]
  const mesmoArquivo = audio === video
  if (!mesmoArquivo) entradas.push('-i', audio)
  if (overlay) entradas.push('-i', overlay)
  const iAudio = mesmoArquivo ? 0 : 1
  const iOverlay = mesmoArquivo ? 1 : 2
  const comFinal = Boolean(final && duracao)
  const [rv, ra] = duracao ? ['corte', 'som'] : ['v', 'a']
  const filtros = [`[0:v]scale=${W}:${H}:flags=lanczos,setsar=1[base]`]
  if (overlay) {
    filtros.push(`[${iOverlay}:v]scale=${W}:${H}:flags=lanczos[ov]`)
    filtros.push(`[base][ov]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[${rv}]`)
  } else {
    filtros.push(`[base]format=yuv420p[${rv}]`)
  }
  filtros.push(`[${iAudio}:a]${filtroDoVolume(previa ? null : medida)},aresample=48000[${ra}]`)
  if (comFinal) {
    const iFinal = entradas.filter((e) => e === '-i').length
    // Os PNGs do cartão podem misturar RGBA e RGB; reconfigurar o grafo nessa troca reinicia o trim.
    if (final.tipo === 'sequencia') entradas.push('-reinit_filter', '0', '-framerate', String(fps), '-i', final.entrada)
    else entradas.push('-i', final.entrada)
    entradas.push('-i', final.som)
    const som = 'aformat=sample_rates=48000:channel_layouts=stereo'
    const quadros = `fps=${fps},settb=AVTB`
    const comeca = n3(Math.max(0, duracao - final.fusao))
    const total = duracaoComFinalizacao(duracao, final)
    filtros.push(`[${rv}]trim=duration=${duracao},setpts=PTS-STARTPTS,${quadros},tpad=stop_mode=clone:stop_duration=${n3(total - duracao + 0.1)}[v1]`)
    filtros.push(`[${ra}]atrim=duration=${duracao},asetpts=PTS-STARTPTS,afade=t=out:st=${comeca}:d=${final.fusao},${som}[a1]`)
    filtros.push(`[${iFinal}:v]scale=${W}:${H}:flags=lanczos,setsar=1,${quadros},format=rgba,fade=t=in:st=0:d=${final.fusao}:alpha=1,setpts=PTS-STARTPTS+${comeca}/TB[v2]`)
    filtros.push(`[${iFinal + 1}:a]${som},adelay=${ms(comeca)}:all=1[a2]`)
    filtros.push(`[v1][v2]overlay=0:0:format=auto:eof_action=pass,trim=duration=${total},format=yuv420p[v]`)
    filtros.push(`[a1][a2]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur=${total},atrim=0:${total}[a]`)
  } else if (duracao) {
    filtros.push(`[${rv}]trim=duration=${duracao},setpts=PTS-STARTPTS[v]`)
    filtros.push(`[${ra}]atrim=duration=${duracao},asetpts=PTS-STARTPTS[a]`)
  }
  // Sem quadros B: com eles, um leitor que ignore a lista de edição do MP4 começa a imagem 2 quadros
  // depois do som.
  const qualidade = previa
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-bf', '0', '-c:a', 'aac', '-b:a', '96k']
    : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-bf', '0', '-profile:v', 'high', '-level:v', '4.2', '-c:a', 'aac', '-b:a', '192k']
  return ['-y', '-loglevel', 'error', ...entradas, '-filter_complex', filtros.join(';'), '-map', '[v]', '-map', '[a]',
    '-r', String(fps), '-pix_fmt', 'yuv420p', ...qualidade, '-ar', '48000', '-shortest', '-map_metadata', '-1', '-movflags', '+faststart', destino]
}

function argsOverlay (listaConcat, fps, destino) {
  return ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listaConcat, '-vf', `fps=${fps},format=rgba`,
    '-c:v', 'png', destino]
}

function argsParaRealce (recorte, destino) {
  return ['-y', '-loglevel', 'error', '-i', recorte, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', destino]
}

function argsQuadroDeConferencia (video, t, destino) {
  return ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', destino]
}

// Três quadros a 30 por segundo; uma folga de 0,3 s já deixou passar um fim cortado em 0,25 s.
const TOLERANCIA_DA_DURACAO = 0.1

function conferirEntrega (probe, duracaoEsperada, previa = false) {
  const v = (probe.streams || []).find((s) => s.codec_type === 'video')
  const a = (probe.streams || []).find((s) => s.codec_type === 'audio')
  const { largura: W, altura: H } = previa ? PREVIA : ENTREGA
  const problemas = []
  if (!v) problemas.push('sem vídeo')
  else {
    if (v.width !== W || v.height !== H) problemas.push(`saiu em ${v.width}×${v.height}, e não ${W}×${H}`)
    if (v.codec_name !== 'h264') problemas.push(`codec ${v.codec_name}, e não h264`)
    if (v.pix_fmt !== 'yuv420p') problemas.push(`pixel ${v.pix_fmt}, e não yuv420p`)
    if (v.has_b_frames > 0) problemas.push('com quadros B: quem ignorar a lista de edição do MP4 começa a imagem atrasada')
  }
  if (!a) problemas.push('sem áudio')
  const dur = Number(probe.format && probe.format.duration)
  if (duracaoEsperada && Math.abs(dur - duracaoEsperada) > TOLERANCIA_DA_DURACAO) problemas.push(`dura ${dur.toFixed(2)} s, e o plano dava ${duracaoEsperada.toFixed(2)} s`)
  return problemas
}

module.exports = {
  ENTREGA,
  argsTrecho, trechoDeCada, pedacos, expressaoX, filtroDoRecorte, telaDoRealce, argsRecorte, argsMedirVolume, lerMedida,
  filtroDoVolume, argsAcabamento, duracaoComFinalizacao, duracaoDosPedacos, argsOverlay, argsParaRealce, argsQuadroDeConferencia, conferirEntrega
}
