import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { GridCanvas } from './components/GridCanvas'
import { Inspector } from './components/Inspector'
import { Sidebar } from './components/Sidebar'
import { useEditorStore } from './store/editorStore'
import './App.css'

function download(filename: string, data: string): void {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()

  URL.revokeObjectURL(url)
}

function App() {
  const map = useEditorStore((state) => state.map)
  const updateMapSettings = useEditorStore((state) => state.updateMapSettings)
  const updateMapTitle = useEditorStore((state) => state.updateMapTitle)
  const updateGridSize = useEditorStore((state) => state.updateGridSize)
  const exportMap = useEditorStore((state) => state.exportMap)
  const loadFromDisk = useEditorStore((state) => state.loadFromDisk)
  const clearMap = useEditorStore((state) => state.clearMap)
  const [topbarCollapsed, setTopbarCollapsed] = useState(map.settings.editorState.panels.topbarCollapsed)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(map.settings.editorState.panels.sidebarCollapsed)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(map.settings.editorState.panels.inspectorCollapsed)
  const [mapUiCollapsed, setMapUiCollapsed] = useState(map.settings.editorState.inspectorSections.mapUi)
  const [sidebarWidth, setSidebarWidth] = useState(map.settings.editorState.panels.sidebarWidth)
  const [inspectorWidth, setInspectorWidth] = useState(map.settings.editorState.panels.inspectorWidth)
  const sidebarWidthRef = useRef(sidebarWidth)
  const inspectorWidthRef = useRef(inspectorWidth)
  const editorStateRef = useRef(map.settings.editorState)
  const panelStateRef = useRef(map.settings.editorState.panels)
  const panelResizeRef = useRef<
    | {
        side: 'sidebar' | 'inspector'
        startX: number
        startWidth: number
      }
    | null
  >(null)

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  function persistPanelState(patch: Partial<typeof map.settings.editorState.panels>): void {
    const nextPanels = {
      ...panelStateRef.current,
      ...patch,
    }

    panelStateRef.current = nextPanels

    updateMapSettings({
      editorState: {
        ...editorStateRef.current,
        panels: nextPanels,
      },
    })
  }

  function beginHorizontalResize(
    side: 'sidebar' | 'inspector',
    event: ReactMouseEvent<HTMLDivElement>,
  ): void {
    event.preventDefault()
    event.stopPropagation()

    panelResizeRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'sidebar' ? sidebarWidth : inspectorWidth,
    }

    document.body.classList.add('is-resizing-panels')
    document.body.classList.add('is-resizing-panels-horizontal')
  }

  useEffect(() => {
    editorStateRef.current = map.settings.editorState
    panelStateRef.current = map.settings.editorState.panels
    setTopbarCollapsed(map.settings.editorState.panels.topbarCollapsed)
    setSidebarCollapsed(map.settings.editorState.panels.sidebarCollapsed)
    setInspectorCollapsed(map.settings.editorState.panels.inspectorCollapsed)
    setMapUiCollapsed(map.settings.editorState.inspectorSections.mapUi)
    setSidebarWidth(map.settings.editorState.panels.sidebarWidth)
    setInspectorWidth(map.settings.editorState.panels.inspectorWidth)
  }, [
    map.settings.editorState,
    map.settings.editorState.panels.inspectorCollapsed,
    map.settings.editorState.panels.inspectorWidth,
    map.settings.editorState.panels.sidebarCollapsed,
    map.settings.editorState.panels.sidebarWidth,
    map.settings.editorState.panels.topbarCollapsed,
    map.settings.editorState.inspectorSections.mapUi,
  ])

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()
    const result = loadFromDisk(text)
    if (!result.ok) {
      alert(result.message)
    }

    event.currentTarget.value = ''
  }

  function toggleMapUiSection(): void {
    const next = !mapUiCollapsed
    setMapUiCollapsed(next)
    updateMapSettings({
      editorState: {
        ...map.settings.editorState,
        inspectorSections: {
          ...map.settings.editorState.inspectorSections,
          mapUi: next,
        },
      },
    })
  }

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    inspectorWidthRef.current = inspectorWidth
  }, [inspectorWidth])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent): void {
      const resizeState = panelResizeRef.current
      if (!resizeState) {
        return
      }

      const dx = event.clientX - resizeState.startX

      if (resizeState.side === 'sidebar') {
        setSidebarWidth(clamp(resizeState.startWidth + dx, 180, 720))
        return
      }

      setInspectorWidth(clamp(resizeState.startWidth - dx, 260, 900))
    }

    function handleMouseUp(): void {
      const resizeState = panelResizeRef.current
      if (!resizeState) {
        return
      }

      if (resizeState.side === 'sidebar') {
        persistPanelState({ sidebarWidth: Math.round(sidebarWidthRef.current) })
      } else {
        persistPanelState({ inspectorWidth: Math.round(inspectorWidthRef.current) })
      }

      panelResizeRef.current = null
      document.body.classList.remove('is-resizing-panels')
      document.body.classList.remove('is-resizing-panels-horizontal')
      document.body.classList.remove('is-resizing-panels-vertical')
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.classList.remove('is-resizing-panels')
      document.body.classList.remove('is-resizing-panels-horizontal')
      document.body.classList.remove('is-resizing-panels-vertical')
    }
  }, [])

  useEffect(() => {
    document.title = `STM - ${map.settings.title}`
  }, [map.settings.title])

  return (
    <div className="app-shell">
      <header className={topbarCollapsed ? 'topbar collapsed' : 'topbar'}>
        <div className="topbar-main">
          <div className="topbar-copy">
            <p className="eyebrow">Satisfactory Train Mapper</p>
            {!topbarCollapsed && <h1>Network Planning Workspace</h1>}
          </div>
          <div className="topbar-actions">
            {!topbarCollapsed && <p className="status-pill">Schema v{map.schemaVersion}</p>}
            <button
              type="button"
              className="panel-collapse-button"
              onClick={() => {
                const next = !topbarCollapsed
                setTopbarCollapsed(next)
                persistPanelState({ topbarCollapsed: next })
              }}
              aria-expanded={!topbarCollapsed}
              aria-label={topbarCollapsed ? 'Expand top bar' : 'Collapse top bar'}
            >
              {topbarCollapsed ? '+' : '−'}
            </button>
          </div>
        </div>

        {!topbarCollapsed && (
          <section className="inspector-section-card topbar-mapui-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={toggleMapUiSection}
              aria-expanded={!mapUiCollapsed}
            >
              <span>Map Title and UI Settings</span>
              <span className="inspector-section-toggle">{mapUiCollapsed ? '+' : '−'}</span>
            </button>

            {!mapUiCollapsed && (
              <div className="inspector-section-body topbar-mapui-body">
                <label className="topbar-mapui-field topbar-mapui-title-field">
                  <span>Map Title</span>
                  <input
                    type="text"
                    value={map.settings.title}
                    onChange={(event) => updateMapTitle(event.target.value)}
                  />
                </label>

                <label className="topbar-mapui-field topbar-mapui-number-field">
                  <span>Grid Width</span>
                  <input
                    type="number"
                    min={10}
                    value={map.settings.worldWidth}
                    onChange={(event) =>
                      updateGridSize(Number(event.target.value), map.settings.worldHeight)
                    }
                  />
                </label>

                <label className="topbar-mapui-field topbar-mapui-number-field">
                  <span>Grid Height</span>
                  <input
                    type="number"
                    min={10}
                    value={map.settings.worldHeight}
                    onChange={(event) =>
                      updateGridSize(map.settings.worldWidth, Number(event.target.value))
                    }
                  />
                </label>

                <div className="io-actions topbar-mapui-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const data = exportMap()
                      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
                      download(`stm-map-${stamp}.json`, data)
                    }}
                  >
                    Export JSON
                  </button>

                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        'Clear the current map and saved local map data? This cannot be undone.',
                      )
                      if (!confirmed) {
                        return
                      }

                      clearMap()
                    }}
                  >
                    Clear Grid
                  </button>

                  <label className="file-import">
                    <span>Import JSON</span>
                    <input type="file" accept="application/json" onChange={handleImport} />
                  </label>
                </div>
              </div>
            )}
          </section>
        )}
      </header>

      <main
        style={{
          '--sidebar-width': `${sidebarWidth}px`,
          '--inspector-width': `${inspectorWidth}px`,
        } as CSSProperties}
        className={
          sidebarCollapsed && inspectorCollapsed
            ? 'workspace-grid sidebar-collapsed inspector-collapsed both-collapsed'
            : sidebarCollapsed
              ? 'workspace-grid sidebar-collapsed'
              : inspectorCollapsed
                ? 'workspace-grid inspector-collapsed'
                : 'workspace-grid'
        }
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            const next = !sidebarCollapsed
            setSidebarCollapsed(next)
            persistPanelState({ sidebarCollapsed: next })
          }}
        />

        {!sidebarCollapsed && (
          <div
            className="panel-resizer horizontal"
            role="separator"
            aria-label="Resize Build Palette panel"
            aria-orientation="vertical"
            onMouseDown={(event) => beginHorizontalResize('sidebar', event)}
          />
        )}

        <GridCanvas />

        {!inspectorCollapsed && (
          <div
            className="panel-resizer horizontal"
            role="separator"
            aria-label="Resize Inspector panel"
            aria-orientation="vertical"
            onMouseDown={(event) => beginHorizontalResize('inspector', event)}
          />
        )}

        <Inspector
          collapsed={inspectorCollapsed}
          onToggleCollapse={() => {
            const next = !inspectorCollapsed
            setInspectorCollapsed(next)
            persistPanelState({ inspectorCollapsed: next })
          }}
        />
      </main>
    </div>
  )
}

export default App
