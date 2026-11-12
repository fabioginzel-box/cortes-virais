'use strict'

// Cada corte publicado ganha os números do YouTube Studio uma semana depois; o resumo diz que gancho e
// que duração seguram o público e se a nota da régua acerta.

const fs = require('node:fs')
const path = require('node:path')
const { mediana } = require('./numeros')

const METRICAS = ['visualizacoes', 'retencao', 'continuaram', 'curtidas', 'inscritos']

// O YouTube Studio em português mostra "12.000" e "74,5": o ponto de milhar sai e a vírgula vira ponto.
// Porcentagem não tem milhar: nela, "74.125" é decimal.
const PORCENTAGENS = ['retencao', 'continuaram']
function lerNumero (valor, nome) {
  const texto = String(valor).trim().replace(/%$/, '').replace(/\s/g, '')
  const milhar = !PORCENTAGENS.includes(nome) && /^\d{1,3}(\.\d{3})+$/.test(texto)
  const normal = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : milhar ? texto.replace(/\./g, '') : texto
  const n = Number(normal)
  if (normal === '' || !Number.isFinite(n)) throw new Error(`--${nome} "${valor}" não é um número`)
  return n
}

function linhaDoCorte (corte, pasta, metricas, agora = new Date()) {
  const faltando = ['visualizacoes', 'retencao'].filter((m) => metricas[m] == null)
  if (faltando.length) throw new Error(`faltam ${faltando.join(' e ')}: tire do YouTube Studio, na aba Alcance e Engajamento do Short`)
  const nums = {}
  for (const m of METRICAS) if (metricas[m] != null) nums[m] = lerNumero(metricas[m], m)
  return {
    registrado_em: agora.toISOString(),
    pasta: path.basename(pasta),
    id: corte.id,
    titulo: corte.titulo,
    tipo_gancho: corte.tipo_gancho || 'outro',
    duracao: corte.duracao,
    nota: corte.nota,
    notas: corte.notas,
    layout: corte.layout || null,
    ...(metricas.url ? { url: metricas.url } : {}),
    metricas: nums
  }
}

// Registrar de novo o mesmo corte troca os números, sem contar o corte duas vezes.
function registrar (arquivo, linha) {
  const outras = ler(arquivo).filter((l) => !(l.pasta === linha.pasta && String(l.id) === String(linha.id)))
  fs.mkdirSync(path.dirname(arquivo), { recursive: true })
  fs.writeFileSync(arquivo, [...outras, linha].map((l) => JSON.stringify(l)).join('\n') + '\n')
}

function ler (arquivo) {
  if (!fs.existsSync(arquivo)) return []
  return fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

function faixaDeDuracao (s) {
  if (s <= 30) return 'até 30 s'
  if (s <= 45) return '31 a 45 s'
  if (s <= 60) return '46 a 60 s'
  return 'mais de 60 s'
}

function agrupar (linhas, chave) {
  const grupos = {}
  for (const l of linhas) (grupos[chave(l)] = grupos[chave(l)] || []).push(l)
  return Object.entries(grupos).map(([nome, ls]) => ({
    nome,
    cortes: ls.length,
    visualizacoes: mediana(ls.map((l) => l.metricas.visualizacoes)),
    retencao: mediana(ls.map((l) => l.metricas.retencao)),
    continuaram: mediana(ls.map((l) => l.metricas.continuaram))
  })).sort((a, b) => (b.retencao || 0) - (a.retencao || 0))
}

// Correlação de postos entre a nota do modelo e a retenção: perto de 1, a nota acerta; perto de 0 ou
// negativa, a régua precisa mudar. Empate leva o posto médio, para a ordem do arquivo não mudar o resultado.
function postos (xs) {
  const ordem = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0])
  const p = new Array(xs.length)
  for (let k = 0; k < ordem.length;) {
    let fim = k
    while (fim + 1 < ordem.length && ordem[fim + 1][0] === ordem[k][0]) fim++
    const medio = (k + fim) / 2 + 1
    for (let j = k; j <= fim; j++) p[ordem[j][1]] = medio
    k = fim + 1
  }
  return p
}

const comNotaERetencao = (linhas) => linhas.filter((l) => Number.isFinite(l.nota) && Number.isFinite(l.metricas.retencao))

function acertoDaNota (linhas) {
  const pares = comNotaERetencao(linhas)
  if (pares.length < 5) return null
  const a = postos(pares.map((l) => l.nota))
  const b = postos(pares.map((l) => l.metricas.retencao))
  const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
  const [ma, mb] = [media(a), media(b)]
  let cov = 0
  let va = 0
  let vb = 0
  a.forEach((x, i) => { cov += (x - ma) * (b[i] - mb); va += (x - ma) ** 2; vb += (b[i] - mb) ** 2 })
  if (!va || !vb) return null
  return Number((cov / Math.sqrt(va * vb)).toFixed(2))
}

function resumo (linhas) {
  const acerto = acertoDaNota(linhas)
  const semAcerto = comNotaERetencao(linhas).length < 5
    ? 'precisa de 5 cortes ou mais com nota e retenção'
    : 'as notas ou a retenção não variam entre os cortes, e não dá para medir'
  return {
    cortes: linhas.length,
    porGancho: agrupar(linhas, (l) => l.tipo_gancho),
    porDuracao: agrupar(linhas, (l) => faixaDeDuracao(l.duracao)),
    acertoDaNota: acerto,
    semAcerto: acerto == null ? semAcerto : null
  }
}

module.exports = { lerNumero, linhaDoCorte, registrar, ler, resumo, faixaDeDuracao, acertoDaNota }
