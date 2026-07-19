import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  createDefaultMap,
  parseMapDocument,
  type MapDocument,
  type Point,
  type Signal,
  type SignalType,
  type RailwaySectionKind,
  type TrainStation,
  type RailwaySection,
  type Intersection,
} from '../models/mapSchema'
import {
  buildSectionConnectivityGraph,
  findSectionPath,
  type SectionConnectivityGraph,
} from '../models/sectionGraph'
import { normalizeMapMetadata } from '../models/connectionReview'

const LOCAL_STORAGE_KEY = 'satisfactory-train-mapper-map-v1'

export type ToolMode =
  | 'select'
  | 'station'
  | 'section-straight'
  | 'section-curved'
  | 'section-intersection'
  | 'signal-block'
  | 'signal-path'

export type SelectedEntity =
  | { entityType: 'station'; id: string }
  | { entityType: 'section'; id: string }
  | { entityType: 'intersection'; id: string }
  | { entityType: 'signal'; id: string }
  | { entityType: 'junction'; id: string }
  | null

type SectionEndpointKey = 'endpoint1' | 'endpoint2'
type SectionEndpointRef = { sectionId: string; endpointKey: SectionEndpointKey }
type StationSide = 'Left' | 'Right'
const INTERSECTION_ENDPOINT_SNAP_TOLERANCE = 16
const DEFAULT_HISTORY_LIMIT = 100
const MAX_HISTORY_LIMIT = 100
const CONFIGURED_HISTORY_LIMIT = Number(import.meta.env.VITE_EDITOR_HISTORY_LIMIT)
const HISTORY_LIMIT = Number.isFinite(CONFIGURED_HISTORY_LIMIT)
  ? Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.round(CONFIGURED_HISTORY_LIMIT)))
  : DEFAULT_HISTORY_LIMIT

let pendingHistoryBatch: MapHistorySnapshot | null = null

type MapHistorySnapshot = {
  map: MapDocument
  zoom: number
  selectedEntity: SelectedEntity
}

function cloneMapDocument(map: MapDocument): MapDocument {
  return JSON.parse(JSON.stringify(map)) as MapDocument
}

function captureHistorySnapshot(state: EditorState): MapHistorySnapshot {
  return {
    map: cloneMapDocument(state.map),
    zoom: state.zoom,
    selectedEntity: state.selectedEntity ? { ...state.selectedEntity } : null,
  }
}

function restoreHistorySnapshot(state: EditorState, snapshot: MapHistorySnapshot): void {
  state.map = cloneMapDocument(snapshot.map)
  state.zoom = snapshot.zoom
  state.selectedEntity = snapshot.selectedEntity ? { ...snapshot.selectedEntity } : null
  state.map.settings.editorState.viewport.zoom = snapshot.zoom
  state.map.settings.editorState.lastSelected = snapshot.selectedEntity
    ? {
        entityType: snapshot.selectedEntity.entityType,
        id: snapshot.selectedEntity.id,
      }
    : null
}

function pushHistorySnapshot(state: EditorState): void {
  if (pendingHistoryBatch) {
    return
  }

  state.undoStack.push(captureHistorySnapshot(state))
  if (state.undoStack.length > HISTORY_LIMIT) {
    state.undoStack.shift()
  }

  state.redoStack = []
}

function beginHistoryBatch(state: EditorState): void {
  pendingHistoryBatch = captureHistorySnapshot(state)
}

function commitHistoryBatch(state: EditorState): void {
  if (!pendingHistoryBatch) {
    return
  }

  const currentSnapshot = captureHistorySnapshot(state)
  if (JSON.stringify(pendingHistoryBatch) === JSON.stringify(currentSnapshot)) {
    pendingHistoryBatch = null
    return
  }

  state.undoStack.push(pendingHistoryBatch)
  if (state.undoStack.length > HISTORY_LIMIT) {
    state.undoStack.shift()
  }

  state.redoStack = []
  pendingHistoryBatch = null
}

function cancelHistoryBatch(): void {
  pendingHistoryBatch = null
}

interface EditorState {
  map: MapDocument
  zoom: number
  activeTool: ToolMode
  connectionsLocked: boolean
  selectedEntity: SelectedEntity
  undoStack: MapHistorySnapshot[]
  redoStack: MapHistorySnapshot[]
  clearMap: () => void
  loadFromDisk: (raw: string) => { ok: true } | { ok: false; message: string }
  setTool: (tool: ToolMode) => void
  setConnectionsLocked: (locked: boolean) => void
  setZoom: (zoom: number) => void
  addEntityAt: (point: Point) => void
  selectEntity: (selectedEntity: SelectedEntity) => void
  updateMapTitle: (title: string) => void
  updateGridSize: (worldWidth: number, worldHeight: number) => void
  updateMapSettings: (patch: Partial<MapDocument['settings']>) => void
  updateJunctionNumber: (
    junctionId: string,
    numberType: 'junction' | 'merge' | 'split',
    junctionNumber: number,
  ) => void
  updateJunctionName: (junctionId: string, name: string) => void
  runConnectionAutoFix: () => number
  exportMap: () => string
  updateStation: (id: string, patch: Partial<TrainStation>) => void
  updateSection: (id: string, patch: Partial<RailwaySection>) => void
  updateIntersection: (id: string, patch: Partial<Intersection>) => void
  updateSignal: (id: string, patch: Partial<Signal>) => void
  moveStation: (id: string, x: number, y: number) => void
  moveSection: (id: string, x: number, y: number) => void
  moveSectionEndpoint: (id: string, endpointKey: SectionEndpointKey, x: number, y: number) => void
  moveIntersection: (id: string, x: number, y: number) => void
  moveIntersectionArmLength: (id: string, armLength: number) => void
  moveJunction: (junctionId: string, x: number, y: number, endpointRefs?: SectionEndpointRef[]) => void
  moveSignal: (id: string, x: number, y: number) => void
  relocateSelected: (x: number, y: number) => boolean
  disconnectSectionEndpointStation: (sectionId: string, endpointKey: SectionEndpointKey) => void
  connectSectionEndpointToStation: (
    sectionId: string,
    endpointKey: SectionEndpointKey,
    stationId: string,
    side: StationSide,
  ) => boolean
  beginHistoryBatch: () => void
  commitHistoryBatch: () => void
  undo: () => void
  redo: () => void
  getSectionConnectivityGraph: () => SectionConnectivityGraph
  findSectionPath: (fromSectionNumber: number, toSectionNumber: number) => number[] | null
  deleteSelected: () => void
}

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function nextStationNumber(map: MapDocument): number {
  if (map.stations.length === 0) {
    return 1
  }

  return Math.max(...map.stations.map((x) => x.stationNumber)) + 1
}

function nextSectionNumber(map: MapDocument): number {
  if (map.sections.length === 0) {
    return 1
  }

  return Math.max(...map.sections.map((x) => x.sectionNumber)) + 1
}

function nextSignalNumber(map: MapDocument): number {
  if (map.signals.length === 0) {
    return 1
  }

  return Math.max(...map.signals.map((x) => x.signalNumber)) + 1
}

function nextIntersectionNumber(map: MapDocument): number {
  if (map.intersections.length === 0) {
    return 1
  }

  return Math.max(...map.intersections.map((x) => x.intersectionNumber)) + 1
}

function loadInitialMap(): MapDocument {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
  if (!raw) {
    return createDefaultMap()
  }

  try {
    const parsed = parseMapDocument(JSON.parse(raw))
    normalizeMapMetadata(parsed)
    reconcileAllStationOccupancy(parsed)
    return parsed
  } catch {
    return createDefaultMap()
  }
}

function isSelectedEntityValid(map: MapDocument, selected: SelectedEntity): boolean {
  if (!selected) {
    return false
  }

  if (selected.entityType === 'station') {
    return map.stations.some((item) => item.id === selected.id)
  }

  if (selected.entityType === 'section') {
    return map.sections.some((item) => item.id === selected.id)
  }

  if (selected.entityType === 'intersection') {
    return map.intersections.some((item) => item.id === selected.id)
  }

  if (selected.entityType === 'signal') {
    return map.signals.some((item) => item.id === selected.id)
  }

  const groupedEndpointCounts: Record<string, number> = {}
  for (const section of map.sections) {
    const keyA = `${Math.round(section.endpoint1.coordinate.x)}:${Math.round(section.endpoint1.coordinate.y)}`
    const keyB = `${Math.round(section.endpoint2.coordinate.x)}:${Math.round(section.endpoint2.coordinate.y)}`
    groupedEndpointCounts[keyA] = (groupedEndpointCounts[keyA] ?? 0) + 1
    groupedEndpointCounts[keyB] = (groupedEndpointCounts[keyB] ?? 0) + 1
  }

  return (groupedEndpointCounts[selected.id] ?? 0) >= 3
}

function resolveSelectedEntity(map: MapDocument): SelectedEntity {
  const candidate = map.settings.editorState.lastSelected
  if (!candidate) {
    return null
  }

  const selected: SelectedEntity = {
    entityType: candidate.entityType,
    id: candidate.id,
  }

  return isSelectedEntityValid(map, selected) ? selected : null
}

const initialMap = loadInitialMap()
const initialSelectedEntity = resolveSelectedEntity(initialMap)

function getSectionMidpoint(section: RailwaySection): Point {
  return {
    x: (section.endpoint1.coordinate.x + section.endpoint2.coordinate.x) / 2,
    y: (section.endpoint1.coordinate.y + section.endpoint2.coordinate.y) / 2,
  }
}

function shiftPoint(point: Point, dx: number, dy: number): Point {
  return {
    x: point.x + dx,
    y: point.y + dy,
  }
}

function pointDistance(pointA: Point, pointB: Point): number {
  const dx = pointA.x - pointB.x
  const dy = pointA.y - pointB.y
  return Math.sqrt(dx * dx + dy * dy)
}

function getIntersectionConnectionPoints(intersection: Intersection): Point[] {
  const arm = Math.max(40, intersection.armLength)
  return [
    { x: intersection.center.x, y: intersection.center.y - arm },
    { x: intersection.center.x + arm, y: intersection.center.y },
    { x: intersection.center.x, y: intersection.center.y + arm },
    { x: intersection.center.x - arm, y: intersection.center.y },
  ]
}

function createStation(map: MapDocument, point: Point): TrainStation {
  const stationNumber = nextStationNumber(map)
  return {
    id: randomId('station'),
    stationName: `Station ${stationNumber}`,
    stationNumber,
    color: '#c7d2fe',
    layoutDirection: 'HorizontalMetaRight',
    sectionInNumber: null,
    sectionOutNumber: null,
    inbound: { x: point.x - 40, y: point.y },
    outbound: { x: point.x + 40, y: point.y },
    liquidFreightStationCount: 0,
    solidFreightStationCount: 1,
    freightStationSequence: [
      {
        slotIndex: 1,
        stationType: 'Freight',
        mode: 'Unload',
        material: '',
      },
    ],
    freightSectionMaterials: [],
    notes: '',
  }
}

type ResolvedStationLayout =
  | 'HorizontalMetaRight'
  | 'HorizontalMetaLeft'
  | 'VerticalMetaTop'
  | 'VerticalMetaBottom'

function resolveStationLayoutDirection(station: TrainStation): ResolvedStationLayout {
  if (station.layoutDirection === 'Default') {
    return 'HorizontalMetaRight'
  }

  if (station.layoutDirection === 'Reversed') {
    return 'HorizontalMetaLeft'
  }

  return station.layoutDirection
}

function getStationDisplayBounds(station: TrainStation): { width: number; height: number } {
  const slotCount = station.freightStationSequence.length
  const slotHeight = 14
  const slotGap = 4
  const freightPanelWidth = 64
  const stationMetaPanelWidth = 116
  const stationMetaPanelHeight = 44
  const freightPanelHeight = Math.max(32, slotCount * (slotHeight + slotGap) + 8)
  const panelInset = 4
  const panelGap = 4
  const layoutDirection = resolveStationLayoutDirection(station)
  const isVerticalLayout =
    layoutDirection === 'VerticalMetaTop' || layoutDirection === 'VerticalMetaBottom'
  const stationInnerWidth = isVerticalLayout
    ? Math.max(freightPanelWidth, stationMetaPanelWidth)
    : freightPanelWidth + panelGap + stationMetaPanelWidth
  const stationInnerHeight = isVerticalLayout
    ? stationMetaPanelHeight + panelGap + freightPanelHeight
    : Math.max(stationMetaPanelHeight, freightPanelHeight)

  return {
    width: stationInnerWidth + panelInset * 2,
    height: stationInnerHeight + panelInset * 2,
  }
}

function createSection(
  map: MapDocument,
  point: Point,
  sectionKind: RailwaySectionKind,
): RailwaySection {
  const sectionNumber = nextSectionNumber(map)
  const curveBendMin = 0
  const curveBendMax = sectionKind === 'Curved' ? 480 : 480
  return {
    id: randomId('section'),
    sectionNumber,
    sectionName: `Section ${sectionNumber}`,
    color: map.settings.defaultSectionColor,
    sectionKind,
    directionMode: 'Bidirectional',
    curveBendMin,
    curveBendMax,
    curveBend: 120,
    endpoint1: {
      sectionNumber,
      coordinate: { x: point.x - 100, y: sectionKind === 'Curved' ? point.y - 60 : point.y },
      stationConnection: null,
      signal1: null,
      signal2: null,
      signalSockets: {
        Left: { state: 'Suggested', expectedType: null, overrideType: null },
        Right: { state: 'Suggested', expectedType: null, overrideType: null },
      },
      entranceMode: 'Allowed',
    },
    endpoint2: {
      sectionNumber,
      coordinate: { x: point.x + 100, y: sectionKind === 'Curved' ? point.y + 60 : point.y },
      stationConnection: null,
      signal1: null,
      signal2: null,
      signalSockets: {
        Left: { state: 'Suggested', expectedType: null, overrideType: null },
        Right: { state: 'Suggested', expectedType: null, overrideType: null },
      },
      entranceMode: 'Allowed',
    },
  }
}

function createIntersection(map: MapDocument, point: Point): Intersection {
  return {
    id: randomId('intersection'),
    intersectionNumber: nextIntersectionNumber(map),
    color: '#fde68a',
    center: { x: point.x, y: point.y },
    armLength: 60,
  }
}

function createSignal(map: MapDocument, point: Point, signalType: SignalType): Signal {
  const signalNumber = nextSignalNumber(map)
  return {
    id: randomId('signal'),
    signalType,
    signalNumber,
    color: signalType === 'Block' ? '#38bdf8' : '#f97316',
    coordinate: point,
    socketA: null,
    socketB: null,
    sectionConnections: [],
  }
}

function withTimestamp(map: MapDocument): MapDocument {
  return {
    ...map,
    lastUpdatedIso: new Date().toISOString(),
  }
}

function getStationSidePoint(station: TrainStation, side: StationSide): Point {
  const anchorX = (station.inbound.x + station.outbound.x) / 2
  const anchorY = (station.inbound.y + station.outbound.y) / 2
  const layoutDirection = resolveStationLayoutDirection(station)
  const bounds = getStationDisplayBounds(station)

  if (layoutDirection === 'VerticalMetaTop') {
    return {
      x: anchorX,
      y: side === 'Left' ? anchorY + bounds.height / 2 : anchorY - bounds.height / 2,
    }
  }

  if (layoutDirection === 'VerticalMetaBottom') {
    return {
      x: anchorX,
      y: side === 'Left' ? anchorY - bounds.height / 2 : anchorY + bounds.height / 2,
    }
  }

  const reverseLayout = layoutDirection === 'HorizontalMetaLeft'
  const effectiveSide = reverseLayout ? (side === 'Left' ? 'Right' : 'Left') : side
  return {
    x: effectiveSide === 'Left' ? anchorX - bounds.width / 2 : anchorX + bounds.width / 2,
    y: anchorY,
  }
}

function syncStationConnectedEndpointCoordinates(map: MapDocument): void {
  const stationById = new Map(map.stations.map((station) => [station.id, station]))

  for (const section of map.sections) {
    for (const endpointKey of ['endpoint1', 'endpoint2'] as SectionEndpointKey[]) {
      const endpoint = section[endpointKey]
      const stationConnection = endpoint.stationConnection
      if (!stationConnection) {
        continue
      }

      const station = stationById.get(stationConnection.stationId)
      if (!station) {
        continue
      }

      endpoint.coordinate = getStationSidePoint(station, stationConnection.side)
    }
  }
}

function setStationSideSectionNumber(
  station: TrainStation,
  side: StationSide,
  sectionNumber: number | null,
): void {
  if (side === 'Left') {
    station.sectionInNumber = sectionNumber
    return
  }

  station.sectionOutNumber = sectionNumber
}

function getConnectedSectionNumbersForStationSide(
  map: MapDocument,
  stationId: string,
  side: StationSide,
): number[] {
  const sectionNumbers = new Set<number>()

  for (const section of map.sections) {
    if (
      section.endpoint1.stationConnection?.stationId === stationId &&
      section.endpoint1.stationConnection.side === side
    ) {
      sectionNumbers.add(section.sectionNumber)
    }

    if (
      section.endpoint2.stationConnection?.stationId === stationId &&
      section.endpoint2.stationConnection.side === side
    ) {
      sectionNumbers.add(section.sectionNumber)
    }
  }

  return Array.from(sectionNumbers)
}

function reconcileStationSideOccupancy(map: MapDocument, station: TrainStation, side: StationSide): void {
  const connectedSectionNumbers = getConnectedSectionNumbersForStationSide(map, station.id, side)
  setStationSideSectionNumber(station, side, connectedSectionNumbers.length > 0 ? connectedSectionNumbers[0] : null)
}

function reconcileAllStationOccupancy(map: MapDocument): void {
  for (const station of map.stations) {
    reconcileStationSideOccupancy(map, station, 'Left')
    reconcileStationSideOccupancy(map, station, 'Right')
  }
}

function detachEndpointStationConnectionIfNeeded(
  map: MapDocument,
  section: RailwaySection,
  endpointKey: SectionEndpointKey,
  tolerance = 8,
): void {
  const endpoint = section[endpointKey]
  const connection = endpoint.stationConnection
  if (!connection) {
    return
  }

  const station = map.stations.find((item) => item.id === connection.stationId)
  if (!station) {
    endpoint.stationConnection = null
    return
  }

  const expectedPoint = getStationSidePoint(station, connection.side)
  if (pointDistance(endpoint.coordinate, expectedPoint) <= tolerance) {
    return
  }

  endpoint.stationConnection = null
  reconcileStationSideOccupancy(map, station, connection.side)
}

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    map: initialMap,
    zoom: initialMap.settings.editorState.viewport.zoom,
    activeTool: 'select',
    connectionsLocked: false,
    selectedEntity: initialSelectedEntity,
    undoStack: [],
    redoStack: [],

    clearMap: () => {
      cancelHistoryBatch()
      set((state) => {
        state.map = createDefaultMap()
        state.selectedEntity = null
        state.activeTool = 'select'
        state.zoom = state.map.settings.editorState.viewport.zoom
        state.undoStack = []
        state.redoStack = []
      })

      localStorage.removeItem(LOCAL_STORAGE_KEY)
    },

    loadFromDisk: (raw) => {
      try {
        cancelHistoryBatch()
        const parsed = parseMapDocument(JSON.parse(raw))
        normalizeMapMetadata(parsed)
        reconcileAllStationOccupancy(parsed)
        const restoredSelection = resolveSelectedEntity(parsed)
        parsed.settings.editorState.lastSelected = restoredSelection
          ? {
              entityType: restoredSelection.entityType,
              id: restoredSelection.id,
            }
          : null

        set((state) => {
          state.map = parsed
          state.selectedEntity = restoredSelection
          state.zoom = parsed.settings.editorState.viewport.zoom
          state.undoStack = []
          state.redoStack = []
        })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error ? error.message : 'Unable to parse map document.',
        }
      }
    },

    setTool: (tool) => {
      set((state) => {
        state.activeTool = tool
      })
    },

    setConnectionsLocked: (locked) => {
      set((state) => {
        state.connectionsLocked = locked
      })
    },

    setZoom: (zoom) => {
      const clampedZoom = Math.min(2.5, Math.max(0.4, zoom))
      set((state) => {
        state.zoom = clampedZoom
        state.map.settings.editorState.viewport.zoom = clampedZoom
        state.map = withTimestamp(state.map)
      })
    },

    addEntityAt: (point) => {
      const { activeTool } = get()
      if (activeTool === 'select') {
        return
      }

      set((state) => {
        if (activeTool === 'station') {
          const station = createStation(state.map, point)
          state.map.stations.push(station)
          state.selectedEntity = { entityType: 'station', id: station.id }
        }

        if (activeTool === 'section-straight') {
          const section = createSection(state.map, point, 'Straight')
          state.map.sections.push(section)
          state.selectedEntity = { entityType: 'section', id: section.id }
        }

        if (activeTool === 'section-curved') {
          const section = createSection(state.map, point, 'Curved')
          state.map.sections.push(section)
          state.selectedEntity = { entityType: 'section', id: section.id }
        }

        if (activeTool === 'section-intersection') {
          const intersection = createIntersection(state.map, point)
          state.map.intersections.push(intersection)
          state.selectedEntity = { entityType: 'intersection', id: intersection.id }
        }

        if (activeTool === 'signal-block') {
          const signal = createSignal(state.map, point, 'Block')
          state.map.signals.push(signal)
          state.selectedEntity = { entityType: 'signal', id: signal.id }
        }

        if (activeTool === 'signal-path') {
          const signal = createSignal(state.map, point, 'Path')
          state.map.signals.push(signal)
          state.selectedEntity = { entityType: 'signal', id: signal.id }
        }

        state.map = withTimestamp(state.map)
      })
    },

    selectEntity: (selectedEntity) => {
      set((state) => {
        state.selectedEntity = selectedEntity
        state.map.settings.editorState.lastSelected = selectedEntity
          ? {
              entityType: selectedEntity.entityType,
              id: selectedEntity.id,
            }
          : null
        state.map = withTimestamp(state.map)
      })
    },

    updateMapTitle: (title) => {
      set((state) => {
        pushHistorySnapshot(state)
        state.map.settings.title = title
        state.map = withTimestamp(state.map)
      })
    },

    updateGridSize: (worldWidth, worldHeight) => {
      set((state) => {
        pushHistorySnapshot(state)
        state.map.settings.worldWidth = Math.max(10, Math.min(10000, Math.round(worldWidth)))
        state.map.settings.worldHeight = Math.max(10, Math.min(10000, Math.round(worldHeight)))
        state.map = withTimestamp(state.map)
      })
    },

    updateMapSettings: (patch) => {
      set((state) => {
        pushHistorySnapshot(state)
        Object.assign(state.map.settings, patch)
        state.map = withTimestamp(state.map)
      })
    },

    updateJunctionNumber: (junctionId, numberType, junctionNumber) => {
      set((state) => {
        pushHistorySnapshot(state)
        const overrides = state.map.settings.junctionNumberOverrides
        const existing = overrides.find((item) => item.junctionId === junctionId)

        const value = Math.max(0, Math.round(junctionNumber))

        const apply = (target: {
          junctionNumber?: number
          mergeNumber?: number
          splitNumber?: number
        }): void => {
          if (numberType === 'junction') {
            target.junctionNumber = value
            return
          }

          if (numberType === 'merge') {
            target.mergeNumber = value
            return
          }

          target.splitNumber = value
        }

        if (existing) {
          apply(existing)
        } else {
          const next: {
            junctionId: string
            displayName: string
            junctionNumber?: number
            mergeNumber?: number
            splitNumber?: number
          } = {
            junctionId,
            displayName: '',
          }
          apply(next)
          overrides.push(next)
        }

        state.map = withTimestamp(state.map)
      })
    },

    updateJunctionName: (junctionId, name) => {
      set((state) => {
        pushHistorySnapshot(state)
        const overrides = state.map.settings.junctionNumberOverrides
        const existing = overrides.find((item) => item.junctionId === junctionId)
        const displayName = name.trim()

        if (existing) {
          existing.displayName = displayName
        } else {
          overrides.push({ junctionId, displayName })
        }

        state.map = withTimestamp(state.map)
      })
    },

    exportMap: () => {
      const { map } = get()
      return JSON.stringify(map, null, 2)
    },

    runConnectionAutoFix: () => {
      let fixCount = 0

      set((state) => {
        pushHistorySnapshot(state)
        const { fixes } = normalizeMapMetadata(state.map)
        fixCount = fixes.length

        if (fixCount > 0) {
          state.map = withTimestamp(state.map)
        }
      })

      return fixCount
    },

    updateStation: (id, patch) => {
      set((state) => {
        const station = state.map.stations.find((x) => x.id === id)
        if (!station) {
          return
        }

        pushHistorySnapshot(state)
        const shouldRealignEndpoints =
          patch.layoutDirection !== undefined ||
          patch.inbound !== undefined ||
          patch.outbound !== undefined
        Object.assign(station, patch)
        if (shouldRealignEndpoints) {
          syncStationConnectedEndpointCoordinates(state.map)
        }
        state.map = withTimestamp(state.map)
      })
    },

    updateSection: (id, patch) => {
      set((state) => {
        const section = state.map.sections.find((x) => x.id === id)
        if (!section) {
          return
        }

        pushHistorySnapshot(state)
        const previousSectionNumber = section.sectionNumber

        Object.assign(section, patch)

        if (patch.sectionNumber !== undefined) {
          if (!section.sectionName || section.sectionName === `Section ${previousSectionNumber}`) {
            section.sectionName = `Section ${patch.sectionNumber}`
          }

          for (const signal of state.map.signals) {
            const nextConnections = signal.sectionConnections.map((sectionNumber) =>
              sectionNumber === previousSectionNumber ? patch.sectionNumber as number : sectionNumber,
            )
            signal.sectionConnections = Array.from(new Set(nextConnections))
          }

          section.endpoint1.sectionNumber = patch.sectionNumber
          section.endpoint2.sectionNumber = patch.sectionNumber
        }

        // If section geometry was edited away from station anchors, detach stale endpoint links.
        detachEndpointStationConnectionIfNeeded(state.map, section, 'endpoint1')
        detachEndpointStationConnectionIfNeeded(state.map, section, 'endpoint2')

        state.map = withTimestamp(state.map)
      })
    },

    updateSignal: (id, patch) => {
      set((state) => {
        const signal = state.map.signals.find((x) => x.id === id)
        if (!signal) {
          return
        }

        pushHistorySnapshot(state)
        Object.assign(signal, patch)
        state.map = withTimestamp(state.map)
      })
    },

    updateIntersection: (id, patch) => {
      set((state) => {
        const intersection = state.map.intersections.find((x) => x.id === id)
        if (!intersection) {
          return
        }

        pushHistorySnapshot(state)
        Object.assign(intersection, patch)
        state.map = withTimestamp(state.map)
      })
    },

    moveStation: (id, x, y) => {
      set((state) => {
        const station = state.map.stations.find((item) => item.id === id)
        if (!station) {
          return
        }

        pushHistorySnapshot(state)
        const previousInbound = { ...station.inbound }
        const previousOutbound = { ...station.outbound }
        const previousLeftBorder = getStationSidePoint(
          {
            ...station,
            inbound: previousInbound,
            outbound: previousOutbound,
          },
          'Left',
        )
        const previousRightBorder = getStationSidePoint(
          {
            ...station,
            inbound: previousInbound,
            outbound: previousOutbound,
          },
          'Right',
        )
        const currentX = (station.inbound.x + station.outbound.x) / 2
        const currentY = (station.inbound.y + station.outbound.y) / 2
        const dx = x - currentX
        const dy = y - currentY

        station.inbound = shiftPoint(station.inbound, dx, dy)
        station.outbound = shiftPoint(station.outbound, dx, dy)

        const isNearAny = (point: Point, targets: Point[], tolerance: number): boolean => {
          return targets.some((target) => {
            const tx = Math.abs(point.x - target.x)
            const ty = Math.abs(point.y - target.y)
            return tx <= tolerance && ty <= tolerance
          })
        }

        for (const section of state.map.sections) {
          if (section.endpoint1.stationConnection?.stationId === station.id) {
            section.endpoint1.coordinate = getStationSidePoint(station, section.endpoint1.stationConnection.side)
          }

          if (section.endpoint2.stationConnection?.stationId === station.id) {
            section.endpoint2.coordinate = getStationSidePoint(station, section.endpoint2.stationConnection.side)
          }

          if (station.sectionInNumber === section.sectionNumber) {
            if (
              !section.endpoint1.stationConnection &&
              isNearAny(section.endpoint1.coordinate, [previousInbound, previousLeftBorder], 30)
            ) {
              section.endpoint1.coordinate = shiftPoint(section.endpoint1.coordinate, dx, dy)
            }

            if (
              !section.endpoint2.stationConnection &&
              isNearAny(section.endpoint2.coordinate, [previousInbound, previousLeftBorder], 30)
            ) {
              section.endpoint2.coordinate = shiftPoint(section.endpoint2.coordinate, dx, dy)
            }
          }

          if (station.sectionOutNumber === section.sectionNumber) {
            if (
              !section.endpoint1.stationConnection &&
              isNearAny(section.endpoint1.coordinate, [previousOutbound, previousRightBorder], 30)
            ) {
              section.endpoint1.coordinate = shiftPoint(section.endpoint1.coordinate, dx, dy)
            }

            if (
              !section.endpoint2.stationConnection &&
              isNearAny(section.endpoint2.coordinate, [previousOutbound, previousRightBorder], 30)
            ) {
              section.endpoint2.coordinate = shiftPoint(section.endpoint2.coordinate, dx, dy)
            }
          }
        }

        state.map = withTimestamp(state.map)
      })
    },

    moveSection: (id, x, y) => {
      set((state) => {
        const section = state.map.sections.find((item) => item.id === id)
        if (!section) {
          return
        }

        pushHistorySnapshot(state)
        const current = getSectionMidpoint(section)
        const dx = x - current.x
        const dy = y - current.y

        // Moving an entire section away from an anchored station endpoint should break that station link.
        detachEndpointStationConnectionIfNeeded(state.map, section, 'endpoint1', 0)
        detachEndpointStationConnectionIfNeeded(state.map, section, 'endpoint2', 0)

        section.endpoint1.coordinate = shiftPoint(section.endpoint1.coordinate, dx, dy)
        section.endpoint2.coordinate = shiftPoint(section.endpoint2.coordinate, dx, dy)

        detachEndpointStationConnectionIfNeeded(state.map, section, 'endpoint1')
        detachEndpointStationConnectionIfNeeded(state.map, section, 'endpoint2')

        state.map = withTimestamp(state.map)
      })
    },

    moveSectionEndpoint: (id, endpointKey, x, y) => {
      set((state) => {
        const section = state.map.sections.find((item) => item.id === id)
        if (!section) {
          return
        }

        const endpoint = section[endpointKey]
        const previousCoordinate = { ...endpoint.coordinate }
        const dx = x - previousCoordinate.x
        const dy = y - previousCoordinate.y
        if (dx === 0 && dy === 0) {
          return
        }

        pushHistorySnapshot(state)
        const previousKey = `${Math.round(previousCoordinate.x)}:${Math.round(previousCoordinate.y)}`

        endpoint.coordinate = shiftPoint(endpoint.coordinate, dx, dy)

        for (const otherSection of state.map.sections) {
          for (const otherEndpointKey of ['endpoint1', 'endpoint2'] as SectionEndpointKey[]) {
            const otherEndpoint = otherSection[otherEndpointKey]
            const otherKey = `${Math.round(otherEndpoint.coordinate.x)}:${Math.round(otherEndpoint.coordinate.y)}`
            if (otherKey !== previousKey) {
              continue
            }

            otherEndpoint.coordinate = shiftPoint(otherEndpoint.coordinate, dx, dy)
            detachEndpointStationConnectionIfNeeded(state.map, otherSection, otherEndpointKey)
          }
        }

        detachEndpointStationConnectionIfNeeded(state.map, section, endpointKey)
        state.map = withTimestamp(state.map)
      })
    },

    moveSignal: (id, x, y) => {
      set((state) => {
        const signal = state.map.signals.find((item) => item.id === id)
        if (!signal) {
          return
        }

        pushHistorySnapshot(state)
        signal.coordinate = { x, y }
        state.map = withTimestamp(state.map)
      })
    },

    moveIntersection: (id, x, y) => {
      set((state) => {
        const intersection = state.map.intersections.find((item) => item.id === id)
        if (!intersection) {
          return
        }

        pushHistorySnapshot(state)
        const previousCenter = { ...intersection.center }
        const dx = x - previousCenter.x
        const dy = y - previousCenter.y
        const previousConnectionPoints = getIntersectionConnectionPoints(intersection)

        intersection.center = { x, y }

        // Carry section endpoints that are snapped to this intersection's connection points.
        for (const section of state.map.sections) {
          const endpoints: SectionEndpointKey[] = ['endpoint1', 'endpoint2']
          for (const endpointKey of endpoints) {
            const endpoint = section[endpointKey]
            if (endpoint.stationConnection) {
              continue
            }

            const isConnectedToIntersection = previousConnectionPoints.some(
              (point) => pointDistance(endpoint.coordinate, point) <= INTERSECTION_ENDPOINT_SNAP_TOLERANCE,
            )

            if (!isConnectedToIntersection) {
              continue
            }

            endpoint.coordinate = shiftPoint(endpoint.coordinate, dx, dy)
          }
        }

        state.map = withTimestamp(state.map)
      })
    },

    moveIntersectionArmLength: (id, armLength) => {
      set((state) => {
        const intersection = state.map.intersections.find((item) => item.id === id)
        if (!intersection) {
          return
        }

        const nextArmLength = Math.max(40, Math.min(240, Math.round(armLength)))
        if (nextArmLength === intersection.armLength) {
          return
        }

        pushHistorySnapshot(state)
        const previousPoints = getIntersectionConnectionPoints(intersection)
        intersection.armLength = nextArmLength
        const nextPoints = getIntersectionConnectionPoints(intersection)

        for (const section of state.map.sections) {
          for (const endpointKey of ['endpoint1', 'endpoint2'] as SectionEndpointKey[]) {
            const endpoint = section[endpointKey]
            if (endpoint.stationConnection) {
              continue
            }

            const matchedIndex = previousPoints.findIndex(
              (point) => pointDistance(endpoint.coordinate, point) <= INTERSECTION_ENDPOINT_SNAP_TOLERANCE,
            )

            if (matchedIndex === -1) {
              continue
            }

            const previousPoint = previousPoints[matchedIndex]
            const nextPoint = nextPoints[matchedIndex]
            endpoint.coordinate = shiftPoint(endpoint.coordinate, nextPoint.x - previousPoint.x, nextPoint.y - previousPoint.y)
          }
        }

        state.map = withTimestamp(state.map)
      })
    },

    moveJunction: (junctionId, x, y, endpointRefs = []) => {
      set((state) => {
        const [xText, yText] = junctionId.split(':')
        const targetX = Number(xText)
        const targetY = Number(yText)
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
          return
        }

        const refs = endpointRefs.length > 0 ? endpointRefs : state.map.sections.flatMap((section) => {
          const matches: SectionEndpointRef[] = []
          if (Math.round(section.endpoint1.coordinate.x) === Math.round(targetX) &&
            Math.round(section.endpoint1.coordinate.y) === Math.round(targetY)) {
            matches.push({ sectionId: section.id, endpointKey: 'endpoint1' })
          }

          if (Math.round(section.endpoint2.coordinate.x) === Math.round(targetX) &&
            Math.round(section.endpoint2.coordinate.y) === Math.round(targetY)) {
            matches.push({ sectionId: section.id, endpointKey: 'endpoint2' })
          }

          return matches
        })

        const endpoints = refs.flatMap((ref) => {
          const section = state.map.sections.find((item) => item.id === ref.sectionId)
          if (!section) {
            return []
          }

          return [{ section, endpointKey: ref.endpointKey, coordinate: section[ref.endpointKey].coordinate }]
        })

        if (endpoints.length === 0) {
          return
        }

        const currentX = endpoints.reduce((sum, endpoint) => sum + endpoint.coordinate.x, 0) / endpoints.length
        const currentY = endpoints.reduce((sum, endpoint) => sum + endpoint.coordinate.y, 0) / endpoints.length
        const dx = x - currentX
        const dy = y - currentY
        if (dx === 0 && dy === 0) {
          return
        }

        pushHistorySnapshot(state)
        for (const endpoint of endpoints) {
          endpoint.section[endpoint.endpointKey].coordinate = shiftPoint(endpoint.coordinate, dx, dy)
          detachEndpointStationConnectionIfNeeded(state.map, endpoint.section, endpoint.endpointKey)
        }

        const nextJunctionId = `${Math.round(x)}:${Math.round(y)}`
        const selectedJunctionId = state.selectedEntity?.entityType === 'junction' ? state.selectedEntity.id : null
        const previousJunctionIds = [junctionId, selectedJunctionId].filter(
          (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
        )

        for (const previousJunctionId of previousJunctionIds) {
          if (previousJunctionId === nextJunctionId) {
            continue
          }

          const overrides = state.map.settings.junctionNumberOverrides
          const sourceIndex = overrides.findIndex((item) => item.junctionId === previousJunctionId)
          if (sourceIndex === -1) {
            continue
          }

          const source = overrides[sourceIndex]
          const existing = overrides.find((item) => item.junctionId === nextJunctionId)
          if (existing) {
            existing.junctionNumber = source.junctionNumber ?? existing.junctionNumber
            existing.mergeNumber = source.mergeNumber ?? existing.mergeNumber
            existing.splitNumber = source.splitNumber ?? existing.splitNumber
            existing.displayName = source.displayName || existing.displayName
            overrides.splice(sourceIndex, 1)
          } else {
            source.junctionId = nextJunctionId
          }
        }

        if (state.selectedEntity?.entityType === 'junction' && (previousJunctionIds.includes(state.selectedEntity.id) || endpointRefs.length > 0)) {
          state.selectedEntity = { entityType: 'junction', id: nextJunctionId }
          state.map.settings.editorState.lastSelected = { entityType: 'junction', id: nextJunctionId }
        }

        state.map = withTimestamp(state.map)
      })
    },

    relocateSelected: (x, y) => {
      let relocated = false

      set((state) => {
        const selected = state.selectedEntity
        if (!selected || selected.entityType === 'junction') {
          return
        }

        const sectionById = new Map(state.map.sections.map((section) => [section.id, section]))
        const sectionIdByNumber = new Map(state.map.sections.map((section) => [section.sectionNumber, section.id]))

        const sectionAdjacency = new Map<string, Set<string>>()
        const sectionGroups = new Map<string, string[]>()

        for (const section of state.map.sections) {
          const keys = [
            `${Math.round(section.endpoint1.coordinate.x)}:${Math.round(section.endpoint1.coordinate.y)}`,
            `${Math.round(section.endpoint2.coordinate.x)}:${Math.round(section.endpoint2.coordinate.y)}`,
          ]

          for (const key of keys) {
            const current = sectionGroups.get(key) ?? []
            current.push(section.id)
            sectionGroups.set(key, current)
          }
        }

        for (const ids of sectionGroups.values()) {
          for (const id of ids) {
            if (!sectionAdjacency.has(id)) {
              sectionAdjacency.set(id, new Set())
            }

            const neighbors = sectionAdjacency.get(id) as Set<string>
            for (const candidate of ids) {
              if (candidate !== id) {
                neighbors.add(candidate)
              }
            }
          }
        }

        const movedSectionIds = new Set<string>()
        const movedStationIds = new Set<string>()
        const movedIntersectionIds = new Set<string>()
        const movedSignalIds = new Set<string>()

        const seedSectionIds = new Set<string>()

        if (selected.entityType === 'section') {
          seedSectionIds.add(selected.id)
        }

        if (selected.entityType === 'station') {
          movedStationIds.add(selected.id)
          for (const section of state.map.sections) {
            if (
              section.endpoint1.stationConnection?.stationId === selected.id ||
              section.endpoint2.stationConnection?.stationId === selected.id
            ) {
              seedSectionIds.add(section.id)
            }
          }
        }

        if (selected.entityType === 'signal') {
          movedSignalIds.add(selected.id)
          const signal = state.map.signals.find((item) => item.id === selected.id)
          if (signal?.socketA?.sectionId) {
            seedSectionIds.add(signal.socketA.sectionId)
          }

          if (signal?.socketB?.sectionId) {
            seedSectionIds.add(signal.socketB.sectionId)
          }

          for (const sectionNumber of signal?.sectionConnections ?? []) {
            const sectionId = sectionIdByNumber.get(sectionNumber)
            if (sectionId) {
              seedSectionIds.add(sectionId)
            }
          }
        }

        if (selected.entityType === 'intersection') {
          movedIntersectionIds.add(selected.id)
          const intersection = state.map.intersections.find((item) => item.id === selected.id)
          if (intersection) {
            const points = getIntersectionConnectionPoints(intersection)
            for (const section of state.map.sections) {
              const endpoints = [section.endpoint1.coordinate, section.endpoint2.coordinate]
              const connected = endpoints.some((endpoint) =>
                points.some((point) => pointDistance(endpoint, point) <= INTERSECTION_ENDPOINT_SNAP_TOLERANCE),
              )

              if (connected) {
                seedSectionIds.add(section.id)
              }
            }
          }
        }

        const queue = Array.from(seedSectionIds)
        while (queue.length > 0) {
          const currentId = queue.shift() as string
          if (movedSectionIds.has(currentId)) {
            continue
          }

          movedSectionIds.add(currentId)
          const neighbors = sectionAdjacency.get(currentId)
          if (!neighbors) {
            continue
          }

          for (const neighbor of neighbors) {
            if (!movedSectionIds.has(neighbor)) {
              queue.push(neighbor)
            }
          }
        }

        for (const sectionId of movedSectionIds) {
          const section = sectionById.get(sectionId)
          if (!section) {
            continue
          }

          if (section.endpoint1.stationConnection?.stationId) {
            movedStationIds.add(section.endpoint1.stationConnection.stationId)
          }

          if (section.endpoint2.stationConnection?.stationId) {
            movedStationIds.add(section.endpoint2.stationConnection.stationId)
          }
        }

        for (const intersection of state.map.intersections) {
          const points = getIntersectionConnectionPoints(intersection)
          const connected = state.map.sections.some((section) => {
            if (!movedSectionIds.has(section.id)) {
              return false
            }

            return [section.endpoint1.coordinate, section.endpoint2.coordinate].some((endpoint) =>
              points.some((point) => pointDistance(endpoint, point) <= INTERSECTION_ENDPOINT_SNAP_TOLERANCE),
            )
          })

          if (connected) {
            movedIntersectionIds.add(intersection.id)
          }
        }

        for (const signal of state.map.signals) {
          const sectionLinkedBySocket =
            (signal.socketA?.sectionId && movedSectionIds.has(signal.socketA.sectionId)) ||
            (signal.socketB?.sectionId && movedSectionIds.has(signal.socketB.sectionId))

          const sectionLinkedByNumber = signal.sectionConnections.some((sectionNumber) => {
            const sectionId = sectionIdByNumber.get(sectionNumber)
            return !!sectionId && movedSectionIds.has(sectionId)
          })

          if (sectionLinkedBySocket || sectionLinkedByNumber) {
            movedSignalIds.add(signal.id)
          }
        }

        if (selected.entityType === 'station') {
          movedStationIds.add(selected.id)
        }
        if (selected.entityType === 'section') {
          movedSectionIds.add(selected.id)
        }
        if (selected.entityType === 'intersection') {
          movedIntersectionIds.add(selected.id)
        }
        if (selected.entityType === 'signal') {
          movedSignalIds.add(selected.id)
        }

        let anchor: Point | null = null
        if (selected.entityType === 'station') {
          const station = state.map.stations.find((item) => item.id === selected.id)
          if (station) {
            anchor = {
              x: (station.inbound.x + station.outbound.x) / 2,
              y: (station.inbound.y + station.outbound.y) / 2,
            }
          }
        }

        if (selected.entityType === 'section') {
          const section = state.map.sections.find((item) => item.id === selected.id)
          if (section) {
            anchor = getSectionMidpoint(section)
          }
        }

        if (selected.entityType === 'intersection') {
          const intersection = state.map.intersections.find((item) => item.id === selected.id)
          if (intersection) {
            anchor = { ...intersection.center }
          }
        }

        if (selected.entityType === 'signal') {
          const signal = state.map.signals.find((item) => item.id === selected.id)
          if (signal) {
            anchor = { ...signal.coordinate }
          }
        }

        if (!anchor) {
          return
        }

        const dx = x - anchor.x
        const dy = y - anchor.y
        if (dx === 0 && dy === 0) {
          relocated = true
          return
        }

        pushHistorySnapshot(state)

        for (const section of state.map.sections) {
          if (!movedSectionIds.has(section.id)) {
            continue
          }

          section.endpoint1.coordinate = shiftPoint(section.endpoint1.coordinate, dx, dy)
          section.endpoint2.coordinate = shiftPoint(section.endpoint2.coordinate, dx, dy)
        }

        for (const station of state.map.stations) {
          if (!movedStationIds.has(station.id)) {
            continue
          }

          station.inbound = shiftPoint(station.inbound, dx, dy)
          station.outbound = shiftPoint(station.outbound, dx, dy)
        }

        for (const intersection of state.map.intersections) {
          if (!movedIntersectionIds.has(intersection.id)) {
            continue
          }

          intersection.center = shiftPoint(intersection.center, dx, dy)
        }

        for (const signal of state.map.signals) {
          if (!movedSignalIds.has(signal.id)) {
            continue
          }

          signal.coordinate = shiftPoint(signal.coordinate, dx, dy)
        }

        state.map = withTimestamp(state.map)
        relocated = true
      })

      return relocated
    },

    disconnectSectionEndpointStation: (sectionId, endpointKey) => {
      set((state) => {
        const section = state.map.sections.find((item) => item.id === sectionId)
        if (!section) {
          return
        }

        const endpoint = section[endpointKey]
        let connection = endpoint.stationConnection

        // Fallback for legacy data where station side occupancy exists but endpoint stationConnection is missing.
        if (!connection) {
          const tolerance = 30
          let best:
            | { stationId: string; side: StationSide; distanceSquared: number }
            | null = null

          for (const station of state.map.stations) {
            const candidates: Array<{ side: StationSide; point: Point; occupiedBy: number | null }> = [
              {
                side: 'Left',
                point: getStationSidePoint(station, 'Left'),
                occupiedBy: station.sectionInNumber,
              },
              {
                side: 'Right',
                point: getStationSidePoint(station, 'Right'),
                occupiedBy: station.sectionOutNumber,
              },
            ]

            for (const candidate of candidates) {
              if (candidate.occupiedBy !== section.sectionNumber) {
                continue
              }

              const dx = endpoint.coordinate.x - candidate.point.x
              const dy = endpoint.coordinate.y - candidate.point.y
              if (Math.abs(dx) > tolerance || Math.abs(dy) > tolerance) {
                continue
              }

              const distanceSquared = dx * dx + dy * dy
              if (!best || distanceSquared < best.distanceSquared) {
                best = {
                  stationId: station.id,
                  side: candidate.side,
                  distanceSquared,
                }
              }
            }
          }

          if (best) {
            connection = { stationId: best.stationId, side: best.side }
          }
        }

        if (!connection) {
          return
        }

        pushHistorySnapshot(state)
        endpoint.stationConnection = null

        const station = state.map.stations.find((item) => item.id === connection.stationId)
        if (station) {
          reconcileStationSideOccupancy(state.map, station, connection.side)
        }

        state.map = withTimestamp(state.map)
      })
    },

    connectSectionEndpointToStation: (sectionId, endpointKey, stationId, side) => {
      let connected = false

      set((state) => {
        const section = state.map.sections.find((item) => item.id === sectionId)
        if (!section) {
          return
        }

        const station = state.map.stations.find((item) => item.id === stationId)
        if (!station) {
          return
        }

        const endpoint = section[endpointKey]
        const sideOccupiedBy = getConnectedSectionNumbersForStationSide(state.map, station.id, side)

        if (sideOccupiedBy.some((sectionNumber) => sectionNumber !== section.sectionNumber)) {
          connected = false
          return
        }

        pushHistorySnapshot(state)
        const previous = endpoint.stationConnection
        endpoint.stationConnection = { stationId, side }
        endpoint.coordinate = getStationSidePoint(station, side)

        if (previous) {
          const previousStation = state.map.stations.find((item) => item.id === previous.stationId)
          if (previousStation) {
            reconcileStationSideOccupancy(state.map, previousStation, previous.side)
          }
        }

        reconcileStationSideOccupancy(state.map, station, side)
        connected = true
        state.map = withTimestamp(state.map)
      })

      return connected
    },

    beginHistoryBatch: () => {
      beginHistoryBatch(get())
    },

    commitHistoryBatch: () => {
      set((state) => {
        commitHistoryBatch(state)
      })
    },

    undo: () => {
      cancelHistoryBatch()
      set((state) => {
        const snapshot = state.undoStack.pop()
        if (!snapshot) {
          return
        }

        state.redoStack.push(captureHistorySnapshot(state))
        if (state.redoStack.length > HISTORY_LIMIT) {
          state.redoStack.shift()
        }

        restoreHistorySnapshot(state, snapshot)
        state.map = withTimestamp(state.map)
      })
    },

    redo: () => {
      cancelHistoryBatch()
      set((state) => {
        const snapshot = state.redoStack.pop()
        if (!snapshot) {
          return
        }

        state.undoStack.push(captureHistorySnapshot(state))
        if (state.undoStack.length > HISTORY_LIMIT) {
          state.undoStack.shift()
        }

        restoreHistorySnapshot(state, snapshot)
        state.map = withTimestamp(state.map)
      })
    },

    getSectionConnectivityGraph: () => {
      const { map } = get()
      return buildSectionConnectivityGraph(map)
    },

    findSectionPath: (fromSectionNumber, toSectionNumber) => {
      const graph = get().getSectionConnectivityGraph()
      return findSectionPath(graph, fromSectionNumber, toSectionNumber)
    },

    deleteSelected: () => {
      set((state) => {
        const selected = state.selectedEntity
        if (!selected) {
          return
        }

        pushHistorySnapshot(state)
        if (selected.entityType === 'station') {
          const station = state.map.stations.find((item) => item.id === selected.id)
          if (station) {
            for (const section of state.map.sections) {
              if (section.endpoint1.stationConnection?.stationId === station.id) {
                section.endpoint1.stationConnection = null
              }

              if (section.endpoint2.stationConnection?.stationId === station.id) {
                section.endpoint2.stationConnection = null
              }
            }
          }

          state.map.stations = state.map.stations.filter((item) => item.id !== selected.id)
        }

        if (selected.entityType === 'section') {
          const section = state.map.sections.find((item) => item.id === selected.id)
          if (section) {
            for (const station of state.map.stations) {
              if (station.sectionInNumber === section.sectionNumber) {
                station.sectionInNumber = null
              }

              if (station.sectionOutNumber === section.sectionNumber) {
                station.sectionOutNumber = null
              }
            }
          }

          state.map.sections = state.map.sections.filter((item) => item.id !== selected.id)
        }

        if (selected.entityType === 'signal') {
          state.map.signals = state.map.signals.filter((item) => item.id !== selected.id)
        }

        if (selected.entityType === 'intersection') {
          state.map.intersections = state.map.intersections.filter((item) => item.id !== selected.id)
        }

        if (selected.entityType === 'junction') {
          state.selectedEntity = null
          state.map.settings.editorState.lastSelected = null
          state.map = withTimestamp(state.map)
          return
        }

        state.selectedEntity = null
        state.map.settings.editorState.lastSelected = null
        state.map = withTimestamp(state.map)
      })
    },
  })),
)

useEditorStore.subscribe((state) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.map))
})
