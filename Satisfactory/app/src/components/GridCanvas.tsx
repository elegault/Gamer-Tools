import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import type { MapDocument } from '../models/mapSchema'
import { buildConnectionReview, buildJunctionMetadata } from '../models/connectionReview'
import { HistoryToolbar } from './HistoryToolbar'
import { useEditorStore } from '../store/editorStore'

type Size = {
  width: number
  height: number
}

function useContainerSize(): [RefObject<HTMLDivElement | null>, Size] {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 960, height: 640 })

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(320, Math.floor(entry.contentRect.height)),
      })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [containerRef, size]
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

type DragTarget =
  | { kind: 'section'; id: string }
  | { kind: 'section-endpoint'; id: string; endpointKey: SectionEndpointKey }
  | { kind: 'station'; id: string }
  | { kind: 'intersection'; id: string }
  | { kind: 'signal'; id: string }
  | { kind: 'junction'; id: string; endpointRefs: Array<{ sectionId: string; endpointKey: SectionEndpointKey }> }
  | null

type CoordinateLabel = {
  key: string
  x: number
  y: number
  text: string
}
function getCurveBendLimits(section: MapDocument['sections'][number], chordLength: number): { min: number; max: number } {
  const min = Math.max(0, Math.round(section.curveBendMin))
  const fallbackMax = Math.round(chordLength * 0.85)
  const max = Math.max(min, Math.min(1000, Math.round(section.curveBendMax ?? fallbackMax)))
  return { min, max }
}

function renderCoordinateLabel(text: string): JSX.Element {
  return (
    <Group listening={false}>
      <Rect x={-34} y={-12} width={68} height={24} cornerRadius={6} fill="#09111d" stroke="#67e8f9" strokeWidth={1} />
      <Text x={-30} y={-6} width={60} height={12} align="center" text={text} fontSize={8} fill="#e2f3ff" />
    </Group>
  )
}

function getStationOutboundArrow(station: MapDocument['stations'][number]): string {
  const dx = station.outbound.x - station.inbound.x
  const dy = station.outbound.y - station.inbound.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? '->' : '<-'
  }

  return dy >= 0 ? 'v' : '^'
}

type ResolvedStationLayout =
  | 'HorizontalMetaRight'
  | 'HorizontalMetaLeft'
  | 'VerticalMetaTop'
  | 'VerticalMetaBottom'

type StationDisplayMetrics = {
  layoutDirection: ResolvedStationLayout
  isVerticalLayout: boolean
  stationMetaOnStart: boolean
  stationWidth: number
  stationHeight: number
  stationLeftX: number
  stationTopY: number
  stationMetaPanelWidth: number
  stationMetaPanelHeight: number
  stationMetaPanelX: number
  stationMetaPanelY: number
  freightPanelWidth: number
  freightPanelHeight: number
  freightPanelX: number
  freightPanelY: number
}

function resolveStationLayoutDirection(
  station: MapDocument['stations'][number],
): ResolvedStationLayout {
  if (station.layoutDirection === 'Default') {
    return 'HorizontalMetaRight'
  }

  if (station.layoutDirection === 'Reversed') {
    return 'HorizontalMetaLeft'
  }

  return station.layoutDirection
}

function getStationDisplayMetrics(
  station: MapDocument['stations'][number],
): StationDisplayMetrics {
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
  const stationMetaOnStart =
    layoutDirection === 'HorizontalMetaLeft' || layoutDirection === 'VerticalMetaTop'
  const stationInnerWidth = isVerticalLayout
    ? Math.max(freightPanelWidth, stationMetaPanelWidth)
    : freightPanelWidth + panelGap + stationMetaPanelWidth
  const stationInnerHeight = isVerticalLayout
    ? stationMetaPanelHeight + panelGap + freightPanelHeight
    : Math.max(stationMetaPanelHeight, freightPanelHeight)
  const stationWidth = stationInnerWidth + panelInset * 2
  const stationHeight = stationInnerHeight + panelInset * 2
  const stationLeftX = -stationWidth / 2
  const stationTopY = -stationHeight / 2
  const stationMetaPanelX = isVerticalLayout
    ? stationLeftX + panelInset + (stationInnerWidth - stationMetaPanelWidth) / 2
    : stationLeftX + panelInset + (stationMetaOnStart ? 0 : freightPanelWidth + panelGap)
  const stationMetaPanelY = isVerticalLayout
    ? stationTopY + panelInset + (stationMetaOnStart ? 0 : freightPanelHeight + panelGap)
    : stationTopY + panelInset + (stationInnerHeight - stationMetaPanelHeight) / 2
  const freightPanelX = isVerticalLayout
    ? stationLeftX + panelInset + (stationInnerWidth - freightPanelWidth) / 2
    : stationLeftX + panelInset + (stationMetaOnStart ? stationMetaPanelWidth + panelGap : 0)
  const freightPanelY = isVerticalLayout
    ? stationTopY + panelInset + (stationMetaOnStart ? stationMetaPanelHeight + panelGap : 0)
    : stationTopY + panelInset + (stationInnerHeight - freightPanelHeight) / 2

  return {
    layoutDirection,
    isVerticalLayout,
    stationMetaOnStart,
    stationWidth,
    stationHeight,
    stationLeftX,
    stationTopY,
    stationMetaPanelWidth,
    stationMetaPanelHeight,
    stationMetaPanelX,
    stationMetaPanelY,
    freightPanelWidth,
    freightPanelHeight,
    freightPanelX,
    freightPanelY,
  }
}

function getStationConnectionPoint(
  station: MapDocument['stations'][number],
  side: 'Left' | 'Right',
): { x: number; y: number } {
  const anchorX = (station.inbound.x + station.outbound.x) / 2
  const anchorY = (station.inbound.y + station.outbound.y) / 2
  const { layoutDirection, stationWidth, stationHeight } = getStationDisplayMetrics(station)

  if (layoutDirection === 'VerticalMetaTop') {
    return {
      x: anchorX,
      y: side === 'Left' ? anchorY + stationHeight / 2 : anchorY - stationHeight / 2,
    }
  }

  if (layoutDirection === 'VerticalMetaBottom') {
    return {
      x: anchorX,
      y: side === 'Left' ? anchorY - stationHeight / 2 : anchorY + stationHeight / 2,
    }
  }

  const reverseLayout = layoutDirection === 'HorizontalMetaLeft'
  const effectiveSide = reverseLayout ? (side === 'Left' ? 'Right' : 'Left') : side
  return {
    x: effectiveSide === 'Left' ? anchorX - stationWidth / 2 : anchorX + stationWidth / 2,
    y: anchorY,
  }
}

function getIntersectionConnectionPoints(
  intersection: MapDocument['intersections'][number],
): Array<{ side: 'Top' | 'Right' | 'Bottom' | 'Left'; x: number; y: number }> {
  const arm = Math.max(40, intersection.armLength)
  return [
    { side: 'Top', x: intersection.center.x, y: intersection.center.y - arm },
    { side: 'Right', x: intersection.center.x + arm, y: intersection.center.y },
    { side: 'Bottom', x: intersection.center.x, y: intersection.center.y + arm },
    { side: 'Left', x: intersection.center.x - arm, y: intersection.center.y },
  ]
}

type SectionEndpointKey = 'endpoint1' | 'endpoint2'
type SectionEndpointSide = 'Left' | 'Right'
type SignalSocketRef = NonNullable<MapDocument['signals'][number]['socketA']>

type EndpointSnapCandidate =
  | { kind: 'station'; stationId: string; side: 'Left' | 'Right'; x: number; y: number }
  | {
      kind: 'section-endpoint'
      sectionId: string
      endpointKey: SectionEndpointKey
      x: number
      y: number
    }

function getSectionEndpointCoordinate(
  section: MapDocument['sections'][number],
  endpointKey: SectionEndpointKey,
): { x: number; y: number } {
  return endpointKey === 'endpoint1' ? section.endpoint1.coordinate : section.endpoint2.coordinate
}

function getOtherEndpointKey(endpointKey: SectionEndpointKey): SectionEndpointKey {
  return endpointKey === 'endpoint1' ? 'endpoint2' : 'endpoint1'
}

function getSectionSignalSocketPoint(
  section: MapDocument['sections'][number],
  endpointKey: SectionEndpointKey,
  side: SectionEndpointSide,
): { x: number; y: number } {
  const endpoint = getSectionEndpointCoordinate(section, endpointKey)
  const opposite = getSectionEndpointCoordinate(section, getOtherEndpointKey(endpointKey))
  const dx = opposite.x - endpoint.x
  const dy = opposite.y - endpoint.y
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy))
  const tangentX = dx / length
  const tangentY = dy / length
  const normalX = -tangentY
  const normalY = tangentX
  const sideSign = side === 'Left' ? -1 : 1
  const longitudinalOffset = 14
  const lateralPadding = 10
  const lateralJitter = ((section.sectionNumber % 3) - 1) * 2
  const lateralOffset = lateralPadding + lateralJitter

  return {
    x: endpoint.x + tangentX * longitudinalOffset + normalX * sideSign * lateralOffset,
    y: endpoint.y + tangentY * longitudinalOffset + normalY * sideSign * lateralOffset,
  }
}

function signalSocketRefKey(ref: SignalSocketRef): string {
  return `${ref.sectionId}:${ref.endpointKey}:${ref.side}`
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function getSectionDirectionDescriptor(section: MapDocument['sections'][number]): {
  symbol: string
  color: string
} {
  const mode = section.directionMode ?? 'Bidirectional'
  const endpoint1Allowed = section.endpoint1.entranceMode === 'Allowed'
  const endpoint2Allowed = section.endpoint2.entranceMode === 'Allowed'

  const modeConsistent =
    (mode === 'Bidirectional' && endpoint1Allowed && endpoint2Allowed) ||
    (mode === 'OneWay1To2' && endpoint1Allowed && !endpoint2Allowed) ||
    (mode === 'OneWay2To1' && !endpoint1Allowed && endpoint2Allowed)

  if (!modeConsistent) {
    return {
      symbol: '?',
      color: '#ef4444',
    }
  }

  if (mode === 'OneWay1To2') {
    return {
      symbol: '1->2',
      color: '#f59e0b',
    }
  }

  if (mode === 'OneWay2To1') {
    return {
      symbol: '2->1',
      color: '#f59e0b',
    }
  }

  return {
    symbol: '<->',
    color: '#22c55e',
  }
}

function getSectionDirectionArrowMarkers(section: MapDocument['sections'][number]): Array<{ x: number; y: number; angle: number; color: string }> {
  const p0 = section.endpoint1.coordinate
  const p2 = section.endpoint2.coordinate
  const mode = section.directionMode ?? 'Bidirectional'

  const chordX = p2.x - p0.x
  const chordY = p2.y - p0.y
  const chordLength = Math.max(1, Math.sqrt(chordX * chordX + chordY * chordY))
  const normalX = -chordY / chordLength
  const normalY = chordX / chordLength
  const midpoint = {
    x: (p0.x + p2.x) / 2,
    y: (p0.y + p2.y) / 2,
  }
  const control = {
    x: midpoint.x + normalX * section.curveBend,
    y: midpoint.y + normalY * section.curveBend,
  }
  const isCurved = section.sectionKind === 'Curved'

  const sample = (t: number): { x: number; y: number; tangentX: number; tangentY: number } => {
    if (!isCurved) {
      return {
        x: p0.x + (p2.x - p0.x) * t,
        y: p0.y + (p2.y - p0.y) * t,
        tangentX: p2.x - p0.x,
        tangentY: p2.y - p0.y,
      }
    }

    const oneMinusT = 1 - t
    return {
      x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * control.x + t * t * p2.x,
      y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * control.y + t * t * p2.y,
      tangentX: 2 * oneMinusT * (control.x - p0.x) + 2 * t * (p2.x - control.x),
      tangentY: 2 * oneMinusT * (control.y - p0.y) + 2 * t * (p2.y - control.y),
    }
  }

  const quarterPoints = [0.25, 0.75]
  const markers: Array<{ x: number; y: number; angle: number; color: string }> = []

  for (const t of quarterPoints) {
    const sampled = sample(t)
    const tangentLength = Math.max(1, Math.sqrt(sampled.tangentX * sampled.tangentX + sampled.tangentY * sampled.tangentY))
    const tangentX = sampled.tangentX / tangentLength
    const tangentY = sampled.tangentY / tangentLength
    const tangentNormalX = -tangentY
    const tangentNormalY = tangentX

    if (mode === 'Bidirectional') {
      const offset = 4
      markers.push({
        x: sampled.x + tangentNormalX * offset,
        y: sampled.y + tangentNormalY * offset,
        angle: Math.atan2(tangentY, tangentX),
        color: '#22c55e',
      })
      markers.push({
        x: sampled.x - tangentNormalX * offset,
        y: sampled.y - tangentNormalY * offset,
        angle: Math.atan2(-tangentY, -tangentX),
        color: '#22c55e',
      })
      continue
    }

    if (mode === 'OneWay1To2') {
      markers.push({
        x: sampled.x,
        y: sampled.y,
        angle: Math.atan2(tangentY, tangentX),
        color: '#f59e0b',
      })
      continue
    }

    markers.push({
      x: sampled.x,
      y: sampled.y,
      angle: Math.atan2(-tangentY, -tangentX),
      color: '#f59e0b',
    })
  }

  return markers
}

type NumericLabelStyle = MapDocument['settings']['labelStyles']['section']

function getLabelContainerDimensions(style: NumericLabelStyle): { width: number; height: number } {
  if (style.shape === 'Circle' || style.shape === 'Hexagon') {
    const diameter = Math.max(style.width, style.height, style.radius * 2)
    return { width: diameter, height: diameter }
  }

  return {
    width: Math.max(8, style.width),
    height: Math.max(8, style.height),
  }
}

function getRegularPolygonPoints(sides: number, radius: number, rotationRadians = -Math.PI / 2): number[] {
  const points: number[] = []
  for (let index = 0; index < sides; index += 1) {
    const angle = rotationRadians + (index * 2 * Math.PI) / sides
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }

  return points
}

function renderNumericLabel(
  style: NumericLabelStyle,
  text: string,
  isSelected: boolean,
  rotationDegrees = 0,
): JSX.Element {
  const dims = getLabelContainerDimensions(style)
  const halfWidth = dims.width / 2
  const halfHeight = dims.height / 2
  const strokeWidth = style.borderWidth + (isSelected ? 0.8 : 0)
  const textBoxHeight = style.textSize + 6

  return (
    <Group rotation={rotationDegrees} listening={false}>
      {style.shape === 'Circle' && (
        <Circle
          radius={Math.max(4, Math.max(dims.width, dims.height) / 2)}
          fill={style.backgroundColor}
          stroke={style.borderColor}
          strokeWidth={strokeWidth}
        />
      )}

      {style.shape === 'Rectangle' && (
        <Rect
          x={-halfWidth}
          y={-halfHeight}
          width={dims.width}
          height={dims.height}
          fill={style.backgroundColor}
          stroke={style.borderColor}
          strokeWidth={strokeWidth}
        />
      )}

      {style.shape === 'Diamond' && (
        <Line
          points={[0, -halfHeight, halfWidth, 0, 0, halfHeight, -halfWidth, 0]}
          closed
          fill={style.backgroundColor}
          stroke={style.borderColor}
          strokeWidth={strokeWidth}
        />
      )}

      {style.shape === 'Triangle' && (
        <Line
          points={[0, -halfHeight, halfWidth, halfHeight, -halfWidth, halfHeight]}
          closed
          fill={style.backgroundColor}
          stroke={style.borderColor}
          strokeWidth={strokeWidth}
        />
      )}

      {style.shape === 'Hexagon' && (
        <Line
          points={getRegularPolygonPoints(6, Math.max(style.radius, Math.max(dims.width, dims.height) / 2))}
          closed
          fill={style.backgroundColor}
          stroke={style.borderColor}
          strokeWidth={strokeWidth}
        />
      )}

      <Text
        x={-halfWidth}
        y={-textBoxHeight / 2 + style.textYOffset}
        width={dims.width}
        height={textBoxHeight}
        align="center"
        verticalAlign="middle"
        text={text}
        fontSize={style.textSize}
        fill={style.textColor}
      />
    </Group>
  )
}

function getContentBounds(map: MapDocument): {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
} {
  let minX = 0
  let maxX = map.settings.worldWidth
  let minY = 0
  let maxY = map.settings.worldHeight

  for (const station of map.stations) {
    minX = Math.min(minX, station.inbound.x, station.outbound.x)
    minY = Math.min(minY, station.inbound.y, station.outbound.y)
    maxX = Math.max(maxX, station.inbound.x, station.outbound.x)
    maxY = Math.max(maxY, station.inbound.y, station.outbound.y)
  }

  for (const section of map.sections) {
    minX = Math.min(minX, section.endpoint1.coordinate.x, section.endpoint2.coordinate.x)
    minY = Math.min(minY, section.endpoint1.coordinate.y, section.endpoint2.coordinate.y)
    maxX = Math.max(maxX, section.endpoint1.coordinate.x, section.endpoint2.coordinate.x)
    maxY = Math.max(maxY, section.endpoint1.coordinate.y, section.endpoint2.coordinate.y)
  }

  for (const intersection of map.intersections) {
    const arm = Math.max(40, intersection.armLength)
    minX = Math.min(minX, intersection.center.x - arm)
    minY = Math.min(minY, intersection.center.y - arm)
    maxX = Math.max(maxX, intersection.center.x + arm)
    maxY = Math.max(maxY, intersection.center.y + arm)
  }

  for (const signal of map.signals) {
    minX = Math.min(minX, signal.coordinate.x)
    minY = Math.min(minY, signal.coordinate.y)
    maxX = Math.max(maxX, signal.coordinate.x)
    maxY = Math.max(maxY, signal.coordinate.y)
  }

  const paddedMinX = minX - 80
  const paddedMaxX = maxX + 80
  const paddedMinY = minY - 80
  const paddedMaxY = maxY + 80

  return {
    minX: paddedMinX,
    maxX: paddedMaxX,
    minY: paddedMinY,
    maxY: paddedMaxY,
    width: paddedMaxX - paddedMinX,
    height: paddedMaxY - paddedMinY,
  }
}

type BoundsRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

type DockSide = 'Top' | 'Right' | 'Bottom' | 'Left'

type DockPanelSizeKey = 'workspacePanelSize' | 'stationSelectorSize'

function isVerticalDockSide(side: DockSide): boolean {
  return side === 'Left' || side === 'Right'
}

function createBoundsRect(minX: number, maxX: number, minY: number, maxY: number): BoundsRect {
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

function getPlacedEntityBounds(map: MapDocument, padding = 40): BoundsRect | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let hasEntities = false

  const includePoint = (x: number, y: number): void => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    hasEntities = true
  }

  const includeRect = (x: number, y: number, width: number, height: number): void => {
    includePoint(x, y)
    includePoint(x + width, y + height)
  }

  for (const station of map.stations) {
    const metrics = getStationDisplayMetrics(station)
    const anchorX = (station.inbound.x + station.outbound.x) / 2
    const anchorY = (station.inbound.y + station.outbound.y) / 2
    includeRect(
      anchorX + metrics.stationLeftX,
      anchorY + metrics.stationTopY,
      metrics.stationWidth,
      metrics.stationHeight,
    )
  }

  for (const section of map.sections) {
    includePoint(section.endpoint1.coordinate.x, section.endpoint1.coordinate.y)
    includePoint(section.endpoint2.coordinate.x, section.endpoint2.coordinate.y)
    if (section.sectionKind === 'Curved') {
      const midpointX = (section.endpoint1.coordinate.x + section.endpoint2.coordinate.x) / 2
      const midpointY = (section.endpoint1.coordinate.y + section.endpoint2.coordinate.y) / 2
      const chordX = section.endpoint2.coordinate.x - section.endpoint1.coordinate.x
      const chordY = section.endpoint2.coordinate.y - section.endpoint1.coordinate.y
      const chordLength = Math.max(1, Math.sqrt(chordX * chordX + chordY * chordY))
      const normalX = -chordY / chordLength
      const normalY = chordX / chordLength
      includePoint(midpointX + normalX * section.curveBend, midpointY + normalY * section.curveBend)
    }
  }

  for (const intersection of map.intersections) {
    const arm = Math.max(40, intersection.armLength)
    includeRect(intersection.center.x - arm, intersection.center.y - arm, arm * 2, arm * 2)
  }

  for (const signal of map.signals) {
    includeRect(signal.coordinate.x - 10, signal.coordinate.y - 10, 20, 20)
  }

  if (!hasEntities) {
    return null
  }

  return createBoundsRect(minX - padding, maxX + padding, minY - padding, maxY + padding)
}

function parseJunctionCoordinate(junctionId: string): { x: number; y: number } | null {
  const [xText, yText] = junctionId.split(':')
  const x = Number(xText)
  const y = Number(yText)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  return { x, y }
}

export function GridCanvas(): JSX.Element {
  const map = useEditorStore((state) => state.map)
  const zoom = useEditorStore((state) => state.zoom)
  const setZoom = useEditorStore((state) => state.setZoom)
  const activeTool = useEditorStore((state) => state.activeTool)
  const addEntityAt = useEditorStore((state) => state.addEntityAt)
  const selectEntity = useEditorStore((state) => state.selectEntity)
  const selectedEntity = useEditorStore((state) => state.selectedEntity)
  const moveStation = useEditorStore((state) => state.moveStation)
  const moveSection = useEditorStore((state) => state.moveSection)
  const moveIntersection = useEditorStore((state) => state.moveIntersection)
  const moveSignal = useEditorStore((state) => state.moveSignal)
  const updateSection = useEditorStore((state) => state.updateSection)
  const connectionsLocked = useEditorStore((state) => state.connectionsLocked)
  const beginHistoryBatch = useEditorStore((state) => state.beginHistoryBatch)
  const commitHistoryBatch = useEditorStore((state) => state.commitHistoryBatch)
  const moveJunction = useEditorStore((state) => state.moveJunction)
  const disconnectSectionEndpointStation = useEditorStore((state) => state.disconnectSectionEndpointStation)
  const connectSectionEndpointToStation = useEditorStore((state) => state.connectSectionEndpointToStation)
  const updateMapSettings = useEditorStore((state) => state.updateMapSettings)

  const [containerRef, size] = useContainerSize()
  const hasAutoFitRef = useRef(false)
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null)
  const [snapPreview, setSnapPreview] = useState<{
    endpointKey: 'endpoint1' | 'endpoint2'
    stationId: string
    side: 'Left' | 'Right'
    x: number
    y: number
  } | null>(null)
  const [hoveredStationPoint, setHoveredStationPoint] = useState<{
    stationId: string
    side: 'Left' | 'Right'
    x: number
    y: number
    occupied: boolean
  } | null>(null)
  const [cursorWorldPosition, setCursorWorldPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)
  const previousStationSideOccupancyRef = useRef<Record<string, boolean>>({})
  const [flashingStationSides, setFlashingStationSides] = useState<Record<string, boolean>>({})
  const [draggedIntersectionId, setDraggedIntersectionId] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: map.settings.editorState.viewport.panX,
    y: map.settings.editorState.viewport.panY,
  })
  const [isPanning, setIsPanning] = useState(false)
  const panStartPointerRef = useRef<{ x: number; y: number } | null>(null)
  const panStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panDidMoveRef = useRef(false)
  const isSpacePanActiveRef = useRef(false)
  const endpointDragStateRef = useRef<
    Partial<
      Record<
        SectionEndpointKey,
        {
          originX: number
          originY: number
          lastX: number
          lastY: number
          connectionKind: 'none' | 'station' | 'section'
        }
      >
    >
  >({})
  const dockPanelResizeRef = useRef<
    | {
        key: DockPanelSizeKey
        dockSide: DockSide
        startPointer: number
        startSize: number
      }
    | null
  >(null)

  const contentBounds = useMemo(() => getContentBounds(map), [map])
  const connectionReview = useMemo(() => buildConnectionReview(map), [map])
  const displayToggles = map.settings.editorState.displayToggles
  const showSectionLabels = displayToggles.showSectionLabels
  const showSignalEndpoints = displayToggles.showSignalEndpoints
  const showDirectionalIndicators = displayToggles.showDirectionalIndicators
  const showValidationIcons = displayToggles.showValidationIcons
  const workspacePanelDock = (map.settings.editorState.panels.workspacePanelDock ?? 'Top') as DockSide
  const stationSelectorDock = (map.settings.editorState.panels.stationSelectorDock ?? 'Top') as DockSide
  const workspacePanelSize = map.settings.editorState.panels.workspacePanelSize ?? 230
  const stationSelectorSize = map.settings.editorState.panels.stationSelectorSize ?? 180
  const workspacePanelVertical = isVerticalDockSide(workspacePanelDock)
  const stationSelectorVertical = isVerticalDockSide(stationSelectorDock)
  const sectionLabelStyle = map.settings.labelStyles.section
  const intersectionLabelStyle = map.settings.labelStyles.intersection
  const worldMinX = contentBounds.minX
  const worldMaxX = contentBounds.maxX
  const worldMinY = contentBounds.minY
  const worldMaxY = contentBounds.maxY
  const worldWidth = contentBounds.width
  const worldHeight = contentBounds.height
  const gridStep = 100
  const worldOffsetX = 40
  const worldOffsetY = 40
  const worldRenderOffsetX = worldOffsetX + panOffset.x - worldMinX * zoom
  const worldRenderOffsetY = worldOffsetY + panOffset.y - worldMinY * zoom
  const stageWidth = Math.max(size.width, worldWidth * zoom + worldOffsetX * 2)
  const stageHeight = Math.max(size.height, worldHeight * zoom + worldOffsetY * 2)

  const fineGridLines = useMemo(() => {
    const lines: Array<[number, number, number, number]> = []
    const startX = Math.floor(worldMinX / gridStep) * gridStep
    const endX = Math.ceil(worldMaxX / gridStep) * gridStep
    const startY = Math.floor(worldMinY / gridStep) * gridStep
    const endY = Math.ceil(worldMaxY / gridStep) * gridStep

    for (let x = startX; x <= endX; x += gridStep) {
      lines.push([x, startY, x, endY])
    }

    for (let y = startY; y <= endY; y += gridStep) {
      lines.push([startX, y, endX, y])
    }

    return lines
  }, [gridStep, worldMaxX, worldMaxY, worldMinX, worldMinY])

  const mainGridLines = useMemo(() => {
    const lines: Array<[number, number, number, number]> = []
    const startX = Math.floor(worldMinX / gridStep) * gridStep
    const endX = Math.ceil(worldMaxX / gridStep) * gridStep
    const startY = Math.floor(worldMinY / gridStep) * gridStep
    const endY = Math.ceil(worldMaxY / gridStep) * gridStep

    for (let x = startX; x <= endX; x += gridStep) {
      lines.push([x, startY, x, endY])
    }

    for (let y = startY; y <= endY; y += gridStep) {
      lines.push([startX, y, endX, y])
    }

    return lines
  }, [gridStep, worldMaxX, worldMaxY, worldMinX, worldMinY])

  const xAxisLabels = useMemo(() => {
    const labels: number[] = []
    const startX = Math.ceil(worldMinX / gridStep) * gridStep
    const endX = Math.floor(worldMaxX / gridStep) * gridStep
    for (let x = startX; x <= endX; x += gridStep) {
      labels.push(x)
    }

    return labels
  }, [gridStep, worldMaxX, worldMinX])

  const yAxisLabels = useMemo(() => {
    const labels: number[] = []
    const startY = Math.ceil(worldMinY / gridStep) * gridStep
    const endY = Math.floor(worldMaxY / gridStep) * gridStep
    for (let y = startY; y <= endY; y += gridStep) {
      labels.push(y)
    }

    return labels
  }, [gridStep, worldMaxY, worldMinY])

  const selectedSection = useMemo(() => {
    if (selectedEntity?.entityType !== 'section') {
      return null
    }

    return map.sections.find((section) => section.id === selectedEntity.id) ?? null
  }, [map.sections, selectedEntity])

  const selectedSignal = useMemo(() => {
    if (selectedEntity?.entityType !== 'signal') {
      return null
    }

    return map.signals.find((signal) => signal.id === selectedEntity.id) ?? null
  }, [map.signals, selectedEntity])

  const orderedStations = useMemo(
    () => [...map.stations].sort((a, b) => a.stationNumber - b.stationNumber),
    [map.stations],
  )

  const selectedEntityBounds = useMemo<BoundsRect | null>(() => {
    if (!selectedEntity) {
      return null
    }

    if (selectedEntity.entityType === 'station') {
      const station = map.stations.find((item) => item.id === selectedEntity.id)
      if (!station) {
        return null
      }

      const metrics = getStationDisplayMetrics(station)
      const anchorX = (station.inbound.x + station.outbound.x) / 2
      const anchorY = (station.inbound.y + station.outbound.y) / 2
      return createBoundsRect(
        anchorX + metrics.stationLeftX - 24,
        anchorX + metrics.stationLeftX + metrics.stationWidth + 24,
        anchorY + metrics.stationTopY - 24,
        anchorY + metrics.stationTopY + metrics.stationHeight + 24,
      )
    }

    if (selectedEntity.entityType === 'section') {
      const section = map.sections.find((item) => item.id === selectedEntity.id)
      if (!section) {
        return null
      }

      let minX = Math.min(section.endpoint1.coordinate.x, section.endpoint2.coordinate.x)
      let maxX = Math.max(section.endpoint1.coordinate.x, section.endpoint2.coordinate.x)
      let minY = Math.min(section.endpoint1.coordinate.y, section.endpoint2.coordinate.y)
      let maxY = Math.max(section.endpoint1.coordinate.y, section.endpoint2.coordinate.y)

      if (section.sectionKind === 'Curved') {
        const midpointX = (section.endpoint1.coordinate.x + section.endpoint2.coordinate.x) / 2
        const midpointY = (section.endpoint1.coordinate.y + section.endpoint2.coordinate.y) / 2
        const chordX = section.endpoint2.coordinate.x - section.endpoint1.coordinate.x
        const chordY = section.endpoint2.coordinate.y - section.endpoint1.coordinate.y
        const chordLength = Math.max(1, Math.sqrt(chordX * chordX + chordY * chordY))
        const normalX = -chordY / chordLength
        const normalY = chordX / chordLength
        const controlX = midpointX + normalX * section.curveBend
        const controlY = midpointY + normalY * section.curveBend
        minX = Math.min(minX, controlX)
        maxX = Math.max(maxX, controlX)
        minY = Math.min(minY, controlY)
        maxY = Math.max(maxY, controlY)
      }

      return createBoundsRect(minX - 30, maxX + 30, minY - 30, maxY + 30)
    }

    if (selectedEntity.entityType === 'intersection') {
      const intersection = map.intersections.find((item) => item.id === selectedEntity.id)
      if (!intersection) {
        return null
      }

      const arm = Math.max(40, intersection.armLength)
      return createBoundsRect(
        intersection.center.x - arm - 24,
        intersection.center.x + arm + 24,
        intersection.center.y - arm - 24,
        intersection.center.y + arm + 24,
      )
    }

    if (selectedEntity.entityType === 'signal') {
      const signal = map.signals.find((item) => item.id === selectedEntity.id)
      if (!signal) {
        return null
      }

      return createBoundsRect(
        signal.coordinate.x - 24,
        signal.coordinate.x + 24,
        signal.coordinate.y - 24,
        signal.coordinate.y + 24,
      )
    }

    const junction = parseJunctionCoordinate(selectedEntity.id)
    if (!junction) {
      return null
    }

    return createBoundsRect(junction.x - 28, junction.x + 28, junction.y - 28, junction.y + 28)
  }, [map.intersections, map.sections, map.signals, map.stations, selectedEntity])

  const sectionEndpointGroups = useMemo(() => {
    const grouped: Record<string, Array<{ sectionId: string; endpointKey: SectionEndpointKey; entranceMode: 'Allowed' | 'Blocked' }>> = {}

    for (const section of map.sections) {
      const endpoints: Array<{ key: SectionEndpointKey; x: number; y: number; entranceMode: 'Allowed' | 'Blocked' }> = [
        {
          key: 'endpoint1',
          x: section.endpoint1.coordinate.x,
          y: section.endpoint1.coordinate.y,
          entranceMode: section.endpoint1.entranceMode,
        },
        {
          key: 'endpoint2',
          x: section.endpoint2.coordinate.x,
          y: section.endpoint2.coordinate.y,
          entranceMode: section.endpoint2.entranceMode,
        },
      ]

      for (const endpoint of endpoints) {
        const pointKey = `${Math.round(endpoint.x)}:${Math.round(endpoint.y)}`
        if (!grouped[pointKey]) {
          grouped[pointKey] = []
        }

        grouped[pointKey].push({
          sectionId: section.id,
          endpointKey: endpoint.key,
          entranceMode: endpoint.entranceMode,
        })
      }
    }

    return grouped
  }, [map.sections])

  const signalSocketPoints = useMemo(() => {
    const sockets: Array<{
      ref: SignalSocketRef
      key: string
      x: number
      y: number
      sectionNumber: number
      endpointKey: SectionEndpointKey
      side: SectionEndpointSide
      signalType: 'Block' | 'Path' | null
    }> = []

    for (const section of map.sections) {
      const endpointKeys: SectionEndpointKey[] = ['endpoint1', 'endpoint2']
      const sides: SectionEndpointSide[] = ['Left', 'Right']

      for (const endpointKey of endpointKeys) {
        const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2
        for (const side of sides) {
          const ref: SignalSocketRef = { sectionId: section.id, endpointKey, side }
          const point = getSectionSignalSocketPoint(section, endpointKey, side)
          sockets.push({
            ref,
            key: signalSocketRefKey(ref),
            x: point.x,
            y: point.y,
            sectionNumber: section.sectionNumber,
            endpointKey,
            side,
            signalType: side === 'Left' ? endpoint.signal1 : endpoint.signal2,
          })
        }
      }
    }

    return sockets
  }, [map.sections])

  const signalSocketLookup = useMemo(() => {
    const lookup: Record<string, { x: number; y: number; sectionNumber: number }> = {}
    for (const socket of signalSocketPoints) {
      lookup[socket.key] = {
        x: socket.x,
        y: socket.y,
        sectionNumber: socket.sectionNumber,
      }
    }
    return lookup
  }, [signalSocketPoints])

  const repositionCoordinateLabels = useMemo<CoordinateLabel[]>(() => {
    if (!dragTarget) {
      return []
    }

    const labels: CoordinateLabel[] = []
    const seen = new Set<string>()

    const pushLabel = (key: string, x: number, y: number): void => {
      if (seen.has(key)) {
        return
      }

      seen.add(key)
      labels.push({
        key,
        x,
        y,
        text: `${Math.round(x)}, ${Math.round(y)}`,
      })
    }

    const addClusterLabels = (coordinate: { x: number; y: number }): void => {
      const clusterKey = `${Math.round(coordinate.x)}:${Math.round(coordinate.y)}`
      const entries = sectionEndpointGroups[clusterKey] ?? []
      const angleStep = entries.length > 0 ? (Math.PI * 2) / entries.length : 0

      entries.forEach((entry, index) => {
        const section = map.sections.find((item) => item.id === entry.sectionId)
        if (!section) {
          return
        }

        const endpoint = entry.endpointKey === 'endpoint1' ? section.endpoint1.coordinate : section.endpoint2.coordinate
        const angle = index * angleStep
        const offset = 22
        pushLabel(
          `${entry.sectionId}:${entry.endpointKey}`,
          endpoint.x + Math.cos(angle) * offset,
          endpoint.y + Math.sin(angle) * offset,
        )
      })
    }

    if (dragTarget.kind === 'section') {
      const section = map.sections.find((item) => item.id === dragTarget.id)
      if (section) {
        addClusterLabels(section.endpoint1.coordinate)
        addClusterLabels(section.endpoint2.coordinate)
      }
      return labels
    }

    if (dragTarget.kind === 'section-endpoint') {
      const section = map.sections.find((item) => item.id === dragTarget.id)
      if (section) {
        const endpoint = dragTarget.endpointKey === 'endpoint1' ? section.endpoint1.coordinate : section.endpoint2.coordinate
        addClusterLabels(endpoint)
      }
      return labels
    }

    if (dragTarget.kind === 'station') {
      for (const section of map.sections) {
        for (const endpointKey of ['endpoint1', 'endpoint2'] as SectionEndpointKey[]) {
          const endpoint = section[endpointKey]
          if (endpoint.stationConnection?.stationId !== dragTarget.id) {
            continue
          }

          pushLabel(
            `${section.id}:${endpointKey}`,
            endpoint.coordinate.x,
            endpoint.coordinate.y,
          )
        }
      }
      return labels
    }

    if (dragTarget.kind === 'intersection') {
      const intersection = map.intersections.find((item) => item.id === dragTarget.id)
      if (!intersection) {
        return labels
      }

      const points = getIntersectionConnectionPoints(intersection)
      for (const section of map.sections) {
        for (const endpointKey of ['endpoint1', 'endpoint2'] as SectionEndpointKey[]) {
          const endpoint = section[endpointKey]
          const matches = points.some((point) => distance(endpoint.coordinate, point) <= 16)
          if (!matches) {
            continue
          }

          pushLabel(
            `${section.id}:${endpointKey}`,
            endpoint.coordinate.x,
            endpoint.coordinate.y,
          )
        }
      }

      return labels
    }

    if (dragTarget.kind === 'junction') {
      dragTarget.endpointRefs.forEach((ref, index) => {
        const section = map.sections.find((item) => item.id === ref.sectionId)
        if (!section) {
          return
        }

        const endpoint = section[ref.endpointKey].coordinate
        const angle = dragTarget.endpointRefs.length > 0 ? index * ((Math.PI * 2) / dragTarget.endpointRefs.length) : 0
        pushLabel(
          `${ref.sectionId}:${ref.endpointKey}`,
          endpoint.x + Math.cos(angle) * 22,
          endpoint.y + Math.sin(angle) * 22,
        )
      })

      return labels
    }

    return labels
  }, [dragTarget, map.intersections, map.sections, sectionEndpointGroups])

  const isRepositioning = dragTarget !== null || Boolean(draggedIntersectionId)

  const junctionIndicators = useMemo(() => {
    const junctionMeta = buildJunctionMetadata(map)
    const indicators: Array<{
      key: string
      x: number
      y: number
      type: 'Merge' | 'Split' | 'Junction' | 'Invalid'
      name: string
      displayLabel: string
      displayNumber: number
      mergeDirectionRadians: number | null
      connectedSectionNumbers: number[]
      connectedEndpoints: Array<{ sectionId: string; endpointKey: SectionEndpointKey }>
    }> = []

    for (const junction of junctionMeta) {
      const connectedEndpoints = (sectionEndpointGroups[junction.id] ?? []).map((entry) => ({
        sectionId: entry.sectionId,
        endpointKey: entry.endpointKey,
      }))
      let mergeDirectionRadians: number | null = null
      if (junction.type === 'Merge') {
        const allowedEntry = (sectionEndpointGroups[junction.id] ?? []).find((entry) => entry.entranceMode === 'Allowed')
        if (allowedEntry) {
          const allowedSection = map.sections.find((section) => section.id === allowedEntry.sectionId)
          if (allowedSection) {
            const oppositeEndpoint = getSectionEndpointCoordinate(
              allowedSection,
              getOtherEndpointKey(allowedEntry.endpointKey),
            )
            mergeDirectionRadians = Math.atan2(oppositeEndpoint.y - junction.y, oppositeEndpoint.x - junction.x)
          }
        }
      }

      indicators.push({
        key: junction.id,
        x: junction.x,
        y: junction.y,
        type: junction.type,
        name: junction.name,
        displayLabel: junction.displayLabel,
        displayNumber: junction.displayNumber,
        mergeDirectionRadians,
        connectedSectionNumbers: junction.connectedSectionNumbers,
        connectedEndpoints,
      })
    }


    return indicators
  }, [map, sectionEndpointGroups])

  const highlightedIntersectionEndpointKeys = useMemo(() => {
    if (!draggedIntersectionId) {
      return new Set<string>()
    }

    const intersection = map.intersections.find((item) => item.id === draggedIntersectionId)
    if (!intersection) {
      return new Set<string>()
    }

    const points = getIntersectionConnectionPoints(intersection)
    const highlighted = new Set<string>()
    const tolerance = 16

    for (const section of map.sections) {
      const endpoints: Array<{ key: SectionEndpointKey; x: number; y: number }> = [
        { key: 'endpoint1', x: section.endpoint1.coordinate.x, y: section.endpoint1.coordinate.y },
        { key: 'endpoint2', x: section.endpoint2.coordinate.x, y: section.endpoint2.coordinate.y },
      ]

      for (const endpoint of endpoints) {
        const nearIntersectionPoint = points.some(
          (point) => distance({ x: endpoint.x, y: endpoint.y }, point) <= tolerance,
        )

        if (nearIntersectionPoint) {
          highlighted.add(`${section.id}:${endpoint.key}`)
        }
      }
    }

    return highlighted
  }, [draggedIntersectionId, map.intersections, map.sections])

  const stationSideOccupancy = useMemo(() => {
    const occupancy: Record<string, number | null> = {}

    for (const station of map.stations) {
      occupancy[`${station.id}:Left`] = null
      occupancy[`${station.id}:Right`] = null
    }

    for (const section of map.sections) {
      const endpoint1Connection = section.endpoint1.stationConnection
      if (endpoint1Connection) {
        occupancy[`${endpoint1Connection.stationId}:${endpoint1Connection.side}`] = section.sectionNumber
      }

      const endpoint2Connection = section.endpoint2.stationConnection
      if (endpoint2Connection) {
        occupancy[`${endpoint2Connection.stationId}:${endpoint2Connection.side}`] = section.sectionNumber
      }
    }

    return occupancy
  }, [map.sections, map.stations])

  function fitBounds(bounds: BoundsRect): void {
    const availableWidth = Math.max(320, size.width - worldOffsetX * 2)
    const availableHeight = Math.max(320, size.height - worldOffsetY * 2)
    const fitScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
    const nextZoom = Math.max(0.1, Math.min(2.5, fitScale))
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const nextPanOffset = {
      x: size.width / 2 - worldOffsetX + worldMinX * nextZoom - centerX * nextZoom,
      y: size.height / 2 - worldOffsetY + worldMinY * nextZoom - centerY * nextZoom,
    }

    setZoom(nextZoom)
    setPanOffset(nextPanOffset)
    persistPanOffset(nextPanOffset)
  }

  function persistPanOffset(nextPanOffset: { x: number; y: number }): void {
    updateMapSettings({
      editorState: {
        ...map.settings.editorState,
        viewport: {
          ...map.settings.editorState.viewport,
          panX: nextPanOffset.x,
          panY: nextPanOffset.y,
        },
      },
    })
  }

  function fitToViewport(): void {
    const componentBounds = getPlacedEntityBounds(map)
    if (!componentBounds) {
      fitBounds(contentBounds)
      return
    }

    fitBounds(componentBounds)
  }

  function fitToSelection(): void {
    if (!selectedEntityBounds) {
      return
    }

    fitBounds(selectedEntityBounds)
  }

  function centerOnStation(station: MapDocument['stations'][number]): void {
    const stationCenter = {
      x: (station.inbound.x + station.outbound.x) / 2,
      y: (station.inbound.y + station.outbound.y) / 2,
    }

    const nextPanOffset = {
      x: size.width / 2 - worldOffsetX + worldMinX * zoom - stationCenter.x * zoom,
      y: size.height / 2 - worldOffsetY + worldMinY * zoom - stationCenter.y * zoom,
    }

    setPanOffset(nextPanOffset)
    persistPanOffset(nextPanOffset)
    selectEntity({ entityType: 'station', id: station.id })
  }

  useEffect(() => {
    setPanOffset({
      x: map.settings.editorState.viewport.panX,
      y: map.settings.editorState.viewport.panY,
    })
  }, [map.settings.editorState.viewport.panX, map.settings.editorState.viewport.panY])

  useEffect(() => {
    if (hasAutoFitRef.current) {
      return
    }

    if (size.width <= 320 || size.height <= 320) {
      return
    }

    const hasSavedViewport =
      Math.abs(map.settings.editorState.viewport.panX) > 0.1 ||
      Math.abs(map.settings.editorState.viewport.panY) > 0.1 ||
      Math.abs(map.settings.editorState.viewport.zoom - 1) > 0.001

    hasAutoFitRef.current = true
    if (hasSavedViewport) {
      return
    }

    fitToViewport()
  }, [
    map.settings.editorState.viewport.panX,
    map.settings.editorState.viewport.panY,
    map.settings.editorState.viewport.zoom,
    size.height,
    size.width,
    worldHeight,
    worldWidth,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        isSpacePanActiveRef.current = true
      }
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        isSpacePanActiveRef.current = false
      }
    }

    const handleWindowBlur = (): void => {
      isSpacePanActiveRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  function updateDisplayToggle(
    key: 'showSectionLabels' | 'showSignalEndpoints' | 'showDirectionalIndicators' | 'showValidationIcons',
    value: boolean,
  ): void {
    updateMapSettings({
      editorState: {
        ...map.settings.editorState,
        displayToggles: {
          ...map.settings.editorState.displayToggles,
          [key]: value,
        },
      },
    })
  }

  function updatePanelDock(key: 'workspacePanelDock' | 'stationSelectorDock', value: DockSide): void {
    updateMapSettings({
      editorState: {
        ...map.settings.editorState,
        panels: {
          ...map.settings.editorState.panels,
          [key]: value,
        },
      },
    })
  }

  function getPanelSizeBounds(key: DockPanelSizeKey): { min: number; max: number } {
    if (key === 'workspacePanelSize') {
      return { min: 140, max: 760 }
    }

    return { min: 120, max: 760 }
  }

  function updatePanelSize(key: DockPanelSizeKey, value: number): void {
    const bounds = getPanelSizeBounds(key)
    const clampedValue = Math.max(bounds.min, Math.min(bounds.max, Math.round(value)))
    updateMapSettings({
      editorState: {
        ...map.settings.editorState,
        panels: {
          ...map.settings.editorState.panels,
          [key]: clampedValue,
        },
      },
    })
  }

  function getDockPanelStyle(side: DockSide, size: number): CSSProperties {
    if (isVerticalDockSide(side)) {
      return {
        width: `${size}px`,
      }
    }

    return {
      height: `${size}px`,
    }
  }

  function beginDockPanelResize(
    key: DockPanelSizeKey,
    dockSide: DockSide,
    event: ReactMouseEvent<HTMLDivElement>,
  ): void {
    event.preventDefault()
    event.stopPropagation()

    const startPointer = isVerticalDockSide(dockSide) ? event.clientX : event.clientY
    const startSize = key === 'workspacePanelSize' ? workspacePanelSize : stationSelectorSize

    dockPanelResizeRef.current = {
      key,
      dockSide,
      startPointer,
      startSize,
    }

    document.body.classList.add('is-resizing-panels')
    if (isVerticalDockSide(dockSide)) {
      document.body.classList.add('is-resizing-panels-horizontal')
    } else {
      document.body.classList.add('is-resizing-panels-vertical')
    }
  }

  useEffect(() => {
    function handleMouseMove(event: MouseEvent): void {
      const resizeState = dockPanelResizeRef.current
      if (!resizeState) {
        return
      }

      const pointer = isVerticalDockSide(resizeState.dockSide) ? event.clientX : event.clientY
      const delta = pointer - resizeState.startPointer
      const signedDelta =
        resizeState.dockSide === 'Right' || resizeState.dockSide === 'Bottom'
          ? -delta
          : delta

      updatePanelSize(resizeState.key, resizeState.startSize + signedDelta)
    }

    function handleMouseUp(): void {
      if (!dockPanelResizeRef.current) {
        return
      }

      dockPanelResizeRef.current = null
      document.body.classList.remove('is-resizing-panels')
      document.body.classList.remove('is-resizing-panels-horizontal')
      document.body.classList.remove('is-resizing-panels-vertical')
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.classList.remove('is-resizing-panels')
      document.body.classList.remove('is-resizing-panels-horizontal')
      document.body.classList.remove('is-resizing-panels-vertical')
    }
  }, [stationSelectorSize, workspacePanelSize, map.settings.editorState, updateMapSettings, map.settings.editorState.panels])

  function renderDockedPanel(
    panel: JSX.Element,
    sizeKey: DockPanelSizeKey,
    dockSide: DockSide,
    size: number,
    label: string,
  ): JSX.Element {
    const showLeadingHandle = dockSide === 'Right' || dockSide === 'Bottom'
    const handleClass =
      dockSide === 'Left'
        ? 'grid-docked-resizer edge-right'
        : dockSide === 'Right'
          ? 'grid-docked-resizer edge-left'
          : dockSide === 'Top'
            ? 'grid-docked-resizer edge-bottom'
            : 'grid-docked-resizer edge-top'

    const handle = (
      <div
        className={handleClass}
        role="separator"
        aria-label={`Resize ${label} panel`}
        aria-orientation={isVerticalDockSide(dockSide) ? 'vertical' : 'horizontal'}
        onMouseDown={(event) => beginDockPanelResize(sizeKey, dockSide, event)}
      />
    )

    return (
      <div className="grid-docked-panel" style={getDockPanelStyle(dockSide, size)}>
        {showLeadingHandle ? handle : null}
        {panel}
        {!showLeadingHandle ? handle : null}
      </div>
    )
  }

  useEffect(() => {
    if (!hoveredSectionId) {
      return
    }

    const stillExists = map.sections.some((section) => section.id === hoveredSectionId)
    if (!stillExists) {
      setHoveredSectionId(null)
    }
  }, [hoveredSectionId, map.sections])

  useEffect(() => {
    const currentOccupancy: Record<string, boolean> = {}

    for (const station of map.stations) {
      currentOccupancy[`${station.id}:Left`] = stationSideOccupancy[`${station.id}:Left`] !== null
      currentOccupancy[`${station.id}:Right`] = stationSideOccupancy[`${station.id}:Right`] !== null
    }

    const previousOccupancy = previousStationSideOccupancyRef.current
    const keysToFlash = Object.keys(currentOccupancy).filter(
      (key) => previousOccupancy[key] === true && currentOccupancy[key] === false,
    )

    previousStationSideOccupancyRef.current = currentOccupancy

    if (keysToFlash.length === 0) {
      return
    }

    setFlashingStationSides((current) => {
      const next = { ...current }
      for (const key of keysToFlash) {
        next[key] = true
      }
      return next
    })

    const timer = window.setTimeout(() => {
      setFlashingStationSides((current) => {
        const next = { ...current }
        for (const key of keysToFlash) {
          delete next[key]
        }
        return next
      })
    }, 420)

    return () => window.clearTimeout(timer)
  }, [map.stations, stationSideOccupancy])

  function getWorldPointer(stage: Konva.Stage): { x: number; y: number } | null {
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      return null
    }

    return {
      x: snap((pointer.x - worldRenderOffsetX) / zoom, gridStep),
      y: snap((pointer.y - worldRenderOffsetY) / zoom, gridStep),
    }
  }

  function syncCursorWorldPosition(stage: Konva.Stage | null): void {
    if (!stage) {
      return
    }

    const pointer = stage.getPointerPosition()
    if (!pointer) {
      return
    }

    setCursorWorldPosition({
      x: (pointer.x - worldRenderOffsetX) / zoom,
      y: (pointer.y - worldRenderOffsetY) / zoom,
    })
  }

  function handleCanvasClick(event: Konva.KonvaEventObject<MouseEvent>): void {
    if (isSpacePanActiveRef.current) {
      return
    }

    if (panDidMoveRef.current) {
      panDidMoveRef.current = false
      return
    }

    const stage = event.target.getStage()
    if (!stage) {
      return
    }

    const point = getWorldPointer(stage)
    if (!point) {
      return
    }

    if (activeTool === 'select') {
      selectEntity(null)
      return
    }

    addEntityAt(point)
  }

  function handleStageMouseDown(event: Konva.KonvaEventObject<MouseEvent>): void {
    const isLeftButton = event.evt.button === 0
    const isMiddleButton = event.evt.button === 1
    const isSpacePan = isLeftButton && isSpacePanActiveRef.current

    if (!isLeftButton && !isMiddleButton) {
      return
    }

    const stage = event.target.getStage()
    if (!stage) {
      return
    }

    if (isMiddleButton || isSpacePan) {
      event.evt.preventDefault()
    }

    const targetName = event.target.name() ?? ''
    const clickedPanSurface = event.target === stage || targetName.includes('pan-surface')
    const canStartPan = isMiddleButton || isSpacePan || clickedPanSurface
    if (!canStartPan) {
      return
    }

    const pointer = stage.getPointerPosition()
    if (!pointer) {
      return
    }

    panStartPointerRef.current = { x: pointer.x, y: pointer.y }
    panStartOffsetRef.current = { ...panOffset }
    panDidMoveRef.current = false
    setIsPanning(true)
  }

  function handleStageMouseMove(event: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = event.target.getStage()
    syncCursorWorldPosition(stage)

    if (!isPanning) {
      return
    }

    const start = panStartPointerRef.current
    if (!stage || !start) {
      return
    }

    const pointer = stage.getPointerPosition()
    if (!pointer) {
      return
    }

    const dx = pointer.x - start.x
    const dy = pointer.y - start.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      panDidMoveRef.current = true
    }

    setPanOffset({
      x: panStartOffsetRef.current.x + dx,
      y: panStartOffsetRef.current.y + dy,
    })
  }

  function handleStageMouseUp(): void {
    if (panDidMoveRef.current) {
      persistPanOffset(panOffset)
    }

    setIsPanning(false)
    panStartPointerRef.current = null
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>): void {
    event.evt.preventDefault()

    if (event.evt.shiftKey) {
      const container = containerRef.current
      if (!container) {
        return
      }

      container.scrollTop += event.evt.deltaY
      return
    }

    const direction = event.evt.deltaY > 0 ? -1 : 1
    const scaleBy = 1.08
    const nextZoom = Math.min(2.5, Math.max(0.1, direction > 0 ? zoom * scaleBy : zoom / scaleBy))

    setZoom(nextZoom)
  }

  function getEndpointSnapCandidate(
    sectionId: string,
    x: number,
    y: number,
  ): EndpointSnapCandidate | null {
    const section = map.sections.find((item) => item.id === sectionId)
    if (!section) {
      return null
    }

    const threshold = 30
    let best: (EndpointSnapCandidate & { d: number }) | null = null

    for (const station of map.stations) {
      const leftPoint = getStationConnectionPoint(station, 'Left')
      const rightPoint = getStationConnectionPoint(station, 'Right')
      const sides: Array<{ side: 'Left' | 'Right'; x: number; y: number; occupiedBy: number | null }> = [
        { side: 'Left', x: leftPoint.x, y: leftPoint.y, occupiedBy: stationSideOccupancy[`${station.id}:Left`] ?? null },
        { side: 'Right', x: rightPoint.x, y: rightPoint.y, occupiedBy: stationSideOccupancy[`${station.id}:Right`] ?? null },
      ]

      for (const side of sides) {
        if (side.occupiedBy !== null && side.occupiedBy !== section.sectionNumber) {
          continue
        }

        const d = distance({ x, y }, { x: side.x, y: side.y })
        if (d > threshold) {
          continue
        }

        if (!best || d < best.d) {
          best = {
            kind: 'station',
            stationId: station.id,
            side: side.side,
            x: side.x,
            y: side.y,
            d,
          }
        }
      }
    }

    for (const candidateSection of map.sections) {
      if (candidateSection.id === sectionId) {
        continue
      }

      const endpoints: Array<{ endpointKey: SectionEndpointKey; x: number; y: number }> = [
        {
          endpointKey: 'endpoint1',
          x: candidateSection.endpoint1.coordinate.x,
          y: candidateSection.endpoint1.coordinate.y,
        },
        {
          endpointKey: 'endpoint2',
          x: candidateSection.endpoint2.coordinate.x,
          y: candidateSection.endpoint2.coordinate.y,
        },
      ]

      for (const candidateEndpoint of endpoints) {
        const d = distance({ x, y }, { x: candidateEndpoint.x, y: candidateEndpoint.y })
        if (d > threshold) {
          continue
        }

        if (!best || d < best.d) {
          best = {
            kind: 'section-endpoint',
            sectionId: candidateSection.id,
            endpointKey: candidateEndpoint.endpointKey,
            x: candidateEndpoint.x,
            y: candidateEndpoint.y,
            d,
          }
        }
      }
    }

    for (const intersection of map.intersections) {
      const points = getIntersectionConnectionPoints(intersection)
      for (const point of points) {
        const d = distance({ x, y }, { x: point.x, y: point.y })
        if (d > threshold) {
          continue
        }

        if (!best || d < best.d) {
          best = {
            kind: 'section-endpoint',
            sectionId: intersection.id,
            endpointKey: 'endpoint1',
            x: point.x,
            y: point.y,
            d,
          }
        }
      }
    }

    if (!best) {
      return null
    }

    const { d: _distance, ...candidate } = best
    return candidate
  }

  function findSignalSocketCandidate(
    x: number,
    y: number,
    excludeKey?: string,
  ): { ref: SignalSocketRef; key: string; x: number; y: number; sectionNumber: number } | null {
    const threshold = 24
    let best: { ref: SignalSocketRef; key: string; x: number; y: number; sectionNumber: number; d: number } | null = null

    for (const socket of signalSocketPoints) {
      if (excludeKey && socket.key === excludeKey) {
        continue
      }

      const d = distance({ x, y }, { x: socket.x, y: socket.y })
      if (d > threshold) {
        continue
      }

      if (!best || d < best.d) {
        best = { ...socket, d }
      }
    }

    if (!best) {
      return null
    }

    const { d: _distance, ...candidate } = best
    return candidate
  }

  function getSignalDisplayPoint(signal: MapDocument['signals'][number]): { x: number; y: number } {
    if (!signal.socketA || !signal.socketB) {
      return signal.coordinate
    }

    const socketA = signalSocketLookup[signalSocketRefKey(signal.socketA)]
    const socketB = signalSocketLookup[signalSocketRefKey(signal.socketB)]
    if (!socketA || !socketB) {
      return signal.coordinate
    }

    return {
      x: (socketA.x + socketB.x) / 2,
      y: (socketA.y + socketB.y) / 2,
    }
  }

  function updateSignalSocket(
    signal: MapDocument['signals'][number],
    socketKey: 'socketA' | 'socketB',
    ref: SignalSocketRef | null,
  ): void {
    const nextSocketA = socketKey === 'socketA' ? ref : signal.socketA
    const nextSocketB = socketKey === 'socketB' ? ref : signal.socketB
    const connectedSectionNumbers = new Set<number>()

    if (nextSocketA) {
      const resolvedA = signalSocketLookup[signalSocketRefKey(nextSocketA)]
      if (resolvedA) {
        connectedSectionNumbers.add(resolvedA.sectionNumber)
      }
    }

    if (nextSocketB) {
      const resolvedB = signalSocketLookup[signalSocketRefKey(nextSocketB)]
      if (resolvedB) {
        connectedSectionNumbers.add(resolvedB.sectionNumber)
      }
    }

    const displayPoint = nextSocketA && nextSocketB
      ? (() => {
          const resolvedA = signalSocketLookup[signalSocketRefKey(nextSocketA)]
          const resolvedB = signalSocketLookup[signalSocketRefKey(nextSocketB)]
          if (!resolvedA || !resolvedB) {
            return signal.coordinate
          }

          return {
            x: (resolvedA.x + resolvedB.x) / 2,
            y: (resolvedA.y + resolvedB.y) / 2,
          }
        })()
      : signal.coordinate

    useEditorStore.getState().updateSignal(signal.id, {
      socketA: nextSocketA,
      socketB: nextSocketB,
      sectionConnections: Array.from(connectedSectionNumbers).slice(0, 3),
      coordinate: displayPoint,
    })
  }

  function updateSectionEndpointCoordinate(
    endpointKey: 'endpoint1' | 'endpoint2',
    nextX: number,
    nextY: number,
  ): { x: number; y: number } | null {
    if (!selectedSection) {
      return null
    }

    const latestSection = useEditorStore
      .getState()
      .map.sections.find((section) => section.id === selectedSection.id)

    if (!latestSection) {
      return null
    }

    const appliedPoint = {
      x: Math.round(nextX),
      y: Math.round(nextY),
    }

    const nextEndpoint1 =
      endpointKey === 'endpoint1'
        ? { ...latestSection.endpoint1, coordinate: appliedPoint }
        : latestSection.endpoint1
    const nextEndpoint2 =
      endpointKey === 'endpoint2'
        ? { ...latestSection.endpoint2, coordinate: appliedPoint }
        : latestSection.endpoint2

    let nextCurveBend = latestSection.curveBend
    if (latestSection.sectionKind === 'Curved') {
      const chordLength = distance(nextEndpoint1.coordinate, nextEndpoint2.coordinate)
      const { min, max } = getCurveBendLimits(latestSection, chordLength)
      const sign = latestSection.curveBend >= 0 ? 1 : -1
      nextCurveBend = sign * clamp(Math.abs(latestSection.curveBend), min, max)
    }

    updateSection(latestSection.id, {
      endpoint1: nextEndpoint1,
      endpoint2: nextEndpoint2,
      curveBend: nextCurveBend,
    })

    return appliedPoint
  }

  function updateSectionCurveControl(nextX: number, nextY: number): { x: number; y: number } | null {
    if (!selectedSection || selectedSection.sectionKind !== 'Curved') {
      return null
    }

    const x1 = selectedSection.endpoint1.coordinate.x
    const y1 = selectedSection.endpoint1.coordinate.y
    const x2 = selectedSection.endpoint2.coordinate.x
    const y2 = selectedSection.endpoint2.coordinate.y
    const chordX = x2 - x1
    const chordY = y2 - y1
    const chordLength = Math.max(1, Math.sqrt(chordX * chordX + chordY * chordY))

    const normalX = -chordY / chordLength
    const normalY = chordX / chordLength
    const midpointX = (x1 + x2) / 2
    const midpointY = (y1 + y2) / 2

    const vectorX = nextX - midpointX
    const vectorY = nextY - midpointY
    const projected = vectorX * normalX + vectorY * normalY
    const sign = projected >= 0 ? 1 : -1
    const { min, max } = getCurveBendLimits(selectedSection, chordLength)
    const magnitude = clamp(Math.abs(projected), min, max)

    updateSection(selectedSection.id, {
      curveBend: sign * magnitude,
    })

    return {
      x: midpointX + normalX * sign * magnitude,
      y: midpointY + normalY * sign * magnitude,
    }
  }

  function moveConnectedEndpointCluster(
    selectedSectionId: string,
    selectedEndpointKey: SectionEndpointKey,
    fromPoint: { x: number; y: number },
    toPoint: { x: number; y: number },
  ): void {
    if (!connectionsLocked) {
      return
    }

    const state = useEditorStore.getState()
    const roundedFromX = Math.round(fromPoint.x)
    const roundedFromY = Math.round(fromPoint.y)

    for (const section of state.map.sections) {
      const endpoints: SectionEndpointKey[] = ['endpoint1', 'endpoint2']
      for (const endpointKey of endpoints) {
        if (section.id === selectedSectionId && endpointKey === selectedEndpointKey) {
          continue
        }

        const endpoint = endpointKey === 'endpoint1' ? section.endpoint1 : section.endpoint2
        if (Math.round(endpoint.coordinate.x) !== roundedFromX || Math.round(endpoint.coordinate.y) !== roundedFromY) {
          continue
        }

        if (endpointKey === 'endpoint1') {
          state.updateSection(section.id, {
            endpoint1: {
              ...section.endpoint1,
              coordinate: { x: toPoint.x, y: toPoint.y },
            },
          })
        } else {
          state.updateSection(section.id, {
            endpoint2: {
              ...section.endpoint2,
              coordinate: { x: toPoint.x, y: toPoint.y },
            },
          })
        }
      }
    }
  }

  const workspacePanel = (
    <header className={workspacePanelVertical ? 'panel-header inline workspace-toolbar-panel dock-vertical' : 'panel-header inline workspace-toolbar-panel dock-horizontal'}>
      <div>
        <p className="eyebrow">Workspace</p>
        <h2>{map.settings.title}</h2>
      </div>
      <div className="view-controls">
        <HistoryToolbar cursorPosition={cursorWorldPosition} />
        <div className="display-toggle-toolbar" aria-label="Display toggles">
          <label>
            <input
              type="checkbox"
              checked={showSectionLabels}
              onChange={(event) => updateDisplayToggle('showSectionLabels', event.target.checked)}
            />
            <span>Section Labels</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showSignalEndpoints}
              onChange={(event) => updateDisplayToggle('showSignalEndpoints', event.target.checked)}
            />
            <span>Signal Endpoints</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showDirectionalIndicators}
              onChange={(event) => updateDisplayToggle('showDirectionalIndicators', event.target.checked)}
            />
            <span>Direction</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showValidationIcons}
              onChange={(event) => updateDisplayToggle('showValidationIcons', event.target.checked)}
            />
            <span>Validation</span>
          </label>
        </div>
        <div className="panel-dock-control">
          <span>Workspace Dock</span>
          <div className="panel-dock-button-group" role="group" aria-label="Workspace panel dock side">
            {(['Top', 'Right', 'Bottom', 'Left'] as DockSide[]).map((side) => (
              <button
                key={`workspace-dock-${side}`}
                type="button"
                className={workspacePanelDock === side ? 'panel-dock-button active' : 'panel-dock-button'}
                onClick={() => updatePanelDock('workspacePanelDock', side)}
              >
                {side.slice(0, 1)}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-dock-control">
          <span>Stations Dock</span>
          <div className="panel-dock-button-group" role="group" aria-label="Station selector panel dock side">
            {(['Top', 'Right', 'Bottom', 'Left'] as DockSide[]).map((side) => (
              <button
                key={`station-dock-${side}`}
                type="button"
                className={stationSelectorDock === side ? 'panel-dock-button active' : 'panel-dock-button'}
                onClick={() => updatePanelDock('stationSelectorDock', side)}
              >
                {side.slice(0, 1)}
              </button>
            ))}
          </div>
        </div>
        <label className="panel-size-control">
          <span>Workspace Size</span>
          <input
            type="range"
            min={140}
            max={760}
            step={10}
            value={workspacePanelSize}
            onChange={(event) => updatePanelSize('workspacePanelSize', Number(event.target.value))}
          />
        </label>
        <label className="panel-size-control">
          <span>Stations Size</span>
          <input
            type="range"
            min={120}
            max={760}
            step={10}
            value={stationSelectorSize}
            onChange={(event) => updatePanelSize('stationSelectorSize', Number(event.target.value))}
          />
        </label>
        <button type="button" className="fit-button" onClick={fitToViewport}>
          Fit View
        </button>
        <button
          type="button"
          className="fit-button"
          onClick={fitToSelection}
          disabled={!selectedEntityBounds}
        >
          Fit To Selection
        </button>
        <label className="zoom-control">
          <span>Zoom</span>
          <input
            type="range"
            min={0.1}
            max={2.5}
            step={0.1}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
      </div>
    </header>
  )

  const stationSelectorPanel = (
    <section className={stationSelectorVertical ? 'workspace-station-strip dock-vertical' : 'workspace-station-strip dock-horizontal'} aria-label="Station quick navigation">
      <p className="workspace-station-strip-title">Train Stations</p>
      <div className="workspace-station-strip-list" role="list">
        {orderedStations.map((station) => {
          const isSelected = selectedEntity?.entityType === 'station' && selectedEntity.id === station.id
          return (
            <button
              key={station.id}
              type="button"
              role="listitem"
              className={isSelected ? 'workspace-station-chip active' : 'workspace-station-chip'}
              onClick={() => centerOnStation(station)}
              title={`Center and select ${station.stationName}`}
            >
              {`#${station.stationNumber} ${station.stationName}`}
            </button>
          )
        })}
        {orderedStations.length === 0 && (
          <p className="workspace-station-empty">No stations on this map yet.</p>
        )}
      </div>
    </section>
  )

  return (
    <section className="grid-panel">
      <div className="grid-panel-layout">
        <div className="grid-panel-dock grid-panel-dock-top">
          {workspacePanelDock === 'Top' && (
            renderDockedPanel(workspacePanel, 'workspacePanelSize', 'Top', workspacePanelSize, 'Workspace')
          )}
          {stationSelectorDock === 'Top' && (
            renderDockedPanel(stationSelectorPanel, 'stationSelectorSize', 'Top', stationSelectorSize, 'Train Stations')
          )}
        </div>
        <div className="grid-panel-middle">
          <div className="grid-panel-dock grid-panel-dock-left">
            {workspacePanelDock === 'Left' && (
              renderDockedPanel(workspacePanel, 'workspacePanelSize', 'Left', workspacePanelSize, 'Workspace')
            )}
            {stationSelectorDock === 'Left' && (
              renderDockedPanel(stationSelectorPanel, 'stationSelectorSize', 'Left', stationSelectorSize, 'Train Stations')
            )}
          </div>
          <div className="canvas-wrap" ref={containerRef}>
        <Stage
          width={stageWidth}
          height={stageHeight}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={() => {
            handleStageMouseUp()
            setCursorWorldPosition(null)
          }}
        >
          <Layer>
            <Rect x={0} y={0} width={stageWidth} height={stageHeight} fill="#0e1725" name="pan-surface" />
            <Group x={worldRenderOffsetX} y={worldRenderOffsetY} scaleX={zoom} scaleY={zoom}>
              <Rect
                x={worldMinX}
                y={worldMinY}
                width={worldWidth}
                height={worldHeight}
                fill="#102038"
                stroke="#2d4463"
                strokeWidth={1.2}
              />

              {fineGridLines.map((line, idx) => (
                <Line key={`fine-${idx}`} points={line} stroke="#183050" strokeWidth={0.4} />
              ))}

              {mainGridLines.map((line, idx) => (
                <Line key={`main-${idx}`} points={line} stroke="#2f5f97" strokeWidth={0.6} />
              ))}

              <Line points={[worldMinX, 0, worldMaxX, 0]} stroke="#7dd3fc" strokeWidth={1} />
              <Line points={[0, worldMinY, 0, worldMaxY]} stroke="#7dd3fc" strokeWidth={1} />

              {xAxisLabels.map((labelX) => {
                return (
                  <Text
                    key={`x-axis-${labelX}`}
                    x={labelX - 10}
                    y={worldMinY - 24}
                    width={40}
                    text={String(labelX)}
                    fontSize={10}
                    fill="#9bd3ff"
                    align="center"
                  />
                )
              })}

              {xAxisLabels.map((labelX) => {
                return (
                  <Text
                    key={`x-axis-bottom-${labelX}`}
                    x={labelX - 10}
                    y={worldMaxY + 12}
                    width={40}
                    text={String(labelX)}
                    fontSize={10}
                    fill="#9bd3ff"
                    align="center"
                  />
                )
              })}

              {yAxisLabels.map((labelY) => {
                return (
                  <Text
                    key={`y-axis-${labelY}`}
                    x={worldMinX - 34}
                    y={labelY - 6}
                    width={28}
                    text={String(-labelY)}
                    fontSize={10}
                    fill="#9bd3ff"
                    align="right"
                  />
                )
              })}

              {yAxisLabels.map((labelY) => {
                return (
                  <Text
                    key={`y-axis-right-${labelY}`}
                    x={worldMaxX + 6}
                    y={labelY - 6}
                    width={30}
                    text={String(-labelY)}
                    fontSize={10}
                    fill="#9bd3ff"
                    align="left"
                  />
                )
              })}

              {map.sections.map((section) => {
                const isSelected = selectedEntity?.entityType === 'section' && selectedEntity.id === section.id
                const isHovered = hoveredSectionId === section.id
                const isCurved = section.sectionKind === 'Curved'
                const sectionLabelText = section.sectionName.trim() || String(section.sectionNumber)
                const reviewState = connectionReview.sectionConnectivity[section.id]
                const signalReviewState = connectionReview.sectionSignalConnectivity[section.id]
                const validationStroke =
                  reviewState?.status === 'orphan'
                    ? '#ef4444'
                    : reviewState?.status === 'partial'
                      ? '#facc15'
                      : null
                const signalBadgeColor =
                  signalReviewState?.status === 'invalid'
                    ? '#ef4444'
                    : signalReviewState?.status === 'partial'
                      ? '#facc15'
                      : signalReviewState?.status === 'ok'
                        ? '#22c55e'
                        : '#64748b'
                const signalBadgeText =
                  signalReviewState?.status === 'invalid'
                    ? '×'
                    : signalReviewState?.status === 'partial'
                      ? '!'
                      : signalReviewState?.status === 'ok'
                        ? 'S'
                        : '?'
                const directionDescriptor = getSectionDirectionDescriptor(section)
                const directionArrowMarkers = getSectionDirectionArrowMarkers(section)
                const chordX = section.endpoint2.coordinate.x - section.endpoint1.coordinate.x
                const chordY = section.endpoint2.coordinate.y - section.endpoint1.coordinate.y
                const chordLength = Math.max(1, Math.sqrt(chordX * chordX + chordY * chordY))
                const normalX = -chordY / chordLength
                const normalY = chordX / chordLength
                const midpointX = (section.endpoint1.coordinate.x + section.endpoint2.coordinate.x) / 2
                const midpointY = (section.endpoint1.coordinate.y + section.endpoint2.coordinate.y) / 2
                const curveControlX = midpointX + normalX * section.curveBend
                const curveControlY = midpointY + normalY * section.curveBend
                const labelX = isCurved ? curveControlX + normalX * 18 : midpointX
                const labelY = isCurved ? curveControlY + normalY * 18 : midpointY
                const localPoints = isCurved
                  ? [
                      section.endpoint1.coordinate.x - midpointX,
                      section.endpoint1.coordinate.y - midpointY,
                      normalX * section.curveBend,
                      normalY * section.curveBend,
                      section.endpoint2.coordinate.x - midpointX,
                      section.endpoint2.coordinate.y - midpointY,
                    ]
                  : [
                      section.endpoint1.coordinate.x - midpointX,
                      section.endpoint1.coordinate.y - midpointY,
                      section.endpoint2.coordinate.x - midpointX,
                      section.endpoint2.coordinate.y - midpointY,
                    ]

                return (
                  <Group
                    key={section.id}
                    x={midpointX}
                    y={midpointY}
                    draggable={activeTool === 'select' && !connectionsLocked}
                    onDragStart={(event) => {
                      event.cancelBubble = true
                      setDragTarget({ kind: 'section', id: section.id })
                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragMove={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragEnd={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveSection(section.id, event.target.x(), event.target.y())
                      setDragTarget(null)
                    }}
                    onClick={(event) => {
                      event.cancelBubble = true
                      selectEntity({ entityType: 'section', id: section.id })
                    }}
                    onMouseEnter={() => {
                      setHoveredSectionId(section.id)
                    }}
                    onMouseLeave={() => {
                      setHoveredSectionId((current) => (current === section.id ? null : current))
                    }}
                  >
                    <Line
                      points={localPoints}
                      stroke={isSelected ? '#fbbf24' : isHovered ? '#cbe7ff' : section.color}
                      strokeWidth={isSelected ? 6 : isHovered ? 5 : 4}
                      hitStrokeWidth={18}
                      lineCap="round"
                      tension={isCurved ? 0.5 : 0}
                    />
                    {showDirectionalIndicators && directionArrowMarkers.map((marker, markerIndex) => (
                      <Group
                        key={`${section.id}-direction-arrow-${markerIndex}`}
                        x={marker.x - midpointX}
                        y={marker.y - midpointY}
                        rotation={toDegrees(marker.angle)}
                        listening={false}
                      >
                        <Line points={[-7, 0, 4, 0]} stroke={marker.color} strokeWidth={1.2} />
                        <Line points={[4, 0, 0, -3]} stroke={marker.color} strokeWidth={1.2} />
                        <Line points={[4, 0, 0, 3]} stroke={marker.color} strokeWidth={1.2} />
                      </Group>
                    ))}
                    {showValidationIcons && validationStroke && (
                      <Line
                        points={localPoints}
                        stroke={validationStroke}
                        strokeWidth={isSelected ? 8 : 6}
                        lineCap="round"
                        dash={[10, 7]}
                        opacity={0.95}
                        tension={isCurved ? 0.5 : 0}
                        listening={false}
                      />
                    )}
                    {showSectionLabels && (
                      <Group x={labelX - midpointX} y={labelY - midpointY}>
                        {renderNumericLabel(sectionLabelStyle, sectionLabelText, isSelected)}
                      </Group>
                    )}
                    {showDirectionalIndicators && (
                      <Group x={labelX - midpointX + 16} y={labelY - midpointY + 14} listening={false}>
                        <Rect
                          x={-20}
                          y={-8}
                          width={40}
                          height={16}
                          cornerRadius={4}
                          fill="#0b1624"
                          stroke={directionDescriptor.color}
                          strokeWidth={1}
                        />
                        <Text
                          x={-20}
                          y={-3}
                          width={40}
                          align="center"
                          text={directionDescriptor.symbol}
                          fontSize={8}
                          fill={directionDescriptor.color}
                        />
                      </Group>
                    )}
                    {showValidationIcons && (
                      <Group x={labelX - midpointX - 18} y={labelY - midpointY + 14} listening={false}>
                        <Circle radius={8} fill={signalBadgeColor} stroke="#0f172a" strokeWidth={1} />
                        <Text
                          x={-6}
                          y={-5}
                          width={12}
                          align="center"
                          text={signalBadgeText}
                          fontSize={8}
                          fill="#ffffff"
                        />
                      </Group>
                    )}
                  </Group>
                )
              })}

              {map.intersections.map((intersection) => {
                const isSelected =
                  selectedEntity?.entityType === 'intersection' && selectedEntity.id === intersection.id
                const armLength = Math.max(40, intersection.armLength)
                const points = getIntersectionConnectionPoints(intersection)

                return (
                  <Group
                    key={intersection.id}
                    x={intersection.center.x}
                    y={intersection.center.y}
                    draggable={activeTool === 'select'}
                    onDragStart={(event) => {
                      event.cancelBubble = true
                      beginHistoryBatch()
                      setDragTarget({ kind: 'intersection', id: intersection.id })
                      setDraggedIntersectionId(intersection.id)
                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragMove={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveIntersection(intersection.id, event.target.x(), event.target.y())
                    }}
                    onDragEnd={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveIntersection(intersection.id, event.target.x(), event.target.y())
                      setDraggedIntersectionId((current) =>
                        current === intersection.id ? null : current,
                      )
                      commitHistoryBatch()
                      setDragTarget(null)
                    }}
                    onClick={(event) => {
                      event.cancelBubble = true
                      selectEntity({ entityType: 'intersection', id: intersection.id })
                    }}
                  >
                    <Line points={[-armLength, 0, armLength, 0]} stroke={intersection.color} strokeWidth={7} />
                    <Line points={[0, -armLength, 0, armLength]} stroke={intersection.color} strokeWidth={7} />
                    <Circle
                      radius={11}
                      fill={intersection.color}
                      stroke={isSelected ? '#fbbf24' : '#1e293b'}
                      strokeWidth={isSelected ? 2 : 1.2}
                    />
                    {renderNumericLabel(
                      intersectionLabelStyle,
                      String(intersection.intersectionNumber),
                      isSelected,
                    )}
                    <Line points={[-6, 0, 6, 0]} stroke="#000000" strokeWidth={1.2} listening={false} />
                    <Line points={[0, -6, 0, 6]} stroke="#000000" strokeWidth={1.2} listening={false} />

                    {points.map((point) => (
                      <Circle
                        key={`${intersection.id}-${point.side}`}
                        x={point.x - intersection.center.x}
                        y={point.y - intersection.center.y}
                        radius={4}
                        fill="#60a5fa"
                        stroke="#0f172a"
                        strokeWidth={0.8}
                        listening={false}
                      />
                    ))}
                  </Group>
                )
              })}

              {activeTool === 'select' &&
                map.sections.map((section) => (
                  <Group key={`${section.id}-endpoint-anchors`} listening={false}>
                    <Circle
                      x={section.endpoint1.coordinate.x}
                      y={section.endpoint1.coordinate.y}
                      radius={
                        highlightedIntersectionEndpointKeys.has(`${section.id}:endpoint1`) ? 7 : 0
                      }
                      fill="#fde047"
                      opacity={0.45}
                    />
                    <Circle
                      x={section.endpoint1.coordinate.x}
                      y={section.endpoint1.coordinate.y}
                      radius={4}
                      fill="#38bdf8"
                      opacity={0.85}
                    />
                    <Circle
                      x={section.endpoint2.coordinate.x}
                      y={section.endpoint2.coordinate.y}
                      radius={
                        highlightedIntersectionEndpointKeys.has(`${section.id}:endpoint2`) ? 7 : 0
                      }
                      fill="#fde047"
                      opacity={0.45}
                    />
                    <Circle
                      x={section.endpoint2.coordinate.x}
                      y={section.endpoint2.coordinate.y}
                      radius={4}
                      fill="#38bdf8"
                      opacity={0.85}
                    />
                  </Group>
                ))}

              {junctionIndicators.map((junction) => {
                const isJunctionSelected =
                  selectedEntity?.entityType === 'junction' && selectedEntity.id === junction.key
                const junctionStyle = map.settings.labelStyles.junction[junction.type]
                const junctionLabelDims = getLabelContainerDimensions(junctionStyle)
                const hitRadius = Math.max(12, Math.max(junctionLabelDims.width, junctionLabelDims.height) / 2 + 4)
                const splitRotation =
                  junction.type === 'Split' ? toDegrees(junction.mergeDirectionRadians ?? 0) : 0

                return (
                  <Group
                    key={`junction-${junction.connectedSectionNumbers.join('-')}`}
                    x={junction.x}
                    y={junction.y}
                    draggable={activeTool === 'select'}
                    onDragStart={(event) => {
                      event.cancelBubble = true
                      beginHistoryBatch()
                      setDragTarget({ kind: 'junction', id: junction.key, endpointRefs: junction.connectedEndpoints })
                      syncCursorWorldPosition(event.target.getStage())
                      selectEntity({ entityType: 'junction', id: junction.key })
                    }}
                    onDragMove={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveJunction(junction.key, event.target.x(), event.target.y(), junction.connectedEndpoints)
                    }}
                    onDragEnd={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveJunction(junction.key, event.target.x(), event.target.y(), junction.connectedEndpoints)
                      commitHistoryBatch()
                      setDragTarget(null)
                    }}
                    onClick={(event) => {
                      event.cancelBubble = true
                      selectEntity({ entityType: 'junction', id: junction.key })
                    }}
                  >
                    <Circle radius={hitRadius} fill="#000000" opacity={0.001} />
                    {renderNumericLabel(
                      junctionStyle,
                      junction.name || String(junction.displayNumber),
                      isJunctionSelected,
                      splitRotation,
                    )}
                    <Text
                      x={-46}
                      y={10}
                      width={92}
                      align="center"
                      text={junction.displayLabel}
                      fontSize={8}
                      fill="#e2e8f0"
                    />
                  </Group>
                )
              })}

              {activeTool === 'select' && showSignalEndpoints && (
                <Group listening={false}>
                  {map.sections.map((section) => {
                    const endpointKeys: SectionEndpointKey[] = ['endpoint1', 'endpoint2']
                    return endpointKeys.map((endpointKey) => {
                      const leftPoint = getSectionSignalSocketPoint(section, endpointKey, 'Left')
                      const rightPoint = getSectionSignalSocketPoint(section, endpointKey, 'Right')
                      return (
                        <Line
                          key={`socket-bar-${section.id}-${endpointKey}`}
                          points={[leftPoint.x, leftPoint.y, rightPoint.x, rightPoint.y]}
                          stroke="#ffffff"
                          strokeWidth={1.2}
                          opacity={0.9}
                        />
                      )
                    })
                  })}

                  {!isRepositioning && signalSocketPoints.map((socket) => (
                    <Circle
                      key={`signal-socket-${socket.key}`}
                      x={socket.x}
                      y={socket.y}
                      radius={4.8}
                      fill={
                        socket.signalType === 'Block'
                          ? '#0ea5e9'
                          : socket.signalType === 'Path'
                            ? '#f97316'
                            : '#64748b'
                      }
                      stroke="#0f172a"
                      strokeWidth={0.9}
                      opacity={0.9}
                    />
                  ))}

                  {!isRepositioning && signalSocketPoints.map((socket) => (
                    <Text
                      key={`signal-socket-type-${socket.key}`}
                      x={socket.x - 5}
                      y={socket.y - 4}
                      width={10}
                      align="center"
                      text={socket.signalType === 'Block' ? 'B' : socket.signalType === 'Path' ? 'P' : ''}
                      fontSize={7}
                      fill="#ffffff"
                    />
                  ))}
                </Group>
              )}

              {selectedSection && activeTool === 'select' && (
                <>
                  <Group
                    x={selectedSection.endpoint1.coordinate.x}
                    y={selectedSection.endpoint1.coordinate.y}
                    draggable
                    onDragStart={(event) => {
                      event.cancelBubble = true
                      beginHistoryBatch()
                      setDragTarget({ kind: 'section-endpoint', id: selectedSection.id, endpointKey: 'endpoint1' })
                      const endpoint = selectedSection.endpoint1
                      const groupKey = `${Math.round(endpoint.coordinate.x)}:${Math.round(endpoint.coordinate.y)}`
                      const group = sectionEndpointGroups[groupKey] ?? []
                      const connectionKind = endpoint.stationConnection
                        ? 'station'
                        : group.length > 1
                          ? 'section'
                          : 'none'

                      endpointDragStateRef.current.endpoint1 = {
                        originX: selectedSection.endpoint1.coordinate.x,
                        originY: selectedSection.endpoint1.coordinate.y,
                        lastX: selectedSection.endpoint1.coordinate.x,
                        lastY: selectedSection.endpoint1.coordinate.y,
                        connectionKind,
                      }

                      if (!connectionsLocked) {
                        disconnectSectionEndpointStation(selectedSection.id, 'endpoint1')
                      }

                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragMove={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      const candidate = getEndpointSnapCandidate(
                        selectedSection.id,
                        event.target.x(),
                        event.target.y(),
                      )
                      if (candidate) {
                        event.target.position({ x: candidate.x, y: candidate.y })
                        updateSectionEndpointCoordinate('endpoint1', candidate.x, candidate.y)
                        if (candidate.kind === 'station') {
                          setSnapPreview({
                            endpointKey: 'endpoint1',
                            stationId: candidate.stationId,
                            side: candidate.side,
                            x: candidate.x,
                            y: candidate.y,
                          })
                        } else {
                          setSnapPreview((current) =>
                            current?.endpointKey === 'endpoint1' ? null : current,
                          )
                        }
                      } else {
                        const dragState = endpointDragStateRef.current.endpoint1
                        if (connectionsLocked && dragState?.connectionKind === 'station') {
                          event.target.position({ x: dragState.originX, y: dragState.originY })
                          updateSectionEndpointCoordinate('endpoint1', dragState.originX, dragState.originY)
                        } else {
                          updateSectionEndpointCoordinate('endpoint1', event.target.x(), event.target.y())
                          if (connectionsLocked && dragState?.connectionKind === 'section') {
                            moveConnectedEndpointCluster(
                              selectedSection.id,
                              'endpoint1',
                              { x: dragState.lastX, y: dragState.lastY },
                              { x: event.target.x(), y: event.target.y() },
                            )
                            dragState.lastX = event.target.x()
                            dragState.lastY = event.target.y()
                          }
                        }

                        setSnapPreview((current) => (current?.endpointKey === 'endpoint1' ? null : current))
                      }
                    }}
                    onDragEnd={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      const candidate = getEndpointSnapCandidate(
                        selectedSection.id,
                        event.target.x(),
                        event.target.y(),
                      )
                      if (
                        candidate?.kind === 'station' &&
                        connectSectionEndpointToStation(selectedSection.id, 'endpoint1', candidate.stationId, candidate.side)
                      ) {
                        event.target.position({ x: candidate.x, y: candidate.y })
                        updateSectionEndpointCoordinate('endpoint1', candidate.x, candidate.y)
                      } else if (candidate?.kind === 'section-endpoint') {
                        event.target.position({ x: candidate.x, y: candidate.y })
                        updateSectionEndpointCoordinate('endpoint1', candidate.x, candidate.y)
                        const dragState = endpointDragStateRef.current.endpoint1
                        if (connectionsLocked && dragState?.connectionKind === 'section') {
                          moveConnectedEndpointCluster(
                            selectedSection.id,
                            'endpoint1',
                            { x: dragState.lastX, y: dragState.lastY },
                            { x: candidate.x, y: candidate.y },
                          )
                          dragState.lastX = candidate.x
                          dragState.lastY = candidate.y
                        }
                      } else {
                        const dragState = endpointDragStateRef.current.endpoint1
                        if (connectionsLocked && dragState?.connectionKind === 'station') {
                          event.target.position({ x: dragState.originX, y: dragState.originY })
                          updateSectionEndpointCoordinate('endpoint1', dragState.originX, dragState.originY)
                        } else {
                          const applied = updateSectionEndpointCoordinate('endpoint1', event.target.x(), event.target.y())
                          if (applied) {
                            event.target.position(applied)
                            if (connectionsLocked && dragState?.connectionKind === 'section') {
                              moveConnectedEndpointCluster(
                                selectedSection.id,
                                'endpoint1',
                                { x: dragState.lastX, y: dragState.lastY },
                                applied,
                              )
                              dragState.lastX = applied.x
                              dragState.lastY = applied.y
                            }
                          }
                        }
                      }

                      setSnapPreview((current) => (current?.endpointKey === 'endpoint1' ? null : current))
                      delete endpointDragStateRef.current.endpoint1
                      setDragTarget(null)
                    }}
                  >
                    <Circle radius={8} fill="#22d3ee" stroke="#0e7490" strokeWidth={1.5} />
                    <Text x={-14} y={10} width={28} align="center" text="E1" fontSize={9} fill="#dbeafe" />
                  </Group>

                  <Group
                    x={selectedSection.endpoint2.coordinate.x}
                    y={selectedSection.endpoint2.coordinate.y}
                    draggable
                    onDragStart={(event) => {
                      event.cancelBubble = true
                      beginHistoryBatch()
                      setDragTarget({ kind: 'section-endpoint', id: selectedSection.id, endpointKey: 'endpoint2' })
                      const endpoint = selectedSection.endpoint2
                      const groupKey = `${Math.round(endpoint.coordinate.x)}:${Math.round(endpoint.coordinate.y)}`
                      const group = sectionEndpointGroups[groupKey] ?? []
                      const connectionKind = endpoint.stationConnection
                        ? 'station'
                        : group.length > 1
                          ? 'section'
                          : 'none'

                      endpointDragStateRef.current.endpoint2 = {
                        originX: selectedSection.endpoint2.coordinate.x,
                        originY: selectedSection.endpoint2.coordinate.y,
                        lastX: selectedSection.endpoint2.coordinate.x,
                        lastY: selectedSection.endpoint2.coordinate.y,
                        connectionKind,
                      }

                      if (!connectionsLocked) {
                        disconnectSectionEndpointStation(selectedSection.id, 'endpoint2')
                      }

                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragMove={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      const candidate = getEndpointSnapCandidate(
                        selectedSection.id,
                        event.target.x(),
                        event.target.y(),
                      )
                      if (candidate) {
                        event.target.position({ x: candidate.x, y: candidate.y })
                        updateSectionEndpointCoordinate('endpoint2', candidate.x, candidate.y)
                        if (candidate.kind === 'station') {
                          setSnapPreview({
                            endpointKey: 'endpoint2',
                            stationId: candidate.stationId,
                            side: candidate.side,
                            x: candidate.x,
                            y: candidate.y,
                          })
                        } else {
                          setSnapPreview((current) =>
                            current?.endpointKey === 'endpoint2' ? null : current,
                          )
                        }
                      } else {
                        const dragState = endpointDragStateRef.current.endpoint2
                        if (connectionsLocked && dragState?.connectionKind === 'station') {
                          event.target.position({ x: dragState.originX, y: dragState.originY })
                          updateSectionEndpointCoordinate('endpoint2', dragState.originX, dragState.originY)
                        } else {
                          updateSectionEndpointCoordinate('endpoint2', event.target.x(), event.target.y())
                          if (connectionsLocked && dragState?.connectionKind === 'section') {
                            moveConnectedEndpointCluster(
                              selectedSection.id,
                              'endpoint2',
                              { x: dragState.lastX, y: dragState.lastY },
                              { x: event.target.x(), y: event.target.y() },
                            )
                            dragState.lastX = event.target.x()
                            dragState.lastY = event.target.y()
                          }
                        }

                        setSnapPreview((current) => (current?.endpointKey === 'endpoint2' ? null : current))
                      }
                    }}
                    onDragEnd={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      const candidate = getEndpointSnapCandidate(
                        selectedSection.id,
                        event.target.x(),
                        event.target.y(),
                      )
                      if (
                        candidate?.kind === 'station' &&
                        connectSectionEndpointToStation(selectedSection.id, 'endpoint2', candidate.stationId, candidate.side)
                      ) {
                        event.target.position({ x: candidate.x, y: candidate.y })
                        updateSectionEndpointCoordinate('endpoint2', candidate.x, candidate.y)
                      } else if (candidate?.kind === 'section-endpoint') {
                        event.target.position({ x: candidate.x, y: candidate.y })
                        updateSectionEndpointCoordinate('endpoint2', candidate.x, candidate.y)
                        const dragState = endpointDragStateRef.current.endpoint2
                        if (connectionsLocked && dragState?.connectionKind === 'section') {
                          moveConnectedEndpointCluster(
                            selectedSection.id,
                            'endpoint2',
                            { x: dragState.lastX, y: dragState.lastY },
                            { x: candidate.x, y: candidate.y },
                          )
                          dragState.lastX = candidate.x
                          dragState.lastY = candidate.y
                        }
                      } else {
                        const dragState = endpointDragStateRef.current.endpoint2
                        if (connectionsLocked && dragState?.connectionKind === 'station') {
                          event.target.position({ x: dragState.originX, y: dragState.originY })
                          updateSectionEndpointCoordinate('endpoint2', dragState.originX, dragState.originY)
                        } else {
                          const applied = updateSectionEndpointCoordinate('endpoint2', event.target.x(), event.target.y())
                          if (applied) {
                            event.target.position(applied)
                            if (connectionsLocked && dragState?.connectionKind === 'section') {
                              moveConnectedEndpointCluster(
                                selectedSection.id,
                                'endpoint2',
                                { x: dragState.lastX, y: dragState.lastY },
                                applied,
                              )
                              dragState.lastX = applied.x
                              dragState.lastY = applied.y
                            }
                          }
                        }
                      }

                      setSnapPreview((current) => (current?.endpointKey === 'endpoint2' ? null : current))
                      delete endpointDragStateRef.current.endpoint2
                      setDragTarget(null)
                    }}
                  >
                    <Circle radius={8} fill="#22d3ee" stroke="#0e7490" strokeWidth={1.5} />
                    <Text x={-14} y={10} width={28} align="center" text="E2" fontSize={9} fill="#dbeafe" />
                  </Group>

                  {selectedSection.sectionKind === 'Curved' && (() => {
                    const x1 = selectedSection.endpoint1.coordinate.x
                    const y1 = selectedSection.endpoint1.coordinate.y
                    const x2 = selectedSection.endpoint2.coordinate.x
                    const y2 = selectedSection.endpoint2.coordinate.y
                    const chordX = x2 - x1
                    const chordY = y2 - y1
                    const chordLength = Math.max(1, Math.sqrt(chordX * chordX + chordY * chordY))
                    const normalX = -chordY / chordLength
                    const normalY = chordX / chordLength
                    const midpointX = (x1 + x2) / 2
                    const midpointY = (y1 + y2) / 2
                    const controlX = midpointX + normalX * selectedSection.curveBend
                    const controlY = midpointY + normalY * selectedSection.curveBend

                    return (
                      <Group
                        x={controlX}
                        y={controlY}
                        draggable
                        onDragStart={(event) => {
                          event.cancelBubble = true
                          beginHistoryBatch()
                          setDragTarget({ kind: 'section', id: selectedSection.id })
                          syncCursorWorldPosition(event.target.getStage())
                        }}
                        onDragMove={(event) => {
                          event.cancelBubble = true
                          syncCursorWorldPosition(event.target.getStage())
                          updateSectionCurveControl(event.target.x(), event.target.y())
                        }}
                        onDragEnd={(event) => {
                          event.cancelBubble = true
                          syncCursorWorldPosition(event.target.getStage())
                          const applied = updateSectionCurveControl(event.target.x(), event.target.y())
                          if (applied) {
                            event.target.position(applied)
                          }
                          commitHistoryBatch()
                          setDragTarget(null)
                        }}
                      >
                        <Circle radius={7} fill="#f59e0b" stroke="#92400e" strokeWidth={1.4} />
                        <Text x={-14} y={10} width={28} align="center" text="C" fontSize={9} fill="#fde68a" />
                      </Group>
                    )
                  })()}
                </>
              )}

              {map.stations.map((station) => {
                const anchorX = (station.inbound.x + station.outbound.x) / 2
                const anchorY = (station.inbound.y + station.outbound.y) / 2
                const isSelected = selectedEntity?.entityType === 'station' && selectedEntity.id === station.id
                const stationReview = connectionReview.stationConnectivity[station.id]
                const stationValidationStroke =
                  stationReview?.status === 'orphan'
                    ? '#ef4444'
                    : stationReview?.status === 'partial'
                      ? '#facc15'
                      : '#1e293b'
                const slotHeight = 14
                const slotGap = 4
                const metrics = getStationDisplayMetrics(station)
                const layoutDirection = metrics.layoutDirection
                const stationWidth = metrics.stationWidth
                const stationHeight = metrics.stationHeight
                const stationLeftX = metrics.stationLeftX
                const stationTopY = metrics.stationTopY
                const outboundArrow = getStationOutboundArrow(station)
                const headerText = `${station.stationName} #${station.stationNumber}`
                const leftPoint = getStationConnectionPoint(station, 'Left')
                const rightPoint = getStationConnectionPoint(station, 'Right')
                const stationMetaPanelX = metrics.stationMetaPanelX
                const stationMetaPanelY = metrics.stationMetaPanelY
                const freightPanelX = metrics.freightPanelX
                const freightPanelY = metrics.freightPanelY
                const metaPadding = 6
                const metaInnerWidth = metrics.stationMetaPanelWidth - metaPadding * 2
                const metaTitleColumnWidth = 70
                const metaStatusColumnX = stationMetaPanelX + metaPadding + metaTitleColumnWidth + 6
                const metaStatusColumnWidth = Math.max(24, metaInnerWidth - metaTitleColumnWidth - 6)
                const leftInward = {
                  x: anchorX - leftPoint.x,
                  y: anchorY - leftPoint.y,
                }
                const leftInwardLength = Math.max(1, Math.sqrt(leftInward.x * leftInward.x + leftInward.y * leftInward.y))
                const leftGlyph = {
                  x: leftPoint.x - anchorX + (leftInward.x / leftInwardLength) * 13,
                  y: leftPoint.y - anchorY + (leftInward.y / leftInwardLength) * 13,
                }
                const rightInward = {
                  x: anchorX - rightPoint.x,
                  y: anchorY - rightPoint.y,
                }
                const rightInwardLength = Math.max(1, Math.sqrt(rightInward.x * rightInward.x + rightInward.y * rightInward.y))
                const rightGlyph = {
                  x: rightPoint.x - anchorX + (rightInward.x / rightInwardLength) * 13,
                  y: rightPoint.y - anchorY + (rightInward.y / rightInwardLength) * 13,
                }
                const layoutBadgeText =
                  layoutDirection === 'HorizontalMetaRight'
                    ? 'H-R'
                    : layoutDirection === 'HorizontalMetaLeft'
                      ? 'H-L'
                      : layoutDirection === 'VerticalMetaTop'
                        ? 'V-T'
                        : 'V-B'
                const leftKey = `${station.id}:Left`
                const rightKey = `${station.id}:Right`
                const leftFlashing = flashingStationSides[leftKey] === true
                const rightFlashing = flashingStationSides[rightKey] === true
                const leftOccupied = (stationSideOccupancy[leftKey] ?? null) !== null
                const rightOccupied = (stationSideOccupancy[rightKey] ?? null) !== null
                const leftGlyphColor = leftFlashing
                  ? '#fcd34d'
                  : leftOccupied
                    ? '#fecaca'
                    : '#bbf7d0'
                const rightGlyphColor = rightFlashing
                  ? '#fcd34d'
                  : rightOccupied
                    ? '#bfdbfe'
                    : '#bbf7d0'

                return (
                  <Group
                    key={station.id}
                    x={anchorX}
                    y={anchorY}
                    draggable={activeTool === 'select'}
                    onDragStart={(event) => {
                      event.cancelBubble = true
                      beginHistoryBatch()
                      setDragTarget({ kind: 'station', id: station.id })
                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragMove={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveStation(station.id, event.target.x(), event.target.y())
                    }}
                    onDragEnd={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveStation(station.id, event.target.x(), event.target.y())
                      commitHistoryBatch()
                      setDragTarget(null)
                    }}
                    onClick={(event) => {
                      event.cancelBubble = true
                      selectEntity({ entityType: 'station', id: station.id })
                    }}
                  >
                    <Rect
                      x={stationLeftX}
                      y={stationTopY}
                      width={stationWidth}
                      height={stationHeight}
                      cornerRadius={8}
                      fill={isSelected ? '#fde68a' : station.color}
                      stroke={stationValidationStroke}
                      strokeWidth={stationReview?.status === 'ok' ? 1 : 2.2}
                    />

                    <Rect
                      x={stationLeftX + stationWidth - 34}
                      y={stationTopY + 4}
                      width={30}
                      height={14}
                      cornerRadius={4}
                      fill="#0b1624"
                      stroke="#67e8f9"
                      strokeWidth={0.8}
                    />
                    <Text
                      x={stationLeftX + stationWidth - 34}
                      y={stationTopY + 8}
                      width={30}
                      height={10}
                      text={layoutBadgeText}
                      fontSize={8}
                      fill="#e2f3ff"
                      align="center"
                      verticalAlign="middle"
                    />

                    <Rect
                      x={freightPanelX}
                      y={freightPanelY}
                      width={metrics.freightPanelWidth}
                      height={metrics.freightPanelHeight}
                      cornerRadius={6}
                      fill="#e5e7eb"
                      stroke="#6b7280"
                      strokeWidth={0.8}
                    />

                    <Rect
                      x={stationMetaPanelX}
                      y={stationMetaPanelY}
                      width={metrics.stationMetaPanelWidth}
                      height={metrics.stationMetaPanelHeight}
                      cornerRadius={6}
                      fill="#f8fafc"
                      stroke="#64748b"
                      strokeWidth={0.8}
                    />

                    <Text
                      x={stationMetaPanelX + metaPadding}
                      y={stationMetaPanelY + 8}
                      width={metaTitleColumnWidth}
                      height={metrics.stationMetaPanelHeight - 12}
                      text={headerText}
                      fontSize={9}
                      fill="#0f172a"
                      align="left"
                      verticalAlign="top"
                    />

                    <Text
                      x={metaStatusColumnX}
                      y={stationMetaPanelY + 8}
                      width={metaStatusColumnWidth}
                      height={12}
                      text={`IN #${station.sectionInNumber ?? '-'}`}
                      fontSize={9}
                      fill="#0f766e"
                      align="right"
                      verticalAlign="middle"
                    />

                    <Text
                      x={metaStatusColumnX}
                      y={stationMetaPanelY + 22}
                      width={metaStatusColumnWidth}
                      height={12}
                      text={`OUT ${outboundArrow} #${station.sectionOutNumber ?? '-'}`}
                      fontSize={9}
                      fill="#1d4ed8"
                      align="right"
                      verticalAlign="middle"
                    />

                    {station.freightStationSequence.map((slot, index) => {
                      const slotX = freightPanelX + 4
                      const slotY = freightPanelY + 4 + index * (slotHeight + slotGap)
                      const slotWidth = metrics.freightPanelWidth - 8
                      const fill = slot.stationType === 'Liquid' ? '#67e8f9' : '#f5d0fe'
                      const stroke = slot.stationType === 'Liquid' ? '#155e75' : '#7e22ce'
                      const modeText = slot.mode === 'Load' ? 'L' : 'U'

                      return (
                        <Group key={`${station.id}-slot-visual-${index}`} x={slotX} y={slotY} listening={false}>
                          <Rect
                            x={0}
                            y={0}
                            width={slotWidth}
                            height={slotHeight}
                            cornerRadius={4}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={1}
                          />
                          <Text
                            x={0}
                            y={2}
                            width={slotWidth}
                            text={`${slot.slotIndex} ${slot.stationType.slice(0, 1)} ${modeText}`}
                            fontSize={8}
                            fill="#111827"
                            align="center"
                            verticalAlign="middle"
                          />
                        </Group>
                      )
                    })}

                    {activeTool === 'select' && (
                      <>
                        <Circle
                          x={leftPoint.x - anchorX}
                          y={leftPoint.y - anchorY}
                          radius={leftFlashing ? 7 : 5}
                          fill={leftFlashing ? '#f59e0b' : leftOccupied ? '#ef4444' : '#22c55e'}
                          stroke="#0f172a"
                          strokeWidth={leftFlashing ? 1.8 : 1}
                          onMouseEnter={(event) => {
                            event.cancelBubble = true
                            setHoveredStationPoint({
                              stationId: station.id,
                              side: 'Left',
                              x: leftPoint.x,
                              y: leftPoint.y,
                              occupied: leftOccupied,
                            })
                          }}
                          onMouseLeave={(event) => {
                            event.cancelBubble = true
                            setHoveredStationPoint((current) =>
                              current?.stationId === station.id && current.side === 'Left' ? null : current,
                            )
                          }}
                        />
                        <Text
                          x={leftGlyph.x - 12}
                          y={leftGlyph.y - 5}
                          width={24}
                          align="center"
                          text="IN"
                          fontSize={8}
                          fill={leftGlyphColor}
                          listening={false}
                        />
                        <Circle
                          x={rightPoint.x - anchorX}
                          y={rightPoint.y - anchorY}
                          radius={rightFlashing ? 7 : 5}
                          fill={rightFlashing ? '#f59e0b' : rightOccupied ? '#ef4444' : '#22c55e'}
                          stroke="#0f172a"
                          strokeWidth={rightFlashing ? 1.8 : 1}
                          onMouseEnter={(event) => {
                            event.cancelBubble = true
                            setHoveredStationPoint({
                              stationId: station.id,
                              side: 'Right',
                              x: rightPoint.x,
                              y: rightPoint.y,
                              occupied: rightOccupied,
                            })
                          }}
                          onMouseLeave={(event) => {
                            event.cancelBubble = true
                            setHoveredStationPoint((current) =>
                              current?.stationId === station.id && current.side === 'Right' ? null : current,
                            )
                          }}
                        />
                        <Text
                          x={rightGlyph.x - 14}
                          y={rightGlyph.y - 5}
                          width={28}
                          align="center"
                          text="OUT"
                          fontSize={8}
                          fill={rightGlyphColor}
                          listening={false}
                        />
                      </>
                    )}
                  </Group>
                )
              })}

              {snapPreview && (
                <Circle
                  x={snapPreview.x}
                  y={snapPreview.y}
                  radius={9}
                  stroke="#facc15"
                  strokeWidth={2}
                  dash={[5, 4]}
                  listening={false}
                />
              )}

              {hoveredStationPoint && activeTool === 'select' && (
                <Group x={hoveredStationPoint.x + 10} y={hoveredStationPoint.y - 28} listening={false}>
                  <Rect width={98} height={22} fill="#0f172a" cornerRadius={5} opacity={0.88} />
                  <Text
                    x={6}
                    y={6}
                    width={86}
                    text={`${hoveredStationPoint.side === 'Left' ? 'IN' : 'OUT'}: ${hoveredStationPoint.occupied ? 'occupied' : 'empty'}`}
                    fontSize={9}
                    fill="#e2e8f0"
                  />
                </Group>
              )}

              {!isRepositioning && selectedSignal && activeTool === 'select' && (() => {
                const signalCenter = getSignalDisplayPoint(selectedSignal)
                const socketAResolved = selectedSignal.socketA
                  ? signalSocketLookup[signalSocketRefKey(selectedSignal.socketA)]
                  : null
                const socketBResolved = selectedSignal.socketB
                  ? signalSocketLookup[signalSocketRefKey(selectedSignal.socketB)]
                  : null

                const socketAPoint = socketAResolved
                  ? { x: socketAResolved.x, y: socketAResolved.y }
                  : { x: signalCenter.x - 14, y: signalCenter.y }
                const socketBPoint = socketBResolved
                  ? { x: socketBResolved.x, y: socketBResolved.y }
                  : { x: signalCenter.x + 14, y: signalCenter.y }

                return (
                  <>
                    <Line
                      points={[signalCenter.x, signalCenter.y, socketAPoint.x, socketAPoint.y]}
                      stroke="#67e8f9"
                      strokeWidth={1.2}
                      dash={[4, 3]}
                      listening={false}
                    />
                    <Line
                      points={[signalCenter.x, signalCenter.y, socketBPoint.x, socketBPoint.y]}
                      stroke="#67e8f9"
                      strokeWidth={1.2}
                      dash={[4, 3]}
                      listening={false}
                    />

                    <Group
                      x={socketAPoint.x}
                      y={socketAPoint.y}
                      draggable
                      onDragMove={(event) => {
                        event.cancelBubble = true
                        syncCursorWorldPosition(event.target.getStage())
                        const excludeKey = selectedSignal.socketB ? signalSocketRefKey(selectedSignal.socketB) : undefined
                        const candidate = findSignalSocketCandidate(event.target.x(), event.target.y(), excludeKey)
                        if (candidate) {
                          event.target.position({ x: candidate.x, y: candidate.y })
                        }
                      }}
                      onDragEnd={(event) => {
                        event.cancelBubble = true
                        const excludeKey = selectedSignal.socketB ? signalSocketRefKey(selectedSignal.socketB) : undefined
                        const candidate = findSignalSocketCandidate(event.target.x(), event.target.y(), excludeKey)
                        updateSignalSocket(selectedSignal, 'socketA', candidate ? candidate.ref : null)
                      }}
                    >
                      <Circle radius={6} fill="#0ea5e9" stroke="#082f49" strokeWidth={1.2} />
                      <Text x={-8} y={8} width={16} align="center" text="A" fontSize={8} fill="#bfdbfe" />
                    </Group>

                    <Group
                      x={socketBPoint.x}
                      y={socketBPoint.y}
                      draggable
                      onDragMove={(event) => {
                        event.cancelBubble = true
                        syncCursorWorldPosition(event.target.getStage())
                        const excludeKey = selectedSignal.socketA ? signalSocketRefKey(selectedSignal.socketA) : undefined
                        const candidate = findSignalSocketCandidate(event.target.x(), event.target.y(), excludeKey)
                        if (candidate) {
                          event.target.position({ x: candidate.x, y: candidate.y })
                        }
                      }}
                      onDragEnd={(event) => {
                        event.cancelBubble = true
                        const excludeKey = selectedSignal.socketA ? signalSocketRefKey(selectedSignal.socketA) : undefined
                        const candidate = findSignalSocketCandidate(event.target.x(), event.target.y(), excludeKey)
                        updateSignalSocket(selectedSignal, 'socketB', candidate ? candidate.ref : null)
                      }}
                    >
                      <Circle radius={6} fill="#22c55e" stroke="#14532d" strokeWidth={1.2} />
                      <Text x={-8} y={8} width={16} align="center" text="B" fontSize={8} fill="#dcfce7" />
                    </Group>
                  </>
                )
              })()}

              {!isRepositioning && map.signals.map((signal) => {
                const isSelected = selectedEntity?.entityType === 'signal' && selectedEntity.id === signal.id
                const displayPoint = getSignalDisplayPoint(signal)
                const statusReview = connectionReview.signalConnectivity[signal.id]
                const status =
                  statusReview?.status === 'ok'
                    ? 'Connected'
                    : statusReview?.status === 'partial'
                      ? 'Partial'
                      : statusReview?.status === 'invalid'
                        ? 'Invalid'
                        : 'Unconnected'
                const statusColor =
                  statusReview?.status === 'ok'
                    ? '#22c55e'
                    : statusReview?.status === 'partial'
                      ? '#f59e0b'
                      : statusReview?.status === 'invalid'
                        ? '#ef4444'
                        : '#64748b'

                return (
                  <Group
                    key={signal.id}
                    x={displayPoint.x}
                    y={displayPoint.y}
                    draggable={activeTool === 'select' && statusReview?.status !== 'ok'}
                    onDragStart={(event) => {
                      event.cancelBubble = true
                      setDragTarget({ kind: 'signal', id: signal.id })
                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragMove={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                    }}
                    onDragEnd={(event) => {
                      event.cancelBubble = true
                      syncCursorWorldPosition(event.target.getStage())
                      moveSignal(signal.id, event.target.x(), event.target.y())
                      setDragTarget(null)
                    }}
                    onClick={(event) => {
                      event.cancelBubble = true
                      selectEntity({ entityType: 'signal', id: signal.id })
                    }}
                  >
                    <Circle
                      radius={9}
                      fill={signal.color}
                      stroke={
                        statusReview?.status === 'invalid'
                          ? '#ef4444'
                          : statusReview?.status === 'partial'
                            ? '#f59e0b'
                            : isSelected
                              ? '#fde047'
                              : '#ffffff'
                      }
                      strokeWidth={statusReview?.status === 'invalid' ? 2.6 : isSelected ? 2.5 : 1.2}
                    />
                    <Circle radius={4} x={12} y={-10} fill={statusColor} stroke="#0f172a" strokeWidth={1} />
                    <Text
                      x={-10}
                      y={12}
                      width={20}
                      align="center"
                      text={String(signal.signalNumber)}
                      fontSize={9}
                      fill="#dbeafe"
                    />
                    {isSelected && (
                      <Text
                        x={-34}
                        y={-24}
                        width={68}
                        align="center"
                        text={status}
                        fontSize={8}
                        fill={statusColor}
                      />
                    )}
                  </Group>
                )
              })}

              {isRepositioning && repositionCoordinateLabels.map((label) => (
                <Group key={label.key} x={label.x} y={label.y} listening={false}>
                  {renderCoordinateLabel(label.text)}
                </Group>
              ))}
            </Group>
          </Layer>
        </Stage>
          </div>
          <div className="grid-panel-dock grid-panel-dock-right">
            {workspacePanelDock === 'Right' && (
              renderDockedPanel(workspacePanel, 'workspacePanelSize', 'Right', workspacePanelSize, 'Workspace')
            )}
            {stationSelectorDock === 'Right' && (
              renderDockedPanel(stationSelectorPanel, 'stationSelectorSize', 'Right', stationSelectorSize, 'Train Stations')
            )}
          </div>
        </div>
        <div className="grid-panel-dock grid-panel-dock-bottom">
          {workspacePanelDock === 'Bottom' && (
            renderDockedPanel(workspacePanel, 'workspacePanelSize', 'Bottom', workspacePanelSize, 'Workspace')
          )}
          {stationSelectorDock === 'Bottom' && (
            renderDockedPanel(stationSelectorPanel, 'stationSelectorSize', 'Bottom', stationSelectorSize, 'Train Stations')
          )}
        </div>
      </div>
    </section>
  )
}
