import { 
  type Machine, type InsertMachine,
  type Operator, type InsertOperator,
  type MaintenanceLog, type InsertMaintenanceLog,
  type ProductionStat, type InsertProductionStat,
  type MachineStatus,
  type User,
  type UpsertUser,
  machines, operators, maintenanceLogs, productionStats, users,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

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
      status: machine.status,
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
    await db.update(machines)
      .set({
        name: updates.name ?? machine.name,
        machineId: updates.machineId ?? machine.machineId,
        status: updates.status ?? machine.status,
        operatorId: updates.operatorId !== undefined ? updates.operatorId : machine.operatorId,
        unitsProduced: updates.unitsProduced ?? machine.unitsProduced,
        targetUnits: updates.targetUnits ?? machine.targetUnits,
        cycleTime: updates.cycleTime ?? machine.cycleTime,
        efficiency: updates.efficiency ?? machine.efficiency,
        lastUpdated: `Updated at ${now}`,
        updatedAt: now,
        updatedBy: operatorId ?? null,
      })
      .where(eq(machines.id, id));

    return (await this.getMachine(id))!;
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
      unitsProduced: stat.unitsProduced,
      targetUnits: stat.targetUnits,
      downtime: stat.downtime ?? 0,
      efficiency: stat.efficiency ?? null,
      createdAt: now,
      createdBy: operatorId ?? null,
    });

    return (await db.select().from(productionStats).where(eq(productionStats.id, id)).limit(1))[0]!;
  }
}

export const storage = new DatabaseStorage();
