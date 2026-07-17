import type { MapDocument, RailwaySection } from './mapSchema'

export type GraphEdgeReason = 'reference' | 'coordinate'

export type SectionGraphEdge = {
  from: number
  to: number
  reason: GraphEdgeReason
}

export type SectionConnectivityGraph = {
  sectionNumbers: number[]
  adjacency: Record<number, number[]>
  directedAdjacency: Record<number, number[]>
  edges: SectionGraphEdge[]
  directedEdges: SectionGraphEdge[]
}

type EndpointKey = 'endpoint1' | 'endpoint2'

type EndpointRef = {
  sectionNumber: number
  endpoint: EndpointKey
  connectedSectionNumber: number
  directionMode: RailwaySection['directionMode']
  x: number
  y: number
}

function createEmptyGraph(): SectionConnectivityGraph {
  return {
    sectionNumbers: [],
    adjacency: {},
    directedAdjacency: {},
    edges: [],
    directedEdges: [],
  }
}

function addNeighbor(adjacency: Map<number, Set<number>>, from: number, to: number): void {
  if (!adjacency.has(from)) {
    adjacency.set(from, new Set<number>())
  }

  adjacency.get(from)?.add(to)
}

function canExitAtEndpoint(endpoint: EndpointRef): boolean {
  const directionMode = endpoint.directionMode ?? 'Bidirectional'

  if (directionMode === 'Bidirectional') {
    return true
  }

  if (directionMode === 'OneWay1To2') {
    return endpoint.endpoint === 'endpoint2'
  }

  return endpoint.endpoint === 'endpoint1'
}

function canEnterAtEndpoint(endpoint: EndpointRef): boolean {
  const directionMode = endpoint.directionMode ?? 'Bidirectional'

  if (directionMode === 'Bidirectional') {
    return true
  }

  if (directionMode === 'OneWay1To2') {
    return endpoint.endpoint === 'endpoint1'
  }

  return endpoint.endpoint === 'endpoint2'
}

function connectUndirected(
  adjacency: Map<number, Set<number>>,
  edges: Map<string, SectionGraphEdge>,
  from: number,
  to: number,
  reason: GraphEdgeReason,
): void {
  if (from === to) {
    return
  }

  addNeighbor(adjacency, from, to)
  addNeighbor(adjacency, to, from)

  const min = Math.min(from, to)
  const max = Math.max(from, to)
  const key = `${min}:${max}`
  const existing = edges.get(key)
  if (!existing) {
    edges.set(key, { from: min, to: max, reason })
    return
  }

  if (existing.reason === 'reference' || reason === 'reference') {
    edges.set(key, { from: min, to: max, reason: 'reference' })
  }
}

function connectDirected(
  adjacency: Map<number, Set<number>>,
  edges: Map<string, SectionGraphEdge>,
  from: number,
  to: number,
  reason: GraphEdgeReason,
): void {
  if (from === to) {
    return
  }

  addNeighbor(adjacency, from, to)

  const key = `${from}:${to}`
  const existing = edges.get(key)
  if (!existing) {
    edges.set(key, { from, to, reason })
    return
  }

  if (existing.reason === 'reference' || reason === 'reference') {
    edges.set(key, { from, to, reason: 'reference' })
  }
}

function getEndpointRefs(section: RailwaySection): EndpointRef[] {
  return [
    {
      sectionNumber: section.sectionNumber,
      endpoint: 'endpoint1',
      connectedSectionNumber: section.endpoint1.sectionNumber,
      directionMode: section.directionMode,
      x: section.endpoint1.coordinate.x,
      y: section.endpoint1.coordinate.y,
    },
    {
      sectionNumber: section.sectionNumber,
      endpoint: 'endpoint2',
      connectedSectionNumber: section.endpoint2.sectionNumber,
      directionMode: section.directionMode,
      x: section.endpoint2.coordinate.x,
      y: section.endpoint2.coordinate.y,
    },
  ]
}

export function buildSectionConnectivityGraph(
  map: Pick<MapDocument, 'sections'>,
): SectionConnectivityGraph {
  if (!map.sections || map.sections.length === 0) {
    return createEmptyGraph()
  }

  const sectionNumbers = Array.from(new Set(map.sections.map((item) => item.sectionNumber))).sort(
    (a, b) => a - b,
  )

  const sectionSet = new Set(sectionNumbers)
  const adjacency = new Map<number, Set<number>>()
  const directedAdjacency = new Map<number, Set<number>>()
  const edges = new Map<string, SectionGraphEdge>()
  const directedEdges = new Map<string, SectionGraphEdge>()

  for (const sectionNumber of sectionNumbers) {
    adjacency.set(sectionNumber, new Set<number>())
    directedAdjacency.set(sectionNumber, new Set<number>())
  }

  const endpointRefs = map.sections.flatMap(getEndpointRefs)
  const endpointsBySectionNumber = new Map<number, EndpointRef[]>()
  for (const endpoint of endpointRefs) {
    const current = endpointsBySectionNumber.get(endpoint.sectionNumber) ?? []
    current.push(endpoint)
    endpointsBySectionNumber.set(endpoint.sectionNumber, current)
  }

  for (const endpoint of endpointRefs) {
    if (!sectionSet.has(endpoint.connectedSectionNumber)) {
      continue
    }

    connectUndirected(adjacency, edges, endpoint.sectionNumber, endpoint.connectedSectionNumber, 'reference')

    if (!canExitAtEndpoint(endpoint)) {
      continue
    }

    const targetEndpoints = endpointsBySectionNumber.get(endpoint.connectedSectionNumber) ?? []
    for (const targetEndpoint of targetEndpoints) {
      if (!canEnterAtEndpoint(targetEndpoint)) {
        continue
      }

      connectDirected(
        directedAdjacency,
        directedEdges,
        endpoint.sectionNumber,
        targetEndpoint.sectionNumber,
        'reference',
      )
    }
  }

  const groupedByCoordinate = new Map<string, EndpointRef[]>()
  for (const endpoint of endpointRefs) {
    const key = `${Math.round(endpoint.x)}:${Math.round(endpoint.y)}`
    if (!groupedByCoordinate.has(key)) {
      groupedByCoordinate.set(key, [])
    }

    groupedByCoordinate.get(key)?.push(endpoint)
  }

  for (const endpointsAtCoordinate of groupedByCoordinate.values()) {
    const numbers = Array.from(new Set(endpointsAtCoordinate.map((item) => item.sectionNumber)))
    if (numbers.length < 2 || endpointsAtCoordinate.length < 2) {
      continue
    }

    for (let i = 0; i < numbers.length - 1; i += 1) {
      for (let j = i + 1; j < numbers.length; j += 1) {
        connectUndirected(adjacency, edges, numbers[i], numbers[j], 'coordinate')
      }
    }

    for (let i = 0; i < endpointsAtCoordinate.length; i += 1) {
      for (let j = 0; j < endpointsAtCoordinate.length; j += 1) {
        if (i === j) {
          continue
        }

        const from = endpointsAtCoordinate[i]
        const to = endpointsAtCoordinate[j]
        if (from.sectionNumber === to.sectionNumber) {
          continue
        }

        if (!canExitAtEndpoint(from) || !canEnterAtEndpoint(to)) {
          continue
        }

        connectDirected(directedAdjacency, directedEdges, from.sectionNumber, to.sectionNumber, 'coordinate')
      }
    }
  }

  const adjacencyRecord: Record<number, number[]> = {}
  const directedAdjacencyRecord: Record<number, number[]> = {}
  for (const sectionNumber of sectionNumbers) {
    adjacencyRecord[sectionNumber] = Array.from(adjacency.get(sectionNumber) ?? []).sort(
      (a, b) => a - b,
    )
    directedAdjacencyRecord[sectionNumber] = Array.from(directedAdjacency.get(sectionNumber) ?? []).sort(
      (a, b) => a - b,
    )
  }

  return {
    sectionNumbers,
    adjacency: adjacencyRecord,
    directedAdjacency: directedAdjacencyRecord,
    edges: Array.from(edges.values()).sort((a, b) => {
      if (a.from !== b.from) {
        return a.from - b.from
      }

      if (a.to !== b.to) {
        return a.to - b.to
      }

      return a.reason.localeCompare(b.reason)
    }),
    directedEdges: Array.from(directedEdges.values()).sort((a, b) => {
      if (a.from !== b.from) {
        return a.from - b.from
      }

      if (a.to !== b.to) {
        return a.to - b.to
      }

      return a.reason.localeCompare(b.reason)
    }),
  }
}

export function getConnectedSectionNumbers(
  graph: SectionConnectivityGraph,
  sectionNumber: number,
): number[] {
  return graph.adjacency[sectionNumber] ?? []
}

export function getReachableSectionNumbers(
  graph: SectionConnectivityGraph,
  startSectionNumber: number,
): number[] {
  if (!graph.sectionNumbers.includes(startSectionNumber)) {
    return []
  }

  const visited = new Set<number>([startSectionNumber])
  const queue: number[] = [startSectionNumber]

  while (queue.length > 0) {
    const current = queue.shift() as number
    const neighbors = graph.directedAdjacency[current] ?? []
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue
      }

      visited.add(neighbor)
      queue.push(neighbor)
    }
  }

  return Array.from(visited).sort((a, b) => a - b)
}

export function findSectionPath(
  graph: SectionConnectivityGraph,
  fromSectionNumber: number,
  toSectionNumber: number,
): number[] | null {
  if (!graph.sectionNumbers.includes(fromSectionNumber)) {
    return null
  }

  if (!graph.sectionNumbers.includes(toSectionNumber)) {
    return null
  }

  if (fromSectionNumber === toSectionNumber) {
    return [fromSectionNumber]
  }

  const visited = new Set<number>([fromSectionNumber])
  const queue: number[] = [fromSectionNumber]
  const previous = new Map<number, number>()

  while (queue.length > 0) {
    const current = queue.shift() as number
    for (const neighbor of graph.directedAdjacency[current] ?? []) {
      if (visited.has(neighbor)) {
        continue
      }

      visited.add(neighbor)
      previous.set(neighbor, current)
      if (neighbor === toSectionNumber) {
        const path: number[] = [toSectionNumber]
        let cursor = toSectionNumber
        while (previous.has(cursor)) {
          cursor = previous.get(cursor) as number
          path.push(cursor)
        }

        return path.reverse()
      }

      queue.push(neighbor)
    }
  }

  return null
}

export function areSectionsConnected(
  graph: SectionConnectivityGraph,
  fromSectionNumber: number,
  toSectionNumber: number,
): boolean {
  return findSectionPath(graph, fromSectionNumber, toSectionNumber) !== null
}