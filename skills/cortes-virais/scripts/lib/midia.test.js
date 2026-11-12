'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { infoDoVideo, fpsDeEntrega, partes, argsQuadros, lerVersao, lerCortesDeCena, acharPrograma, argsYtDlp } = require('./midia')

const probe = (v, extra = {}) => ({ streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30000/1001', avg_frame_rate: '30000/1001', ...v }, { codec_type: 'audio' }], format: { duration: '600.5' }, ...extra })

test('infoDoVideo lê medida, duração e quadros por segundo', () => {
  const i = infoDoVideo(probe({}))
  assert.deepEqual([i.largura, i.altura, i.duracao, i.fpsDeEntrega, i.quadroVariavel], [1920, 1080, 600.5, 30, false])
})

test('infoDoVideo troca largura e altura no vídeo girado', () => {
  const i = infoDoVideo(probe({ side_data_list: [{ rotation: -90 }] }))
  assert.deepEqual([i.largura, i.altura], [1080, 1920])
})

test('infoDoVideo marca o quadro variável e entrega a 30', () => {
  const i = infoDoVideo(probe({ r_frame_rate: '60/1', avg_frame_rate: '2997/100' }))
  assert.deepEqual([i.quadroVariavel, i.fpsDeEntrega], [true, 30])
})

test('infoDoVideo recusa arquivo sem vídeo', () => {
  assert.throws(() => infoDoVideo({ streams: [{ codec_type: 'audio' }] }), /não tem vídeo/)
})

test('fpsDeEntrega mantém 25', () => {
  assert.equal(fpsDeEntrega(25), 25)
})

test('fpsDeEntrega arredonda 59,94 para 60', () => {
  assert.equal(fpsDeEntrega(59.94), 60)
})

test('partes não divide o vídeo curto', () => {
  assert.deepEqual(partes(900), [{ inicio: 0, fim: 900 }])
})

test('partes divide o vídeo longo com um minuto de sobra entre as partes', () => {
  assert.deepEqual(partes(3000), [{ inicio: 0, fim: 1200 }, { inicio: 1140, fim: 2340 }, { inicio: 2280, fim: 3000 }])
})

test('argsQuadros tira os quadros do trecho na frequência pedida', () => {
  const a = argsQuadros('f.mp4', 10, 20, 5, 'q%05d.jpg')
  assert.equal(a[a.indexOf('-vf') + 1], 'fps=5,scale=640:-2')
})

test('lerVersao lê a versão do ffmpeg', () => {
  assert.equal(lerVersao('ffmpeg version 9.0.2 Copyright (c) 2000-2026'), 9)
})

test('lerVersao conta a build de data do Windows como nova', () => {
  assert.equal(lerVersao('ffmpeg version 2026-01-02-git-abc123-full_build-www.gyan.dev'), 99)
})

test('lerCortesDeCena leva o tempo do trecho para a fonte', () => {
  const stderr = '[Parsed_showinfo_2] n:0 pts:113 pts_time:3.7863 duration:1\n[Parsed_showinfo_2] n:1 pts:850 pts_time:28.344 duration:1'
  assert.deepEqual(lerCortesDeCena(stderr, 683.2, 774.7), [686.986, 711.544])
})

test('lerCortesDeCena descarta o que passa do fim do trecho', () => {
  assert.deepEqual(lerCortesDeCena('pts_time:116.6', 683.2, 774.7), [])
})

const semNada = () => false
const falha = () => { throw new Error('não achou') }

test('acharPrograma no Windows prefere o .exe ao .cmd que o where devolve antes', () => {
  const executar = () => 'C:\\tools\\yt-dlp.cmd\r\nC:\\Python\\Scripts\\yt-dlp.exe\r\n'
  assert.equal(acharPrograma('yt-dlp', {}, 'win32', { existe: semNada, executar }), 'C:\\Python\\Scripts\\yt-dlp.exe')
})

test('acharPrograma no Windows acha o programa nos links do winget com o PATH ainda velho', () => {
  const link = 'C:\\Users\\ana\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
  const r = acharPrograma('ffmpeg', { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' }, 'win32', { existe: (c) => c === link, executar: falha })
  assert.equal(r, link)
})

test('acharPrograma no Windows ignora o .cmd do PATH e cai nos links do winget', () => {
  const link = 'C:\\Users\\ana\\AppData\\Local\\Microsoft\\WinGet\\Links\\yt-dlp.exe'
  const executar = () => 'C:\\npm\\yt-dlp.cmd\r\n'
  const r = acharPrograma('yt-dlp', { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' }, 'win32', { existe: (c) => c === link, executar })
  assert.equal(r, link)
})

test('acharPrograma usa a variável CORTES_VIRAIS_ antes de procurar', () => {
  const r = acharPrograma('yt-dlp', { CORTES_VIRAIS_YT_DLP: 'D:\\bin\\yt-dlp.exe' }, 'win32', { existe: () => true, executar: falha })
  assert.equal(r, 'D:\\bin\\yt-dlp.exe')
})

test('argsYtDlp passa o ffmpeg e o Node achados para o yt-dlp', () => {
  const a = argsYtDlp('https://youtu.be/x', 'fonte.mp4', { ffmpeg: 'C:\\ff\\ffmpeg.exe', node: 'C:\\node\\node.exe' })
  assert.deepEqual(a.slice(a.indexOf('--ffmpeg-location'), a.indexOf('--ffmpeg-location') + 4),
    ['--ffmpeg-location', 'C:\\ff\\ffmpeg.exe', '--js-runtimes', 'node:C:\\node\\node.exe'])
})

test('argsYtDlp sem programas achados não passa as opções', () => {
  const a = argsYtDlp('https://youtu.be/x', 'fonte.mp4')
  assert.ok(!a.includes('--ffmpeg-location') && !a.includes('--js-runtimes'))
})

test('argsYtDlp sobrescreve o download de outro vídeo na mesma pasta', () => {
  assert.ok(argsYtDlp('https://youtu.be/x', '/p/fonte.mp4').includes('--force-overwrites'))
})

test('infoDoVideo usa a largura de exibição do pixel não quadrado', () => {
  const i = infoDoVideo(probe({ width: 1440, height: 1080, sample_aspect_ratio: '4:3' }))
  assert.deepEqual([i.largura, i.altura], [1920, 1080])
})

test('infoDoVideo ignora o SAR indefinido', () => {
  assert.equal(infoDoVideo(probe({ sample_aspect_ratio: '0:1' })).largura, 1920)
})

test('infoDoVideo arredonda a largura de exibição como o filtro do trecho', () => {
  assert.equal(infoDoVideo(probe({ width: 720, height: 480, sample_aspect_ratio: '32:27' })).largura, 852)
})
