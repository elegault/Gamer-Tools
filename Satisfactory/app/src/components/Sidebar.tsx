import type { JSX } from 'react'
import { useEditorStore, type ToolMode } from '../store/editorStore'

const tools: Array<{ value: ToolMode; label: string; detail: string }> = [
  { value: 'select', label: 'Select', detail: 'Choose and inspect map entities' },
]

const stationTools: Array<{ value: ToolMode; label: string; detail: string }> = [
  { value: 'station', label: 'Train Station', detail: 'Place station in/out anchor pair' },
]

const sectionTools: Array<{ value: ToolMode; label: string; detail: string }> = [
  {
    value: 'section-straight',
    label: 'Straight Section',
    detail: 'Place a straight railway section',
  },
  {
    value: 'section-curved',
    label: 'Curved Section',
    detail: 'Place a curved railway section',
  },
  {
    value: 'section-intersection',
    label: 'Intersection',
    detail: 'Place a 4-way fixed intersection component',
  },
]

const signalTools: Array<{ value: ToolMode; label: string; detail: string }> = [
  { value: 'signal-block', label: 'Block Signal', detail: 'Place user-defined block signal' },
  { value: 'signal-path', label: 'Path Signal', detail: 'Place user-defined path signal' },
]

export function Sidebar(): JSX.Element {
  const activeTool = useEditorStore((state) => state.activeTool)
  const setTool = useEditorStore((state) => state.setTool)
  const connectionsLocked = useEditorStore((state) => state.connectionsLocked)
  const setConnectionsLocked = useEditorStore((state) => state.setConnectionsLocked)

  return (
    <aside className="sidebar">
      <header className="panel-header">
        <p className="eyebrow">Toolbox</p>
        <h2>Build Palette</h2>
      </header>
      <div className="palette-group">
        <p className="palette-group-title">Selection</p>
        <div className="tool-list" role="list">
          {tools.map((tool) => {
            const isActive = activeTool === tool.value
            return (
              <button
                key={tool.value}
                type="button"
                className={isActive ? 'tool-button active' : 'tool-button'}
                onClick={() => setTool(tool.value)}
              >
                <span>{tool.label}</span>
                <small>{tool.detail}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="palette-group">
        <p className="palette-group-title">Stations</p>
        <div className="tool-list" role="list">
          {stationTools.map((tool) => {
            const isActive = activeTool === tool.value
            return (
              <button
                key={tool.value}
                type="button"
                className={isActive ? 'tool-button active' : 'tool-button'}
                onClick={() => setTool(tool.value)}
              >
                <span>{tool.label}</span>
                <small>{tool.detail}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="palette-group">
        <p className="palette-group-title">Railway Sections</p>
        <div className="tool-list" role="list">
          {sectionTools.map((tool) => {
            const isActive = activeTool === tool.value
            return (
              <button
                key={tool.value}
                type="button"
                className={isActive ? 'tool-button active' : 'tool-button'}
                onClick={() => setTool(tool.value)}
              >
                <span>{tool.label}</span>
                <small>{tool.detail}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="palette-group">
        <p className="palette-group-title">Connections</p>
        <div className="tool-list" role="list">
          <button
            type="button"
            className={connectionsLocked ? 'tool-button active' : 'tool-button'}
            onClick={() => setConnectionsLocked(!connectionsLocked)}
          >
            <span>{connectionsLocked ? 'Unlock Disconnections' : 'Lock Disconnections'}</span>
            <small>
              {connectionsLocked
                ? 'Connected section endpoints stay connected while dragging'
                : 'Allow endpoints to disconnect from existing connections'}
            </small>
          </button>
        </div>
      </div>

      <div className="palette-group">
        <p className="palette-group-title">Signals</p>
        <div className="tool-list" role="list">
          {signalTools.map((tool) => {
            const isActive = activeTool === tool.value
            return (
              <button
                key={tool.value}
                type="button"
                className={isActive ? 'tool-button active' : 'tool-button'}
                onClick={() => setTool(tool.value)}
              >
                <span>{tool.label}</span>
                <small>{tool.detail}</small>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
