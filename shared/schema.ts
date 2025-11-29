import { pgTable, text, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Machine status enum
export const machineStatuses = ["running", "idle", "maintenance", "down", "setup"] as const;
export type MachineStatus = typeof machineStatuses[number];

// Operators table
export const operators = pgTable("operators", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  shift: text("shift").notNull(),
});

export const insertOperatorSchema = createInsertSchema(operators).omit({ id: true });
export type InsertOperator = z.infer<typeof insertOperatorSchema>;
export type Operator = typeof operators.$inferSelect;

// Machines table
export const machines = pgTable("machines", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  machineId: text("machine_id").notNull(),
  status: text("status").notNull().$type<MachineStatus>(),
  operatorId: varchar("operator_id"),
  unitsProduced: integer("units_produced").notNull().default(0),
  targetUnits: integer("target_units").notNull().default(100),
  cycleTime: real("cycle_time"),
  efficiency: real("efficiency"),
  lastUpdated: text("last_updated"),
});

export const insertMachineSchema = createInsertSchema(machines).omit({ id: true });
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;

// Maintenance logs table
export const maintenanceLogs = pgTable("maintenance_logs", {
  id: varchar("id").primaryKey(),
  machineId: varchar("machine_id").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  scheduledDate: text("scheduled_date"),
  completedDate: text("completed_date"),
  technician: text("technician"),
  notes: text("notes"),
});

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogs).omit({ id: true });
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;

// Production stats for tracking shift data
export const productionStats = pgTable("production_stats", {
  id: varchar("id").primaryKey(),
  machineId: varchar("machine_id").notNull(),
  shift: text("shift").notNull(),
  date: text("date").notNull(),
  unitsProduced: integer("units_produced").notNull(),
  targetUnits: integer("target_units").notNull(),
  downtime: integer("downtime").default(0),
  efficiency: real("efficiency"),
});

export const insertProductionStatSchema = createInsertSchema(productionStats).omit({ id: true });
export type InsertProductionStat = z.infer<typeof insertProductionStatSchema>;
export type ProductionStat = typeof productionStats.$inferSelect;
