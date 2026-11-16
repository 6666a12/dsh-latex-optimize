// DSH's native client bundle format; React is supplied by the running shell.
window.__ModuleLoader__.load({
  id: 'dsh-latex-optimize',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const STORAGE_KEY = 'dsh-latex-optimize:v1'
    const FLOW = '[data-slot="conversation.chat.flow"]'
    const PARAGRAPH = `${FLOW} p:has(.katex):not(:has(img, video, iframe, pre, table))`
    // Do not nest containment inside an already contained math paragraph.
    const DISPLAY = `${FLOW} .katex-display:not(p *)`
    const MODES = Object.freeze([
      ['balanced', '公式与段落'],
      ['formulas', '仅独立公式'],
      ['off', '关闭'],
    ])
    const validMode = (mode) => MODES.some(([value]) => value === mode)

    const UI_CSS = `
.dsh-latex-settings { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:12px 0; color:var(--dsw-alias-label-primary); }
.dsh-latex-settings .dsh-latex-copy { flex:1 1 240px; }
.dsh-latex-settings strong { font-size:14px; font-weight:600; }
.dsh-latex-settings p { margin:5px 0 0; font-size:12px; line-height:1.6; color:var(--dsw-alias-label-secondary); }
.dsh-latex-select { font:inherit; font-size:12px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; padding:5px 7px; max-width:100%; }
.dsh-latex-select:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
.dsh-latex-dock { display:flex; align-items:center; justify-content:flex-end; gap:7px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.dsh-latex-dock label { display:flex; align-items:center; gap:7px; }
@media print { .dsh-latex-dock, .dsh-latex-settings { display:none !important; } }
`

    /** Only delay layout/paint. No changes to KaTeX, React, text, or the DOM. */
    function optimizationCSS(mode) {
      if (mode === 'off') return ''
      const targets = mode === 'balanced' ? `${DISPLAY},\n${PARAGRAPH}` : `${FLOW} .katex-display`
      const paragraphSize = mode === 'balanced' ? `${PARAGRAPH} { contain-intrinsic-block-size: auto 6em; }` : ''
      return `
@supports (content-visibility: auto) and (contain-intrinsic-block-size: auto 1px) {
  ${targets} {
    content-visibility: auto;
    contain-intrinsic-block-size: auto 4em;
  }
  ${paragraphSize}
  ${FLOW} .katex-display:focus-within,
  ${FLOW} p:has(.katex):focus-within {
    content-visibility: visible;
    contain-intrinsic-block-size: none;
  }
  @media print {
    ${targets} {
      content-visibility: visible !important;
      contain-intrinsic-block-size: none !important;
    }
  }
}
`
    }

    function parseMode(raw) {
      try {
        const value = JSON.parse(raw)
        return validMode(value?.mode) ? value.mode : 'balanced'
      } catch { return 'balanced' }
    }

    /** Small external store, one stylesheet and one listener per plugin lifetime. */
    function createOptimizer(win) {
      const supported = Boolean(
        win.CSS?.supports?.('content-visibility', 'auto') &&
        win.CSS.supports('contain-intrinsic-block-size', 'auto 1px') &&
        win.CSS.supports('selector(p:has(.katex))'),
      )
      let storage
      let persistent = true
      try { storage = win.localStorage } catch { persistent = false }
      let mode = 'balanced'
      try { if (storage) mode = parseMode(storage.getItem(STORAGE_KEY)) } catch { persistent = false }
      const style = win.document.createElement('style')
      style.dataset.dshLatexOptimize = '0.1.0'
      const listeners = new Set()
      let disposed = false
      let snapshot
      const publish = () => {
        if (disposed) return
        style.textContent = UI_CSS + optimizationCSS(supported ? mode : 'off')
        snapshot = Object.freeze({ mode, supported, persistent })
        for (const listener of listeners) listener()
      }
      publish()
      // Installed synchronously, before future conversations enter first layout.
      win.document.head.appendChild(style)
      const onStorage = (event) => {
        if (event.key !== null && event.key !== STORAGE_KEY) return
        if (event.storageArea && event.storageArea !== storage) return
        mode = parseMode(event.key === null ? null : event.newValue)
        publish()
      }
      win.addEventListener('storage', onStorage)
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          if (disposed) return () => {}
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        setMode(next) {
          if (disposed || !validMode(next) || next === mode) return
          mode = next
          try {
            if (storage) {
              storage.setItem(STORAGE_KEY, JSON.stringify({ mode }))
              persistent = true
            }
          } catch { persistent = false }
          publish()
        },
        dispose() {
          if (disposed) return
          disposed = true
          win.removeEventListener('storage', onStorage)
          style.remove()
          listeners.clear()
        },
      }
    }

    function apply(ctx) {
      let optimizer
      ctx.effect(() => {
        optimizer = createOptimizer(window)
        return () => optimizer.dispose()
      })
      const usePreference = () => React.useSyncExternalStore(
        optimizer.subscribe, optimizer.getSnapshot, optimizer.getSnapshot,
      )
      function ModeSelect({ preference }) {
        return h('select', {
          className: 'dsh-latex-select',
          'aria-label': '长对话优化模式',
          disabled: !preference.supported,
          value: preference.mode,
          onChange: (event) => optimizer.setMode(event.target.value),
        }, ...MODES.map(([value, label]) => h('option', { value, key: value }, label)))
      }
      function SettingsRow() {
        const preference = usePreference()
        const description = !preference.supported
          ? '当前浏览器不支持离屏渲染优化，已自动停用。'
          : '延迟屏幕外公式和含公式段落的排版与绘制，滚动到附近时自动显示。内容、复制和搜索保持原样。首次解析大量公式仍可能耗时。'
        return h('div', { className: 'dsh-latex-settings' },
          h('div', { className: 'dsh-latex-copy' },
            h('strong', null, '长对话 LaTeX 优化'),
            h('p', null, description),
            h('p', null, '若阅读位置有跳动，可切换“仅独立公式”或关闭。'),
            !preference.persistent && h('p', { role: 'status' }, '偏好暂时无法保存，本次窗口仍可使用。'),
          ),
          h(ModeSelect, { preference }),
        )
      }
      function DockControl() {
        const preference = usePreference()
        return h('div', { className: 'dsh-latex-dock' },
          h('label', null, '长对话优化', h(ModeSelect, { preference })),
        )
      }
      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item', id: 'dsh-latex-optimize', order: 31,
      }, SettingsRow))
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock', id: 'dsh-latex-optimize', order: 25,
      }, DockControl))
    }

    return {
      apply,
      inject: ['slots'],
      // Pure logic exposed for the local verification harness, no global patching.
      createOptimizer, optimizationCSS, parseMode, STORAGE_KEY,
    }
  },
})
