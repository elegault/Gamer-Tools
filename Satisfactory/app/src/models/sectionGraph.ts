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
  edges: SectionGraphEdge[]
}

type EndpointKey = 'endpoint1' | 'endpoint2'

type EndpointRef = {
  sectionNumber: number
  endpoint: EndpointKey
  connectedSectionNumber: number
  x: number
  y: number
}

function createEmptyGraph(): SectionConnectivityGraph {
  return {
    sectionNumbers: [],
    adjacency: {},
    edges: [],
  }
}

function addNeighbor(adjacency: Map<number, Set<number>>, from: number, to: number): void {
  if (!adjacency.has(from)) {
    adjacency.set(from, new Set<number>())
  }

  adjacency.get(from)?.add(to)
}

function connect(
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

function getEndpointRefs(section: RailwaySection): EndpointRef[] {
  return [
    {
      sectionNumber: section.sectionNumber,
      endpoint: 'endpoint1',
      connectedSectionNumber: section.endpoint1.sectionNumber,
      x: section.endpoint1.coordinate.x,
      y: section.endpoint1.coordinate.y,
    },
    {
      sectionNumber: section.sectionNumber,
      endpoint: 'endpoint2',
      connectedSectionNumber: section.endpoint2.sectionNumber,
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
  const edges = new Map<string, SectionGraphEdge>()

  for (const sectionNumber of sectionNumbers) {
    adjacency.set(sectionNumber, new Set<number>())
  }

  const endpointRefs = map.sections.flatMap(getEndpointRefs)

  for (const endpoint of endpointRefs) {
    if (!sectionSet.has(endpoint.connectedSectionNumber)) {
      continue
    }

    connect(adjacency, edges, endpoint.sectionNumber, endpoint.connectedSectionNumber, 'reference')
  }

  const groupedByCoordinate = new Map<string, Set<number>>()
  for (const endpoint of endpointRefs) {
    const key = `${endpoint.x}:${endpoint.y}`
    if (!groupedByCoordinate.has(key)) {
      groupedByCoordinate.set(key, new Set<number>())
    }

    groupedByCoordinate.get(key)?.add(endpoint.sectionNumber)
  }

  for (const sectionNumbersAtCoordinate of groupedByCoordinate.values()) {
    const numbers = Array.from(sectionNumbersAtCoordinate)
    if (numbers.length < 2) {
      continue
    }

    for (let i = 0; i < numbers.length - 1; i += 1) {
      for (let j = i + 1; j < numbers.length; j += 1) {
        connect(adjacency, edges, numbers[i], numbers[j], 'coordinate')
      }
    }
  }

  const adjacencyRecord: Record<number, number[]> = {}
  for (const sectionNumber of sectionNumbers) {
    adjacencyRecord[sectionNumber] = Array.from(adjacency.get(sectionNumber) ?? []).sort(
      (a, b) => a - b,
    )
  }

  return {
    sectionNumbers,
    adjacency: adjacencyRecord,
    edges: Array.from(edges.values()).sort((a, b) => {
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
    const neighbors = getConnectedSectionNumbers(graph, current)
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
    for (const neighbor of getConnectedSectionNumbers(graph, current)) {
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