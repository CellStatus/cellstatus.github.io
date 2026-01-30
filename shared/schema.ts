import { pgTable, text, varchar, integer, real, jsonb } from "drizzle-orm/pg-core";
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
  // VSM fields
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

// === VALUE STREAM MAPPING ===

// VSM configurations table - stores value stream maps
export const vsmConfigurations = pgTable("vsm_configurations", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("active"), // Cell status: active, idle, down, etc.
  stationsJson: jsonb("stations_json").notNull(), // Array of VSM stations with machine links
  bottleneckRate: real("bottleneck_rate"), // System throughput in units/sec
  processEfficiency: real("process_efficiency"), // Overall efficiency percentage
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertVsmConfigurationSchema = createInsertSchema(vsmConfigurations).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
});
export type InsertVsmConfiguration = z.infer<typeof insertVsmConfigurationSchema>;
export type VsmConfiguration = typeof vsmConfigurations.$inferSelect;

// === AUDIT FINDINGS ===

export const auditFindings = pgTable("audit_findings", {
  id: varchar("id").primaryKey(),
  machineId: varchar("machine_id").notNull(),
  characteristic: text("characteristic").notNull(),
  status: text("status").default("open"),
  partNumber: text("part_number"),
  partName: text("part_name"),
  charNumber: text("char_number"),
  charName: text("char_name"),
  charMax: text("char_max"),
  charMin: text("char_min"),
  tolerance: text("tolerance"),
  measuredValue: text("measured_value").notNull(),
  correctiveAction: text("corrective_action"),
  createdAt: text("created_at").notNull(),
});

export const insertAuditFindingSchema = createInsertSchema(auditFindings).omit({ id: true, createdAt: true });
export type InsertAuditFinding = z.infer<typeof insertAuditFindingSchema>;
export type AuditFinding = typeof auditFindings.$inferSelect;
