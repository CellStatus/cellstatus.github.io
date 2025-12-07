import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === REPLIT AUTH TABLES ===

// Session storage table (REQUIRED for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (REQUIRED for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// === MANUFACTURING APP TABLES ===

// Machine status enum
export const machineStatuses = ["running", "idle", "maintenance", "down", "setup"] as const;
export type MachineStatus = typeof machineStatuses[number];

// Operators table
export const operators = pgTable("operators", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  shift: text("shift").notNull(),
  password: text("password"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertOperatorSchema = createInsertSchema(operators).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperator = z.infer<typeof insertOperatorSchema>;
export type Operator = typeof operators.$inferSelect;

// Machines table
export const machines = pgTable("machines", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  machineId: text("machine_id").notNull(),
  status: text("status").notNull().$type<MachineStatus>(),
  operatorId: varchar("operator_id"),
  // OEE fields
  idealCycleTime: real("ideal_cycle_time"),
  goodPartsRan: integer("good_parts_ran").default(0),
  scrapParts: integer("scrap_parts").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
});

export const insertMachineSchema = createInsertSchema(machines).omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true });
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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
});

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogs).omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true });
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;

// Production stats for tracking shift data
export const productionStats = pgTable("production_stats", {
  id: varchar("id").primaryKey(),
  machineId: varchar("machine_id").notNull(),
  shift: text("shift").notNull(),
  date: text("date").notNull(),
  goodPartsRan: integer("good_parts_ran").notNull(),
  scrapParts: integer("scrap_parts").default(0),
  idealCycleTime: real("ideal_cycle_time"),
  downtime: integer("downtime").default(0),
  oee: real("oee"),
  availability: real("availability"),
  performance: real("performance"),
  quality: real("quality"),
  createdAt: text("created_at").notNull(),
  createdBy: varchar("created_by"),
});

export const insertProductionStatSchema = createInsertSchema(productionStats).omit({ id: true, createdAt: true, createdBy: true });
export type InsertProductionStat = z.infer<typeof insertProductionStatSchema>;
export type ProductionStat = typeof productionStats.$inferSelect;

// === DOWNTIME TRACKING ===

// Downtime reason categories
export const downtimeCategories = ["mechanical", "electrical", "material", "operator", "quality", "other"] as const;
export type DowntimeCategory = typeof downtimeCategories[number];

// Predefined downtime reason codes with their categories
export const downtimeReasonCodes = {
  // Mechanical
  MECH_BREAKDOWN: { category: "mechanical" as const, label: "Machine breakdown" },
  MECH_TOOLING: { category: "mechanical" as const, label: "Tooling issue/change" },
  MECH_ADJUSTMENT: { category: "mechanical" as const, label: "Machine adjustment needed" },
  MECH_JAM: { category: "mechanical" as const, label: "Material jam" },
  // Electrical
  ELEC_FAILURE: { category: "electrical" as const, label: "Electrical failure" },
  ELEC_SENSOR: { category: "electrical" as const, label: "Sensor malfunction" },
  ELEC_CONTROLS: { category: "electrical" as const, label: "Control system issue" },
  // Material
  MAT_SHORTAGE: { category: "material" as const, label: "Material shortage" },
  MAT_QUALITY: { category: "material" as const, label: "Material quality issue" },
  MAT_CHANGEOVER: { category: "material" as const, label: "Material changeover" },
  // Operator
  OP_BREAK: { category: "operator" as const, label: "Scheduled break" },
  OP_TRAINING: { category: "operator" as const, label: "Training" },
  OP_UNAVAILABLE: { category: "operator" as const, label: "Operator unavailable" },
  OP_MEETING: { category: "operator" as const, label: "Meeting" },
  // Quality
  QUAL_INSPECTION: { category: "quality" as const, label: "Quality inspection hold" },
  QUAL_REWORK: { category: "quality" as const, label: "Rework required" },
  QUAL_CALIBRATION: { category: "quality" as const, label: "Calibration needed" },
  // Other
  OTHER_PLANNED: { category: "other" as const, label: "Planned downtime" },
  OTHER_UNPLANNED: { category: "other" as const, label: "Unplanned (other)" },
  OTHER_UTILITIES: { category: "other" as const, label: "Utilities issue (power, air, etc.)" },
} as const;

export type DowntimeReasonCode = keyof typeof downtimeReasonCodes;

// Downtime logs table
export const downtimeLogs = pgTable("downtime_logs", {
  id: varchar("id").primaryKey(),
  machineId: varchar("machine_id").notNull(),
  reasonCode: text("reason_code").notNull().$type<DowntimeReasonCode>(),
  reasonCategory: text("reason_category").notNull().$type<DowntimeCategory>(),
  description: text("description"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  duration: integer("duration"), // in minutes
  reportedBy: text("reported_by"),
  resolvedBy: text("resolved_by"),
  createdAt: text("created_at").notNull(),
});

export const insertDowntimeLogSchema = createInsertSchema(downtimeLogs)
  .omit({ id: true, createdAt: true })
  .refine(
    (data) => !data.startTime || new Date(data.startTime).getTime() <= Date.now(),
    { message: "Start time cannot be in the future", path: ["startTime"] }
  )
  .refine(
    (data) => !data.endTime || new Date(data.endTime).getTime() <= Date.now(),
    { message: "End time cannot be in the future", path: ["endTime"] }
  )
  .refine(
    (data) => {
      if (!data.startTime || !data.endTime) return true;
      return new Date(data.endTime).getTime() >= new Date(data.startTime).getTime();
    },
    { message: "End time must be after start time", path: ["endTime"] }
  );
export type InsertDowntimeLog = z.infer<typeof insertDowntimeLogSchema>;
export type DowntimeLog = typeof downtimeLogs.$inferSelect;

// === EVENTS ===

export const events = pgTable("events", {
  id: varchar("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: varchar("created_by"),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const eventTasks = pgTable("event_tasks", {
  id: varchar("id").primaryKey(),
  eventId: varchar("event_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status").default("pending"),
  assigneeId: varchar("assignee_id"), // operatorId
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertEventTaskSchema = createInsertSchema(eventTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventTask = z.infer<typeof insertEventTaskSchema>;
export type EventTask = typeof eventTasks.$inferSelect;

export const eventMembers = pgTable("event_members", {
  id: varchar("id").primaryKey(),
  eventId: varchar("event_id").notNull(),
  operatorId: varchar("operator_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertEventMemberSchema = createInsertSchema(eventMembers).omit({ id: true, createdAt: true });
export type InsertEventMember = z.infer<typeof insertEventMemberSchema>;
export type EventMember = typeof eventMembers.$inferSelect;

// === MANUFACTURING CELLS ===

// Manufacturing cells table
export const cells = pgTable("cells", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetOee: real("target_oee").default(85),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
});

export const insertCellSchema = createInsertSchema(cells).omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true });
export type InsertCell = z.infer<typeof insertCellSchema>;
export type Cell = typeof cells.$inferSelect;

// Cell machines assignment table
export const cellMachines = pgTable("cell_machines", {
  id: varchar("id").primaryKey(),
  cellId: varchar("cell_id").notNull(),
  machineId: varchar("machine_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertCellMachineSchema = createInsertSchema(cellMachines).omit({ id: true, createdAt: true });
export type InsertCellMachine = z.infer<typeof insertCellMachineSchema>;
export type CellMachine = typeof cellMachines.$inferSelect;
