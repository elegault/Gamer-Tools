import { z } from 'zod'

export const signalTypeSchema = z.enum(['Block', 'Path'])
export type SignalType = z.infer<typeof signalTypeSchema>

export const signalSocketStateSchema = z.enum(['Suggested', 'Implemented', 'Removed', 'Overridden'])
export type SignalSocketState = z.infer<typeof signalSocketStateSchema>

export const freightStationTypeSchema = z.enum(['Freight', 'Liquid'])
export type FreightStationType = z.infer<typeof freightStationTypeSchema>

export const freightModeSchema = z.enum(['Load', 'Unload'])
export type FreightMode = z.infer<typeof freightModeSchema>

export const stationLayoutDirectionSchema = z.enum([
  'HorizontalMetaRight',
  'HorizontalMetaLeft',
  'VerticalMetaTop',
  'VerticalMetaBottom',
  // Legacy values retained for backward compatibility with existing saved maps.
  'Default',
  'Reversed',
])
export type StationLayoutDirection = z.infer<typeof stationLayoutDirectionSchema>

export const railwaySectionKindSchema = z.enum(['Straight', 'Curved'])
export type RailwaySectionKind = z.infer<typeof railwaySectionKindSchema>

export const sectionDirectionSchema = z.enum(['Bidirectional', 'OneWay1To2', 'OneWay2To1'])
export type SectionDirection = z.infer<typeof sectionDirectionSchema>

export const labelShapeSchema = z.enum(['Circle', 'Rectangle', 'Diamond', 'Triangle', 'Hexagon'])
export type LabelShape = z.infer<typeof labelShapeSchema>

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
  layoutDirection: stationLayoutDirectionSchema.default('HorizontalMetaRight'),
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
  signalSockets: z
    .object({
      Left: z
        .object({
          state: signalSocketStateSchema.default('Suggested'),
          expectedType: signalTypeSchema.nullable().default(null),
          overrideType: signalTypeSchema.nullable().default(null),
        })
        .default({
          state: 'Suggested',
          expectedType: null,
          overrideType: null,
        }),
      Right: z
        .object({
          state: signalSocketStateSchema.default('Suggested'),
          expectedType: signalTypeSchema.nullable().default(null),
          overrideType: signalTypeSchema.nullable().default(null),
        })
        .default({
          state: 'Suggested',
          expectedType: null,
          overrideType: null,
        }),
    })
    .default({
      Left: {
        state: 'Suggested',
        expectedType: null,
        overrideType: null,
      },
      Right: {
        state: 'Suggested',
        expectedType: null,
        overrideType: null,
      },
    }),
  entranceMode: z.enum(['Allowed', 'Blocked']),
})

const signalSocketRefSchema = z.object({
  sectionId: z.string(),
  endpointKey: z.enum(['endpoint1', 'endpoint2']),
  side: z.enum(['Left', 'Right']),
})

const labelStyleSchema = z.object({
  shape: labelShapeSchema.default('Circle'),
  width: z.number().int().min(8).max(200).default(20),
  height: z.number().int().min(8).max(200).default(20),
  radius: z.number().int().min(4).max(120).default(10),
  backgroundColor: z.string().default('#000000'),
  borderColor: z.string().default('#e2e8f0'),
  borderWidth: z.number().min(0).max(10).default(1),
  textColor: z.string().default('#ffffff'),
  textSize: z.number().int().min(6).max(72).default(8),
  textYOffset: z.number().min(-80).max(80).default(0),
})

const labelStylesSchema = z.object({
  section: labelStyleSchema.default({
    shape: 'Circle',
    width: 20,
    height: 20,
    radius: 10,
    backgroundColor: '#ff0000',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    textColor: '#ffffff',
    textSize: 18,
    textYOffset: 0,
  }),
  intersection: labelStyleSchema.default({
    shape: 'Circle',
    width: 20,
    height: 20,
    radius: 10,
    backgroundColor: '#dc2626',
    borderColor: '#111827',
    borderWidth: 1.1,
    textColor: '#ffffff',
    textSize: 8,
    textYOffset: 0,
  }),
  junction: z
    .object({
      Merge: labelStyleSchema.default({
        shape: 'Rectangle',
        width: 14,
        height: 14,
        radius: 7,
        backgroundColor: '#64748b',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      }),
      Split: labelStyleSchema.default({
        shape: 'Triangle',
        width: 16,
        height: 16,
        radius: 8,
        backgroundColor: '#dc2626',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      }),
      Junction: labelStyleSchema.default({
        shape: 'Circle',
        width: 14,
        height: 14,
        radius: 7,
        backgroundColor: '#111827',
        borderColor: '#e2e8f0',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      }),
      Invalid: labelStyleSchema.default({
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
      }),
      Undefined: labelStyleSchema.default({
        shape: 'Diamond',
        width: 16,
        height: 16,
        radius: 8,
        backgroundColor: '#475569',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      }),
    })
    .default({
      Merge: {
        shape: 'Rectangle',
        width: 14,
        height: 14,
        radius: 7,
        backgroundColor: '#64748b',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
      Split: {
        shape: 'Triangle',
        width: 16,
        height: 16,
        radius: 8,
        backgroundColor: '#dc2626',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
      Junction: {
        shape: 'Circle',
        width: 14,
        height: 14,
        radius: 7,
        backgroundColor: '#111827',
        borderColor: '#e2e8f0',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
      Invalid: {
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
      },
      Undefined: {
        shape: 'Diamond',
        width: 16,
        height: 16,
        radius: 8,
        backgroundColor: '#475569',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
    }),
})

const junctionNumberOverrideSchema = z.object({
  junctionId: z.string(),
  junctionNumber: z.number().int().nonnegative().optional(),
  mergeNumber: z.number().int().nonnegative().optional(),
  splitNumber: z.number().int().nonnegative().optional(),
  displayName: z.string().trim().default(''),
})

const persistedSelectedEntitySchema = z.object({
  entityType: z.enum(['station', 'section', 'intersection', 'signal', 'junction']),
  id: z.string(),
})

const viewportStateSchema = z.object({
  zoom: z.number().min(0.1).max(2.5).default(1),
  panX: z.number().default(0),
  panY: z.number().default(0),
})

const panelStateSchema = z.object({
  topbarCollapsed: z.boolean().default(false),
  sidebarCollapsed: z.boolean().default(false),
  inspectorCollapsed: z.boolean().default(false),
  sidebarWidth: z.number().int().min(180).max(720).default(260),
  inspectorWidth: z.number().int().min(260).max(900).default(600),
  workspacePanelDock: z.enum(['Top', 'Right', 'Bottom', 'Left']).default('Top'),
  stationSelectorDock: z.enum(['Top', 'Right', 'Bottom', 'Left']).default('Top'),
  workspacePanelSize: z.number().int().min(140).max(760).default(230),
  stationSelectorSize: z.number().int().min(120).max(760).default(180),
})

const inspectorCollapseStateSchema = z.object({
  mapUi: z.boolean().default(false),
  selection: z.boolean().default(false),
  connectivity: z.boolean().default(false),
  review: z.boolean().default(false),
  relocate: z.boolean().default(false),
  totals: z.boolean().default(false),
  legend: z.boolean().default(false),
})

const displayToggleStateSchema = z.object({
  showSectionLabels: z.boolean().default(true),
  showSignalEndpoints: z.boolean().default(true),
  showDirectionalIndicators: z.boolean().default(true),
  showValidationIcons: z.boolean().default(true),
})

const editorStateSchema = z.object({
  viewport: viewportStateSchema.default({
    zoom: 1,
    panX: 0,
    panY: 0,
  }),
  lastSelected: persistedSelectedEntitySchema.nullable().default(null),
  panels: panelStateSchema.default({
    topbarCollapsed: false,
    sidebarCollapsed: false,
    inspectorCollapsed: false,
    sidebarWidth: 260,
    inspectorWidth: 600,
    workspacePanelDock: 'Top',
    stationSelectorDock: 'Top',
    workspacePanelSize: 230,
    stationSelectorSize: 180,
  }),
  inspectorSections: inspectorCollapseStateSchema.default({
    mapUi: false,
    selection: false,
    connectivity: false,
    review: false,
    relocate: false,
    totals: false,
    legend: false,
  }),
  displayToggles: displayToggleStateSchema.default({
    showSectionLabels: true,
    showSignalEndpoints: true,
    showDirectionalIndicators: true,
    showValidationIcons: true,
  }),
})

export type JunctionNumberOverride = z.infer<typeof junctionNumberOverrideSchema>

export const railwaySectionSchema = z.object({
  id: z.string(),
  sectionNumber: z.number().int().nonnegative(),
  sectionName: z.string().trim().default(''),
  color: z.string().default('#da0fec'),
  sectionKind: railwaySectionKindSchema.default('Straight'),
  directionMode: sectionDirectionSchema.default('Bidirectional'),
  curveBendMin: z.number().min(0).max(1000).default(0),
  curveBendMax: z.number().min(0).max(1000).default(480),
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
  defaultSectionColor: z.string().default('#da0fec'),
  junctionNumberOverrides: z.array(junctionNumberOverrideSchema).default([]),
  editorState: editorStateSchema.default({
    viewport: {
      zoom: 1,
      panX: 0,
      panY: 0,
    },
    lastSelected: null,
    panels: {
      topbarCollapsed: false,
      sidebarCollapsed: false,
      inspectorCollapsed: false,
      sidebarWidth: 260,
      inspectorWidth: 600,
      workspacePanelDock: 'Top',
      stationSelectorDock: 'Top',
      workspacePanelSize: 230,
      stationSelectorSize: 180,
    },
    inspectorSections: {
      mapUi: false,
      selection: false,
      connectivity: false,
      review: false,
      relocate: false,
      totals: false,
      legend: false,
    },
    displayToggles: {
      showSectionLabels: true,
      showSignalEndpoints: true,
      showDirectionalIndicators: true,
      showValidationIcons: true,
    },
  }),
  labelStyles: labelStylesSchema.default({
    section: {
      shape: 'Circle',
      width: 20,
      height: 20,
      radius: 10,
      backgroundColor: '#000000',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      textColor: '#ffffff',
      textSize: 8,
      textYOffset: 0,
    },
    intersection: {
      shape: 'Circle',
      width: 20,
      height: 20,
      radius: 10,
      backgroundColor: '#dc2626',
      borderColor: '#111827',
      borderWidth: 1.1,
      textColor: '#ffffff',
      textSize: 8,
      textYOffset: 0,
    },
    junction: {
      Merge: {
        shape: 'Rectangle',
        width: 14,
        height: 14,
        radius: 7,
        backgroundColor: '#64748b',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
      Split: {
        shape: 'Triangle',
        width: 16,
        height: 16,
        radius: 8,
        backgroundColor: '#dc2626',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
      Invalid: {
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
      },
      Junction: {
        shape: 'Circle',
        width: 14,
        height: 14,
        radius: 7,
        backgroundColor: '#111827',
        borderColor: '#e2e8f0',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
      Undefined: {
        shape: 'Diamond',
        width: 16,
        height: 16,
        radius: 8,
        backgroundColor: '#475569',
        borderColor: '#0f172a',
        borderWidth: 1.2,
        textColor: '#ffffff',
        textSize: 7,
        textYOffset: 0,
      },
    },
  }),
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
    settings: mapSettingsSchema.parse({
      title: 'Main Rail Network',
      worldWidth: 100,
      worldHeight: 100,
      defaultSectionColor: '#da0fec',
      junctionNumberOverrides: [],
      editorState: {
        viewport: {
          zoom: 1,
          panX: 0,
          panY: 0,
        },
        lastSelected: null,
        panels: {
          topbarCollapsed: false,
          sidebarCollapsed: false,
          inspectorCollapsed: false,
          sidebarWidth: 260,
          inspectorWidth: 600,
        },
        inspectorSections: {
          mapUi: false,
          selection: false,
          connectivity: false,
          review: false,
          relocate: false,
          totals: false,
          legend: false,
        },
      },
    }),
    stations: [],
    sections: [],
    intersections: [],
    signals: [],
  }
}

export function parseMapDocument(raw: unknown): MapDocument {
  return mapDocumentSchema.parse(raw)
}
