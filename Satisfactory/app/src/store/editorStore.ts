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
type StationSide = 'Left' | 'Right'
const STATION_CONNECTION_HALF_WIDTH = 86
const INTERSECTION_ENDPOINT_SNAP_TOLERANCE = 16

interface EditorState {
  map: MapDocument
  zoom: number
  activeTool: ToolMode
  connectionsLocked: boolean
  selectedEntity: SelectedEntity
  clearMap: () => void
  loadFromDisk: (raw: string) => { ok: true } | { ok: false; message: string }
  setTool: (tool: ToolMode) => void
  setConnectionsLocked: (locked: boolean) => void
  setZoom: (zoom: number) => void
  addEntityAt: (point: Point) => void
  selectEntity: (selectedEntity: SelectedEntity) => void
  updateMapTitle: (title: string) => void
  updateGridSize: (worldWidth: number, worldHeight: number) => void
  exportMap: () => string
  updateStation: (id: string, patch: Partial<TrainStation>) => void
  updateSection: (id: string, patch: Partial<RailwaySection>) => void
  updateIntersection: (id: string, patch: Partial<Intersection>) => void
  updateSignal: (id: string, patch: Partial<Signal>) => void
  moveStation: (id: string, x: number, y: number) => void
  moveSection: (id: string, x: number, y: number) => void
  moveIntersection: (id: string, x: number, y: number) => void
  moveSignal: (id: string, x: number, y: number) => void
  disconnectSectionEndpointStation: (sectionId: string, endpointKey: SectionEndpointKey) => void
  connectSectionEndpointToStation: (
    sectionId: string,
    endpointKey: SectionEndpointKey,
    stationId: string,
    side: StationSide,
  ) => boolean
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
    return parseMapDocument(JSON.parse(raw))
  } catch {
    return createDefaultMap()
  }
}

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

function createSection(
  map: MapDocument,
  point: Point,
  sectionKind: RailwaySectionKind,
): RailwaySection {
  const sectionNumber = nextSectionNumber(map)
  return {
    id: randomId('section'),
    sectionNumber,
    color: '#93c5fd',
    sectionKind,
    curveBend: 120,
    endpoint1: {
      sectionNumber,
      coordinate: { x: point.x - 100, y: sectionKind === 'Curved' ? point.y - 60 : point.y },
      stationConnection: null,
      signal1: null,
      signal2: null,
      entranceMode: 'Allowed',
    },
    endpoint2: {
      sectionNumber,
      coordinate: { x: point.x + 100, y: sectionKind === 'Curved' ? point.y + 60 : point.y },
      stationConnection: null,
      signal1: null,
      signal2: null,
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
  return {
    x: side === 'Left' ? anchorX - STATION_CONNECTION_HALF_WIDTH : anchorX + STATION_CONNECTION_HALF_WIDTH,
    y: anchorY,
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
    map: loadInitialMap(),
    zoom: 1,
    activeTool: 'select',
    connectionsLocked: false,
    selectedEntity: null,

    clearMap: () => {
      set((state) => {
        state.map = createDefaultMap()
        state.selectedEntity = null
        state.activeTool = 'select'
        state.zoom = 1
      })

      localStorage.removeItem(LOCAL_STORAGE_KEY)
    },

    loadFromDisk: (raw) => {
      try {
        const parsed = parseMapDocument(JSON.parse(raw))
        reconcileAllStationOccupancy(parsed)
        set((state) => {
          state.map = parsed
          state.selectedEntity = null
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
      })
    },

    updateMapTitle: (title) => {
      set((state) => {
        state.map.settings.title = title
        state.map = withTimestamp(state.map)
      })
    },

    updateGridSize: (worldWidth, worldHeight) => {
      set((state) => {
        state.map.settings.worldWidth = Math.max(10, Math.min(10000, Math.round(worldWidth)))
        state.map.settings.worldHeight = Math.max(10, Math.min(10000, Math.round(worldHeight)))
        state.map = withTimestamp(state.map)
      })
    },

    exportMap: () => {
      const { map } = get()
      return JSON.stringify(map, null, 2)
    },

    updateStation: (id, patch) => {
      set((state) => {
        const station = state.map.stations.find((x) => x.id === id)
        if (!station) {
          return
        }

        Object.assign(station, patch)
        state.map = withTimestamp(state.map)
      })
    },

    updateSection: (id, patch) => {
      set((state) => {
        const section = state.map.sections.find((x) => x.id === id)
        if (!section) {
          return
        }

        Object.assign(section, patch)

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

        const previousInbound = { ...station.inbound }
        const previousOutbound = { ...station.outbound }
        const previousAnchorX = (previousInbound.x + previousOutbound.x) / 2
        const previousAnchorY = (previousInbound.y + previousOutbound.y) / 2
        const previousLeftBorder = {
          x: previousAnchorX - STATION_CONNECTION_HALF_WIDTH,
          y: previousAnchorY,
        }
        const previousRightBorder = {
          x: previousAnchorX + STATION_CONNECTION_HALF_WIDTH,
          y: previousAnchorY,
        }
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

    moveSignal: (id, x, y) => {
      set((state) => {
        const signal = state.map.signals.find((item) => item.id === id)
        if (!signal) {
          return
        }

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
              { side: 'Left', point: getStationSidePoint(station, 'Left'), occupiedBy: station.sectionInNumber },
              { side: 'Right', point: getStationSidePoint(station, 'Right'), occupiedBy: station.sectionOutNumber },
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
          return
        }

        state.selectedEntity = null
        state.map = withTimestamp(state.map)
      })
    },
  })),
)

useEditorStore.subscribe((state) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.map))
})
