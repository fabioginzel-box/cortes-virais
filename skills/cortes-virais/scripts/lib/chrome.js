'use strict'

// Chrome sem janela, pelo DevTools Protocol: desenha a legenda em PNG transparente e roda a detecção
// de rosto.

const { spawn, spawnSync, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function candidatos (env = process.env) {
  const local = env.LOCALAPPDATA || ''
  return [
    env.CORTES_VIRAIS_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean)
}

function acharChrome (env = process.env) {
  for (const c of candidatos(env)) {
    try { if (fs.statSync(c).isFile()) return c } catch {}
  }
  try {
    return execFileSync('which', ['google-chrome'], { encoding: 'utf8', windowsHide: true }).trim() || null
  } catch {
    return null
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

// No Windows, a primeira abertura do Chrome com o antivírus olhando passou de 15 s no CI; um computador
// lento demora o mesmo. Um Chrome que não sobe de jeito nenhum falha antes, pelo erro do processo.
const PRAZO_PARA_ABRIR = 60000

// No Windows o Chrome ainda está escrevendo o arquivo quando ele aparece, e a leitura falha com EBUSY:
// vale como "ainda não", e a próxima volta tenta de novo.
function lerPorta (arquivo, ler = fs.readFileSync) {
  try {
    const primeira = String(ler(arquivo, 'utf8')).split('\n')[0].trim()
    return primeira ? Number(primeira) : null
  } catch (e) {
    if (['ENOENT', 'EBUSY', 'EPERM', 'EACCES'].includes(e.code)) return null
    throw e
  }
}

async function abrir ({ tempoLimite = 60000 } = {}) {
  if (typeof WebSocket === 'undefined') {
    throw new Error(`este Node não tem WebSocket global (precisa de Node 22+; este é ${process.version}).`)
  }
  const chrome = acharChrome()
  if (!chrome) throw new Error('não achei o Chrome nesta máquina. Instale o Google Chrome ou aponte o binário em CORTES_VIRAIS_CHROME.')

  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cortes-virais-'))
  const processo = spawn(chrome, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--allow-file-access-from-files',
    `--user-data-dir=${perfil}`,
    '--remote-debugging-port=0',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  processo.stderr.on('data', () => {})
  let falhou = null
  processo.once('error', (e) => { falhou = e })
  const saiu = new Promise((resolve) => { processo.once('exit', resolve); processo.once('error', resolve) })

  // O perfil só se apaga depois que o Chrome sai: até lá ele ainda grava nele, e no Windows o arquivo
  // aberto trava a remoção.
  const fechar = async () => {
    if (processo.exitCode === null && processo.signalCode === null) {
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(processo.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        else processo.kill()
      } catch {}
      let relogio
      await Promise.race([saiu, new Promise((resolve) => { relogio = setTimeout(resolve, 5000) })])
      clearTimeout(relogio)
    }
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch {}
  }

  try {
    const arquivoPorta = path.join(perfil, 'DevToolsActivePort')
    let porta = null
    const limite = Date.now() + PRAZO_PARA_ABRIR
    while (!porta && Date.now() < limite) {
      await esperar(100)
      if (falhou) throw new Error(`não consegui abrir o Chrome em ${chrome} (${falhou.code || falhou.message}): aponte o executável, e não a pasta do app, em CORTES_VIRAIS_CHROME`)
      if (processo.exitCode !== null) throw new Error(`o Chrome saiu antes de abrir a porta de depuração (código ${processo.exitCode})`)
      porta = lerPorta(arquivoPorta)
    }
    if (!porta) throw new Error(`o Chrome não abriu a porta de depuração em ${PRAZO_PARA_ABRIR / 1000} s`)

    const alvo = await (await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, { method: 'PUT' })).json()
    const ws = new WebSocket(alvo.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error('não consegui falar com o Chrome pelo DevTools Protocol'))
    })

    let id = 0
    const pendentes = new Map()
    const eventos = new Map()
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg); pendentes.delete(msg.id) }
      if (msg.method && eventos.has(msg.method)) { eventos.get(msg.method)(); eventos.delete(msg.method) }
    }
    const enviar = (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id
      const relogio = setTimeout(() => reject(new Error(`${method} não respondeu em ${tempoLimite} ms`)), tempoLimite)
      pendentes.set(i, (msg) => {
        clearTimeout(relogio)
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`))
        else resolve(msg.result)
      })
      ws.send(JSON.stringify({ id: i, method, params }))
    })

    await enviar('Page.enable')

    const pagina = {
      chrome,
      async carregar (url) {
        const carregou = new Promise((resolve) => eventos.set('Page.loadEventFired', resolve))
        await enviar('Page.navigate', { url })
        // O relógio é desarmado ao carregar: armado, ele seguraria o processo até o fim do prazo.
        let relogio
        const prazo = new Promise((resolve, reject) => { relogio = setTimeout(() => reject(new Error('o template não terminou de carregar')), tempoLimite) })
        try {
          await Promise.race([carregou, prazo])
        } finally {
          clearTimeout(relogio)
        }
      },
      async tamanho (largura, altura) {
        await enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: false })
      },
      async avaliar (expressao) {
        const r = await enviar('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true })
        if (r.exceptionDetails) {
          const e = r.exceptionDetails
          throw new Error((e.exception && e.exception.description) || e.text)
        }
        return r.result.value
      },
      async transparente () {
        await enviar('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
      },
      async capturar (largura, altura) {
        const r = await enviar('Page.captureScreenshot', {
          format: 'png',
          clip: { x: 0, y: 0, width: largura, height: altura, scale: 1 },
          captureBeyondViewport: false
        })
        return Buffer.from(r.data, 'base64')
      },
      async fechar () {
        try { ws.close() } catch {}
        await fechar()
      }
    }
    return pagina
  } catch (erro) {
    await fechar()
    throw erro
  }
}

module.exports = { abrir, acharChrome, candidatos, lerPorta }
