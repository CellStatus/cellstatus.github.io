import { pgTable, text, varchar, integer, real, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === MANUFACTURING APP TABLES ===

// Machine status enum
export const machineStatuses = ["running", "idle", "maintenance", "down", "setup"] as const;
export type MachineStatus = typeof machineStatuses[number];

// Machines table
export const machines = pgTable("machines", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  machineId: text("machine_id").notNull(),
  status: text("status").notNull().$type<MachineStatus>(),
  cell: text("cell"), // Cell/area the machine belongs to
  // Cell flow fields
  idealCycleTime: real("ideal_cycle_time"), // cycle time in seconds
  batchSize: integer("batch_size"), // pcs per setup
  uptimePercent: real("uptime_percent"), // reliability percentage (0-100)
  setupTime: real("setup_time"), // setup time in seconds
  statusUpdate: text("status_update"), // Machine status notes
  // Operational counters (optional)
  // (legacy OEE fields removed from DB migrations)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertMachineSchema = createInsertSchema(machines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;

// Placeholder / additional shared types for frontend usage
export type Operator = { id: string; name: string; };
export type ProductionStat = any;
export type DowntimeLog = any;

// Lightweight downtime helper lists (frontend may import these)
export const downtimeCategories = ['mechanical', 'electrical', 'material', 'operator', 'quality', 'other'] as const;
export const downtimeReasonCodes: Record<string, { category: typeof downtimeCategories[number]; label: string }> = {
  MECH_01: { category: 'mechanical', label: 'Bearing failure' },
  ELEC_01: { category: 'electrical', label: 'Power loss' },
  MAT_01: { category: 'material', label: 'Missing raw material' },
  OP_01: { category: 'operator', label: 'Operator absent' },
  QUA_01: { category: 'quality', label: 'Quality hold' },
  OTH_01: { category: 'other', label: 'Other' },
};

// === CELL CONFIGURATIONS ===

export const cellConfigurations = pgTable("cell_configurations", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("active"),
  operationsJson: jsonb("operations_json").notNull(),
  throughputUph: real("throughput_uph"),
  totalWip: real("total_wip"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCellConfigurationSchema = createInsertSchema(cellConfigurations).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
});
export type InsertCellConfiguration = z.infer<typeof insertCellConfigurationSchema>;
export type CellConfiguration = typeof cellConfigurations.$inferSelect;

// === SCRAP INCIDENTS ===

export const scrapIncidentStatuses = ["open", "closed"] as const;
export type ScrapIncidentStatus = typeof scrapIncidentStatuses[number];

export const scrapIncidents = pgTable("scrap_incidents", {
  id: varchar("id").primaryKey(),
  machineId: varchar("machine_id").notNull(),
  partId: varchar("part_id"),
  characteristic: text("characteristic").notNull(),
  quantity: integer("quantity").notNull(),
  estimatedCost: real("estimated_cost").notNull(),
  note: text("note"),
  status: text("status").notNull().$type<ScrapIncidentStatus>().default("open"),
  dateCreated: text("date_created"),
  dateClosed: text("date_closed"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertScrapIncidentSchema = createInsertSchema(scrapIncidents)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ partId: z.string().nullable().optional() });
export type InsertScrapIncident = z.infer<typeof insertScrapIncidentSchema>;
export type ScrapIncident = typeof scrapIncidents.$inferSelect;

// === SPC DATA (3NF) ===

// Parts table – one row per unique part
export const parts = pgTable("parts", {
  id: varchar("id").primaryKey(),
  partNumber: text("part_number").notNull(),
  partName: text("part_name"),
  material: text("material"),
  rawMaterialCost: real("raw_material_cost"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertPartSchema = createInsertSchema(parts).omit({ id: true, createdAt: true });
export type InsertPart = z.infer<typeof insertPartSchema>;
export type Part = typeof parts.$inferSelect;

// Characteristics table – one row per unique characteristic within a part
export const characteristics = pgTable("characteristics", {
  id: varchar("id").primaryKey(),
  partId: varchar("part_id"),  // FK → parts.id (optional)
  charNumber: text("char_number").notNull(),
  charName: text("char_name"),
  isAttributeCheck: boolean("is_attribute_check").notNull().default(false),
  nominalValue: text("nominal_value"),
  charMax: text("char_max"),
  charMin: text("char_min"),
  tolerance: text("tolerance"),
  opName: text("op_name"),
  createdAt: text("created_at").notNull(),
});

export const insertCharacteristicSchema = createInsertSchema(characteristics)
  .omit({ id: true, createdAt: true })
  .extend({ partId: z.string().nullable().optional() });
export type InsertCharacteristic = z.infer<typeof insertCharacteristicSchema>;
export type Characteristic = typeof characteristics.$inferSelect;

// SPC Measurements table – one row per individual measurement
export const spcMeasurements = pgTable("spc_measurements", {
  id: varchar("id").primaryKey(),
  characteristicId: varchar("characteristic_id").notNull(), // FK → characteristics.id
  machineId: varchar("machine_id").notNull(),               // FK → machines.id
  measuredValue: text("measured_value").notNull(),
  status: text("status").default("open"),
  recordNote: text("record_note"),
  createdAt: text("created_at").notNull(),
});

export const insertSpcMeasurementSchema = createInsertSchema(spcMeasurements).omit({ id: true, createdAt: true });
export type InsertSpcMeasurement = z.infer<typeof insertSpcMeasurementSchema>;
export type SpcMeasurement = typeof spcMeasurements.$inferSelect;

// Flat joined view type returned by the API for backward compatibility
export interface SpcRecordFlat {
  id: string;
  machineId: string;
  characteristicId: string;
  partId: string | null;
  partNumber: string;
  partName: string | null;
  charNumber: string;
  charName: string | null;
  nominalValue: string | null;
  charMax: string | null;
  charMin: string | null;
  tolerance: string | null;
  opName: string | null;
  measuredValue: string;
  status: string | null;
  recordNote: string | null;
  createdAt: string;
}

// Backward-compatible aliases so existing frontend code keeps compiling
export type SpcRecord = SpcRecordFlat;
export type AuditFinding = SpcRecordFlat;
export type InsertSpcRecord = InsertSpcMeasurement & {
  partNumber?: string;
  partName?: string;
  charNumber?: string;
  charName?: string;
  nominalValue?: string;
  charMax?: string;
  charMin?: string;
  tolerance?: string;
  opName?: string;
  characteristic?: string;
  correctiveAction?: string;
};
export type InsertAuditFinding = InsertSpcRecord;

// Keep table aliases for any code that still references these
export const spcRecords = spcMeasurements;
export const auditFindings = spcMeasurements;
export const insertAuditFindingSchema = insertSpcMeasurementSchema;
export const insertSpcRecordSchema = insertSpcMeasurementSchema;
