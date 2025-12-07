import { 
  type Machine, type InsertMachine,
  type Operator, type InsertOperator,
  type MaintenanceLog, type InsertMaintenanceLog,
  type ProductionStat, type InsertProductionStat,
  type DowntimeLog, type InsertDowntimeLog,
  type MachineStatus,
  type DowntimeReasonCode,
  type DowntimeCategory,
  type User,
  type UpsertUser,
  machines, operators, maintenanceLogs, productionStats, users, downtimeLogs,
  events, eventTasks, eventMembers,
} from "@shared/schema";
import type { 
  Event as EventEntity, InsertEvent as InsertEventEntity,
  EventTask as EventTaskEntity, InsertEventTask as InsertEventTaskEntity,
  EventMember as EventMemberEntity, InsertEventMember as InsertEventMemberEntity,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, isNull, inArray } from "drizzle-orm";

export interface IStorage {
  // Users (REQUIRED for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Machines
  getMachines(): Promise<Machine[]>;
  getMachine(id: string): Promise<Machine | undefined>;
  createMachine(machine: InsertMachine, operatorId?: string): Promise<Machine>;
  updateMachine(id: string, updates: Partial<InsertMachine>, operatorId?: string): Promise<Machine | undefined>;
  updateMachineStatus(id: string, status: MachineStatus, operatorId?: string): Promise<Machine | undefined>;
  updateMachineOperator(id: string, operatorId: string | null): Promise<Machine | undefined>;
  updateMachineStatusUpdate(id: string, statusUpdate: string, operatorId?: string): Promise<Machine | undefined>;
  deleteMachine(id: string): Promise<boolean>;

  // Operators
  getOperators(): Promise<Operator[]>;
  getOperator(id: string): Promise<Operator | undefined>;
  getOperatorByInitials(initials: string): Promise<Operator | undefined>;
  createOperator(operator: InsertOperator): Promise<Operator>;
  updateOperator(id: string, updates: Partial<InsertOperator>): Promise<Operator | undefined>;
  deleteOperator(id: string): Promise<boolean>;

  // Maintenance Logs
  getMaintenanceLogs(): Promise<MaintenanceLog[]>;
  getMaintenanceLog(id: string): Promise<MaintenanceLog | undefined>;
  getMaintenanceLogsByMachine(machineId: string): Promise<MaintenanceLog[]>;
  createMaintenanceLog(log: InsertMaintenanceLog, operatorId?: string): Promise<MaintenanceLog>;
  updateMaintenanceLog(id: string, updates: Partial<InsertMaintenanceLog>, operatorId?: string): Promise<MaintenanceLog | undefined>;
  deleteMaintenanceLog(id: string): Promise<boolean>;

  // Production Stats
  getProductionStats(): Promise<ProductionStat[]>;
  getProductionStatsByMachine(machineId: string): Promise<ProductionStat[]>;
  createProductionStat(stat: InsertProductionStat, operatorId?: string): Promise<ProductionStat>;
  deleteProductionStat(id: string): Promise<boolean>;
  deleteProductionStatsByMachineAndDate(machineId: string, date: string): Promise<number>;
  deleteProductionStatsByMachineDateShift(machineId: string, date: string, shift: string): Promise<number>;

  // Downtime Logs
  getDowntimeLogs(): Promise<DowntimeLog[]>;
  getDowntimeLog(id: string): Promise<DowntimeLog | undefined>;
  getDowntimeLogsByMachine(machineId: string): Promise<DowntimeLog[]>;
  getActiveDowntimeLogs(): Promise<DowntimeLog[]>;
  createDowntimeLog(log: InsertDowntimeLog): Promise<DowntimeLog>;
  updateDowntimeLog(id: string, updates: Partial<InsertDowntimeLog>): Promise<DowntimeLog | undefined>;
  deleteDowntimeLog(id: string): Promise<boolean>;

  // Events
  getEvents(): Promise<EventEntity[]>;
  getEvent(id: string): Promise<EventEntity | undefined>;
  createEvent(event: InsertEventEntity, createdBy?: string): Promise<EventEntity>;
  updateEvent(id: string, updates: Partial<InsertEventEntity>): Promise<EventEntity | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  // Event Tasks
  getEventTasks(eventId: string): Promise<EventTaskEntity[]>;
  createEventTask(task: InsertEventTaskEntity): Promise<EventTaskEntity>;
  updateEventTask(id: string, updates: Partial<InsertEventTaskEntity>): Promise<EventTaskEntity | undefined>;
  deleteEventTask(id: string): Promise<boolean>;
  // Event Members
  getEventMembers(eventId: string): Promise<EventMemberEntity[]>;
  addEventMember(member: InsertEventMemberEntity): Promise<EventMemberEntity>;
  removeEventMember(eventId: string, operatorId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations (REQUIRED for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const now = new Date();
    const existing = await this.getUser(userData.id);
    
    if (existing) {
      await db.update(users)
        .set({
          email: userData.email ?? existing.email,
          firstName: userData.firstName ?? existing.firstName,
          lastName: userData.lastName ?? existing.lastName,
          profileImageUrl: userData.profileImageUrl ?? existing.profileImageUrl,
          updatedAt: now,
        })
        .where(eq(users.id, userData.id));
      
      const updated = await this.getUser(userData.id);
      return updated!;
    } else {
      await db.insert(users).values({
        id: userData.id,
        email: userData.email ?? null,
        firstName: userData.firstName ?? null,
        lastName: userData.lastName ?? null,
        profileImageUrl: userData.profileImageUrl ?? null,
        createdAt: now,
        updatedAt: now,
      });
      
      return (await this.getUser(userData.id))!;
    }
  }

  // Machines
  async getMachines(): Promise<Machine[]> {
    return await db.select().from(machines);
  }

  async getMachine(id: string): Promise<Machine | undefined> {
    const result = await db.select().from(machines).where(eq(machines.id, id)).limit(1);
    return result[0];
  }

  async createMachine(machine: InsertMachine, operatorId?: string): Promise<Machine> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const newMachine = {
      id,
      name: machine.name,
      machineId: machine.machineId,
      status: machine.status as MachineStatus,
      operatorId: machine.operatorId ?? null,
      unitsProduced: machine.unitsProduced ?? 0,
      targetUnits: machine.targetUnits ?? 100,
      cycleTime: machine.cycleTime ?? null,
      efficiency: machine.efficiency ?? null,
      lastUpdated: `Created at ${now}`,
      createdAt: now,
      updatedAt: now,
      createdBy: operatorId ?? null,
      updatedBy: null,
    };

    await db.insert(machines).values(newMachine);
    return (await this.getMachine(id))!;
  }

  async updateMachine(id: string, updates: Partial<InsertMachine>, operatorId?: string): Promise<Machine | undefined> {
    const machine = await this.getMachine(id);
    if (!machine) return undefined;

    const now = new Date().toISOString();
    
    // Build update object carefully, preserving existing values for fields not being updated
    const goodPartsRanValue = updates.goodPartsRan !== undefined ? updates.goodPartsRan : machine.goodPartsRan;
    const scrapPartsValue = updates.scrapParts !== undefined ? updates.scrapParts : machine.scrapParts;
    const idealCycleTimeValue = updates.idealCycleTime !== undefined ? updates.idealCycleTime : machine.idealCycleTime;
    
    console.log('[updateMachine] About to set OEE fields:', { goodPartsRan: goodPartsRanValue, scrapParts: scrapPartsValue, idealCycleTime: idealCycleTimeValue });
    
    await db.update(machines)
      .set({
        name: updates.name ?? machine.name,
        machineId: updates.machineId ?? machine.machineId,
        status: (updates.status ?? machine.status) as MachineStatus,
        operatorId: updates.operatorId ?? machine.operatorId,
        statusUpdate: updates.statusUpdate ?? machine.statusUpdate,
        idealCycleTime: idealCycleTimeValue,
        goodPartsRan: goodPartsRanValue,
        scrapParts: scrapPartsValue,
        lastUpdated: `Updated at ${now}`,
        updatedAt: now,
        updatedBy: operatorId ?? null,
      })
      .where(eq(machines.id, id));

    const updated = await this.getMachine(id);
    console.log('[updateMachine] Verification after update:', { id: updated?.id, idealCycleTime: updated?.idealCycleTime, goodPartsRan: updated?.goodPartsRan, scrapParts: updated?.scrapParts });
    
    return updated!;
  }

  async updateMachineStatus(id: string, status: MachineStatus, operatorId?: string): Promise<Machine | undefined> {
    const machine = await this.getMachine(id);
    if (!machine) return undefined;

    const now = new Date().toISOString();
    await db.update(machines)
      .set({
        status,
        lastUpdated: "Just now",
        updatedAt: now,
        updatedBy: operatorId ?? null,
      })
      .where(eq(machines.id, id));

    return (await this.getMachine(id))!;
  }

  async updateMachineOperator(id: string, operatorId: string | null): Promise<Machine | undefined> {
    const machine = await this.getMachine(id);
    if (!machine) return undefined;

    const now = new Date().toISOString();
    await db.update(machines)
      .set({
        operatorId,
        lastUpdated: "Just now",
        updatedAt: now,
        updatedBy: operatorId ?? null,
      })
      .where(eq(machines.id, id));

    return (await this.getMachine(id))!;
  }

  async updateMachineStatusUpdate(id: string, statusUpdate: string, operatorId?: string): Promise<Machine | undefined> {
    const machine = await this.getMachine(id);
    if (!machine) return undefined;

    const now = new Date().toISOString();
    await db.update(machines)
      .set({
        statusUpdate,
        lastUpdated: "Just now",
        updatedAt: now,
        updatedBy: operatorId ?? null,
      })
      .where(eq(machines.id, id));

    return (await this.getMachine(id))!;
  }

  async deleteMachine(id: string): Promise<boolean> {
    const result = await db.delete(machines).where(eq(machines.id, id));
    return true;
  }

  // Operators
  async getOperators(): Promise<Operator[]> {
    return await db.select().from(operators);
  }

  async getOperator(id: string): Promise<Operator | undefined> {
    const result = await db.select().from(operators).where(eq(operators.id, id)).limit(1);
    return result[0];
  }

  async getOperatorByInitials(initials: string): Promise<Operator | undefined> {
    const result = await db.select().from(operators).limit(100);
    return result.find(op => op.initials.toUpperCase() === initials.toUpperCase());
  }

  async createOperator(operator: InsertOperator): Promise<Operator> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.insert(operators).values({
      id,
      name: operator.name,
      initials: operator.initials,
      shift: operator.shift,
      password: operator.password ?? "",
      createdAt: now,
      updatedAt: now,
    });

    return (await this.getOperator(id))!;
  }

  async updateOperator(id: string, updates: Partial<InsertOperator>): Promise<Operator | undefined> {
    const operator = await this.getOperator(id);
    if (!operator) return undefined;

    const now = new Date().toISOString();
    await db.update(operators)
      .set({
        name: updates.name ?? operator.name,
        initials: updates.initials ?? operator.initials,
        shift: updates.shift ?? operator.shift,
        password: updates.password ?? operator.password,
        updatedAt: now,
      })
      .where(eq(operators.id, id));

    return (await this.getOperator(id))!;
  }

  async deleteOperator(id: string): Promise<boolean> {
    // Unassign this operator from any machines
    const allMachines = await this.getMachines();
    for (const machine of allMachines) {
      if (machine.operatorId === id) {
        await db.update(machines)
          .set({ operatorId: null })
          .where(eq(machines.id, machine.id));
      }
    }

    await db.delete(operators).where(eq(operators.id, id));
    return true;
  }

  // Maintenance Logs
  async getMaintenanceLogs(): Promise<MaintenanceLog[]> {
    return await db.select().from(maintenanceLogs);
  }

  async getMaintenanceLog(id: string): Promise<MaintenanceLog | undefined> {
    const result = await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.id, id)).limit(1);
    return result[0];
  }

  async getMaintenanceLogsByMachine(machineId: string): Promise<MaintenanceLog[]> {
    return await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.machineId, machineId));
  }

  async createMaintenanceLog(log: InsertMaintenanceLog, operatorId?: string): Promise<MaintenanceLog> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.insert(maintenanceLogs).values({
      id,
      machineId: log.machineId,
      type: log.type,
      description: log.description,
      status: log.status,
      scheduledDate: log.scheduledDate ?? null,
      completedDate: log.completedDate ?? null,
      technician: log.technician ?? null,
      notes: log.notes ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: operatorId ?? null,
      updatedBy: null,
    });

    // If maintenance is in-progress, update machine status
    if (log.status === "in-progress") {
      const machine = await this.getMachine(log.machineId);
      if (machine) {
        await this.updateMachineStatus(log.machineId, "maintenance", operatorId);
      }
    }

    return (await this.getMaintenanceLog(id))!;
  }

  async updateMaintenanceLog(id: string, updates: Partial<InsertMaintenanceLog>, operatorId?: string): Promise<MaintenanceLog | undefined> {
    const log = await this.getMaintenanceLog(id);
    if (!log) return undefined;

    const now = new Date().toISOString();
    await db.update(maintenanceLogs)
      .set({
        machineId: updates.machineId ?? log.machineId,
        type: updates.type ?? log.type,
        description: updates.description ?? log.description,
        status: updates.status ?? log.status,
        scheduledDate: updates.scheduledDate ?? log.scheduledDate,
        completedDate: updates.completedDate ?? log.completedDate,
        technician: updates.technician ?? log.technician,
        notes: updates.notes ?? log.notes,
        updatedAt: now,
        updatedBy: operatorId ?? null,
      })
      .where(eq(maintenanceLogs.id, id));

    return (await this.getMaintenanceLog(id))!;
  }

  async deleteMaintenanceLog(id: string): Promise<boolean> {
    await db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, id));
    return true;
  }

  // Production Stats
  async getProductionStats(): Promise<ProductionStat[]> {
    return await db.select().from(productionStats);
  }

  async getProductionStatsByMachine(machineId: string): Promise<ProductionStat[]> {
    return await db.select().from(productionStats).where(eq(productionStats.machineId, machineId));
  }

  async createProductionStat(stat: InsertProductionStat, operatorId?: string): Promise<ProductionStat> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.insert(productionStats).values({
      id,
      machineId: stat.machineId,
      shift: stat.shift,
      date: stat.date,
      goodPartsRan: typeof stat.goodPartsRan === "number" && Number.isFinite(stat.goodPartsRan) ? stat.goodPartsRan : 0,
      scrapParts: typeof stat.scrapParts === "number" && Number.isFinite(stat.scrapParts) ? stat.scrapParts : 0,
      idealCycleTime: typeof stat.idealCycleTime === "number" && Number.isFinite(stat.idealCycleTime) ? stat.idealCycleTime : 0,
      downtime: typeof stat.downtime === "number" && Number.isFinite(stat.downtime) ? stat.downtime : 0,
      oee: typeof stat.oee === "number" && Number.isFinite(stat.oee) ? stat.oee : 0,
      availability: typeof stat.availability === "number" && Number.isFinite(stat.availability) ? stat.availability : 0,
      performance: typeof stat.performance === "number" && Number.isFinite(stat.performance) ? stat.performance : 0,
      quality: typeof stat.quality === "number" && Number.isFinite(stat.quality) ? stat.quality : 0,
      createdAt: now,
      createdBy: operatorId ?? null,
    });

    return (await db.select().from(productionStats).where(eq(productionStats.id, id)).limit(1))[0]!;
  }

  async deleteProductionStat(id: string): Promise<boolean> {
    await db.delete(productionStats).where(eq(productionStats.id, id));
    return true;
  }

  async deleteProductionStatsByMachineAndDate(machineId: string, date: string): Promise<number> {
    // Defensive: fetch and filter in JS to avoid subtle text/date compare issues
    const allForMachine = await db
      .select({ id: productionStats.id, date: productionStats.date })
      .from(productionStats)
      .where(eq(productionStats.machineId, machineId));

    const idsToDelete = allForMachine.filter(s => s.date === date).map(s => s.id);
    if (idsToDelete.length === 0) {
      return 0;
    }

    await db.delete(productionStats).where(inArray(productionStats.id, idsToDelete));
    return idsToDelete.length;
  }

  async deleteProductionStatsByMachineDateShift(machineId: string, date: string, shift: string): Promise<number> {
      console.log("Storage delete with:", { machineId, date, shift });
    const toDelete = await db
      .select({ id: productionStats.id })
      .from(productionStats)
      .where(and(eq(productionStats.machineId, machineId), eq(productionStats.date, date), eq(productionStats.shift, shift)));
  console.log("Found to delete:", toDelete.length, toDelete);
    await db
      .delete(productionStats)
      .where(and(eq(productionStats.machineId, machineId), eq(productionStats.date, date), eq(productionStats.shift, shift)));
  console.log("Delete completed");
    return toDelete.length;
  }

  // Downtime Logs
  async getDowntimeLogs(): Promise<DowntimeLog[]> {
    return await db.select().from(downtimeLogs);
  }

  async getDowntimeLog(id: string): Promise<DowntimeLog | undefined> {
    const result = await db.select().from(downtimeLogs).where(eq(downtimeLogs.id, id)).limit(1);
    return result[0];
  }

  async getDowntimeLogsByMachine(machineId: string): Promise<DowntimeLog[]> {
    return await db.select().from(downtimeLogs).where(eq(downtimeLogs.machineId, machineId));
  }

  async getActiveDowntimeLogs(): Promise<DowntimeLog[]> {
    return await db.select().from(downtimeLogs).where(isNull(downtimeLogs.endTime));
  }

  async createDowntimeLog(log: InsertDowntimeLog): Promise<DowntimeLog> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.insert(downtimeLogs).values({
      id,
      machineId: log.machineId,
      reasonCode: log.reasonCode as DowntimeReasonCode,
      reasonCategory: log.reasonCategory as DowntimeCategory,
      description: log.description ?? null,
      startTime: log.startTime,
      endTime: log.endTime ?? null,
      duration: log.duration ?? null,
      reportedBy: log.reportedBy ?? null,
      resolvedBy: log.resolvedBy ?? null,
      createdAt: now,
    });

    return (await this.getDowntimeLog(id))!;
  }

  async updateDowntimeLog(id: string, updates: Partial<InsertDowntimeLog>): Promise<DowntimeLog | undefined> {
    const log = await this.getDowntimeLog(id);
    if (!log) return undefined;

    // Calculate duration if endTime is being set and startTime exists
    let duration = updates.duration ?? log.duration;
    if (updates.endTime && log.startTime) {
      const start = new Date(log.startTime).getTime();
      const end = new Date(updates.endTime).getTime();
      duration = Math.round((end - start) / 60000); // Convert ms to minutes
    }

    await db.update(downtimeLogs)
      .set({
        machineId: updates.machineId ?? log.machineId,
        reasonCode: (updates.reasonCode ?? log.reasonCode) as DowntimeReasonCode,
        reasonCategory: (updates.reasonCategory ?? log.reasonCategory) as DowntimeCategory,
        description: updates.description !== undefined ? updates.description : log.description,
        startTime: updates.startTime ?? log.startTime,
        endTime: updates.endTime !== undefined ? updates.endTime : log.endTime,
        duration: duration,
        reportedBy: updates.reportedBy !== undefined ? updates.reportedBy : log.reportedBy,
        resolvedBy: updates.resolvedBy !== undefined ? updates.resolvedBy : log.resolvedBy,
      })
      .where(eq(downtimeLogs.id, id));

    return (await this.getDowntimeLog(id))!;
  }

  async deleteDowntimeLog(id: string): Promise<boolean> {
    await db.delete(downtimeLogs).where(eq(downtimeLogs.id, id));
    return true;
  }

  async clearAllDowntimeLogs(): Promise<number> {
    // Use Neon pool directly to ensure execution
    const { pool } = await import("./db");
    const beforeRes = await pool.query("SELECT id FROM downtime_logs");
    const beforeCount = beforeRes.rowCount ?? beforeRes.rows.length;
    await pool.query("DELETE FROM downtime_logs");
    const afterRes = await pool.query("SELECT id FROM downtime_logs");
    const afterCount = afterRes.rowCount ?? afterRes.rows.length;
    return beforeCount - afterCount;
  }

  // Events
  async getEvents(): Promise<EventEntity[]> {
    return await db.select().from(events);
  }

  async getEvent(id: string): Promise<EventEntity | undefined> {
    const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
    return result[0];
  }

  async createEvent(event: InsertEventEntity, createdBy?: string): Promise<EventEntity> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(events).values({
      id,
      title: event.title,
      description: event.description ?? null,
      startDate: event.startDate ?? null,
      endDate: event.endDate ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy ?? null,
    });
    return (await this.getEvent(id))!;
  }

  async updateEvent(id: string, updates: Partial<InsertEventEntity>): Promise<EventEntity | undefined> {
    const ev = await this.getEvent(id);
    if (!ev) return undefined;
    const now = new Date().toISOString();
    await db.update(events)
      .set({
        title: updates.title ?? (ev as any).title,
        description: updates.description !== undefined ? updates.description : (ev as any).description,
        startDate: updates.startDate ?? (ev as any).startDate,
        endDate: updates.endDate ?? (ev as any).endDate,
        updatedAt: now,
      })
      .where(eq(events.id, id));
    return (await this.getEvent(id))!;
  }

  async deleteEvent(id: string): Promise<boolean> {
    // Cascade delete tasks and members
    await db.delete(eventTasks).where(eq(eventTasks.eventId, id));
    await db.delete(eventMembers).where(eq(eventMembers.eventId, id));
    await db.delete(events).where(eq(events.id, id));
    return true;
  }

  // Event Tasks
  async getEventTasks(eventId: string): Promise<EventTaskEntity[]> {
    return await db.select().from(eventTasks).where(eq(eventTasks.eventId, eventId));
  }

  async createEventTask(task: InsertEventTaskEntity): Promise<EventTaskEntity> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(eventTasks).values({
      id,
      eventId: task.eventId,
      title: task.title,
      description: task.description ?? null,
      startDate: task.startDate ?? null,
      endDate: task.endDate ?? null,
      status: task.status ?? "pending",
      assigneeId: task.assigneeId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const result = await db.select().from(eventTasks).where(eq(eventTasks.id, id)).limit(1);
    return result[0]!;
  }

  async updateEventTask(id: string, updates: Partial<InsertEventTaskEntity>): Promise<EventTaskEntity | undefined> {
    const current = await db.select().from(eventTasks).where(eq(eventTasks.id, id)).limit(1);
    const task = current[0];
    if (!task) return undefined;
    const now = new Date().toISOString();
    await db.update(eventTasks)
      .set({
        title: updates.title ?? task.title,
        description: updates.description !== undefined ? updates.description : task.description,
        startDate: updates.startDate ?? task.startDate,
        endDate: updates.endDate ?? task.endDate,
        status: updates.status ?? task.status,
        assigneeId: updates.assigneeId !== undefined ? updates.assigneeId : task.assigneeId,
        updatedAt: now,
      })
      .where(eq(eventTasks.id, id));
    const result = await db.select().from(eventTasks).where(eq(eventTasks.id, id)).limit(1);
    return result[0]!;
  }

  async deleteEventTask(id: string): Promise<boolean> {
    await db.delete(eventTasks).where(eq(eventTasks.id, id));
    return true;
  }

  // Event Members
  async getEventMembers(eventId: string): Promise<EventMemberEntity[]> {
    return await db.select().from(eventMembers).where(eq(eventMembers.eventId, eventId));
  }

  async addEventMember(member: InsertEventMemberEntity): Promise<EventMemberEntity> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(eventMembers).values({
      id,
      eventId: member.eventId,
      operatorId: member.operatorId,
      createdAt: now,
    });
    const result = await db.select().from(eventMembers).where(eq(eventMembers.id, id)).limit(1);
    return result[0]!;
  }

  async removeEventMember(eventId: string, operatorId: string): Promise<boolean> {
    await db.delete(eventMembers).where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.operatorId, operatorId)));
    return true;
  }
}

export const storage = new DatabaseStorage();
