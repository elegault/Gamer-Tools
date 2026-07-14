import { useEffect } from 'react'
import { GridCanvas } from './components/GridCanvas'
import { Inspector } from './components/Inspector'
import { Sidebar } from './components/Sidebar'
import { useEditorStore } from './store/editorStore'
import './App.css'

function App() {
  const map = useEditorStore((state) => state.map)

  useEffect(() => {
    document.title = `STM - ${map.settings.title}`
  }, [map.settings.title])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Satisfactory Train Mapper</p>
          <h1>Network Planning Workspace</h1>
        </div>
        <p className="status-pill">Schema v{map.schemaVersion}</p>
      </header>

      <main className="workspace-grid">
        <Sidebar />
        <GridCanvas />
        <Inspector />
      </main>
    </div>
  )
}

export default App
