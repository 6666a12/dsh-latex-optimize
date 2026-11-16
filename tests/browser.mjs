import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import katex from 'katex'

const root = fileURLToPath(new URL('../', import.meta.url))
const resultDir = path.join(root, 'test-results')
await fs.mkdir(resultDir, { recursive: true })
const formulas = [String.raw`\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt{\pi}}{2}`, String.raw`\sum_{n=0}^\infty\frac{x^n}{n!}=e^x`, String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}\begin{pmatrix}x\\y\end{pmatrix}=\begin{pmatrix}ax+by\\cx+dy\end{pmatrix}`]
const display = formulas.map((s) => katex.renderToString(s, { displayMode: true }))
const inline = katex.renderToString(String.raw`\frac{\partial f}{\partial x}=2x`, { displayMode: false })
const rows = Array.from({ length: 400 }, (_, i) => `<article><h3>推导 ${i + 1}</h3><p id="p-${i}">这是一段含行内公式 ${inline} 的历史回答。<a href="#p-399">跳到最后</a></p>${display[i % display.length]}</article>`).join('')
const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root, 'node_modules/katex/dist/katex.min.css'))}"><style>
:root{--dsw-alias-label-primary:#222;--dsw-alias-label-secondary:#666;--dsw-alias-bg-layer-1:#f7f7f8;--dsw-alias-border-l1:#ddd;--dsw-alias-brand-primary:#5068ed}
body{margin:0;font:15px/1.6 system-ui;background:#fff;color:#222}header,#settings,#dock{padding:12px 24px}header{font-weight:600}#viewport{height:600px;overflow:auto;border-block:1px solid #ddd}#content{max-width:780px;margin:auto;padding:20px}article{margin-bottom:28px}h3{font-size:16px}p{margin:1em 0}.katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden}#outside{display:none}
</style></head><body><header>长对话 LaTeX 优化 · 浏览器测试夹具（400 条）</header><div id="settings"></div><div id="viewport"><div id="content" data-slot="conversation.chat.flow"></div></div><div id="dock"></div><div id="outside">${display[0]}</div></body></html>`
const fixturePath = path.join(resultDir, 'fixture.html')
await fs.writeFile(fixturePath, fixture)
const executablePath = process.env.DSH_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await chromium.launch({ executablePath, headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(pathToFileURL(fixturePath).href)
  await page.addScriptTag({ path: path.join(root, 'node_modules/react/umd/react.production.min.js') })
  await page.addScriptTag({ path: path.join(root, 'node_modules/react-dom/umd/react-dom.production.min.js') })
  await page.evaluate(() => {
    localStorage.clear()
    window.__ModuleLoader__ = { load({ factory }) { window.plugin = factory((id) => { if (id !== 'react') throw new Error(id); return window.React }) } }
  })
  await page.addScriptTag({ path: path.join(root, 'client.js') })
  await page.evaluate(() => {
    const cleanup = []
    window.plugin.apply({
      effect(fn) { cleanup.push(fn()) },
      slots: {
        inject(name, fn) { cleanup.push(fn()) },
        register(options, Component) {
          const target = document.getElementById(options.name === 'settings.general.item' ? 'settings' : 'dock')
          const root = ReactDOM.createRoot(target)
          root.render(React.createElement(Component))
          return () => root.unmount()
        },
      },
    })
    window.unload = () => { for (const fn of cleanup.reverse()) fn() }
  })
  await page.locator('select').first().waitFor()
  await page.evaluate((html) => { document.getElementById('content').innerHTML = html }, rows)
  await page.evaluate(() => document.fonts.ready)
  const htmlBefore = await page.locator('#content').innerHTML()
  const css = (selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).contentVisibility)
  assert.equal(await css('#content p'), 'auto')
  assert.equal(await css('#content .katex-display'), 'auto')
  assert.equal(await css('#content .katex:not(.katex-display)'), 'visible')
  assert.equal(await css('#outside .katex-display'), 'visible')
  await page.locator('select').last().selectOption('formulas')
  await page.waitForFunction(() => document.querySelector('select').value === 'formulas')
  assert.equal(await css('#content p'), 'visible')
  assert.equal(await css('#content .katex-display'), 'auto')
  await page.locator('select').first().selectOption('off')
  assert.equal(await css('#content .katex-display'), 'visible')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-latex-optimize:v1')).mode), 'off')
  await page.locator('select').first().selectOption('balanced')
  await page.locator('#p-0 a').focus()
  assert.equal(await css('#p-0'), 'visible')
  await page.locator('select').first().focus()
  assert.equal(await css('#p-0'), 'auto')
  await page.emulateMedia({ media: 'print' })
  assert.equal(await css('#content p'), 'visible')
  assert.equal(await css('#content .katex-display'), 'visible')
  await page.emulateMedia({ media: 'screen' })
  await page.locator('#p-399').scrollIntoViewIfNeeded()
  const lastSize = await page.locator('#content article:last-child .katex-display').boundingBox()
  assert.ok(lastSize.height > 20 && lastSize.width > 100)
  await page.setViewportSize({ width: 700, height: 900 })
  assert.equal(await page.locator('#content').innerHTML(), htmlBefore)
  const stats = await page.evaluate(() => ({
    formulas: document.querySelectorAll('#content .katex').length,
    domElements: document.querySelectorAll('#content *').length,
    mathML: document.querySelectorAll('#content .katex-mathml').length,
  }))
  assert.equal(stats.formulas, 800)
  assert.equal(stats.mathML, 800)
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.locator('#p-0').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(resultDir, 'preview.png') })

  // Isolate DOM insertion vs first layout. This does NOT measure TeX parsing,
  // React mounting, session IO, or the user's real conversation opening time.
  const timings = []
  for (let round = 0; round < 5; round++) {
    for (const mode of round % 2 ? ['balanced', 'off'] : ['off', 'balanced']) {
      await page.locator('select').first().selectOption(mode)
      const result = await page.evaluate(async ({ html, mode }) => {
        const content = document.getElementById('content')
        const viewport = document.getElementById('viewport')
        viewport.scrollTop = 0
        content.replaceChildren()
        void viewport.offsetHeight
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const start = performance.now()
        content.innerHTML = html
        const inserted = performance.now()
        void content.offsetHeight
        const laidOut = performance.now()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return { mode, insertionMs: inserted - start, firstLayoutMs: laidOut - inserted }
      }, { html: rows, mode })
      timings.push(result)
    }
  }
  await page.evaluate(() => window.unload())
  assert.equal(await page.locator('style[data-dsh-latex-optimize]').count(), 0)
  assert.equal(await css('#content .katex-display'), 'visible')
  assert.equal(await page.locator('select').count(), 0)
  assert.deepEqual(errors, [])
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const summary = Object.fromEntries(['off', 'balanced'].map((mode) => [mode, {
    insertionMs: median(timings.filter((x) => x.mode === mode).map((x) => x.insertionMs)),
    firstLayoutMs: median(timings.filter((x) => x.mode === mode).map((x) => x.firstLayoutMs)),
  }]))
  const report = { browser: browser.version(), fixture: '400 paragraphs + 400 display equations; precomputed KaTeX HTML', stats, checks: ['scope', 'inline-and-display', 'settings-and-dock-sync', 'off', 'preference', 'focus', 'print', 'scroll-to-last', 'resize', 'unchanged-content', 'MathML-preserved', 'unload'], summary, timings, limitations: 'Synthetic first layout only. No evidence about real session I/O, KaTeX parsing, React work, or end-to-end opening latency.' }
  await fs.writeFile(path.join(resultDir, 'browser-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close() }
