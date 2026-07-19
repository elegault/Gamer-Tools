import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react'
import { useEditorStore } from '../store/editorStore'
import type {
  Intersection,
  MapDocument,
  RailwaySection,
  SectionDirection,
  Signal,
  SignalSocketState,
  SignalType,
  StationFreightSlot,
  TrainStation,
} from '../models/mapSchema'
import {
  buildConnectionReview,
  buildJunctionMetadata,
} from '../models/connectionReview'

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

function getSectionDisplayLabel(section: Pick<RailwaySection, 'sectionName' | 'sectionNumber'>): string {
  const sectionName = section.sectionName.trim() || `Section ${section.sectionNumber}`
  return sectionName
}

const freightStationTypes = ['Freight', 'Liquid'] as const
const freightModes = ['Load', 'Unload'] as const
const signalTypes = ['Block', 'Path'] as const
const signalSocketStates = ['Suggested', 'Implemented', 'Removed', 'Overridden'] as const
const sectionKinds = ['Straight', 'Curved'] as const

function getDerivedEntranceMode(
  directionMode: SectionDirection | undefined,
  endpointKey: 'endpoint1' | 'endpoint2',
): 'Allowed' | 'Blocked' {
  const mode = directionMode ?? 'Bidirectional'

  if (mode === 'Bidirectional') {
    return 'Allowed'
  }

  if (mode === 'OneWay1To2') {
    return endpointKey === 'endpoint1' ? 'Allowed' : 'Blocked'
  }

  return endpointKey === 'endpoint1' ? 'Blocked' : 'Allowed'
}

type EndpointSignalSocketState = {
  state: SignalSocketState
  expectedType: SignalType | null
  overrideType: SignalType | null
}

function getEndpointSignalSocketState(
  endpoint: RailwaySection['endpoint1'],
  side: 'Left' | 'Right',
): EndpointSignalSocketState {
  const legacySignalType = side === 'Left' ? endpoint.signal1 : endpoint.signal2
  const socket = endpoint.signalSockets?.[side]

  if (!socket) {
    return {
      state: 'Suggested',
      expectedType: legacySignalType,
      overrideType: null,
    }
  }

  return {
    state: socket.state,
    expectedType: socket.expectedType ?? legacySignalType,
    overrideType: socket.overrideType,
  }
}

function getEffectiveSignalType(socket: EndpointSignalSocketState): SignalType | null {
  if (socket.state === 'Removed') {
    return null
  }

  if (socket.state === 'Overridden') {
    return socket.overrideType
  }

  return socket.expectedType
}

function getSectionEndpointConnectionDisplay(
  map: Pick<MapDocument, 'sections' | 'stations' | 'intersections'>,
  junctionLabelsByCoordinate: Map<string, string>,
  section: RailwaySection,
  endpointKey: 'endpoint1' | 'endpoint2',
): string {
  const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2

  if (endpoint.stationConnection) {
    const station = map.stations.find((item) => item.id === endpoint.stationConnection?.stationId)
    if (station) {
      return `Train Station (${station.stationName})`
    }
  }

  const coordinateKey = `${Math.round(endpoint.coordinate.x)}:${Math.round(endpoint.coordinate.y)}`
  const connectedEndpoints = map.sections.flatMap((candidate) => {
    const matches: Array<{ sectionId: string; sectionNumber: number }> = []
    if (Math.round(candidate.endpoint1.coordinate.x) === Math.round(endpoint.coordinate.x) &&
      Math.round(candidate.endpoint1.coordinate.y) === Math.round(endpoint.coordinate.y)) {
      matches.push({ sectionId: candidate.id, sectionNumber: candidate.sectionNumber })
    }

    if (Math.round(candidate.endpoint2.coordinate.x) === Math.round(endpoint.coordinate.x) &&
      Math.round(candidate.endpoint2.coordinate.y) === Math.round(endpoint.coordinate.y)) {
      matches.push({ sectionId: candidate.id, sectionNumber: candidate.sectionNumber })
    }

    return matches
  })

  const connectedOtherSections = connectedEndpoints.filter((item) => item.sectionId !== section.id)

  if (connectedOtherSections.length === 1) {
    const connectedSection = map.sections.find((item) => item.id === connectedOtherSections[0].sectionId)
    return connectedSection ? getSectionDisplayLabel(connectedSection) : `Section (${connectedOtherSections[0].sectionId})`
  }

  if (connectedOtherSections.length > 1) {
    return junctionLabelsByCoordinate.get(coordinateKey) ?? `Junction ${coordinateKey}`
  }

  for (const intersection of map.intersections) {
    const arm = Math.max(40, intersection.armLength)
    const points = [
      { x: intersection.center.x, y: intersection.center.y - arm },
      { x: intersection.center.x + arm, y: intersection.center.y },
      { x: intersection.center.x, y: intersection.center.y + arm },
      { x: intersection.center.x - arm, y: intersection.center.y },
    ]

    const connectedToIntersection = points.some((point) => {
      const dx = point.x - endpoint.coordinate.x
      const dy = point.y - endpoint.coordinate.y
      return Math.sqrt(dx * dx + dy * dy) <= 16
    })

    if (connectedToIntersection) {
      return `Intersection ${intersection.intersectionNumber}`
    }
  }

  return 'Unconnected'
}

type JunctionMetadata = {
  id: string
  x: number
  y: number
  type: 'Merge' | 'Split' | 'Junction' | 'Invalid'
  name: string
  junctionNumber: number
  mergeNumber: number | null
  splitNumber: number | null
  displayNumber: number
  displayLabel: string
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

function JunctionEditor({
  junction,
  onChangeNumber,
  onChangeName,
  onMove,
  beginHistoryBatch,
  commitHistoryBatch,
}: {
  junction: JunctionMetadata
  onChangeNumber: (
    junctionId: string,
    numberType: 'junction' | 'merge' | 'split',
    junctionNumber: number,
  ) => void
  onChangeName: (junctionId: string, name: string) => void
  onMove: (junctionId: string, x: number, y: number) => void
  beginHistoryBatch: () => void
  commitHistoryBatch: () => void
}): JSX.Element {
  return (
    <div className="selection-body">
      <p>{junction.displayLabel}</p>

      <div className="form-grid compact-grid">
        <label>
          <span>Name</span>
          <input
            type="text"
            value={junction.name}
            onChange={(event) => onChangeName(junction.id, event.target.value)}
          />
        </label>
        <label>
          <span>Junction Number</span>
          <input
            type="number"
            value={junction.junctionNumber}
            onChange={(event) => onChangeNumber(junction.id, 'junction', toNumber(event.target.value))}
          />
        </label>
        {junction.type === 'Merge' && (
          <label>
            <span>Merge Number</span>
            <input
              type="number"
              value={junction.mergeNumber ?? 0}
              onChange={(event) => onChangeNumber(junction.id, 'merge', toNumber(event.target.value))}
            />
          </label>
        )}
        {junction.type === 'Split' && (
          <label>
            <span>Split Number</span>
            <input
              type="number"
              value={junction.splitNumber ?? 0}
              onChange={(event) => onChangeNumber(junction.id, 'split', toNumber(event.target.value))}
            />
          </label>
        )}
        <label>
          <span>Coordinate X</span>
          <input
            type="number"
            value={junction.x}
            onFocus={beginHistoryBatch}
            onBlur={commitHistoryBatch}
            onChange={(event) => onMove(junction.id, toNumber(event.target.value), junction.y)}
          />
        </label>
        <label>
          <span>Coordinate Y</span>
          <input
            type="number"
            value={junction.y}
            onFocus={beginHistoryBatch}
            onBlur={commitHistoryBatch}
            onChange={(event) => onMove(junction.id, junction.x, toNumber(event.target.value))}
          />
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

function getCurveBendLimits(section: RailwaySection, chordLength: number): { min: number; max: number } {
  const min = Math.max(0, Math.round(section.curveBendMin))
  const fallbackMax = Math.round(chordLength * 0.85)
  const max = Math.max(min, Math.min(1000, Math.round(section.curveBendMax ?? fallbackMax)))
  return { min, max }
}

function StationEditor({
  station,
  updateStation,
  moveStation,
}: {
  station: TrainStation
  updateStation: (id: string, patch: Partial<TrainStation>) => void
  moveStation: (id: string, x: number, y: number) => void
}): JSX.Element {
  function moveStationCoordinate(
    axis: 'x' | 'y',
    endpointKey: 'inbound' | 'outbound',
    nextValue: number,
  ): void {
    const anchor = {
      x: (station.inbound.x + station.outbound.x) / 2,
      y: (station.inbound.y + station.outbound.y) / 2,
    }
    const currentPoint = station[endpointKey]
    const delta = nextValue - currentPoint[axis]

    moveStation(
      station.id,
      axis === 'x' ? anchor.x + delta : anchor.x,
      axis === 'y' ? anchor.y + delta : anchor.y,
    )
  }

  const resolvedLayoutDirection =
    station.layoutDirection === 'Default'
      ? 'HorizontalMetaRight'
      : station.layoutDirection === 'Reversed'
        ? 'HorizontalMetaLeft'
        : station.layoutDirection

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
          <span>Layout</span>
          <select
            value={resolvedLayoutDirection}
            onChange={(event) =>
              updateStation(station.id, {
                layoutDirection: event.target.value as TrainStation['layoutDirection'],
              })
            }
          >
            <option value="HorizontalMetaRight">Horizontal: IN Left, OUT Right</option>
            <option value="HorizontalMetaLeft">Horizontal: IN Right, OUT Left</option>
            <option value="VerticalMetaTop">Vertical: IN Bottom, OUT Top</option>
            <option value="VerticalMetaBottom">Vertical: IN Top, OUT Bottom</option>
          </select>
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
            onChange={(event) => moveStationCoordinate('x', 'inbound', toNumber(event.target.value))}
          />
        </label>
        <label>
          <span>Inbound Y</span>
          <input
            type="number"
            value={station.inbound.y}
            onChange={(event) => moveStationCoordinate('y', 'inbound', toNumber(event.target.value))}
          />
        </label>
        <label>
          <span>Outbound X</span>
          <input
            type="number"
            value={station.outbound.x}
            onChange={(event) => moveStationCoordinate('x', 'outbound', toNumber(event.target.value))}
          />
        </label>
        <label>
          <span>Outbound Y</span>
          <input
            type="number"
            value={station.outbound.y}
            onChange={(event) => moveStationCoordinate('y', 'outbound', toNumber(event.target.value))}
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
  map,
  junctionLabelsByCoordinate,
  section,
  defaultSectionColor,
  updateSection,
  moveSectionEndpoint,
}: {
  map: Pick<MapDocument, 'sections' | 'stations' | 'intersections'>
  junctionLabelsByCoordinate: Map<string, string>
  section: RailwaySection
  defaultSectionColor: string
  updateSection: (id: string, patch: Partial<RailwaySection>) => void
  moveSectionEndpoint: (id: string, endpointKey: 'endpoint1' | 'endpoint2', x: number, y: number) => void
}): JSX.Element {
  const dx = section.endpoint2.coordinate.x - section.endpoint1.coordinate.x
  const dy = section.endpoint2.coordinate.y - section.endpoint1.coordinate.y
  const chordLength = distanceBetweenPoints(section.endpoint1.coordinate, section.endpoint2.coordinate)
  const safeLength = Math.max(chordLength, 1)
  const directionX = dx / safeLength
  const directionY = dy / safeLength
  const straightLength = Math.round(chordLength)
  const { min: minCurveBend, max: maxCurveBend } = getCurveBendLimits(section, chordLength)
  const endpoint1ConnectedDisplay = getSectionEndpointConnectionDisplay(
    map,
    junctionLabelsByCoordinate,
    section,
    'endpoint1',
  )
  const endpoint2ConnectedDisplay = getSectionEndpointConnectionDisplay(
    map,
    junctionLabelsByCoordinate,
    section,
    'endpoint2',
  )
  const derivedEndpoint1EntranceMode = getDerivedEntranceMode(section.directionMode, 'endpoint1')
  const derivedEndpoint2EntranceMode = getDerivedEntranceMode(section.directionMode, 'endpoint2')
  const endpoint1SignalLeft = getEndpointSignalSocketState(section.endpoint1, 'Left')
  const endpoint1SignalRight = getEndpointSignalSocketState(section.endpoint1, 'Right')
  const endpoint2SignalLeft = getEndpointSignalSocketState(section.endpoint2, 'Left')
  const endpoint2SignalRight = getEndpointSignalSocketState(section.endpoint2, 'Right')

  function updateEndpointSignalSocket(
    endpointKey: 'endpoint1' | 'endpoint2',
    side: 'Left' | 'Right',
    next: Partial<EndpointSignalSocketState>,
  ): void {
    const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2
    const currentSocket = getEndpointSignalSocketState(endpoint, side)
    const nextSocket: EndpointSignalSocketState = {
      state: next.state ?? currentSocket.state,
      expectedType: next.expectedType === undefined ? currentSocket.expectedType : next.expectedType,
      overrideType: next.overrideType === undefined ? currentSocket.overrideType : next.overrideType,
    }

    if (nextSocket.state === 'Removed') {
      nextSocket.overrideType = null
    }

    if (nextSocket.state !== 'Overridden') {
      nextSocket.overrideType = null
    }

    const effectiveType = getEffectiveSignalType(nextSocket)
    const nextEndpoint = {
      ...endpoint,
      signalSockets: {
        ...(endpoint.signalSockets ?? {
          Left: { state: 'Suggested', expectedType: null, overrideType: null },
          Right: { state: 'Suggested', expectedType: null, overrideType: null },
        }),
        [side]: nextSocket,
      },
      signal1: side === 'Left' ? effectiveType : endpoint.signal1,
      signal2: side === 'Right' ? effectiveType : endpoint.signal2,
    }

    if (endpointKey === 'endpoint1') {
      updateSection(section.id, { endpoint1: nextEndpoint })
      return
    }

    updateSection(section.id, { endpoint2: nextEndpoint })
  }

  function updateStraightLength(nextLengthRaw: number): void {
    const nextLength = clamp(Math.round(nextLengthRaw), 80, 3000)
    const nextEndpoint2 = {
      x: Math.round(section.endpoint1.coordinate.x + directionX * nextLength),
      y: Math.round(section.endpoint1.coordinate.y + directionY * nextLength),
    }

    moveSectionEndpoint(section.id, 'endpoint2', nextEndpoint2.x, nextEndpoint2.y)
  }

  function updateCurveBend(nextBendRaw: number): void {
    const sign = section.curveBend >= 0 ? 1 : -1
    const magnitude = clamp(Math.abs(Math.round(nextBendRaw)), minCurveBend, maxCurveBend)
    updateSection(section.id, { curveBend: sign * magnitude })
  }

  function updateCurveBendLimit(patch: Partial<Pick<RailwaySection, 'curveBendMin' | 'curveBendMax'>>): void {
    const nextMin = patch.curveBendMin ?? section.curveBendMin
    const nextMax = patch.curveBendMax ?? section.curveBendMax
    const normalizedMin = Math.max(0, Math.round(nextMin))
    const normalizedMax = Math.max(normalizedMin, Math.round(nextMax))
    const currentMagnitude = Math.abs(Math.round(section.curveBend))
    const clampedMagnitude = clamp(currentMagnitude, normalizedMin, normalizedMax)

    updateSection(section.id, {
      curveBendMin: normalizedMin,
      curveBendMax: normalizedMax,
      curveBend: (section.curveBend >= 0 ? 1 : -1) * clampedMagnitude,
    })
  }

  return (
    <div className="selection-body">
      <p>{getSectionDisplayLabel(section)}</p>

      <div className="form-grid compact-grid">
        <label>
          <span>Name</span>
          <input
            type="text"
            value={section.sectionName}
            onChange={(event) => updateSection(section.id, { sectionName: event.target.value })}
          />
        </label>
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
          <span>Direction</span>
          <select
            value={section.directionMode ?? 'Bidirectional'}
            onChange={(event) => {
              const nextDirection = event.target.value as SectionDirection
              if (nextDirection === 'Bidirectional') {
                updateSection(section.id, {
                  directionMode: nextDirection,
                  endpoint1: {
                    ...section.endpoint1,
                    entranceMode: getDerivedEntranceMode(nextDirection, 'endpoint1'),
                  },
                  endpoint2: {
                    ...section.endpoint2,
                    entranceMode: getDerivedEntranceMode(nextDirection, 'endpoint2'),
                  },
                })
                return
              }

              if (nextDirection === 'OneWay1To2') {
                updateSection(section.id, {
                  directionMode: nextDirection,
                  endpoint1: {
                    ...section.endpoint1,
                    entranceMode: getDerivedEntranceMode(nextDirection, 'endpoint1'),
                  },
                  endpoint2: {
                    ...section.endpoint2,
                    entranceMode: getDerivedEntranceMode(nextDirection, 'endpoint2'),
                  },
                })
                return
              }

              updateSection(section.id, {
                directionMode: nextDirection,
                endpoint1: {
                  ...section.endpoint1,
                  entranceMode: getDerivedEntranceMode(nextDirection, 'endpoint1'),
                },
                endpoint2: {
                  ...section.endpoint2,
                  entranceMode: getDerivedEntranceMode(nextDirection, 'endpoint2'),
                },
              })
            }}
          >
            <option value="Bidirectional">Bidirectional</option>
            <option value="OneWay1To2">{`${endpoint1ConnectedDisplay} -> ${endpoint2ConnectedDisplay}`}</option>
            <option value="OneWay2To1">{`${endpoint2ConnectedDisplay} -> ${endpoint1ConnectedDisplay}`}</option>
          </select>
        </label>
        <label>
          <span>Color</span>
          <div className="inline-field-actions">
            <input
              type="color"
              value={section.color}
              onChange={(event) => updateSection(section.id, { color: event.target.value })}
            />
            <button
              type="button"
              onClick={() => updateSection(section.id, { color: defaultSectionColor })}
            >
              Reset Color
            </button>
          </div>
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

      <div className="nested-editor">
        <h4>Endpoint 1</h4>
        <div className="form-grid compact-grid">
          <label>
            <span>Connected Section</span>
            <input type="text" value={endpoint1ConnectedDisplay} readOnly />
          </label>
          <label>
            <span>X</span>
            <input type="number" value={section.endpoint1.coordinate.x} readOnly />
          </label>
          <label>
            <span>Y</span>
            <input type="number" value={section.endpoint1.coordinate.y} readOnly />
          </label>
          <label>
            <span>Left Signal State</span>
            <select
              value={endpoint1SignalLeft.state}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint1', 'Left', {
                  state: event.target.value as SignalSocketState,
                })
              }
            >
              {renderSelectOptions(signalSocketStates)}
            </select>
          </label>
          <label>
            <span>Left Signal Type</span>
            <select
              value={
                endpoint1SignalLeft.state === 'Overridden'
                  ? endpoint1SignalLeft.overrideType ?? ''
                  : endpoint1SignalLeft.expectedType ?? ''
              }
              disabled={endpoint1SignalLeft.state === 'Removed'}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint1', 'Left',
                  endpoint1SignalLeft.state === 'Overridden'
                    ? {
                      overrideType: event.target.value === '' ? null : (event.target.value as SignalType),
                    }
                    : {
                      expectedType: event.target.value === '' ? null : (event.target.value as SignalType),
                    })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Right Signal State</span>
            <select
              value={endpoint1SignalRight.state}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint1', 'Right', {
                  state: event.target.value as SignalSocketState,
                })
              }
            >
              {renderSelectOptions(signalSocketStates)}
            </select>
          </label>
          <label>
            <span>Right Signal Type</span>
            <select
              value={
                endpoint1SignalRight.state === 'Overridden'
                  ? endpoint1SignalRight.overrideType ?? ''
                  : endpoint1SignalRight.expectedType ?? ''
              }
              disabled={endpoint1SignalRight.state === 'Removed'}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint1', 'Right',
                  endpoint1SignalRight.state === 'Overridden'
                    ? {
                      overrideType: event.target.value === '' ? null : (event.target.value as SignalType),
                    }
                    : {
                      expectedType: event.target.value === '' ? null : (event.target.value as SignalType),
                    })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Entrance Mode</span>
            <input type="text" value={derivedEndpoint1EntranceMode} readOnly />
          </label>
        </div>
      </div>

      <div className="nested-editor">
        <h4>Endpoint 2</h4>
        <div className="form-grid compact-grid">
          <label>
            <span>Connected Section</span>
            <input type="text" value={endpoint2ConnectedDisplay} readOnly />
          </label>
          <label>
            <span>X</span>
            <input type="number" value={section.endpoint2.coordinate.x} readOnly />
          </label>
          <label>
            <span>Y</span>
            <input type="number" value={section.endpoint2.coordinate.y} readOnly />
          </label>
          <label>
            <span>Left Signal State</span>
            <select
              value={endpoint2SignalLeft.state}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint2', 'Left', {
                  state: event.target.value as SignalSocketState,
                })
              }
            >
              {renderSelectOptions(signalSocketStates)}
            </select>
          </label>
          <label>
            <span>Left Signal Type</span>
            <select
              value={
                endpoint2SignalLeft.state === 'Overridden'
                  ? endpoint2SignalLeft.overrideType ?? ''
                  : endpoint2SignalLeft.expectedType ?? ''
              }
              disabled={endpoint2SignalLeft.state === 'Removed'}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint2', 'Left',
                  endpoint2SignalLeft.state === 'Overridden'
                    ? {
                      overrideType: event.target.value === '' ? null : (event.target.value as SignalType),
                    }
                    : {
                      expectedType: event.target.value === '' ? null : (event.target.value as SignalType),
                    })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Right Signal State</span>
            <select
              value={endpoint2SignalRight.state}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint2', 'Right', {
                  state: event.target.value as SignalSocketState,
                })
              }
            >
              {renderSelectOptions(signalSocketStates)}
            </select>
          </label>
          <label>
            <span>Right Signal Type</span>
            <select
              value={
                endpoint2SignalRight.state === 'Overridden'
                  ? endpoint2SignalRight.overrideType ?? ''
                  : endpoint2SignalRight.expectedType ?? ''
              }
              disabled={endpoint2SignalRight.state === 'Removed'}
              onChange={(event) =>
                updateEndpointSignalSocket('endpoint2', 'Right',
                  endpoint2SignalRight.state === 'Overridden'
                    ? {
                      overrideType: event.target.value === '' ? null : (event.target.value as SignalType),
                    }
                    : {
                      expectedType: event.target.value === '' ? null : (event.target.value as SignalType),
                    })
              }
            >
              <option value="">None</option>
              {renderSelectOptions(signalTypes)}
            </select>
          </label>
          <label>
            <span>Entrance Mode</span>
            <input type="text" value={derivedEndpoint2EntranceMode} readOnly />
          </label>
        </div>
      </div>

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
              <span>Allowed Range Min</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={minCurveBend}
                onChange={(event) => updateCurveBendLimit({ curveBendMin: toNumber(event.target.value) })}
              />
            </label>
            <label>
              <span>Allowed Range Max</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={maxCurveBend}
                onChange={(event) => updateCurveBendLimit({ curveBendMax: toNumber(event.target.value) })}
              />
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
    </div>
  )
}

function SignalEditor({
  signal,
  updateSignal,
  moveSignal,
}: {
  signal: Signal
  updateSignal: (id: string, patch: Partial<Signal>) => void
  moveSignal: (id: string, x: number, y: number) => void
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
            onChange={(event) => moveSignal(signal.id, toNumber(event.target.value), signal.coordinate.y)}
          />
        </label>
        <label>
          <span>Y</span>
          <input
            type="number"
            value={signal.coordinate.y}
            onChange={(event) => moveSignal(signal.id, signal.coordinate.x, toNumber(event.target.value))}
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
  moveIntersection,
  moveIntersectionArmLength,
}: {
  intersection: Intersection
  updateIntersection: (id: string, patch: Partial<Intersection>) => void
  moveIntersection: (id: string, x: number, y: number) => void
  moveIntersectionArmLength: (id: string, armLength: number) => void
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
            onChange={(event) => moveIntersection(intersection.id, toNumber(event.target.value), intersection.center.y)}
          />
        </label>
        <label>
          <span>Center Y</span>
          <input
            type="number"
            value={intersection.center.y}
            onChange={(event) => moveIntersection(intersection.id, intersection.center.x, toNumber(event.target.value))}
          />
        </label>
        <label>
          <span>Arm Length</span>
          <input
            type="number"
            min={40}
            max={240}
            value={intersection.armLength}
            onChange={(event) => moveIntersectionArmLength(intersection.id, toNumber(event.target.value))}
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

export function Inspector({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}): JSX.Element {
  const map = useEditorStore((state) => state.map)
  const selectedEntity = useEditorStore((state) => state.selectedEntity)
  const updateMapTitle = useEditorStore((state) => state.updateMapTitle)
  const updateGridSize = useEditorStore((state) => state.updateGridSize)
  const updateStation = useEditorStore((state) => state.updateStation)
  const moveStation = useEditorStore((state) => state.moveStation)
  const updateSection = useEditorStore((state) => state.updateSection)
  const moveSectionEndpoint = useEditorStore((state) => state.moveSectionEndpoint)
  const updateIntersection = useEditorStore((state) => state.updateIntersection)
  const moveIntersection = useEditorStore((state) => state.moveIntersection)
  const moveIntersectionArmLength = useEditorStore((state) => state.moveIntersectionArmLength)
  const moveJunction = useEditorStore((state) => state.moveJunction)
  const updateSignal = useEditorStore((state) => state.updateSignal)
  const moveSignal = useEditorStore((state) => state.moveSignal)
  const updateJunctionNumber = useEditorStore((state) => state.updateJunctionNumber)
  const updateJunctionName = useEditorStore((state) => state.updateJunctionName)
  const beginHistoryBatch = useEditorStore((state) => state.beginHistoryBatch)
  const commitHistoryBatch = useEditorStore((state) => state.commitHistoryBatch)
  const deleteSelected = useEditorStore((state) => state.deleteSelected)
  const exportMap = useEditorStore((state) => state.exportMap)
  const loadFromDisk = useEditorStore((state) => state.loadFromDisk)
  const clearMap = useEditorStore((state) => state.clearMap)
  const relocateSelected = useEditorStore((state) => state.relocateSelected)
  const runConnectionAutoFix = useEditorStore((state) => state.runConnectionAutoFix)
  const getSectionConnectivityGraph = useEditorStore((state) => state.getSectionConnectivityGraph)
  const findSectionPath = useEditorStore((state) => state.findSectionPath)
  const updateMapSettings = useEditorStore((state) => state.updateMapSettings)
  const [pathTarget, setPathTarget] = useState('')
  const [relocateX, setRelocateX] = useState('')
  const [relocateY, setRelocateY] = useState('')
  const [lastAutoFixCount, setLastAutoFixCount] = useState<number | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<{
    mapUi: boolean
    selection: boolean
    connectivity: boolean
    review: boolean
    relocate: boolean
    totals: boolean
    legend: boolean
  }>(map.settings.editorState.inspectorSections)

  useEffect(() => {
    setCollapsedSections(map.settings.editorState.inspectorSections)
  }, [map.settings.editorState.inspectorSections])

  function toggleSection(
    key: 'mapUi' | 'selection' | 'connectivity' | 'review' | 'relocate' | 'totals' | 'legend',
  ): void {
    setCollapsedSections((current) => ({
      ...current,
      [key]: !current[key],
    }))

    updateMapSettings({
      editorState: {
        ...map.settings.editorState,
        inspectorSections: {
          ...map.settings.editorState.inspectorSections,
          [key]: !map.settings.editorState.inspectorSections[key],
        },
      },
    })
  }

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

  const junctionMetadata = useMemo(() => buildJunctionMetadata(map) as JunctionMetadata[], [map])

  const junctionLabelsByCoordinate = useMemo(() => {
    return new Map(junctionMetadata.map((junction) => [`${Math.round(junction.x)}:${Math.round(junction.y)}`, junction.displayLabel]))
  }, [junctionMetadata])

  const selectedJunction = useMemo(() => {
    if (selectedEntity?.entityType !== 'junction') {
      return null
    }

    return junctionMetadata.find((junction) => junction.id === selectedEntity.id) ?? null
  }, [junctionMetadata, selectedEntity])

  const selectedAnchor = useMemo(() => {
    if (selectedStation) {
      return {
        x: (selectedStation.inbound.x + selectedStation.outbound.x) / 2,
        y: (selectedStation.inbound.y + selectedStation.outbound.y) / 2,
      }
    }

    if (selectedSection) {
      return {
        x: (selectedSection.endpoint1.coordinate.x + selectedSection.endpoint2.coordinate.x) / 2,
        y: (selectedSection.endpoint1.coordinate.y + selectedSection.endpoint2.coordinate.y) / 2,
      }
    }

    if (selectedIntersection) {
      return { ...selectedIntersection.center }
    }

    if (selectedSignal) {
      return { ...selectedSignal.coordinate }
    }

    return null
  }, [selectedIntersection, selectedSection, selectedSignal, selectedStation])

  const sectionGraph = useMemo(() => getSectionConnectivityGraph(), [map.sections, getSectionConnectivityGraph])

  const selectedSectionNeighbors = useMemo(() => {
    if (!selectedSection) {
      return []
    }

    return sectionGraph.directedAdjacency[selectedSection.sectionNumber] ?? []
  }, [sectionGraph, selectedSection])

  const selectedSectionReachable = useMemo(() => {
    if (!selectedSection) {
      return []
    }

    const visited = new Set<number>([selectedSection.sectionNumber])
    const queue: number[] = [selectedSection.sectionNumber]

    while (queue.length > 0) {
      const current = queue.shift() as number
      const neighbors = sectionGraph.directedAdjacency[current] ?? []
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

  const connectionReview = useMemo(() => buildConnectionReview(map), [map])

  useEffect(() => {
    setPathTarget('')
  }, [selectedSection?.id])

  useEffect(() => {
    if (!selectedAnchor) {
      setRelocateX('')
      setRelocateY('')
      return
    }

    setRelocateX(String(Math.round(selectedAnchor.x)))
    setRelocateY(String(Math.round(selectedAnchor.y)))
  }, [selectedAnchor?.x, selectedAnchor?.y])

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
    <aside className={collapsed ? 'inspector collapsed-panel' : 'inspector'}>
      <header className="panel-header">
        <div className="panel-header-copy">
          <p className="eyebrow">Properties</p>
          {!collapsed && <h2>Inspector</h2>}
        </div>
        <button
          type="button"
          className="panel-collapse-button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
        >
          {collapsed ? '+' : '−'}
        </button>
      </header>

      {!collapsed && (
        <div className="panel-body">
          <section className="inspector-section-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={() => toggleSection('mapUi')}
              aria-expanded={!collapsedSections.mapUi}
            >
              <span>Map Title and UI Settings</span>
              <span className="inspector-section-toggle">{collapsedSections.mapUi ? '+' : '−'}</span>
            </button>

            {!collapsedSections.mapUi && (
              <div className="inspector-section-body">
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
                        onChange={(event) =>
                          updateGridSize(Number(event.target.value), map.settings.worldHeight)
                        }
                      />
                    </label>
                    <label>
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
              </div>
            )}
          </section>

          <section className="inspector-section-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={() => toggleSection('selection')}
              aria-expanded={!collapsedSections.selection}
            >
              <span>Selection</span>
              <span className="inspector-section-toggle">{collapsedSections.selection ? '+' : '−'}</span>
            </button>

            {!collapsedSections.selection && (
              <div className="inspector-section-body">
                <section className="selection-details">
                  {!selectedStation &&
                    !selectedSection &&
                    !selectedSignal &&
                    !selectedIntersection &&
                    !selectedJunction && (
                      <p>Nothing selected. Choose Select tool and click an entity.</p>
                    )}

                  {selectedStation && (
                    <StationEditor station={selectedStation} updateStation={updateStation} moveStation={moveStation} />
                  )}
                  {selectedSection && (
                    <SectionEditor
                      map={map}
                      junctionLabelsByCoordinate={junctionLabelsByCoordinate}
                      section={selectedSection}
                      defaultSectionColor={map.settings.defaultSectionColor}
                      updateSection={updateSection}
                      moveSectionEndpoint={moveSectionEndpoint}
                    />
                  )}
                  {selectedSignal && (
                    <SignalEditor signal={selectedSignal} updateSignal={updateSignal} moveSignal={moveSignal} />
                  )}
                  {selectedIntersection && (
                    <IntersectionEditor
                      intersection={selectedIntersection}
                      updateIntersection={updateIntersection}
                      moveIntersection={moveIntersection}
                      moveIntersectionArmLength={moveIntersectionArmLength}
                    />
                  )}
                  {selectedJunction && (
                    <JunctionEditor
                      junction={selectedJunction}
                      onChangeNumber={updateJunctionNumber}
                      onChangeName={updateJunctionName}
                      onMove={moveJunction}
                      beginHistoryBatch={beginHistoryBatch}
                      commitHistoryBatch={commitHistoryBatch}
                    />
                  )}
                </section>

                <div className="selection-actions selection-actions-bottom">
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
              </div>
            )}
          </section>

          <section className="inspector-section-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={() => toggleSection('connectivity')}
              aria-expanded={!collapsedSections.connectivity}
            >
              <span>Connectivity</span>
              <span className="inspector-section-toggle">
                {collapsedSections.connectivity ? '+' : '−'}
              </span>
            </button>

            {!collapsedSections.connectivity && (
              <div className="inspector-section-body">
                {!selectedSection && <p>Select a section to inspect connectivity.</p>}

                {selectedSection && (
                  <div className="nested-editor">
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
                        Path: {selectedSectionPath ? selectedSectionPath.join(' -> ') : 'No path found'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="inspector-section-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={() => toggleSection('review')}
              aria-expanded={!collapsedSections.review}
            >
              <span>Connection Review</span>
              <span className="inspector-section-toggle">{collapsedSections.review ? '+' : '−'}</span>
            </button>

            {!collapsedSections.review && (
              <div className="inspector-section-body">
                <p>
                  Issues: {connectionReview.issues.length} ({connectionReview.issues.filter((item) => item.severity === 'error').length} errors,{' '}
                  {connectionReview.issues.filter((item) => item.severity === 'warning').length} warnings)
                </p>

                <div className="selection-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const count = runConnectionAutoFix()
                      setLastAutoFixCount(count)
                    }}
                  >
                    Auto-fix Metadata
                  </button>
                </div>

                {lastAutoFixCount !== null && (
                  <p>{lastAutoFixCount > 0 ? `Applied ${lastAutoFixCount} metadata fixes.` : 'No metadata fixes were needed.'}</p>
                )}

                <div className="review-issues-list">
                  {connectionReview.issues.length === 0 && <p>No connection issues detected.</p>}
                  {connectionReview.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className={issue.severity === 'error' ? 'review-issue-row error' : 'review-issue-row warning'}
                    >
                      <p>{issue.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="inspector-section-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={() => toggleSection('relocate')}
              aria-expanded={!collapsedSections.relocate}
            >
              <span>Relocate Selection</span>
              <span className="inspector-section-toggle">{collapsedSections.relocate ? '+' : '−'}</span>
            </button>

            {!collapsedSections.relocate && (
              <div className="inspector-section-body">
                {!selectedAnchor && <p>Select a station, section, intersection, or signal to relocate.</p>}

                {selectedAnchor && (
                  <div className="nested-editor">
                    <p>Moves the selected component and connected layout while preserving its shape.</p>
                    <div className="form-grid compact-grid">
                      <label>
                        <span>New X</span>
                        <input
                          type="number"
                          value={relocateX}
                          onChange={(event) => setRelocateX(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>New Y</span>
                        <input
                          type="number"
                          value={relocateY}
                          onChange={(event) => setRelocateY(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="selection-actions">
                      <button
                        type="button"
                        onClick={() => relocateSelected(toNumber(relocateX), toNumber(relocateY))}
                      >
                        Relocate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="inspector-section-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={() => toggleSection('totals')}
              aria-expanded={!collapsedSections.totals}
            >
              <span>Map Totals</span>
              <span className="inspector-section-toggle">{collapsedSections.totals ? '+' : '−'}</span>
            </button>

            {!collapsedSections.totals && (
              <div className="inspector-section-body">
                <section className="stats-panel">
                  <p>Stations: {map.stations.length}</p>
                  <p>Sections: {map.sections.length}</p>
                  <p>Intersections: {map.intersections.length}</p>
                  <p>Signals: {map.signals.length}</p>
                </section>
              </div>
            )}
          </section>

          <section className="inspector-section-card">
            <button
              type="button"
              className="inspector-section-header"
              onClick={() => toggleSection('legend')}
              aria-expanded={!collapsedSections.legend}
            >
              <span>Canvas Legend</span>
              <span className="inspector-section-toggle">{collapsedSections.legend ? '+' : '−'}</span>
            </button>

            {!collapsedSections.legend && (
              <div className="inspector-section-body">
                <section className="stats-panel legend-panel">
                  <p>Station layout: Freight blocks on the left, title and station number on the right.</p>
                  <p>Outbound indicator: OUT + arrow points toward station outbound direction.</p>
                  <p>Freight block colors: Magenta = Freight, Cyan = Liquid.</p>
                  <p>Mode labels: L = Load, U = Unload.</p>
                  <p>
                    Junction markers: Merge (gray square), Split (red triangle), Junction (black circle),
                    Invalid (gray diamond).
                  </p>
                  <p>Signal status dot: Green = connected, Amber = partial, Gray = unconnected.</p>
                  <p>Section labels: Number shown at each section center.</p>
                  <p>Junction labels: Merge #, Split #, Junction #, Invalid #.</p>
                  <p>Intersection labels: Intersection # with fixed four-arm connection points.</p>
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  )
}
