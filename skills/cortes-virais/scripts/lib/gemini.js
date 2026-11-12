'use strict'

// O Claude não recebe vídeo: o Gemini assiste e aponta o que a transcrição não mostra.

const { lerTempo, formatarTempo } = require('./transcricao')

const MODELO = 'google/gemini-3.1-pro'
const SINAIS = ['riso', 'reacao', 'energia', 'gesto', 'conflito', 'prova_visual', 'frase_de_efeito', 'historia', 'humor', 'virada']

function prompt (parte, total, indice, quantas) {
  return [
    'Você é editor de cortes virais para YouTube Shorts, Reels e TikTok.',
    `Este vídeo é a parte ${indice + 1} de ${quantas} de uma gravação de ${formatarTempo(total)}; ele começa em ${formatarTempo(parte.inicio)} do original.`,
    'Assista inteiro, com som e imagem, e liste os momentos com mais potencial de virar um corte vertical de 20 a 60 segundos.',
    'Interessa sobretudo o que só se vê ou se ouve: risada, reação de surpresa, mudança de energia na voz, gesto forte, discussão,',
    'silêncio constrangedor, algo mostrado na tela que prova o que se fala, troca rápida entre as pessoas, frase de efeito dita com convicção,',
    'o desfecho de uma história. Não invente: se a parte não tem nada forte, devolva a lista vazia.',
    '',
    'Para cada momento:',
    '- "inicio" e "fim": MM:SS contados do começo DESTE vídeo (não do original), cobrindo o momento inteiro, com a pergunta ou o contexto que o provocou;',
    `- "sinais": lista com um ou mais de ${SINAIS.join(', ')};`,
    '- "intensidade": de 1 a 10, o quanto prende quem está rolando o feed;',
    '- "o_que_acontece": uma frase, em português;',
    '- "frase_chave": a fala mais forte do momento, como foi dita.',
    'Diga também, em "visao_geral", quantas pessoas aparecem ("pessoas"), o formato ("tipo": podcast, entrevista, palestra, tela, vlog ou outro) e o tema em poucas palavras ("tema").',
    '',
    'Até 15 momentos, do mais forte ao mais fraco. Responda só com JSON, sem texto em volta:',
    '{"visao_geral": {"pessoas": 2, "tipo": "podcast", "tema": "..."}, "momentos": [{"inicio": "03:12", "fim": "03:55", "sinais": ["riso"], "intensidade": 8, "o_que_acontece": "...", "frase_chave": "..."}]}'
  ].filter((l) => l !== '').join('\n')
}

function entrada (url, parte, total, indice, quantas) {
  return { prompt: prompt(parte, total, indice, quantas), videos: [url], video_fps: 2, thinking_level: 'high', max_output_tokens: 16384, temperature: 0.4 }
}

function lerJson (texto) {
  const limpo = String(texto).replace(/```(?:json)?/g, '')
  const a = limpo.indexOf('{')
  const b = limpo.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('o Gemini não devolveu JSON')
  return JSON.parse(limpo.slice(a, b + 1))
}

function momentosDaParte (saida, parte) {
  const texto = Array.isArray(saida) ? saida.join('') : String(saida)
  const doc = lerJson(texto)
  const lista = []
  for (const m of doc.momentos || []) {
    let a, b
    try { a = lerTempo(m.inicio); b = lerTempo(m.fim) } catch { continue }
    if (!(b > a)) continue
    lista.push({
      inicio: Number((parte.inicio + a).toFixed(1)),
      fim: Number(Math.min(parte.fim, parte.inicio + b).toFixed(1)),
      sinais: (m.sinais || []).filter((s) => SINAIS.includes(s)),
      intensidade: Math.max(1, Math.min(10, Number(m.intensidade) || 1)),
      o_que_acontece: String(m.o_que_acontece || ''),
      frase_chave: String(m.frase_chave || '')
    })
  }
  return { visaoGeral: doc.visao_geral || null, momentos: lista }
}

// Na sobra entre duas partes o mesmo momento aparece duas vezes: fica o de maior intensidade.
function juntar (listas) {
  const todos = listas.flat().sort((x, y) => y.intensidade - x.intensidade)
  const ficam = []
  for (const m of todos) {
    const igual = ficam.find((f) => Math.min(f.fim, m.fim) - Math.max(f.inicio, m.inicio) > 0.5 * (m.fim - m.inicio))
    if (!igual) ficam.push(m)
  }
  return ficam.sort((x, y) => x.inicio - y.inicio)
}

function textoParaModelo (momentos) {
  return momentos.map((m) => `[${formatarTempo(m.inicio)}–${formatarTempo(m.fim)}] ${m.intensidade}/10 ${m.sinais.join(',')} — ${m.o_que_acontece}${m.frase_chave ? ` "${m.frase_chave}"` : ''}`).join('\n')
}

module.exports = { MODELO, prompt, entrada, momentosDaParte, juntar, textoParaModelo }
