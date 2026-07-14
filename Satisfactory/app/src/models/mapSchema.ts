import { z } from 'zod'

export const signalTypeSchema = z.enum(['Block', 'Path'])
export type SignalType = z.infer<typeof signalTypeSchema>

export const freightStationTypeSchema = z.enum(['Freight', 'Liquid'])
export type FreightStationType = z.infer<typeof freightStationTypeSchema>

export const freightModeSchema = z.enum(['Load', 'Unload'])
export type FreightMode = z.infer<typeof freightModeSchema>

export const railwaySectionKindSchema = z.enum(['Straight', 'Curved'])
export type RailwaySectionKind = z.infer<typeof railwaySectionKindSchema>

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const stationFreightSlotSchema = z.object({
  slotIndex: z.number().int().min(1),
  stationType: freightStationTypeSchema,
  mode: freightModeSchema,
  material: z.string().trim().default(''),
})

export const trainStationSchema = z.object({
  id: z.string(),
  stationName: z.string().trim().min(1),
  stationNumber: z.number().int().nonnegative(),
  color: z.string().default('#c7d2fe'),
  sectionInNumber: z.number().int().nonnegative().nullable(),
  sectionOutNumber: z.number().int().nonnegative().nullable(),
  inbound: pointSchema,
  outbound: pointSchema,
  liquidFreightStationCount: z.number().int().nonnegative(),
  solidFreightStationCount: z.number().int().nonnegative(),
  freightStationSequence: z.array(stationFreightSlotSchema),
  freightSectionMaterials: z.array(z.string().trim()),
  notes: z.string().default(''),
})

const endpointSchema = z.object({
  sectionNumber: z.number().int().nonnegative(),
  coordinate: pointSchema,
  stationConnection: z
    .object({
      stationId: z.string(),
      side: z.enum(['Left', 'Right']),
    })
    .nullable()
    .default(null),
  signal1: signalTypeSchema.nullable(),
  signal2: signalTypeSchema.nullable(),
  entranceMode: z.enum(['Allowed', 'Blocked']),
})

const signalSocketRefSchema = z.object({
  sectionId: z.string(),
  endpointKey: z.enum(['endpoint1', 'endpoint2']),
  side: z.enum(['Left', 'Right']),
})

export const railwaySectionSchema = z.object({
  id: z.string(),
  sectionNumber: z.number().int().nonnegative(),
  color: z.string().default('#93c5fd'),
  sectionKind: railwaySectionKindSchema.default('Straight'),
  curveBend: z.number().min(-1000).max(1000).default(120),
  endpoint1: endpointSchema,
  endpoint2: endpointSchema,
})

export const intersectionSchema = z.object({
  id: z.string(),
  intersectionNumber: z.number().int().nonnegative(),
  color: z.string().default('#fde68a'),
  center: pointSchema,
  armLength: z.number().int().min(40).max(240).default(60),
})

export const signalSchema = z.object({
  id: z.string(),
  signalType: signalTypeSchema,
  signalNumber: z.number().int().nonnegative(),
  color: z.string().default('#38bdf8'),
  coordinate: pointSchema,
  socketA: signalSocketRefSchema.nullable().default(null),
  socketB: signalSocketRefSchema.nullable().default(null),
  sectionConnections: z.array(z.number().int().nonnegative()).max(3),
})

export const mapSettingsSchema = z.object({
  title: z.string().trim().default('Untitled Map'),
  worldWidth: z.number().int().positive().default(100),
  worldHeight: z.number().int().positive().default(100),
})

export const mapDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  lastUpdatedIso: z.string(),
  settings: mapSettingsSchema,
  stations: z.array(trainStationSchema),
  sections: z.array(railwaySectionSchema),
  intersections: z.array(intersectionSchema).default([]),
  signals: z.array(signalSchema),
})

export type Point = z.infer<typeof pointSchema>
export type StationFreightSlot = z.infer<typeof stationFreightSlotSchema>
export type TrainStation = z.infer<typeof trainStationSchema>
export type RailwaySection = z.infer<typeof railwaySectionSchema>
export type Intersection = z.infer<typeof intersectionSchema>
export type Signal = z.infer<typeof signalSchema>
export type MapSettings = z.infer<typeof mapSettingsSchema>
export type MapDocument = z.infer<typeof mapDocumentSchema>

export function createDefaultMap(): MapDocument {
  return {
    schemaVersion: 1,
    lastUpdatedIso: new Date().toISOString(),
    settings: {
      title: 'Main Rail Network',
      worldWidth: 100,
      worldHeight: 100,
    },
    stations: [],
    sections: [],
    intersections: [],
    signals: [],
  }
}

export function parseMapDocument(raw: unknown): MapDocument {
  return mapDocumentSchema.parse(raw)
}
