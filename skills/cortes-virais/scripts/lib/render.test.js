'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  argsTrecho, trechoDeCada, pedacos, expressaoX, filtroDoRecorte, telaDoRealce, argsRecorte, lerMedida, filtroDoVolume, argsAcabamento, duracaoComFinalizacao, conferirEntrega
} = require('./render')

test('argsTrecho pega meio segundo antes do início e devolve o deslocamento', () => {
  const r = argsTrecho('fonte.mp4', 10, 20, 30, 't.mov')
  assert.equal(r.deslocamento, 9.5)
  assert.deepEqual(r.args.slice(r.args.indexOf('-ss'), r.args.indexOf('-ss') + 6), ['-ss', '9.500', '-i', 'fonte.mp4', '-t', '11.000'])
})

test('argsTrecho não pede tempo negativo no começo do vídeo', () => {
  assert.equal(argsTrecho('f.mp4', 0.2, 5, 30, 't.mov').deslocamento, 0)
})

test('trechoDeCada acha o trecho de cada pedaço na ordem em que tocam', () => {
  const trechos = [{ inicio: 50, fim: 55 }, { inicio: 40, fim: 60 }]
  assert.deepEqual(trechoDeCada([[50, 55], [40, 45], [50, 55]], trechos), [0, 1, 1])
})

test('pedacos corta o mantido na troca de plano e leva o tempo para o arquivo do trecho', () => {
  const plano = { mantidos: [[10, 20]], trechos: [{ inicio: 10, fim: 20 }] }
  const enq = { planos: [{ de: 0, ate: 4, tipo: 'rosto' }, { de: 4, ate: 10, tipo: 'rosto' }] }
  const lista = pedacos(plano, enq, [9.5], [], 30)
  assert.deepEqual(lista.map((p) => [p.de, p.ate, p.editado]), [[0.5, 4.5, 0], [4.5, 10.5, 4]])
})

test('pedacos segue a ordem dos mantidos de trechos diferentes', () => {
  const plano = { mantidos: [[100, 102], [10, 15]], trechos: [{ inicio: 100, fim: 102 }, { inicio: 10, fim: 15 }] }
  const lista = pedacos(plano, { planos: [{ de: 0, ate: 7, tipo: 'tela' }] }, [99.5, 9.5], [], 30)
  assert.deepEqual(lista.map((p) => [p.entrada, p.de, p.editado]), [[0, 0.5, 0], [1, 0.5, 2]])
})

test('pedacos arredonda cada pedaço para quadros inteiros', () => {
  const plano = { mantidos: [[10.013, 11.027], [12.051, 13.004]], trechos: [{ inicio: 10, fim: 14 }] }
  const lista = pedacos(plano, { planos: [{ de: 0, ate: 5, tipo: 'tela' }] }, [9.5], [], 30)
  assert.deepEqual(lista.map((p) => Number.isInteger(p.quadros) && Number.isInteger(p.inicio)), [true, true])
})

test('pedacos soma os quadros da duração do plano, sem acumular sobra a cada emenda', () => {
  const mantidos = Array.from({ length: 50 }, (_, i) => [10 + i * 1.237, 10 + i * 1.237 + 0.611])
  const plano = { mantidos, trechos: [{ inicio: 10, fim: 80 }] }
  const lista = pedacos(plano, { planos: [{ de: 0, ate: 40, tipo: 'tela' }] }, [9.5], [], 30)
  const doPlano = mantidos.reduce((t, [a, b]) => t + b - a, 0)
  const dosPedacos = lista.reduce((t, pd) => t + pd.quadros, 0) / 30
  assert.ok(Math.abs(dosPedacos - doPlano) <= 1 / 60)
})

test('pedacos começa cada pedaço no quadro em que o anterior acabou, na linha editada', () => {
  const plano = { mantidos: [[10.013, 11.027], [12.051, 13.004]], trechos: [{ inicio: 10, fim: 14 }] }
  const [a, b] = pedacos(plano, { planos: [{ de: 0, ate: 5, tipo: 'tela' }] }, [9.5], [], 30)
  assert.equal(Math.round(b.editado * 30), Math.round(a.editado * 30) + a.quadros)
})

test('expressaoX interpola entre as chaves no tempo do pedaço', () => {
  assert.equal(expressaoX([[0, 100], [2, 300]], 0), "'lt(t,0)*100+gte(t,0)*lt(t,2)*(100+(t-0)*100)+gte(t,2)*300'")
})

test('expressaoX desloca as chaves quando o pedaço começa no meio do plano', () => {
  assert.match(expressaoX([[0, 100], [2, 300]], 1), /lt\(t,-1\)\*100/)
})

const pedaco = (extra) => ({ entrada: 0, inicio: 15, quadros: 60, fps: 30, editado: 0, plano: { tipo: 'tela' }, ...extra })

test('filtroDoRecorte escolhe os quadros do pedaço com meia folga de quadro', () => {
  const f = filtroDoRecorte([pedaco({ plano: { tipo: 'rosto', w: 608, h: 1080, x: 600, y: 0 } })])
  assert.match(f, /\[0:v\]trim=start=0\.483333:end=2\.483333,setpts=PTS-STARTPTS,crop=608:1080:600:0,scale=1080:1920/)
})

test('filtroDoRecorte corta o áudio no mesmo intervalo exato dos quadros', () => {
  assert.match(filtroDoRecorte([pedaco()]), /\[0:a\]atrim=start=0\.5:end=2\.5,/)
})

test('filtroDoRecorte emenda os pedaços com áudio e vídeo', () => {
  const f = filtroDoRecorte([pedaco(), pedaco({ inicio: 90, editado: 2 })])
  assert.match(f, /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[v\]\[a\]$/)
})

test('filtroDoRecorte empilha os dois rostos na tela dividida', () => {
  const pl = { tipo: 'dividido', cima: { w: 900, h: 800, x: 0, y: 0 }, baixo: { w: 900, h: 800, x: 1000, y: 0 } }
  assert.match(filtroDoRecorte([pedaco({ plano: pl })]), /scale=1080:960.*vstack=inputs=2/s)
})

test('filtroDoRecorte põe a tela inteira sobre o fundo desfocado quando não há rosto', () => {
  assert.match(filtroDoRecorte([pedaco()]), /gblur=sigma=40/)
})

test('filtroDoRecorte suaviza o áudio em cada emenda', () => {
  assert.match(filtroDoRecorte([pedaco()]), /afade=t=in:st=0:d=0\.012,afade=t=out:st=1\.988:d=0\.012/)
})

test('filtroDoRecorte não pede tempo negativo no primeiro quadro do trecho', () => {
  assert.match(filtroDoRecorte([pedaco({ inicio: 0 })]), /trim=start=0:end=/)
})

test('lerMedida pega o último bloco do loudnorm', () => {
  const stderr = '[Parsed_loudnorm_0]\n{\n"input_i" : "-23.10",\n"input_tp" : "-4.00",\n"input_lra" : "6.10",\n"input_thresh" : "-33.40",\n"target_offset" : "0.30"\n}'
  assert.deepEqual(lerMedida(stderr), { I: '-23.10', TP: '-4.00', LRA: '6.10', limiar: '-33.40', ajuste: '0.30' })
})

test('filtroDoVolume aplica a medida em modo linear', () => {
  assert.match(filtroDoVolume({ I: '-23', TP: '-4', LRA: '6', limiar: '-33', ajuste: '0.3' }), /measured_I=-23:.*linear=true/)
})

test('argsAcabamento usa o mesmo arquivo para vídeo e áudio sem abrir duas vezes', () => {
  const args = argsAcabamento({ video: 'r.mov', audio: 'r.mov', overlay: 'o.mov', fps: 30, destino: 'f.mp4' })
  assert.deepEqual(args.filter((a, i) => args[i - 1] === '-i'), ['r.mov', 'o.mov'])
})

test('argsAcabamento sai em 360×640 na prévia', () => {
  const args = argsAcabamento({ video: 'r.mov', audio: 'r.mov', overlay: null, fps: 30, destino: 'p.mp4', previa: true })
  assert.match(args[args.indexOf('-filter_complex') + 1], /scale=360:640/)
})

const cartao = { tipo: 'sequencia', entrada: 'cartao/q%04d.png', som: 'cartao/som.wav', duracao: 2.75, fusao: 0.25 }
const assinatura = { tipo: 'video', entrada: 'assinatura.mov', som: 'som.wav', duracao: 4, fusao: 0.25 }
const comFinal = (final = cartao) => argsAcabamento({ video: 'r.mov', audio: 'r.mov', overlay: 'o.mov', fps: 30, destino: 'f.mp4', final, duracao: 43.2 })
const filtroComFinal = (final) => { const args = comFinal(final); return args[args.indexOf('-filter_complex') + 1] }

test('argsAcabamento com a finalização a põe por cima dos últimos quadros do corte', () => {
  assert.match(filtroComFinal(), /setpts=PTS-STARTPTS\+42\.95\/TB\[v2\]/)
})

test('argsAcabamento com a finalização faz a fusão pela transparência', () => {
  assert.match(filtroComFinal(), /format=rgba,fade=t=in:st=0:d=0\.25:alpha=1/)
})

test('argsAcabamento com a finalização segura o último quadro do corte por baixo dela', () => {
  assert.match(filtroComFinal(), /tpad=stop_mode=clone:stop_duration=2\.6\[v1\]/)
})

test('argsAcabamento com a finalização corta a imagem no fim dela', () => {
  assert.match(filtroComFinal(), /\[v1\]\[v2\]overlay=0:0:format=auto:eof_action=pass,trim=duration=45\.7,/)
})

test('argsAcabamento com o cartão lê os quadros sem reconfigurar o grafo', () => {
  const args = comFinal()
  assert.deepEqual(args.slice(args.indexOf('-reinit_filter'), args.indexOf('-reinit_filter') + 5), ['-reinit_filter', '0', '-framerate', '30', '-i'])
})

test('argsAcabamento com o vídeo de assinatura lê o arquivo sem -framerate', () => {
  assert.equal(comFinal(assinatura).includes('-framerate'), false)
})

test('argsAcabamento com a finalização mistura o som dela a partir da fusão', () => {
  assert.match(filtroComFinal(), /\[3:a\]aformat=sample_rates=48000:channel_layouts=stereo,adelay=42950:all=1\[a2\]/)
})

test('argsAcabamento com a finalização junta as duas falas sem normalizar', () => {
  assert.match(filtroComFinal(), /\[a1\]\[a2\]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur=45\.7,atrim=0:45\.7\[a\]/)
})

test('argsAcabamento com a finalização esmaece a fala do corte durante a fusão', () => {
  assert.match(filtroComFinal(), /atrim=duration=43\.2,asetpts=PTS-STARTPTS,afade=t=out:st=42\.95:d=0\.25/)
})

test('argsAcabamento com a finalização lê os quadros e o som dela', () => {
  const args = comFinal()
  assert.deepEqual(args.filter((a, i) => args[i - 1] === '-i'), ['r.mov', 'o.mov', 'cartao/q%04d.png', 'cartao/som.wav'])
})

test('duracaoComFinalizacao soma a finalização menos a fusão', () => {
  assert.equal(duracaoComFinalizacao(43.2, cartao), 45.7)
})

test('duracaoComFinalizacao sem finalização é a duração do corte', () => {
  assert.equal(duracaoComFinalizacao(43.2, null), 43.2)
})

test('argsAcabamento sem finalização corta o vídeo e o som na duração do plano', () => {
  const args = argsAcabamento({ video: 'r.mov', audio: 'r.mov', overlay: 'o.mov', fps: 30, destino: 'f.mp4', duracao: 43.2 })
  assert.match(args[args.indexOf('-filter_complex') + 1], /\[corte\]trim=duration=43\.2,setpts=PTS-STARTPTS\[v\];\[som\]atrim=duration=43\.2/)
})

test('argsAcabamento sem finalização não junta nada', () => {
  const args = argsAcabamento({ video: 'r.mov', audio: 'r.mov', overlay: 'o.mov', fps: 30, destino: 'f.mp4' })
  assert.doesNotMatch(args[args.indexOf('-filter_complex') + 1], /concat/)
})

test('argsAcabamento entrega sem quadros B', () => {
  const args = argsAcabamento({ video: 'r.mov', audio: 'r.mov', overlay: 'o.mov', fps: 30, destino: 'f.mp4' })
  assert.equal(args[args.indexOf('-bf') + 1], '0')
})

test('argsAcabamento tira os metadados herdados do realce', () => {
  const args = argsAcabamento({ video: 'r.mov', audio: 'r.mov', overlay: 'o.mov', fps: 30, destino: 'f.mp4' })
  assert.equal(args[args.indexOf('-map_metadata') + 1], '-1')
})

test('conferirEntrega aponta o vídeo com quadros B', () => {
  const probe = { streams: [{ codec_type: 'video', width: 1080, height: 1920, codec_name: 'h264', pix_fmt: 'yuv420p', has_b_frames: 2 }, { codec_type: 'audio' }], format: { duration: '30' } }
  assert.deepEqual(conferirEntrega(probe, 30), ['com quadros B: quem ignorar a lista de edição do MP4 começa a imagem atrasada'])
})

test('conferirEntrega aponta a medida errada', () => {
  const probe = { streams: [{ codec_type: 'video', width: 720, height: 1280, codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_type: 'audio' }], format: { duration: '30' } }
  assert.deepEqual(conferirEntrega(probe, 30), ['saiu em 720×1280, e não 1080×1920'])
})

test('conferirEntrega aponta o fim cortado em um quarto de segundo', () => {
  const probe = { streams: [{ codec_type: 'video', width: 1080, height: 1920, codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_type: 'audio' }], format: { duration: '35.49' } }
  assert.deepEqual(conferirEntrega(probe, 35.74), ['dura 35.49 s, e o plano dava 35.74 s'])
})

test('conferirEntrega aceita a diferença de um quadro', () => {
  const probe = { streams: [{ codec_type: 'video', width: 1080, height: 1920, codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_type: 'audio' }], format: { duration: '35.766667' } }
  assert.deepEqual(conferirEntrega(probe, 35.74), [])
})

test('conferirEntrega aponta a duração que não bate com o plano', () => {
  const probe = { streams: [{ codec_type: 'video', width: 1080, height: 1920, codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_type: 'audio' }], format: { duration: '31' } }
  assert.equal(conferirEntrega(probe, 30).length, 1)
})

test('pedacos corta na frase de impacto e dá zoom só nela', () => {
  const plano = { mantidos: [[10, 20]], trechos: [{ inicio: 10, fim: 20 }] }
  const enq = { planos: [{ de: 0, ate: 10, tipo: 'rosto', w: 608, h: 1080, x: 600, y: 0 }] }
  const lista = pedacos(plano, enq, [9.5], [{ de: 3, ate: 5 }])
  assert.deepEqual(lista.map((p) => [p.editado, p.zoom]), [[0, 1], [3, 1.12], [5, 1]])
})

test('pedacos não dá zoom de impacto na tela dividida', () => {
  const plano = { mantidos: [[10, 20]], trechos: [{ inicio: 10, fim: 20 }] }
  const enq = { planos: [{ de: 0, ate: 10, tipo: 'dividido', cima: {}, baixo: {} }] }
  assert.ok(pedacos(plano, enq, [9.5], [{ de: 3, ate: 5 }]).every((p) => p.zoom === 1))
})

test('filtroDoRecorte aperta o recorte no zoom de impacto mantendo o centro e a altura dos olhos', () => {
  const f = filtroDoRecorte([{ entrada: 0, de: 0, ate: 1, editado: 0, zoom: 1.12, plano: { tipo: 'rosto', w: 608, h: 1080, x: 600, y: 0 } }])
  assert.match(f, /crop=542:964:633:44,/)
})

test('telaDoRealce usa a altura nativa do recorte do rosto', () => {
  const r = telaDoRealce({ planos: [{ tipo: 'rosto', h: 1080 }, { tipo: 'dividido' }] }, { largura: 1920, altura: 1080 })
  assert.deepEqual(r, { largura: 608, altura: 1080 })
})

test('telaDoRealce limita a altura à da entrega numa fonte 4K', () => {
  const r = telaDoRealce({ planos: [{ tipo: 'tela' }] }, { largura: 3840, altura: 2160 })
  assert.deepEqual(r, { largura: 1080, altura: 1920 })
})

test('argsRecorte passa o filtro por arquivo com a sintaxe do ffmpeg 7 em diante', () => {
  const a = argsRecorte(['t0.mov'], 'filtro.txt', 30, 'r.mov', 9)
  assert.deepEqual(a.slice(a.indexOf('filtro.txt') - 1, a.indexOf('filtro.txt') + 1), ['-/filter_complex', 'filtro.txt'])
})

test('argsRecorte usa o -filter_complex_script no ffmpeg 6', () => {
  assert.ok(argsRecorte(['t0.mov'], 'filtro.txt', 30, 'r.mov', 6).includes('-filter_complex_script'))
})

test('argsTrecho deixa o pixel quadrado antes de recortar', () => {
  const a = argsTrecho('f.mp4', 10, 20, 30, 't.mov').args
  assert.equal(a[a.indexOf('-vf') + 1], 'scale=trunc(iw*sar/2)*2:ih,setsar=1,fps=30')
})

test('pedacos não pula nem repete quadro da fonte na troca de plano dentro de um mantido', () => {
  const plano = { mantidos: [[1.013, 3.013]], trechos: [{ inicio: 1.013, fim: 3.013 }] }
  const [a, b] = pedacos(plano, { planos: [{ de: 0, ate: 0.95, tipo: 'tela' }, { de: 0.95, ate: 2.1, tipo: 'tela' }] }, [0.513], [], 30)
  assert.equal(b.inicio, a.inicio + a.quadros)
})

test('pedacos não pula quadro na troca de plano a 25 quadros por segundo', () => {
  const plano = { mantidos: [[1, 3]], trechos: [{ inicio: 1, fim: 3 }] }
  const [a, b] = pedacos(plano, { planos: [{ de: 0, ate: 0.5, tipo: 'tela' }, { de: 0.5, ate: 2.1, tipo: 'tela' }] }, [0.5], [], 25)
  assert.equal(b.inicio, a.inicio + a.quadros)
})
