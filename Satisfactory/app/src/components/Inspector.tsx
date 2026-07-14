import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react'
import { useEditorStore } from '../store/editorStore'
import type {
  Intersection,
  RailwaySection,
  Signal,
  StationFreightSlot,
  TrainStation,
} from '../models/mapSchema'

function download(filename: string, data: string): void {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()

  URL.revokeObjectURL(url)
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function listToText(values: string[]): string {
  return values.join(', ')
}

function textToList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function renderSelectOptions(values: readonly string[]): JSX.Element[] {
  return values.map((value) => (
    <option key={value} value={value}>
      {value}
    </option>
  ))
}

const freightStationTypes = ['Freight', 'Liquid'] as const
const freightModes = ['Load', 'Unload'] as const
const signalTypes = ['Block', 'Path'] as const
const entranceModes = ['Allowed', 'Blocked'] as const
const sectionKinds = ['Straight', 'Curved'] as const

type JunctionMetadata = {
  id: string
  x: number
  y: number
  type: 'Merge' | 'Split' | 'Junction' | 'Undefined'
  label: string
  connectedSectionNumbers: number[]
  allowedCount: number
  blockedCount: number
}

function formatSectionNumbers(values: number[]): string {
  if (values.length === 0) {
    return 'None'
  }

  return values.join(', ')
}

function JunctionEditor({ junction }: { junction: JunctionMetadata }): JSX.Element {
  return (
    <div className="selection-body">
      <p>{junction.label}</p>

      <div className="form-grid compact-grid">
        <label>
          <span>Junction ID</span>
          <input type="text" value={junction.id} readOnly />
        </label>
        <label>
          <span>Type</span>
          <input type="text" value={junction.type} readOnly />
        </label>
        <label>
          <span>Coordinate X</span>
          <input type="number" value={junction.x} readOnly />
        </label>
        <label>
          <span>Coordinate Y</span>
          <input type="number" value={junction.y} readOnly />
        </label>
        <label>
          <span>Allowed Endpoints</span>
          <input type="number" value={junction.allowedCount} readOnly />
        </label>
        <label>
          <span>Blocked Endpoints</span>
          <input type="number" value={junction.blockedCount} readOnly />
        </label>
      </div>

      <div className="nested-editor">
        <h4>Connected Sections</h4>
        <p>{formatSectionNumbers(junction.connectedSectionNumbers)}</p>
      </div>
    </div>
  )
}

function distanceBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getCurveBendLimits(chordLength: number): { min: number; max: number } {
  const min = Math.max(30, Math.round(chordLength * 0.12))
  const max = Math.min(480, Math.round(chordLength * 0.85))
  return { min, max }
}

function StationEditor({
  station,
  updateStation,
}: {
  station: TrainStation
  updateStation: (id: string, patch: Partial<TrainStation>) => void
}): JSX.Element {
  return (
    <div className="selection-body">
      <p>
        Station #{station.stationNumber} - {station.stationName}
      </p>

      <div className="form-grid compact-grid">
        <label>
          <span>Station ID</span>
          <input type="text" value={station.id} readOnly />
        </label>
        <label>
          <span>Station Name</span>
          <input
            type="text"
            value={station.stationName}
            onChange={(event) => updateStation(station.id, { stationName: event.target.value })}
          />
        </label>
        <label>
          <span>Station Number</span>
          <input
            type="number"
            value={station.stationNumber}
            onChange={(event) => updateStation(station.id, { stationNumber: toNumber(event.target.value) })}
          />
        </label>
        <label>
          <span>Color</span>
          <input
            type="color"
            value={station.color}
            onChange={(event) => updateStation(station.id, { color: event.target.value })}
          />
        </label>
        <label>
          <span>Section In Number</span>
          <input
            type="number"
            value={station.sectionInNumber ?? ''}
            onChange={(event) =>
              updateStation(station.id, { sectionInNumber: toNullableNumber(event.target.value) })
            }
          />
        </label>
        <label>
          <span>Section Out Number</span>
          <input
            type="number"
            value={station.sectionOutNumber ?? ''}
            onChange={(event) =>
              updateStation(station.id, { sectionOutNumber: toNullableNumber(event.target.value) })
            }
          />
        </label>
        <label>
          <span>Inbound X</span>
          <input
            type="number"
            value={station.inbound.x}
            onChange={(event) =>
              updateStation(station.id, {
                inbound: { ...station.inbound, x: toNumber(event.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>Inbound Y</span>
          <input
            type="number"
            value={station.inbound.y}
            onChange={(event) =>
              updateStation(station.id, {
                inbound: { ...station.inbound, y: toNumber(event.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>Outbound X</span>
          <input
            type="number"
            value={station.outbound.x}
            onChange={(event) =>
              updateStation(station.id, {
                outbound: { ...station.outbound, x: toNumber(event.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>Outbound Y</span>
          <input
            type="number"
            value={station.outbound.y}
            onChange={(event) =>
              updateStation(station.id, {
                outbound: { ...station.outbound, y: toNumber(event.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>Liquid Freight Count</span>
          <input
            type="number"
            value={station.liquidFreightStationCount}
            onChange={(event) =>
              updateStation(station.id, {
                liquidFreightStationCount: toNumber(event.target.value),
              })
            }
          />
        </label>
        <label>
          <span>Solid Freight Count</span>
          <input
            type="number"
            value={station.solidFreightStationCount}
            onChange={(event) =>
              updateStation(station.id, {
                solidFreightStationCount: toNumber(event.target.value),
              })
            }
          />
        </label>
      </div>

      <div className="nested-editor">
        <div className="nested-editor-head">
          <h4>Freight Station Sequence</h4>
          <button
            type="button"
            onClick={() => {
              const nextSlot: StationFreightSlot = {
                slotIndex: station.freightStationSequence.length + 1,
                stationType: 'Freight',
                mode: 'Load',
                material: '',
              }
              updateStation(station.id, {
                freightStationSequence: [...station.freightStationSequence, nextSlot],
              })
            }}
          >
            Add Slot
          </button>
        </div>

        <div className="nested-list">
          {station.freightStationSequence.length === 0 && <p>No freight sequence entries yet.</p>}
          {station.freightStationSequence.map((slot, index) => (
            <div key={`${station.id}-slot-${index}`} className="nested-row">
              <label>
                <span>Slot</span>
                <input
                  type="number"
                  value={slot.slotIndex}
                  onChange={(event) => {
                    const next = station.freightStationSequence.slice()
                    next[index] = { ...slot, slotIndex: toNumber(event.target.value) }
                    updateStation(station.id, { freightStationSequence: next })
                  }}
                />
              </label>
              <label>
                <span>Station Type</span>
                <select
                  value={slot.stationType}
                  onChange={(event) => {
                    const next = station.freightStationSequence.slice()
                    next[index] = {
                      ...slot,
                      stationType: event.target.value as StationFreightSlot['stationType'],
                    }
                    updateStation(station.id, { freightStationSequence: next })
                  }}
                >
                  {renderSelectOptions(freightStationTypes)}
                </select>
              </label>
              <label>
                <span>Mode</span>
                <select
                  value={slot.mode}
                  onChange={(event) => {
                    const next = station.freightStationSequence.slice()
                    next[index] = {
                      ...slot,
                      mode: event.target.value as StationFreightSlot['mode'],
                    }
                    updateStation(station.id, { freightStationSequence: next })
                  }}
                >
                  {renderSelectOptions(freightModes)}
                </select>
              </label>
              <label>
                <span>Material</span>
                <input
                  type="text"
                  value={slot.material}
                  onChange={(event) => {
                    const next = station.freightStationSequence.slice()
                    next[index] = { ...slot, material: event.target.value }
                    updateStation(station.id, { freightStationSequence: next })
                  }}
                />
              </label>
              <button
                type="button"
                className="inline-delete"
                onClick={() => {
                  const next = station.freightStationSequence.filter((_, itemIndex) => itemIndex !== index)
                  updateStation(station.id, { freightStationSequence: next })
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <label>
        <span>Freight Section Materials</span>
        <textarea
          rows={3}
          value={listToText(station.freightSectionMaterials)}
          onChange={(event) =>
            updateStation(station.id, { freightSectionMaterials: textToList(event.target.value) })
          }
        />
      </label>

      <label>
        <span>Notes</span>
        <textarea
          value={station.notes}
          onChange={(event) => updateStation(station.id, { notes: event.target.value })}
          rows={5}
        />
      </label>
    </div>
  )
}

function SectionEditor({
  section,
  updateSection,
}: {
  section: RailwaySection
  updateSection: (id: string, patch: Partial<RailwaySection>) => void
}): JSX.Element {
  const dx = section.endpoint2.coordinate.x - section.endpoint1.coordinate.x
  const dy = section.endpoint2.coordinate.y - section.endpoint1.coordinate.y
  const chordLength = distanceBetweenPoints(section.endpoint1.coordinate, section.endpoint2.coordinate)
  const safeLength = Math.max(chordLength, 1)
  const directionX = dx / safeLength
  const directionY = dy / safeLength
  const straightLength = Math.round(chordLength)
  const { min: minCurveBend, max: maxCurveBend } = getCurveBendLimits(chordLength)

  function updateStraightLength(nextLengthRaw: number): void {
    const nextLength = clamp(Math.round(nextLengthRaw), 80, 3000)
    const nextEndpoint2 = {
      x: Math.round(section.endpoint1.coordinate.x + directionX * nextLength),
      y: Math.round(section.endpoint1.coordinate.y + directionY * nextLength),
    }

    updateSection(section.id, {
      endpoint2: {
        ...section.endpoint2,
        coordinate: nextEndpoint2,
      },
    })
  }

  function updateCurveBend(nextBendRaw: number): void {
    const sign = section.curveBend >= 0 ? 1 : -1
    const magnitude = clamp(Math.abs(Math.round(nextBendRaw)), minCurveBend, maxCurveBend)
    updateSection(section.id, { curveBend: sign * magnitude })
  }

  return (
    <div className="selection-body">
      <p>
        Section #{section.sectionNumber} - {section.sectionKind}
      </p>

      <div className="form-grid compact-grid">
        <label>
          <span>Section ID</span>
          <input type="text" value={section.id} readOnly />
        </label>
        <label>
          <span>Section Number</span>
          <input
            type="number"
            value={section.sectionNumber}
            onChange={(event) =>
              updateSection(section.id, { sectionNumber: toNumber(event.target.value) })
            }
          />
        </label>
        <label>
          <span>Section Kind</span>
          <select
            value={section.sectionKind}
            onChange={(event) =>
              updateSection(section.id, {
                sectionKind: event.target.value as RailwaySection['sectionKind'],
                curveBend:
                  event.target.value === 'Curved'
                    ? clamp(Math.abs(section.curveBend), minCurveBend, maxCurveBend)
                    : section.curveBend,
              })
            }
          >
            {renderSelectOptions(sectionKinds)}
          </select>
        </label>
        <label>
          <span>Color</span>
          <input
            type="color"
            value={section.color}
            onChange={(event) => updateSection(section.id, { color: event.target.value })}
          />
        </label>
      </div>

      {section.sectionKind === 'Straight' && (
        <div className="nested-editor">
          <h4>Straight Geometry</h4>
          <div className="form-grid compact-grid">
            <label>
              <span>Length</span>
              <input
                type="number"
                min={80}
                max={3000}
                value={straightLength}
                onChange={(event) => updateStraightLength(toNumber(event.target.value))}
              />
            </label>
            <label>
              <span>Preview Heading</span>
              <input
                type="text"
                readOnly
                value={`${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)} deg`}
              />
            </label>
          </div>
        </div>
      )}

      {section.sectionKind === 'Curved' && (
        <div className="nested-editor">
          <h4>Curved Geometry</h4>
          <div className="form-grid compact-grid">
            <label>
              <span>Curve Bend</span>
              <input
                type="number"
                min={minCurveBend}
                max={maxCurveBend}
                value={Math.abs(Math.round(section.curveBend))}
                onChange={(event) => updateCurveBend(toNumber(event.target.value))}
              />
            </label>
            <label>
              <span>Allowed Range</span>
              <input type="text" readOnly value={`${minCurveBend}..${maxCurveBend}`} />
            </label>
          </div>

          <div className="selection-actions">
            <button
              type="button"
              onClick={() => updateSection(section.id, { curveBend: section.curveBend * -1 })}
            >
              Flip Curve Direction
            </button>
          </div>
        </div>
      )}

      <div className="nested-editor">
        <h4>Endpoint 1</h4>
        <div className="form-grid compact-grid">
          <label>
            <span>Connected Section</span>
            <input
              type="number"
              value={section.endpoint1.sectionNumber}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint1: {
                    ...section.endpoint1,
                    sectionNumber: toNumber(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            <span>X</span>
            <input
              type="number"
              value={section.endpoint1.coordinate.x}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint1: {
                    ...section.endpoint1,
                    coordinate: { ...section.endpoint1.coordinate, x: toNumber(event.target.value) },
                  },
                })
              }
            />
          </label>
          <label>
            <span>Y</span>
            <input
              type="number"
              value={section.endpoint1.coordinate.y}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint1: {
                    ...section.endpoint1,
                    coordinate: { ...section.endpoint1.coordinate, y: toNumber(event.target.value) },
                  },
                })
              }
            />
          </label>
          <label>
            <span>Signal 1</span>
            <select
              value={section.endpoint1.signal1 ?? ''}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint1: {
                    ...section.endpoint1,
                    signal1: event.target.value === '' ? null : (event.target.value as 'Block' | 'Path'),
                  },
                })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Signal 2</span>
            <select
              value={section.endpoint1.signal2 ?? ''}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint1: {
                    ...section.endpoint1,
                    signal2: event.target.value === '' ? null : (event.target.value as 'Block' | 'Path'),
                  },
                })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Entrance Mode</span>
            <select
              value={section.endpoint1.entranceMode}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint1: {
                    ...section.endpoint1,
                    entranceMode: event.target.value as 'Allowed' | 'Blocked',
                  },
                })
              }
            >
              {renderSelectOptions(entranceModes)}
            </select>
          </label>
        </div>
      </div>

      <div className="nested-editor">
        <h4>Endpoint 2</h4>
        <div className="form-grid compact-grid">
          <label>
            <span>Connected Section</span>
            <input
              type="number"
              value={section.endpoint2.sectionNumber}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint2: {
                    ...section.endpoint2,
                    sectionNumber: toNumber(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            <span>X</span>
            <input
              type="number"
              value={section.endpoint2.coordinate.x}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint2: {
                    ...section.endpoint2,
                    coordinate: { ...section.endpoint2.coordinate, x: toNumber(event.target.value) },
                  },
                })
              }
            />
          </label>
          <label>
            <span>Y</span>
            <input
              type="number"
              value={section.endpoint2.coordinate.y}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint2: {
                    ...section.endpoint2,
                    coordinate: { ...section.endpoint2.coordinate, y: toNumber(event.target.value) },
                  },
                })
              }
            />
          </label>
          <label>
            <span>Signal 1</span>
            <select
              value={section.endpoint2.signal1 ?? ''}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint2: {
                    ...section.endpoint2,
                    signal1: event.target.value === '' ? null : (event.target.value as 'Block' | 'Path'),
                  },
                })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Signal 2</span>
            <select
              value={section.endpoint2.signal2 ?? ''}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint2: {
                    ...section.endpoint2,
                    signal2: event.target.value === '' ? null : (event.target.value as 'Block' | 'Path'),
                  },
                })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Entrance Mode</span>
            <select
              value={section.endpoint2.entranceMode}
              onChange={(event) =>
                updateSection(section.id, {
                  endpoint2: {
                    ...section.endpoint2,
                    entranceMode: event.target.value as 'Allowed' | 'Blocked',
                  },
                })
              }
            >
              {renderSelectOptions(entranceModes)}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

function SignalEditor({
  signal,
  updateSignal,
}: {
  signal: Signal
  updateSignal: (id: string, patch: Partial<Signal>) => void
}): JSX.Element {
  return (
    <div className="selection-body">
      <p>
        {signal.signalType} Signal #{signal.signalNumber}
      </p>

      <div className="form-grid compact-grid">
        <label>
          <span>Signal ID</span>
          <input type="text" value={signal.id} readOnly />
        </label>
        <label>
          <span>Signal Type</span>
          <select
            value={signal.signalType}
            onChange={(event) =>
              updateSignal(signal.id, {
                signalType: event.target.value as Signal['signalType'],
              })
            }
          >
            {renderSelectOptions(signalTypes)}
          </select>
        </label>
        <label>
          <span>Color</span>
          <input
            type="color"
            value={signal.color}
            onChange={(event) => updateSignal(signal.id, { color: event.target.value })}
          />
        </label>
        <label>
          <span>Signal Number</span>
          <input
            type="number"
            value={signal.signalNumber}
            onChange={(event) =>
              updateSignal(signal.id, { signalNumber: toNumber(event.target.value) })
            }
          />
        </label>
        <label>
          <span>X</span>
          <input
            type="number"
            value={signal.coordinate.x}
            onChange={(event) =>
              updateSignal(signal.id, {
                coordinate: { ...signal.coordinate, x: toNumber(event.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>Y</span>
          <input
            type="number"
            value={signal.coordinate.y}
            onChange={(event) =>
              updateSignal(signal.id, {
                coordinate: { ...signal.coordinate, y: toNumber(event.target.value) },
              })
            }
          />
        </label>
      </div>

      <div className="nested-editor">
        <div className="nested-editor-head">
          <h4>Section Connections</h4>
          <button
            type="button"
            onClick={() =>
              updateSignal(signal.id, {
                sectionConnections: [...signal.sectionConnections, 0],
              })
            }
          >
            Add Connection
          </button>
        </div>

        <div className="nested-list">
          {signal.sectionConnections.length === 0 && <p>No section connections yet.</p>}
          {signal.sectionConnections.map((connection, index) => (
            <div key={`${signal.id}-connection-${index}`} className="nested-row">
              <label>
                <span>Section #{index + 1}</span>
                <input
                  type="number"
                  value={connection}
                  onChange={(event) => {
                    const next = signal.sectionConnections.slice()
                    next[index] = toNumber(event.target.value)
                    updateSignal(signal.id, { sectionConnections: next })
                  }}
                />
              </label>
              <button
                type="button"
                className="inline-delete"
                onClick={() => {
                  const next = signal.sectionConnections.filter((_, itemIndex) => itemIndex !== index)
                  updateSignal(signal.id, { sectionConnections: next })
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function IntersectionEditor({
  intersection,
  updateIntersection,
}: {
  intersection: Intersection
  updateIntersection: (id: string, patch: Partial<Intersection>) => void
}): JSX.Element {
  return (
    <div className="selection-body">
      <p>
        Intersection #{intersection.intersectionNumber}
      </p>

      <div className="form-grid compact-grid">
        <label>
          <span>Intersection ID</span>
          <input type="text" value={intersection.id} readOnly />
        </label>
        <label>
          <span>Intersection Number</span>
          <input
            type="number"
            value={intersection.intersectionNumber}
            onChange={(event) =>
              updateIntersection(intersection.id, {
                intersectionNumber: toNumber(event.target.value),
              })
            }
          />
        </label>
        <label>
          <span>Center X</span>
          <input
            type="number"
            value={intersection.center.x}
            onChange={(event) =>
              updateIntersection(intersection.id, {
                center: { ...intersection.center, x: toNumber(event.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>Center Y</span>
          <input
            type="number"
            value={intersection.center.y}
            onChange={(event) =>
              updateIntersection(intersection.id, {
                center: { ...intersection.center, y: toNumber(event.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>Arm Length</span>
          <input
            type="number"
            min={40}
            max={240}
            value={intersection.armLength}
            onChange={(event) =>
              updateIntersection(intersection.id, {
                armLength: Math.max(40, Math.min(240, toNumber(event.target.value))),
              })
            }
          />
        </label>
        <label>
          <span>Color</span>
          <input
            type="color"
            value={intersection.color}
            onChange={(event) => updateIntersection(intersection.id, { color: event.target.value })}
          />
        </label>
      </div>
    </div>
  )
}

export function Inspector(): JSX.Element {
  const map = useEditorStore((state) => state.map)
  const selectedEntity = useEditorStore((state) => state.selectedEntity)
  const updateMapTitle = useEditorStore((state) => state.updateMapTitle)
  const updateGridSize = useEditorStore((state) => state.updateGridSize)
  const updateStation = useEditorStore((state) => state.updateStation)
  const updateSection = useEditorStore((state) => state.updateSection)
  const updateIntersection = useEditorStore((state) => state.updateIntersection)
  const updateSignal = useEditorStore((state) => state.updateSignal)
  const deleteSelected = useEditorStore((state) => state.deleteSelected)
  const exportMap = useEditorStore((state) => state.exportMap)
  const loadFromDisk = useEditorStore((state) => state.loadFromDisk)
  const clearMap = useEditorStore((state) => state.clearMap)
  const getSectionConnectivityGraph = useEditorStore((state) => state.getSectionConnectivityGraph)
  const findSectionPath = useEditorStore((state) => state.findSectionPath)
  const [pathTarget, setPathTarget] = useState('')

  const selectedStation = useMemo(() => {
    if (selectedEntity?.entityType !== 'station') {
      return null
    }
    return map.stations.find((x) => x.id === selectedEntity.id) ?? null
  }, [map.stations, selectedEntity])

  const selectedSection = useMemo(() => {
    if (selectedEntity?.entityType !== 'section') {
      return null
    }
    return map.sections.find((x) => x.id === selectedEntity.id) ?? null
  }, [map.sections, selectedEntity])

  const selectedSignal = useMemo(() => {
    if (selectedEntity?.entityType !== 'signal') {
      return null
    }
    return map.signals.find((x) => x.id === selectedEntity.id) ?? null
  }, [map.signals, selectedEntity])

  const selectedIntersection = useMemo(() => {
    if (selectedEntity?.entityType !== 'intersection') {
      return null
    }
    return map.intersections.find((x) => x.id === selectedEntity.id) ?? null
  }, [map.intersections, selectedEntity])

  const junctionMetadata = useMemo(() => {
    const grouped: Record<
      string,
      Array<{ sectionNumber: number; entranceMode: 'Allowed' | 'Blocked' }>
    > = {}

    for (const section of map.sections) {
      const endpoints: Array<{ x: number; y: number; entranceMode: 'Allowed' | 'Blocked' }> = [
        {
          x: section.endpoint1.coordinate.x,
          y: section.endpoint1.coordinate.y,
          entranceMode: section.endpoint1.entranceMode,
        },
        {
          x: section.endpoint2.coordinate.x,
          y: section.endpoint2.coordinate.y,
          entranceMode: section.endpoint2.entranceMode,
        },
      ]

      for (const endpoint of endpoints) {
        const key = `${Math.round(endpoint.x)}:${Math.round(endpoint.y)}`
        if (!grouped[key]) {
          grouped[key] = []
        }

        grouped[key].push({
          sectionNumber: section.sectionNumber,
          entranceMode: endpoint.entranceMode,
        })
      }
    }

    const junctions: JunctionMetadata[] = []
    const typeCounters: Record<'Merge' | 'Split' | 'Junction' | 'Undefined', number> = {
      Merge: 0,
      Split: 0,
      Junction: 0,
      Undefined: 0,
    }

    for (const [id, entries] of Object.entries(grouped)) {
      if (entries.length < 3) {
        continue
      }

      const [xText, yText] = id.split(':')
      const x = Number(xText)
      const y = Number(yText)
      const allowedCount = entries.filter((entry) => entry.entranceMode === 'Allowed').length
      const blockedCount = entries.length - allowedCount

      let type: JunctionMetadata['type'] = 'Junction'
      if (blockedCount >= 2 && allowedCount === 1) {
        type = 'Merge'
      } else if (allowedCount >= 2 && blockedCount === 1) {
        type = 'Split'
      }

      typeCounters[type] += 1
      const connectedSectionNumbers = Array.from(
        new Set(entries.map((entry) => entry.sectionNumber)),
      ).sort((a, b) => a - b)

      junctions.push({
        id,
        x,
        y,
        type,
        label: `${type} ${typeCounters[type]}`,
        connectedSectionNumbers,
        allowedCount,
        blockedCount,
      })
    }

    return junctions
  }, [map.sections])

  const selectedJunction = useMemo(() => {
    if (selectedEntity?.entityType !== 'junction') {
      return null
    }

    return junctionMetadata.find((junction) => junction.id === selectedEntity.id) ?? null
  }, [junctionMetadata, selectedEntity])

  const sectionGraph = useMemo(() => getSectionConnectivityGraph(), [map.sections, getSectionConnectivityGraph])

  const selectedSectionNeighbors = useMemo(() => {
    if (!selectedSection) {
      return []
    }

    return sectionGraph.adjacency[selectedSection.sectionNumber] ?? []
  }, [sectionGraph, selectedSection])

  const selectedSectionReachable = useMemo(() => {
    if (!selectedSection) {
      return []
    }

    const visited = new Set<number>([selectedSection.sectionNumber])
    const queue: number[] = [selectedSection.sectionNumber]

    while (queue.length > 0) {
      const current = queue.shift() as number
      const neighbors = sectionGraph.adjacency[current] ?? []
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue
        }

        visited.add(neighbor)
        queue.push(neighbor)
      }
    }

    return Array.from(visited)
      .sort((a, b) => a - b)
      .filter((item) => item !== selectedSection.sectionNumber)
  }, [sectionGraph, selectedSection])

  const selectedSectionPath = useMemo(() => {
    if (!selectedSection) {
      return null
    }

    const target = Number(pathTarget)
    if (!Number.isFinite(target) || pathTarget.trim() === '') {
      return null
    }

    return findSectionPath(selectedSection.sectionNumber, target)
  }, [findSectionPath, pathTarget, selectedSection])

  useEffect(() => {
    setPathTarget('')
  }, [selectedSection?.id])

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

  return (
    <aside className="inspector">
      <header className="panel-header">
        <p className="eyebrow">Properties</p>
        <h2>Inspector</h2>
      </header>

      <div className="form-grid">
        <label>
          <span>Map Title</span>
          <input
            type="text"
            value={map.settings.title}
            onChange={(event) => updateMapTitle(event.target.value)}
          />
        </label>
      </div>

      <section className="ui-settings">
        <h3>UI Settings</h3>
        <div className="form-grid compact-grid">
          <label>
            <span>Grid Width</span>
            <input
              type="number"
              min={10}
              value={map.settings.worldWidth}
              onChange={(event) => updateGridSize(Number(event.target.value), map.settings.worldHeight)}
            />
          </label>
          <label>
            <span>Grid Height</span>
            <input
              type="number"
              min={10}
              value={map.settings.worldHeight}
              onChange={(event) => updateGridSize(map.settings.worldWidth, Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <div className="io-actions">
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
          Clear Grid / Save
        </button>

        <label className="file-import">
          <span>Import JSON</span>
          <input type="file" accept="application/json" onChange={handleImport} />
        </label>
      </div>

      <div className="selection-actions">
        <button
          type="button"
          className="danger-button"
          onClick={() => deleteSelected()}
          disabled={
            !selectedStation &&
            !selectedSection &&
            !selectedSignal &&
            !selectedIntersection &&
            !selectedJunction
          }
        >
          Delete Selected
        </button>
      </div>

      <section className="selection-details">
        <h3>Selection</h3>
        {!selectedStation &&
          !selectedSection &&
          !selectedSignal &&
          !selectedIntersection &&
          !selectedJunction && (
          <p>Nothing selected. Choose Select tool and click an entity.</p>
          )}

        {selectedStation && <StationEditor station={selectedStation} updateStation={updateStation} />}
        {selectedSection && <SectionEditor section={selectedSection} updateSection={updateSection} />}
        {selectedSection && (
          <div className="nested-editor">
            <h4>Connectivity</h4>
            <p>Directly Connected: {formatSectionNumbers(selectedSectionNeighbors)}</p>
            <p>Reachable Sections: {formatSectionNumbers(selectedSectionReachable)}</p>

            <div className="form-grid compact-grid">
              <label>
                <span>Path Target Section #</span>
                <input
                  type="number"
                  value={pathTarget}
                  onChange={(event) => setPathTarget(event.target.value)}
                />
              </label>
            </div>

            {pathTarget.trim() !== '' && (
              <p>
                Path:{' '}
                {selectedSectionPath ? selectedSectionPath.join(' -> ') : 'No path found'}
              </p>
            )}
          </div>
        )}
        {selectedSignal && <SignalEditor signal={selectedSignal} updateSignal={updateSignal} />}
        {selectedIntersection && (
          <IntersectionEditor
            intersection={selectedIntersection}
            updateIntersection={updateIntersection}
          />
        )}
        {selectedJunction && <JunctionEditor junction={selectedJunction} />}
      </section>

      <section className="stats-panel">
        <h3>Map Totals</h3>
        <p>Stations: {map.stations.length}</p>
        <p>Sections: {map.sections.length}</p>
        <p>Intersections: {map.intersections.length}</p>
        <p>Signals: {map.signals.length}</p>
      </section>

      <section className="stats-panel legend-panel">
        <h3>Canvas Legend</h3>
        <p>Station layout: Freight blocks on the left, title and station number on the right.</p>
        <p>Outbound indicator: OUT + arrow points toward station outbound direction.</p>
        <p>Freight block colors: Magenta = Freight, Cyan = Liquid.</p>
        <p>Mode labels: L = Load, U = Unload.</p>
        <p>Junction markers: Merge (gray square), Split (red triangle), Junction (black circle), Undefined (gray diamond).</p>
        <p>Signal status dot: Green = connected, Amber = partial, Gray = unconnected.</p>
        <p>Section labels: Number shown at each section center.</p>
        <p>Junction labels: Merge #, Split #, Junction #, Undefined #.</p>
        <p>Intersection labels: Intersection # with fixed four-arm connection points.</p>
      </section>
    </aside>
  )
}
