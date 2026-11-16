import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
function setup({ raw = null, supported = true, storageThrows = false } = {}) {
  const events = new Map()
  const elements = []
  const values = new Map(raw === null ? [] : [['dsh-latex-optimize:v1', raw]])
  const win = {
    CSS: { supports: () => supported },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) { if (storageThrows) throw new Error('quota'); values.set(key, value) },
    },
    document: {
      createElement: () => ({ dataset: {}, textContent: '', remove() { elements.splice(elements.indexOf(this), 1) } }),
      head: { appendChild: (element) => elements.push(element) },
    },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name) },
  }
  let api
  win.__ModuleLoader__ = { load(spec) {
    assert.equal(spec.id, 'dsh-latex-optimize')
    api = spec.factory((id) => { assert.equal(id, 'react'); return { createElement() {} } })
  } }
  vm.runInNewContext(source, { window: win })
  return { api, win, events, elements, values }
}

test('defaults are useful; corrupt or unrecognized preferences recover', () => {
  const { api } = setup()
  for (const raw of [null, '', '{', '{}', '"off"', '{"mode":"unknown"}', '{"mode":null}']) {
    assert.equal(api.parseMode(raw), 'balanced')
  }
  assert.equal(api.parseMode('{"mode":"off"}'), 'off')
})

test('injects CSS synchronously, never modifies chat content, stores preference only', () => {
  const { api, win, elements, values } = setup()
  const optimizer = api.createOptimizer(win)
  assert.equal(elements.length, 1)
  assert.match(elements[0].textContent, /content-visibility: auto/)
  assert.match(elements[0].textContent, /conversation\.chat\.flow/)
  assert.equal(optimizer.getSnapshot().mode, 'balanced')
  let notifications = 0
  const off = optimizer.subscribe(() => notifications++)
  optimizer.setMode('formulas')
  assert.equal(notifications, 1)
  assert.equal(values.get(api.STORAGE_KEY), '{"mode":"formulas"}')
  assert.equal(values.size, 1)
  assert.equal(optimizer.getSnapshot().mode, 'formulas')
  optimizer.setMode('bogus')
  optimizer.setMode('formulas')
  assert.equal(notifications, 1)
  off()
  optimizer.setMode('off')
  assert.equal(notifications, 1)
  assert.doesNotMatch(elements[0].textContent, /content-visibility: auto/)
  optimizer.dispose()
})

test('unsupported browser fails open without changing message rendering', () => {
  const { api, win, elements } = setup({ supported: false })
  const optimizer = api.createOptimizer(win)
  assert.equal(optimizer.getSnapshot().supported, false)
  assert.doesNotMatch(elements[0].textContent, /content-visibility/)
  optimizer.dispose()
})

test('blocked storage is nonfatal and reflected in the preference state', () => {
  const { api, win } = setup({ storageThrows: true })
  const optimizer = api.createOptimizer(win)
  optimizer.setMode('off')
  assert.equal(optimizer.getSnapshot().mode, 'off')
  assert.equal(optimizer.getSnapshot().persistent, false)
  optimizer.dispose()
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('denied') } })
  const other = api.createOptimizer(win)
  assert.equal(other.getSnapshot().mode, 'balanced')
  assert.equal(other.getSnapshot().persistent, false)
  other.dispose()
})

test('storage events synchronize modes and reset to default on removal', () => {
  const { api, win, events } = setup({ raw: '{"mode":"off"}' })
  const optimizer = api.createOptimizer(win)
  const send = (key, newValue, storageArea = win.localStorage) => events.get('storage')({ key, newValue, storageArea })
  send('unrelated', '{"mode":"formulas"}')
  assert.equal(optimizer.getSnapshot().mode, 'off')
  send(api.STORAGE_KEY, '{"mode":"formulas"}', {})
  assert.equal(optimizer.getSnapshot().mode, 'off')
  send(api.STORAGE_KEY, '{"mode":"formulas"}')
  assert.equal(optimizer.getSnapshot().mode, 'formulas')
  send(null, null)
  assert.equal(optimizer.getSnapshot().mode, 'balanced')
  optimizer.dispose()
})

test('unload is idempotent; no style, listener, or late callback remains', () => {
  const { api, win, events, elements } = setup()
  const optimizer = api.createOptimizer(win)
  let notifications = 0
  optimizer.subscribe(() => notifications++)
  optimizer.dispose()
  optimizer.dispose()
  optimizer.setMode('off')
  assert.equal(elements.length, 0)
  assert.equal(events.size, 0)
  assert.equal(notifications, 0)
})

test('only additive Slots and lifecycle-owned effects are registered', () => {
  const { api, elements, events } = setup()
  const dispose = []
  const registrations = []
  api.apply({
    effect(callback) { dispose.push(callback()) },
    slots: {
      inject(name, callback) { const cleanup = callback(); dispose.push(cleanup) },
      register(options, component) { registrations.push({ options, component }); return () => registrations.pop() },
    },
  })
  assert.deepEqual(registrations.map((x) => x.options.name), ['settings.general.item', 'conversation.composer.dock'])
  assert.ok(registrations.every((x) => x.options.id === 'dsh-latex-optimize'))
  assert.equal(elements.length, 1)
  for (const cleanup of dispose.reverse()) cleanup()
  assert.equal(registrations.length, 0)
  assert.equal(elements.length, 0)
  assert.equal(events.size, 0)
})

test('manifest exposes the native loader bundle and constrains the inspected runtime', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.engines.dsh, '0.2.1-rc.2')
  assert.equal(manifest.exports['./client'], './client.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dependencies, undefined)
  assert.equal(manifest.scripts.postinstall, undefined)
  for (const file of manifest.files) assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), file)
})
