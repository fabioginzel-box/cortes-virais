'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const marca = require('./marca')

const pastaTemporaria = () => fs.mkdtempSync(path.join(os.tmpdir(), 'marca-'))

test('resolver sem nada usa o estilo clássico', () => {
  const m = marca.resolver({})
  assert.equal(m.estilo, 'classico')
  assert.equal(m.fonte, 'montserrat')
})

test('resolver mantém do estilo o que a pessoa não trocou', () => {
  const m = marca.resolver({ estilo: 'impacto', legenda: { texto: '#EEEEEE' } })
  assert.equal(m.legenda.texto, '#EEEEEE')
  assert.equal(m.legenda.ativa.texto, '#B6FF3B')
})

test('resolver troca a lista do degradê inteira, sem misturar com a do estilo', () => {
  const m = marca.resolver({ estilo: 'marca', legenda: { ativa: { fundo: ['#111111'] } } })
  assert.deepEqual(m.legenda.ativa.fundo, ['#111111'])
})

test('resolver aceita contorno nulo para tirar o contorno', () => {
  const m = marca.resolver({ legenda: { contorno: null } })
  assert.equal(m.legenda.contorno, null)
})

test('resolver recusa estilo que não existe', () => {
  assert.throws(() => marca.resolver({ estilo: 'neon' }), /o estilo "neon" não existe/)
})

test('resolver tira as cores do cartão do card quando a pessoa não diz', () => {
  const m = marca.resolver({ estilo: 'marca' })
  assert.equal(m.finalizacao.cartao.cores.botao, '#7C3AED')
})

test('resolver começa sem finalização', () => {
  assert.equal(marca.resolver({}).finalizacao.modo, 'nenhuma')
})

test('o estilo clássico não tem problema', () => {
  assert.deepEqual(marca.problemas(marca.resolver({ estilo: 'classico' })), [])
})

test('o estilo marca não tem problema', () => {
  assert.deepEqual(marca.problemas(marca.resolver({ estilo: 'marca' })), [])
})

test('o estilo impacto não tem problema', () => {
  assert.deepEqual(marca.problemas(marca.resolver({ estilo: 'impacto' })), [])
})

test('problemas acusa cor que não é hexadecimal', () => {
  const p = marca.problemas(marca.resolver({ legenda: { texto: 'branco' } }))
  assert.match(p.join('\n'), /legenda\.texto: "branco" não é uma cor/)
})

test('problemas acusa degradê com três cores', () => {
  const p = marca.problemas(marca.resolver({ legenda: { ativa: { estilo: 'fundo', fundo: ['#000', '#111', '#222'] } } }))
  assert.match(p.join('\n'), /legenda\.ativa\.fundo: uma cor, ou duas/)
})

test('problemas acusa tamanho fora de P, M e G', () => {
  const p = marca.problemas(marca.resolver({ legenda: { tamanho: 'XL' } }))
  assert.match(p.join('\n'), /legenda\.tamanho: P, M ou G/)
})

test('problemas acusa fonte própria que não existe', () => {
  const p = marca.problemas(marca.resolver({ fonte: 'MinhaFonte.ttf' }, pastaTemporaria()))
  assert.match(p.join('\n'), /fonte: não achei/)
})

test('problemas aceita fonte própria que existe na pasta do canal', () => {
  const dir = pastaTemporaria()
  fs.writeFileSync(path.join(dir, 'MinhaFonte.ttf'), 'x')
  assert.deepEqual(marca.problemas(marca.resolver({ fonte: 'MinhaFonte.ttf' }, dir)), [])
})

test('problemas recusa fonte com extensão que não é de fonte', () => {
  const p = marca.problemas(marca.resolver({ fonte: 'logo.png' }, pastaTemporaria()))
  assert.match(p.join('\n'), /fonte: "logo\.png" tem de ser \.ttf/)
})

test('problemas acusa modo de finalização que não existe', () => {
  const p = marca.problemas(marca.resolver({ finalizacao: { modo: 'porta' } }))
  assert.match(p.join('\n'), /finalizacao\.modo: use nenhuma, cartao, video/)
})

test('problemas pede o arquivo no modo vídeo', () => {
  const p = marca.problemas(marca.resolver({ finalizacao: { modo: 'video' } }))
  assert.match(p.join('\n'), /finalizacao\.video\.arquivo/)
})

test('problemas acusa título do cartão longo demais', () => {
  const p = marca.problemas(marca.resolver({ finalizacao: { modo: 'cartao', cartao: { titulo: 'x'.repeat(29) } } }))
  assert.match(p.join('\n'), /cartao\.titulo: até 28/)
})

test('problemas acusa duração do cartão fora de 1,5 a 8 s', () => {
  const p = marca.problemas(marca.resolver({ finalizacao: { modo: 'cartao', cartao: { duracao: 12 } } }))
  assert.match(p.join('\n'), /cartao\.duracao/)
})

test('problemas acusa logo que não existe', () => {
  const p = marca.problemas(marca.resolver({ finalizacao: { modo: 'cartao', cartao: { logo: 'logo.png' } } }, pastaTemporaria()))
  assert.match(p.join('\n'), /cartao\.logo: não achei/)
})

test('avisos acusa pouco contraste na palavra ativa', () => {
  const a = marca.avisos(marca.resolver({ legenda: { ativa: { fundo: ['#FFFFFF'], texto: '#FFFF00' } } }))
  assert.match(a.join('\n'), /palavra ativa tem pouco contraste/)
})

test('avisos lembra da licença da fonte própria', () => {
  const dir = pastaTemporaria()
  fs.writeFileSync(path.join(dir, 'f.otf'), 'x')
  assert.match(marca.avisos(marca.resolver({ fonte: 'f.otf' }, dir)).join('\n'), /licença/)
})

test('contraste de preto com branco é 21', () => {
  assert.equal(Math.round(marca.contraste('#000000', '#FFFFFF')), 21)
})

test('fonteDaMarca acha a fonte embutida na pasta da skill', () => {
  const f = marca.fonteDaMarca(marca.resolver({ estilo: 'impacto' }))
  assert.equal(path.basename(f.arquivo), 'Anton-Regular.ttf')
  assert.equal(fs.existsSync(f.arquivo), true)
})

test('temaDaLegenda faz o degradê com duas cores', () => {
  const t = marca.temaDaLegenda(marca.resolver({ estilo: 'marca' }))
  assert.equal(t.cores.ativaFundo, 'linear-gradient(135deg, #7C3AED, #DB2777)')
})

test('temaDaLegenda deixa o contorno transparente quando ele é nulo', () => {
  const t = marca.temaDaLegenda(marca.resolver({ estilo: 'marca' }))
  assert.equal(t.contorno, false)
  assert.equal(t.cores.contorno, 'transparent')
})

test('temaDaLegenda leva o tamanho G', () => {
  assert.deepEqual(marca.temaDaLegenda(marca.resolver({ estilo: 'impacto' })).tamanho, { maximo: 108, minimo: 70 })
})

test('impressao muda quando muda a cor', () => {
  const a = JSON.stringify(marca.impressao(marca.resolver({})))
  const b = JSON.stringify(marca.impressao(marca.resolver({ legenda: { texto: '#EEEEEE' } })))
  assert.notEqual(a, b)
})
