import { useState, type JSX } from 'react'
import type { LabelShape, MapSettings } from '../models/mapSchema'
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

const labelShapeOptions: LabelShape[] = ['Circle', 'Rectangle', 'Diamond', 'Triangle', 'Hexagon']

type LabelStyle = MapSettings['labelStyles']['section']
type JunctionType = 'Merge' | 'Split' | 'Junction' | 'Invalid'

type AppSettingsDraft = {
  defaultSectionColor: string
  signalEndpointChannelStyle: MapSettings['signalEndpointChannelStyle']
  labelStyles: MapSettings['labelStyles']
}

function cloneDraft(value: AppSettingsDraft): AppSettingsDraft {
  return JSON.parse(JSON.stringify(value)) as AppSettingsDraft
}

function LabelStyleEditor({
  title,
  style,
  onChange,
}: {
  title: string
  style: LabelStyle
  onChange: (nextStyle: LabelStyle) => void
}): JSX.Element {
  function updateField<K extends keyof LabelStyle>(field: K, value: LabelStyle[K]): void {
    onChange({ ...style, [field]: value })
  }

  return (
    <div className="settings-subsection">
      <h4>{title}</h4>
      <div className="form-grid compact-grid settings-grid">
        <label>
          <span>Icon</span>
          <select
            value={style.shape}
            onChange={(event) => updateField('shape', event.target.value as LabelStyle['shape'])}
          >
            {labelShapeOptions.map((shape) => (
              <option key={shape} value={shape}>
                {shape}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Background</span>
          <input
            type="color"
            value={style.backgroundColor}
            onChange={(event) => updateField('backgroundColor', event.target.value)}
          />
        </label>
        <label>
          <span>Border</span>
          <input
            type="color"
            value={style.borderColor}
            onChange={(event) => updateField('borderColor', event.target.value)}
          />
        </label>
        <label>
          <span>Text Color</span>
          <input
            type="color"
            value={style.textColor}
            onChange={(event) => updateField('textColor', event.target.value)}
          />
        </label>
        <label>
          <span>Width</span>
          <input
            type="number"
            min={8}
            max={200}
            value={style.width}
            onChange={(event) => updateField('width', Number(event.target.value) || 8)}
          />
        </label>
        <label>
          <span>Height</span>
          <input
            type="number"
            min={8}
            max={200}
            value={style.height}
            onChange={(event) => updateField('height', Number(event.target.value) || 8)}
          />
        </label>
        <label>
          <span>Radius</span>
          <input
            type="number"
            min={4}
            max={120}
            value={style.radius}
            onChange={(event) => updateField('radius', Number(event.target.value) || 4)}
          />
        </label>
        <label>
          <span>Border Width</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={style.borderWidth}
            onChange={(event) => updateField('borderWidth', Number(event.target.value) || 0)}
          />
        </label>
        <label>
          <span>Text Size</span>
          <input
            type="number"
            min={6}
            max={72}
            value={style.textSize}
            onChange={(event) => updateField('textSize', Number(event.target.value) || 6)}
          />
        </label>
      </div>
    </div>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}): JSX.Element {
  const map = useEditorStore((state) => state.map)
  const activeTool = useEditorStore((state) => state.activeTool)
  const setTool = useEditorStore((state) => state.setTool)
  const connectionsLocked = useEditorStore((state) => state.connectionsLocked)
  const setConnectionsLocked = useEditorStore((state) => state.setConnectionsLocked)
  const updateMapSettings = useEditorStore((state) => state.updateMapSettings)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [activeJunctionType, setActiveJunctionType] = useState<JunctionType>('Merge')
  const [draftSettings, setDraftSettings] = useState<AppSettingsDraft | null>(null)
  const [saveFeedback, setSaveFeedback] = useState('')

  function openSettingsDialog(): void {
    setDraftSettings(
      cloneDraft({
        defaultSectionColor: map.settings.defaultSectionColor,
        signalEndpointChannelStyle: map.settings.signalEndpointChannelStyle,
        labelStyles: map.settings.labelStyles,
      }),
    )
    setSaveFeedback('')
    setAppSettingsOpen(true)
  }

  function closeSettingsDialog(): void {
    setAppSettingsOpen(false)
    setDraftSettings(null)
    setSaveFeedback('')
  }

  function saveSettings(): void {
    if (!draftSettings) {
      return
    }

    updateMapSettings({
      defaultSectionColor: draftSettings.defaultSectionColor,
      signalEndpointChannelStyle: draftSettings.signalEndpointChannelStyle,
      labelStyles: draftSettings.labelStyles,
    })
    setSaveFeedback('Settings saved.')
  }

  return (
    <>
      <aside className={collapsed ? 'sidebar collapsed-panel' : 'sidebar'}>
        <header className="panel-header">
          <div className="panel-header-copy">
            <p className="eyebrow">Toolbox</p>
            {!collapsed && <h2>Build Palette</h2>}
          </div>
          <button
            type="button"
            className="panel-collapse-button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '+' : '−'}
          </button>
        </header>
        {!collapsed && (
          <div className="panel-body">
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

            <div className="palette-group">
              <p className="palette-group-title">Application</p>
              <div className="tool-list" role="list">
                <button type="button" className="tool-button" onClick={openSettingsDialog}>
                  <span>App Settings</span>
                  <small>Configure label styles, section defaults, and signal endpoint channels</small>
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {appSettingsOpen && draftSettings && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="App Settings">
          <div className="settings-dialog">
            <div className="settings-dialog-header">
              <h3>App Settings</h3>
              <button type="button" className="inline-delete" onClick={closeSettingsDialog}>
                Close
              </button>
            </div>

            <div className="settings-dialog-body">
              <div className="settings-subsection">
                <h4>Section Defaults</h4>
                <div className="form-grid compact-grid settings-grid">
                  <label>
                    <span>Default Section Color</span>
                    <input
                      type="color"
                      value={draftSettings.defaultSectionColor}
                      onChange={(event) =>
                        setDraftSettings((current) =>
                          current
                            ? {
                                ...current,
                                defaultSectionColor: event.target.value,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="settings-subsection">
                <h4>Signal Endpoint Channel Settings</h4>
                <div className="form-grid compact-grid settings-grid">
                  <label>
                    <span>Channel Line Color</span>
                    <input
                      type="color"
                      value={draftSettings.signalEndpointChannelStyle.color}
                      onChange={(event) =>
                        setDraftSettings((current) =>
                          current
                            ? {
                                ...current,
                                signalEndpointChannelStyle: {
                                  ...current.signalEndpointChannelStyle,
                                  color: event.target.value,
                                },
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Channel Line Length</span>
                    <input
                      type="number"
                      min={20}
                      max={280}
                      value={draftSettings.signalEndpointChannelStyle.length}
                      onChange={(event) =>
                        setDraftSettings((current) =>
                          current
                            ? {
                                ...current,
                                signalEndpointChannelStyle: {
                                  ...current.signalEndpointChannelStyle,
                                  length: Math.max(20, Math.min(280, Math.round(Number(event.target.value) || 20))),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Channel Line Width</span>
                    <input
                      type="number"
                      min={6}
                      max={60}
                      value={draftSettings.signalEndpointChannelStyle.width}
                      onChange={(event) =>
                        setDraftSettings((current) =>
                          current
                            ? {
                                ...current,
                                signalEndpointChannelStyle: {
                                  ...current.signalEndpointChannelStyle,
                                  width: Math.max(6, Math.min(60, Math.round(Number(event.target.value) || 6))),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              <LabelStyleEditor
                title="Section Label"
                style={draftSettings.labelStyles.section}
                onChange={(nextStyle) =>
                  setDraftSettings((current) =>
                    current
                      ? {
                          ...current,
                          labelStyles: {
                            ...current.labelStyles,
                            section: nextStyle,
                          },
                        }
                      : current,
                  )
                }
              />

              <LabelStyleEditor
                title="Intersection Label"
                style={draftSettings.labelStyles.intersection}
                onChange={(nextStyle) =>
                  setDraftSettings((current) =>
                    current
                      ? {
                          ...current,
                          labelStyles: {
                            ...current.labelStyles,
                            intersection: nextStyle,
                          },
                        }
                      : current,
                  )
                }
              />

              <div className="settings-subsection">
                <h4>Junction Label</h4>
                <div className="form-grid compact-grid settings-grid">
                  <label>
                    <span>Junction Type</span>
                    <select
                      value={activeJunctionType}
                      onChange={(event) => {
                        const nextType = event.target.value as JunctionType
                        setActiveJunctionType(nextType)
                      }}
                    >
                      <option value="Merge">Merge</option>
                      <option value="Split">Split</option>
                      <option value="Junction">Junction</option>
                      <option value="Invalid">Invalid</option>
                    </select>
                  </label>
                </div>
                <LabelStyleEditor
                  title={`${activeJunctionType} Label`}
                  style={draftSettings.labelStyles.junction[activeJunctionType]}
                  onChange={(nextStyle) =>
                    setDraftSettings((current) =>
                      current
                        ? {
                            ...current,
                            labelStyles: {
                              ...current.labelStyles,
                              junction: {
                                ...current.labelStyles.junction,
                                [activeJunctionType]: nextStyle,
                              },
                            },
                          }
                        : current,
                    )
                  }
                />
              </div>
            </div>

            <div className="settings-dialog-actions">
              <button type="button" onClick={saveSettings}>
                Save Settings
              </button>
              <button type="button" className="danger-button" onClick={closeSettingsDialog}>
                Cancel
              </button>
            </div>
            {saveFeedback && (
              <div className="settings-dialog-actions">
                <span>{saveFeedback}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
