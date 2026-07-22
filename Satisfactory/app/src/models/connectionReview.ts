import type { MapDocument, SignalType } from './mapSchema'
import { buildSectionConnectivityGraph } from './sectionGraph'

type SectionEndpointKey = 'endpoint1' | 'endpoint2'
type SectionEndpointSide = 'Left' | 'Right'
type JunctionType = 'Merge' | 'Split' | 'Junction' | 'Invalid'

function getDerivedEntranceMode(
  directionMode: MapDocument['sections'][number]['directionMode'] | undefined,
  endpointKey: SectionEndpointKey,
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

export type ConnectionReviewIssue = {
  id: string
  severity: 'warning' | 'error'
  code:
    | 'SECTION_ORPHANED'
    | 'SECTION_PARTIAL'
    | 'STATION_ORPHANED'
    | 'STATION_PARTIAL'
    | 'ENDPOINT_SECTION_NUMBER_MISMATCH'
    | 'SECTION_NUMBER_DUPLICATE'
    | 'INVALID_STATION_CONNECTION'
    | 'MISSING_SIGNAL'
    | 'INVALID_SIGNAL_ATTACHMENT'
    | 'SECTION_DIRECTION_INVALID'
    | 'DUPLICATE_JUNCTION_NUMBER'
    | 'DUPLICATE_MERGE_NUMBER'
    | 'DUPLICATE_SPLIT_NUMBER'
  entityType: 'section' | 'station' | 'signal' | 'intersection' | 'junction' | 'map'
  entityId: string
  message: string
}

export type JunctionMetadata = {
  id: string
  x: number
  y: number
  type: JunctionType
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

export type ConnectionReview = {
  issues: ConnectionReviewIssue[]
  sectionConnectivity: Record<string, { connectedEndpoints: 0 | 1 | 2; status: 'ok' | 'partial' | 'orphan' }>
  stationConnectivity: Record<string, { connectedSides: 0 | 1 | 2; status: 'ok' | 'partial' | 'orphan' }>
  sectionSignalConnectivity: Record<
    string,
    { connectedSignals: 0 | 1 | 2 | 3 | 4; requiredSignals: 0 | 1 | 2 | 3 | 4; status: 'ok' | 'partial' | 'invalid' | 'orphan' }
  >
  signalConnectivity: Record<
    string,
    { connectedSockets: 0 | 1 | 2; status: 'ok' | 'partial' | 'invalid' | 'orphan' }
  >
}

const INTERSECTION_ENDPOINT_SNAP_TOLERANCE = 16

function pointKey(x: number, y: number): string {
  return `${Math.round(x)}:${Math.round(y)}`
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

function getIntersectionConnectionPoints(
  intersection: MapDocument['intersections'][number],
): Array<{ x: number; y: number }> {
  const arm = Math.max(40, intersection.armLength)
  return [
    { x: intersection.center.x, y: intersection.center.y - arm },
    { x: intersection.center.x + arm, y: intersection.center.y },
    { x: intersection.center.x, y: intersection.center.y + arm },
    { x: intersection.center.x - arm, y: intersection.center.y },
  ]
}

function getEndpointSignalType(
  section: MapDocument['sections'][number],
  endpointKey: SectionEndpointKey,
  side: SectionEndpointSide,
): 'Block' | 'Path' | null {
  const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2
  const socket = endpoint.signalSockets?.[side]

  if (!socket) {
    return null
  }

  if (socket.state === 'Off') {
    return null
  }

  return socket.expectedType
}

function getEndpointSignalSocketState(
  section: MapDocument['sections'][number],
  endpointKey: SectionEndpointKey,
  side: SectionEndpointSide,
): {
  state: 'Suggested' | 'Implemented' | 'Off'
  expectedType: 'Block' | 'Path' | null
} {
  const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2
  const socket = endpoint.signalSockets?.[side]

  if (!socket) {
    return {
      state: 'Suggested',
      expectedType: null,
    }
  }

  return {
    state: socket.state,
    expectedType: socket.expectedType,
  }
}

function getRouteSuggestedSignalType(
  map: Pick<MapDocument, 'sections' | 'stations'>,
  section: MapDocument['sections'][number],
  endpointKey: SectionEndpointKey,
  side: SectionEndpointSide,
  endpointGroups: Record<string, Array<{ sectionId: string; endpointKey: SectionEndpointKey }>>,
  graph: ReturnType<typeof buildSectionConnectivityGraph>,
): SignalType | null {
  const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2
  const coordinateKey = pointKey(endpoint.coordinate.x, endpoint.coordinate.y)
  const connectedSections = (endpointGroups[coordinateKey] ?? []).filter((entry) => entry.sectionId !== section.id)
  const connectedToStation = endpoint.stationConnection
    ? map.stations.some((station) => station.id === endpoint.stationConnection?.stationId)
    : false
  const connectedToRoute =
    connectedToStation ||
    connectedSections.length > 0 ||
    (graph.adjacency[section.sectionNumber]?.length ?? 0) > 0

  if (!connectedToRoute) {
    return null
  }

  const endpointIsEntry = getDerivedEntranceMode(section.directionMode, endpointKey) === 'Allowed'
  if (endpointIsEntry) {
    return side === 'Left' ? 'Block' : 'Path'
  }

  return side === 'Left' ? 'Path' : 'Block'
}

export function buildRouteSignalSuggestionMap(map: Pick<MapDocument, 'sections' | 'stations'>): Map<string, SignalType | null> {
  const suggestions = new Map<string, SignalType | null>()
  const endpointGroups = buildEndpointGroups(map)
  const graph = buildSectionConnectivityGraph(map)

  for (const section of map.sections) {
    for (const endpointKey of ['endpoint1', 'endpoint2'] as const) {
      for (const side of ['Left', 'Right'] as const) {
        suggestions.set(
          `${section.id}:${endpointKey}:${side}`,
          getRouteSuggestedSignalType(map, section, endpointKey, side, endpointGroups, graph),
        )
      }
    }
  }

  return suggestions
}

function getSignalSocketKey(ref: NonNullable<MapDocument['signals'][number]['socketA']>): string {
  return `${ref.sectionId}:${ref.endpointKey}:${ref.side}`
}

function buildSignalSocketLookup(map: MapDocument): Map<string, { signalId: string; signalType: 'Block' | 'Path' }> {
  const lookup = new Map<string, { signalId: string; signalType: 'Block' | 'Path' }>()

  for (const signal of map.signals) {
    const sockets = [signal.socketA, signal.socketB].filter(Boolean) as Array<NonNullable<typeof signal.socketA>>
    for (const socket of sockets) {
      lookup.set(getSignalSocketKey(socket), { signalId: signal.id, signalType: signal.signalType })
    }
  }

  return lookup
}

export function deriveJunctionType(endpoints: Array<{ entranceMode: 'Allowed' | 'Blocked' }>): JunctionType {
  if (endpoints.length !== 3) {
    return 'Invalid'
  }

  const allowedCount = endpoints.filter((entry) => entry.entranceMode === 'Allowed').length
  const blockedCount = endpoints.length - allowedCount

  if (blockedCount === 2 && allowedCount === 1) {
    return 'Merge'
  }

  if (allowedCount === 2 && blockedCount === 1) {
    return 'Split'
  }

  if (allowedCount === 3) {
    return 'Junction'
  }

  return 'Invalid'
}

export function getJunctionDisplayLabel(type: JunctionType, displayNumber: number): string {
  if (type === 'Merge') {
    return `Merge ${displayNumber}`
  }

  if (type === 'Split') {
    return `Split ${displayNumber}`
  }

  if (type === 'Junction') {
    return `Junction ${displayNumber}`
  }

  return `Invalid ${displayNumber}`
}

function buildEndpointGroups(map: Pick<MapDocument, 'sections'>): Record<string, Array<{ sectionId: string; endpointKey: SectionEndpointKey }>> {
  const grouped: Record<string, Array<{ sectionId: string; endpointKey: SectionEndpointKey }>> = {}

  for (const section of map.sections) {
    const endpoints: Array<{ endpointKey: SectionEndpointKey; x: number; y: number }> = [
      {
        endpointKey: 'endpoint1',
        x: section.endpoint1.coordinate.x,
        y: section.endpoint1.coordinate.y,
      },
      {
        endpointKey: 'endpoint2',
        x: section.endpoint2.coordinate.x,
        y: section.endpoint2.coordinate.y,
      },
    ]

    for (const endpoint of endpoints) {
      const key = pointKey(endpoint.x, endpoint.y)
      const entries = grouped[key] ?? []
      entries.push({ sectionId: section.id, endpointKey: endpoint.endpointKey })
      grouped[key] = entries
    }
  }

  return grouped
}

function inferConnectedSectionNumber(
  map: MapDocument,
  section: MapDocument['sections'][number],
  endpointKey: SectionEndpointKey,
  endpointGroups: Record<string, Array<{ sectionId: string; endpointKey: SectionEndpointKey }>>,
): number {
  const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2

  if (endpoint.stationConnection) {
    const stationExists = map.stations.some((station) => station.id === endpoint.stationConnection?.stationId)
    if (stationExists) {
      return section.sectionNumber
    }
  }

  const coordinateKey = pointKey(endpoint.coordinate.x, endpoint.coordinate.y)
  const linkedEntries = (endpointGroups[coordinateKey] ?? []).filter((entry) => entry.sectionId !== section.id)
  const linkedSectionNumbers = linkedEntries
    .map((entry) => map.sections.find((item) => item.id === entry.sectionId)?.sectionNumber)
    .filter((value): value is number => value !== undefined)

  if (linkedSectionNumbers.length === 1) {
    return linkedSectionNumbers[0]
  }

  if (linkedSectionNumbers.length > 1) {
    return [...linkedSectionNumbers].sort((a, b) => a - b)[0]
  }

  return section.sectionNumber
}

export function getJunctionIds(map: MapDocument): Set<string> {
  const endpointGroups = buildEndpointGroups(map)
  const ids = new Set<string>()

  for (const [key, entries] of Object.entries(endpointGroups)) {
    if (entries.length === 3) {
      ids.add(key)
    }
  }

  return ids
}

function allocateJunctionNumbers(
  items: Array<{ id: string }>,
  overrides: Map<string, MapDocument['settings']['junctionNumberOverrides'][number]>,
  field: 'junctionNumber' | 'mergeNumber' | 'splitNumber',
): Map<string, number> {
  const result = new Map<string, number>()
  const used = new Set<number>()

  for (const item of items) {
    const candidate = overrides.get(item.id)?.[field]
    if (candidate === undefined) {
      continue
    }

    result.set(item.id, candidate)
    if (candidate >= 1) {
      used.add(candidate)
    }
  }

  let nextNumber = 1
  for (const item of items) {
    if (result.has(item.id)) {
      continue
    }

    while (used.has(nextNumber)) {
      nextNumber += 1
    }

    result.set(item.id, nextNumber)
    used.add(nextNumber)
  }

  return result
}

export function buildJunctionMetadata(map: MapDocument): JunctionMetadata[] {
  const grouped: Record<string, Array<{ sectionNumber: number; entranceMode: 'Allowed' | 'Blocked' }>> = {}

  for (const section of map.sections) {
    const endpoint1EntranceMode = getDerivedEntranceMode(section.directionMode, 'endpoint1')
    const endpoint2EntranceMode = getDerivedEntranceMode(section.directionMode, 'endpoint2')

    const endpoints: Array<{ x: number; y: number; entranceMode: 'Allowed' | 'Blocked' }> = [
      {
        x: section.endpoint1.coordinate.x,
        y: section.endpoint1.coordinate.y,
        entranceMode: endpoint1EntranceMode,
      },
      {
        x: section.endpoint2.coordinate.x,
        y: section.endpoint2.coordinate.y,
        entranceMode: endpoint2EntranceMode,
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

  for (const [id, entries] of Object.entries(grouped)) {
    if (entries.length !== 3) {
      continue
    }

    const [xText, yText] = id.split(':')
    const x = Number(xText)
    const y = Number(yText)
    const allowedCount = entries.filter((entry) => entry.entranceMode === 'Allowed').length
    const blockedCount = entries.length - allowedCount
    const type = deriveJunctionType(entries)

    const connectedSectionNumbers = Array.from(new Set(entries.map((entry) => entry.sectionNumber))).sort((a, b) => a - b)

    junctions.push({
      id,
      x,
      y,
      type,
      name: '',
      junctionNumber: 0,
      mergeNumber: null,
      splitNumber: null,
      displayNumber: 0,
      displayLabel: '',
      connectedSectionNumbers,
      allowedCount,
      blockedCount,
    })
  }

  junctions.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

  const overrides = new Map(map.settings.junctionNumberOverrides.map((entry) => [entry.junctionId, entry]))
  const junctionNumberMap = allocateJunctionNumbers(junctions, overrides, 'junctionNumber')
  const mergeNumberMap = allocateJunctionNumbers(junctions.filter((junction) => junction.type === 'Merge'), overrides, 'mergeNumber')
  const splitNumberMap = allocateJunctionNumbers(junctions.filter((junction) => junction.type === 'Split'), overrides, 'splitNumber')

  return junctions.map((junction) => {
    const junctionNumber = junctionNumberMap.get(junction.id) ?? 0
    const mergeNumber = junction.type === 'Merge' ? (mergeNumberMap.get(junction.id) ?? null) : null
    const splitNumber = junction.type === 'Split' ? (splitNumberMap.get(junction.id) ?? null) : null
    const overrideName = overrides.get(junction.id)?.displayName?.trim() ?? ''
    const displayNumber =
      junction.type === 'Merge'
        ? (mergeNumber ?? junctionNumber)
        : junction.type === 'Split'
          ? (splitNumber ?? junctionNumber)
          : junctionNumber
    const displayLabel = overrideName || getJunctionDisplayLabel(junction.type, displayNumber)

    return {
      ...junction,
      name: overrideName,
      junctionNumber,
      mergeNumber,
      splitNumber,
      displayNumber,
      displayLabel,
    }
  })
}

export function buildConnectionReview(map: MapDocument): ConnectionReview {
  const issues: ConnectionReviewIssue[] = []
  const sectionConnectivity: ConnectionReview['sectionConnectivity'] = {}
  const stationConnectivity: ConnectionReview['stationConnectivity'] = {}
  const sectionSignalConnectivity: ConnectionReview['sectionSignalConnectivity'] = {}
  const signalConnectivity: ConnectionReview['signalConnectivity'] = {}

  const endpointGroups = buildEndpointGroups(map)
  const routeSignalSuggestions = buildRouteSignalSuggestionMap(map)
  const stationById = new Map(map.stations.map((station) => [station.id, station]))
  const signalSocketLookup = buildSignalSocketLookup(map)
  const junctionMetadata = buildJunctionMetadata(map)

  const sectionByNumber = new Map<number, string>()
  const duplicateNumbers = new Set<number>()
  for (const section of map.sections) {
    if (sectionByNumber.has(section.sectionNumber)) {
      duplicateNumbers.add(section.sectionNumber)
    } else {
      sectionByNumber.set(section.sectionNumber, section.id)
    }
  }

  for (const duplicateNumber of duplicateNumbers) {
    issues.push({
      id: `dup-section-${duplicateNumber}`,
      severity: 'error',
      code: 'SECTION_NUMBER_DUPLICATE',
      entityType: 'map',
      entityId: String(duplicateNumber),
      message: `Duplicate section number ${duplicateNumber} detected.`,
    })
  }

  const intersectionPoints = map.intersections.flatMap((intersection) =>
    getIntersectionConnectionPoints(intersection),
  )

  for (const section of map.sections) {
    const endpoints: Array<{ key: SectionEndpointKey; endpoint: MapDocument['sections'][number]['endpoint1'] }> = [
      { key: 'endpoint1', endpoint: section.endpoint1 },
      { key: 'endpoint2', endpoint: section.endpoint2 },
    ]

    let connectedCount = 0
    const endpointConnected: Record<SectionEndpointKey, boolean> = {
      endpoint1: false,
      endpoint2: false,
    }
    let signalRequiredCount = 0
    let signalConnectedCount = 0
    let signalInvalidCount = 0

    for (const { key, endpoint } of endpoints) {
      const expectedConnectedSectionNumber = inferConnectedSectionNumber(map, section, key, endpointGroups)
      if (endpoint.sectionNumber !== expectedConnectedSectionNumber) {
        issues.push({
          id: `endpoint-number-${section.id}-${key}`,
          severity: 'warning',
          code: 'ENDPOINT_SECTION_NUMBER_MISMATCH',
          entityType: 'section',
          entityId: section.id,
          message: `Section ${section.sectionNumber} has mismatched ${key}.sectionNumber (${endpoint.sectionNumber}); expected ${expectedConnectedSectionNumber}.`,
        })
      }

      let connected = false

      if (endpoint.stationConnection) {
        const station = stationById.get(endpoint.stationConnection.stationId)
        if (station) {
          connected = true
        } else {
          issues.push({
            id: `invalid-station-link-${section.id}-${key}`,
            severity: 'error',
            code: 'INVALID_STATION_CONNECTION',
            entityType: 'section',
            entityId: section.id,
            message: `Section ${section.sectionNumber} ${key} references missing station ${endpoint.stationConnection.stationId}.`,
          })
        }
      }

      const keyName = pointKey(endpoint.coordinate.x, endpoint.coordinate.y)
      if ((endpointGroups[keyName]?.length ?? 0) > 1) {
        connected = true
      }

      if (!connected) {
        connected = intersectionPoints.some(
          (point) => distance(endpoint.coordinate, point) <= INTERSECTION_ENDPOINT_SNAP_TOLERANCE,
        )
      }

      if (connected) {
        connectedCount += 1
        endpointConnected[key] = true
      }

      const endpointSignals: Array<{ side: SectionEndpointSide }> = [{ side: 'Left' }, { side: 'Right' }]

      for (const slot of endpointSignals) {
        const socketState = getEndpointSignalSocketState(section, key, slot.side)
        const expectedSignalType = socketState.expectedType ?? routeSignalSuggestions.get(`${section.id}:${key}:${slot.side}`) ?? null
        const socketKey = `${section.id}:${key}:${slot.side}`
        const attachedSignal = signalSocketLookup.get(socketKey)

        if (socketState.state === 'Off') {
          if (attachedSignal) {
            signalInvalidCount += 1
            issues.push({
              id: `signal-off-slot-attached-${section.id}-${key}-${slot.side}`,
              severity: 'error',
              code: 'INVALID_SIGNAL_ATTACHMENT',
              entityType: 'section',
              entityId: section.id,
              message: `Section ${section.sectionNumber} has a signal attached at ${key}.${slot.side}, but that socket is turned Off.`,
            })
          }
          continue
        }

        if (!expectedSignalType) {
          if (attachedSignal) {
            signalInvalidCount += 1
            issues.push({
              id: `signal-unexpected-slot-attached-${section.id}-${key}-${slot.side}`,
              severity: 'error',
              code: 'INVALID_SIGNAL_ATTACHMENT',
              entityType: 'section',
              entityId: section.id,
              message: `Section ${section.sectionNumber} has a signal attached at ${key}.${slot.side}, but no signal type is expected for that socket.`,
            })
          }
          continue
        }

        if (connected) {
          signalRequiredCount += 1
        }

        if (!attachedSignal) {
          if (connected) {
            issues.push({
              id: `missing-signal-slot-${section.id}-${key}-${slot.side}`,
              severity: 'warning',
              code: 'MISSING_SIGNAL',
              entityType: 'section',
              entityId: section.id,
              message: `Section ${section.sectionNumber} is missing a ${expectedSignalType} signal at ${key}.${slot.side}.`,
            })
          }
          continue
        }

        signalConnectedCount += 1
        if (attachedSignal.signalType !== expectedSignalType) {
          signalInvalidCount += 1
          issues.push({
            id: `signal-type-mismatch-${section.id}-${key}-${slot.side}`,
            severity: 'error',
            code: 'INVALID_SIGNAL_ATTACHMENT',
            entityType: 'section',
            entityId: section.id,
            message: `Section ${section.sectionNumber} has a ${attachedSignal.signalType} signal attached where ${expectedSignalType} is expected at ${key}.${slot.side}.`,
          })
        }
      }
    }

    if (connectedCount === 0) {
      sectionConnectivity[section.id] = { connectedEndpoints: 0, status: 'orphan' }
      issues.push({
        id: `section-orphan-${section.id}`,
        severity: 'error',
        code: 'SECTION_ORPHANED',
        entityType: 'section',
        entityId: section.id,
        message: `Section ${section.sectionNumber} is orphaned (0/2 endpoint connections).`,
      })
    } else if (connectedCount === 1) {
      sectionConnectivity[section.id] = { connectedEndpoints: 1, status: 'partial' }
      issues.push({
        id: `section-partial-${section.id}`,
        severity: 'warning',
        code: 'SECTION_PARTIAL',
        entityType: 'section',
        entityId: section.id,
        message: `Section ${section.sectionNumber} is partially connected (1/2 endpoint connections).`,
      })
    } else {
      sectionConnectivity[section.id] = { connectedEndpoints: 2, status: 'ok' }
    }

    if (signalRequiredCount === 0) {
      sectionSignalConnectivity[section.id] = {
        connectedSignals: 0,
        requiredSignals: 0,
        status: 'orphan',
      }
    } else if (signalInvalidCount > 0) {
      sectionSignalConnectivity[section.id] = {
        connectedSignals: signalConnectedCount as 0 | 1 | 2 | 3 | 4,
        requiredSignals: signalRequiredCount as 0 | 1 | 2 | 3 | 4,
        status: 'invalid',
      }
    } else if (signalConnectedCount < signalRequiredCount) {
      sectionSignalConnectivity[section.id] = {
        connectedSignals: signalConnectedCount as 0 | 1 | 2 | 3 | 4,
        requiredSignals: signalRequiredCount as 0 | 1 | 2 | 3 | 4,
        status: 'partial',
      }
    } else {
      sectionSignalConnectivity[section.id] = {
        connectedSignals: signalConnectedCount as 0 | 1 | 2 | 3 | 4,
        requiredSignals: signalRequiredCount as 0 | 1 | 2 | 3 | 4,
        status: 'ok',
      }
    }

    const directionMode = section.directionMode ?? 'Bidirectional'
    const endpoint1Connected = endpointConnected.endpoint1
    const endpoint2Connected = endpointConnected.endpoint2

    if (directionMode === 'OneWay1To2') {
      if (!endpoint1Connected || !endpoint2Connected) {
        issues.push({
          id: `direction-viability-${section.id}`,
          severity: 'warning',
          code: 'SECTION_DIRECTION_INVALID',
          entityType: 'section',
          entityId: section.id,
          message: `Section ${section.sectionNumber} is OneWay1To2 but does not have viable connectivity at both endpoints.`,
        })
      }
    }

    if (directionMode === 'OneWay2To1') {
      if (!endpoint1Connected || !endpoint2Connected) {
        issues.push({
          id: `direction-viability-${section.id}`,
          severity: 'warning',
          code: 'SECTION_DIRECTION_INVALID',
          entityType: 'section',
          entityId: section.id,
          message: `Section ${section.sectionNumber} is OneWay2To1 but does not have viable connectivity at both endpoints.`,
        })
      }
    }

  }

  for (const signal of map.signals) {
    const sockets = [signal.socketA, signal.socketB].filter(Boolean) as Array<NonNullable<typeof signal.socketA>>
    let connectedSockets = 0
    let invalid = false

    if (sockets.length === 0) {
      signalConnectivity[signal.id] = { connectedSockets: 0, status: 'orphan' }
      issues.push({
        id: `signal-orphan-${signal.id}`,
        severity: 'error',
        code: 'INVALID_SIGNAL_ATTACHMENT',
        entityType: 'signal',
        entityId: signal.id,
        message: `Signal ${signal.signalNumber} is not attached to any section socket.`,
      })
      continue
    }

    for (const socket of sockets) {
      const section = map.sections.find((item) => item.id === socket.sectionId)
      if (!section) {
        invalid = true
        issues.push({
          id: `signal-missing-section-${signal.id}-${socket.endpointKey}-${socket.side}`,
          severity: 'error',
          code: 'INVALID_SIGNAL_ATTACHMENT',
          entityType: 'signal',
          entityId: signal.id,
          message: `Signal ${signal.signalNumber} references missing section ${socket.sectionId}.`,
        })
        continue
      }

      const slotType = routeSignalSuggestions.get(`${section.id}:${socket.endpointKey}:${socket.side}`) ?? getEndpointSignalType(section, socket.endpointKey, socket.side)
      if (slotType !== signal.signalType) {
        invalid = true
        issues.push({
          id: `signal-type-slot-mismatch-${signal.id}-${socket.endpointKey}-${socket.side}`,
          severity: 'error',
          code: 'INVALID_SIGNAL_ATTACHMENT',
          entityType: 'signal',
          entityId: signal.id,
          message: `Signal ${signal.signalNumber} is attached to ${section.sectionNumber}.${socket.endpointKey}.${socket.side}, but that slot is not defined as ${signal.signalType}.`,
        })
      }

      connectedSockets += 1
    }

    if (invalid) {
      signalConnectivity[signal.id] = {
        connectedSockets: connectedSockets as 0 | 1 | 2,
        status: 'invalid',
      }
    } else if (connectedSockets === 1) {
      signalConnectivity[signal.id] = { connectedSockets: 1, status: 'partial' }
    } else {
      signalConnectivity[signal.id] = { connectedSockets: 2, status: 'ok' }
    }
  }

  for (const station of map.stations) {
    const leftLinked = map.sections.some(
      (section) => section.endpoint1.stationConnection?.stationId === station.id && section.endpoint1.stationConnection.side === 'Left',
    ) ||
      map.sections.some(
        (section) => section.endpoint2.stationConnection?.stationId === station.id && section.endpoint2.stationConnection.side === 'Left',
      )

    const rightLinked = map.sections.some(
      (section) => section.endpoint1.stationConnection?.stationId === station.id && section.endpoint1.stationConnection.side === 'Right',
    ) ||
      map.sections.some(
        (section) => section.endpoint2.stationConnection?.stationId === station.id && section.endpoint2.stationConnection.side === 'Right',
      )

    const connectedSides = (leftLinked ? 1 : 0) + (rightLinked ? 1 : 0)

    if (connectedSides === 0) {
      stationConnectivity[station.id] = { connectedSides: 0, status: 'orphan' }
      issues.push({
        id: `station-orphan-${station.id}`,
        severity: 'error',
        code: 'STATION_ORPHANED',
        entityType: 'station',
        entityId: station.id,
        message: `Station ${station.stationNumber} has no connected sections.`,
      })
    } else if (connectedSides === 1) {
      stationConnectivity[station.id] = { connectedSides: 1, status: 'partial' }
      issues.push({
        id: `station-partial-${station.id}`,
        severity: 'warning',
        code: 'STATION_PARTIAL',
        entityType: 'station',
        entityId: station.id,
        message: `Station ${station.stationNumber} is missing one side connection (1/2).`,
      })
    } else {
      stationConnectivity[station.id] = { connectedSides: 2, status: 'ok' }
    }
  }

  const pushDuplicateIssues = (
    items: JunctionMetadata[],
    selector: (junction: JunctionMetadata) => number | null,
    code: 'DUPLICATE_JUNCTION_NUMBER' | 'DUPLICATE_MERGE_NUMBER' | 'DUPLICATE_SPLIT_NUMBER',
    label: string,
  ): void => {
    const grouped = new Map<number, JunctionMetadata[]>()
    for (const item of items) {
      const value = selector(item)
      if (value === null) {
        continue
      }

      const current = grouped.get(value) ?? []
      current.push(item)
      grouped.set(value, current)
    }

    for (const [value, groupedItems] of grouped.entries()) {
      if (groupedItems.length < 2) {
        continue
      }

      for (const item of groupedItems) {
        issues.push({
          id: `${code}-${item.id}-${value}`,
          severity: 'warning',
          code,
          entityType: 'junction',
          entityId: item.id,
          message: `${label} ${value} is duplicated across ${groupedItems.length} junctions.`,
        })
      }
    }
  }

  pushDuplicateIssues(
    junctionMetadata.filter((junction) => junction.type === 'Junction' || junction.type === 'Invalid'),
    (junction) => junction.junctionNumber,
    'DUPLICATE_JUNCTION_NUMBER',
    'Junction number',
  )
  pushDuplicateIssues(
    junctionMetadata.filter((junction) => junction.type === 'Merge'),
    (junction) => junction.mergeNumber,
    'DUPLICATE_MERGE_NUMBER',
    'Merge number',
  )
  pushDuplicateIssues(
    junctionMetadata.filter((junction) => junction.type === 'Split'),
    (junction) => junction.splitNumber,
    'DUPLICATE_SPLIT_NUMBER',
    'Split number',
  )

  return {
    issues,
    sectionConnectivity,
    stationConnectivity,
    sectionSignalConnectivity,
    signalConnectivity,
  }
}

export function normalizeMapMetadata(map: MapDocument): { fixes: string[] } {
  const fixes: string[] = []
  const stationById = new Map(map.stations.map((station) => [station.id, station]))
  const endpointGroups = buildEndpointGroups(map)
  const routeSignalSuggestions = buildRouteSignalSuggestionMap(map)
  const signalSocketLookup = buildSignalSocketLookup(map)

  const legacyInvalidStyle = {
    shape: 'Diamond',
    width: 16,
    height: 16,
    radius: 8,
    backgroundColor: '#475569',
    borderColor: '#ff0000',
    borderWidth: 1.2,
    textColor: '#ffffff',
    textSize: 7,
    textYOffset: 0,
  }

  if (
    JSON.stringify(map.settings.labelStyles.junction.Invalid) === JSON.stringify(legacyInvalidStyle) &&
    map.settings.labelStyles.junction.Undefined
  ) {
    map.settings.labelStyles.junction.Invalid = JSON.parse(JSON.stringify(map.settings.labelStyles.junction.Undefined))
    fixes.push('Migrated legacy Undefined junction label style into Invalid.')
  }

  for (const section of map.sections) {
    if (!section.sectionName || section.sectionName.trim() === '') {
      section.sectionName = `Section ${section.sectionNumber}`
      fixes.push(`Added sectionName for section ${section.sectionNumber}.`)
    }

    if (!section.directionMode) {
      section.directionMode = 'Bidirectional'
      fixes.push(`Set default directionMode for section ${section.sectionNumber}.`)
    }

    const endpoint1DerivedEntranceMode = getDerivedEntranceMode(section.directionMode, 'endpoint1')
    if (section.endpoint1.entranceMode !== endpoint1DerivedEntranceMode) {
      section.endpoint1.entranceMode = endpoint1DerivedEntranceMode
      fixes.push(`Synced endpoint1 entranceMode from directionMode for section ${section.sectionNumber}.`)
    }

    const endpoint2DerivedEntranceMode = getDerivedEntranceMode(section.directionMode, 'endpoint2')
    if (section.endpoint2.entranceMode !== endpoint2DerivedEntranceMode) {
      section.endpoint2.entranceMode = endpoint2DerivedEntranceMode
      fixes.push(`Synced endpoint2 entranceMode from directionMode for section ${section.sectionNumber}.`)
    }

    if (section.endpoint1.stationConnection && !stationById.has(section.endpoint1.stationConnection.stationId)) {
      section.endpoint1.stationConnection = null
      fixes.push(`Removed invalid station connection from section ${section.sectionNumber} endpoint1.`)
    }

    if (section.endpoint2.stationConnection && !stationById.has(section.endpoint2.stationConnection.stationId)) {
      section.endpoint2.stationConnection = null
      fixes.push(`Removed invalid station connection from section ${section.sectionNumber} endpoint2.`)
    }

    const inferredEndpoint1 = inferConnectedSectionNumber(map, section, 'endpoint1', endpointGroups)
    if (section.endpoint1.sectionNumber !== inferredEndpoint1) {
      section.endpoint1.sectionNumber = inferredEndpoint1
      fixes.push(`Auto-corrected endpoint1.sectionNumber for section ${section.sectionNumber}.`)
    }

    const inferredEndpoint2 = inferConnectedSectionNumber(map, section, 'endpoint2', endpointGroups)
    if (section.endpoint2.sectionNumber !== inferredEndpoint2) {
      section.endpoint2.sectionNumber = inferredEndpoint2
      fixes.push(`Auto-corrected endpoint2.sectionNumber for section ${section.sectionNumber}.`)
    }

    for (const endpointKey of ['endpoint1', 'endpoint2'] as const) {
      const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2
      if (!endpoint.signalSockets) {
        endpoint.signalSockets = {
          Left: { state: 'Suggested', expectedType: null },
          Right: { state: 'Suggested', expectedType: null },
        }
        fixes.push(`Added default signal socket metadata for section ${section.sectionNumber} ${endpointKey}.`)
      }

      for (const side of ['Left', 'Right'] as const) {
        const socketKey = `${section.id}:${endpointKey}:${side}`
        const attachedSignal = signalSocketLookup.get(socketKey)
        const currentSocket = endpoint.signalSockets[side] ?? {
          state: 'Suggested',
          expectedType: null,
        }
        const routeSuggestedType = routeSignalSuggestions.get(socketKey) ?? null

        if (attachedSignal) {
          endpoint.signalSockets[side] = {
            state: 'Implemented',
            expectedType: currentSocket.expectedType ?? routeSuggestedType ?? attachedSignal.signalType,
          }
        } else if (currentSocket.state === 'Off') {
          endpoint.signalSockets[side] = {
            state: 'Off',
            expectedType: currentSocket.expectedType ?? routeSuggestedType,
          }
        } else {
          endpoint.signalSockets[side] = {
            state: 'Suggested',
            expectedType: currentSocket.expectedType ?? routeSuggestedType,
          }
        }
      }
    }
  }

  const validSectionSocketKeys = new Set<string>()
  for (const section of map.sections) {
    for (const endpointKey of ['endpoint1', 'endpoint2'] as const) {
      for (const side of ['Left', 'Right'] as const) {
        validSectionSocketKeys.add(`${section.id}:${endpointKey}:${side}`)
      }
    }
  }

  for (const signal of map.signals) {
    for (const socketKey of ['socketA', 'socketB'] as const) {
      const socket = signal[socketKey]
      if (!socket) {
        continue
      }

      const key = `${socket.sectionId}:${socket.endpointKey}:${socket.side}`
      if (!validSectionSocketKeys.has(key)) {
        signal[socketKey] = null
        fixes.push(`Removed invalid ${socketKey} reference from signal ${signal.signalNumber}.`)
      }
    }
  }

  for (const station of map.stations) {
    station.sectionInNumber = null
    station.sectionOutNumber = null
  }

  for (const section of map.sections) {
    const endpointLinks = [section.endpoint1.stationConnection, section.endpoint2.stationConnection]
    for (const link of endpointLinks) {
      if (!link) {
        continue
      }

      const station = stationById.get(link.stationId)
      if (!station) {
        continue
      }

      if (link.side === 'Left' && station.sectionInNumber === null) {
        station.sectionInNumber = section.sectionNumber
      }

      if (link.side === 'Right' && station.sectionOutNumber === null) {
        station.sectionOutNumber = section.sectionNumber
      }
    }
  }

  const validJunctionIds = getJunctionIds(map)
  const dedupedById = new Map<string, MapDocument['settings']['junctionNumberOverrides'][number]>()
  for (const item of map.settings.junctionNumberOverrides) {
    dedupedById.set(item.junctionId, item)
  }

  const beforeCount = map.settings.junctionNumberOverrides.length
  map.settings.junctionNumberOverrides = Array.from(dedupedById.values()).filter((item) => {
    const hasAnyNumber =
      item.junctionNumber !== undefined || item.mergeNumber !== undefined || item.splitNumber !== undefined || item.displayName.trim() !== ''
    return hasAnyNumber && validJunctionIds.has(item.junctionId)
  })

  if (map.settings.junctionNumberOverrides.length !== beforeCount) {
    fixes.push('Pruned stale/duplicate junction number overrides.')
  }

  for (const signal of map.signals) {
    const validSectionNumbers = new Set(map.sections.map((section) => section.sectionNumber))
    const filtered = signal.sectionConnections.filter((sectionNumber) => validSectionNumbers.has(sectionNumber))
    if (filtered.length !== signal.sectionConnections.length) {
      signal.sectionConnections = filtered
      fixes.push(`Pruned invalid sectionConnections from signal ${signal.signalNumber}.`)
    }
  }

  return { fixes }
}
