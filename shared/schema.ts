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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertMachineSchema = createInsertSchema(machines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;

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
