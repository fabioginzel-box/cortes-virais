'use strict'

function mediana (xs) {
  const o = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!o.length) return null
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

function desvio (xs) {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

const par = (x) => Math.max(2, Math.round(x / 2) * 2)
const limitar = (x, a, b) => Math.max(a, Math.min(b, x))

module.exports = { mediana, desvio, par, limitar }
