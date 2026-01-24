import { 
  type Machine, type InsertMachine,
  type MachineStatus,
  type VsmConfiguration, type InsertVsmConfiguration,
  machines, vsmConfigurations,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Machines
  getMachines(): Promise<Machine[]>;
  getMachine(id: string): Promise<Machine | undefined>;
  createMachine(machine: InsertMachine): Promise<Machine>;
  updateMachine(id: string, updates: Partial<InsertMachine>): Promise<Machine | undefined>;
  updateMachineStatus(id: string, status: MachineStatus): Promise<Machine | undefined>;
  updateMachineStatusUpdate(id: string, statusUpdate: string): Promise<Machine | undefined>;
  deleteMachine(id: string): Promise<boolean>;

  // VSM Configurations
  getVsmConfigurations(): Promise<VsmConfiguration[]>;
  getVsmConfiguration(id: string): Promise<VsmConfiguration | undefined>;
  createVsmConfiguration(config: InsertVsmConfiguration): Promise<VsmConfiguration>;
  updateVsmConfiguration(id: string, updates: Partial<InsertVsmConfiguration>): Promise<VsmConfiguration | undefined>;
  deleteVsmConfiguration(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Machines
  async getMachines(): Promise<Machine[]> {
    return await db.select().from(machines);
  }

  async getMachine(id: string): Promise<Machine | undefined> {
    const result = await db.select().from(machines).where(eq(machines.id, id)).limit(1);
    return result[0];
  }

  async createMachine(machine: InsertMachine): Promise<Machine> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const newMachine = {
      id,
      name: machine.name,
      machineId: machine.machineId,
      status: machine.status as MachineStatus,
      cell: machine.cell ?? null,
      idealCycleTime: machine.idealCycleTime ?? null,
      batchSize: machine.batchSize ?? null,
      uptimePercent: machine.uptimePercent ?? null,
      setupTime: machine.setupTime ?? null,
      statusUpdate: machine.statusUpdate ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(machines).values(newMachine);
    return (await this.getMachine(id))!;
  }

  async updateMachine(id: string, updates: Partial<InsertMachine>): Promise<Machine | undefined> {
    const machine = await this.getMachine(id);
    if (!machine) return undefined;

    const now = new Date().toISOString();
    
    // Build update object carefully, preserving existing values for fields not being updated
    const idealCycleTimeValue = updates.idealCycleTime !== undefined ? updates.idealCycleTime : machine.idealCycleTime;
    const batchSizeValue = updates.batchSize !== undefined ? updates.batchSize : machine.batchSize;
    const uptimePercentValue = updates.uptimePercent !== undefined ? updates.uptimePercent : machine.uptimePercent;
    const setupTimeValue = updates.setupTime !== undefined ? updates.setupTime : machine.setupTime;
    const cellValue = updates.cell !== undefined ? updates.cell : machine.cell;
    
    await db.update(machines)
      .set({
        name: updates.name ?? machine.name,
        machineId: updates.machineId ?? machine.machineId,
        status: (updates.status ?? machine.status) as MachineStatus,
        cell: cellValue,
        statusUpdate: updates.statusUpdate ?? machine.statusUpdate,
        idealCycleTime: idealCycleTimeValue,
        batchSize: batchSizeValue,
        uptimePercent: uptimePercentValue,
        setupTime: setupTimeValue,
        updatedAt: now,
      })
      .where(eq(machines.id, id));

    return (await this.getMachine(id))!;
  }

  async updateMachineStatus(id: string, status: MachineStatus): Promise<Machine | undefined> {
    const machine = await this.getMachine(id);
    if (!machine) return undefined;

    const now = new Date().toISOString();
    await db.update(machines)
      .set({
        status,
        updatedAt: now,
      })
      .where(eq(machines.id, id));

    return (await this.getMachine(id))!;
  }

  async updateMachineStatusUpdate(id: string, statusUpdate: string): Promise<Machine | undefined> {
    const machine = await this.getMachine(id);
    if (!machine) return undefined;

    const now = new Date().toISOString();
    await db.update(machines)
      .set({
        statusUpdate,
        updatedAt: now,
      })
      .where(eq(machines.id, id));

    return (await this.getMachine(id))!;
  }

  async deleteMachine(id: string): Promise<boolean> {
    await db.delete(machines).where(eq(machines.id, id));
    return true;
  }

  // VSM Configuration operations
  async getVsmConfigurations(): Promise<VsmConfiguration[]> {
    return await db.select().from(vsmConfigurations).orderBy(vsmConfigurations.updatedAt);
  }

  async getVsmConfiguration(id: string): Promise<VsmConfiguration | undefined> {
    const result = await db.select().from(vsmConfigurations).where(eq(vsmConfigurations.id, id)).limit(1);
    return result[0];
  }

  async createVsmConfiguration(config: InsertVsmConfiguration): Promise<VsmConfiguration> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(vsmConfigurations).values({
      id,
      ...config,
      createdAt: now,
      updatedAt: now,
    });
    const result = await db.select().from(vsmConfigurations).where(eq(vsmConfigurations.id, id)).limit(1);
    return result[0]!;
  }

  async updateVsmConfiguration(id: string, updates: Partial<InsertVsmConfiguration>): Promise<VsmConfiguration | undefined> {
    const now = new Date().toISOString();
    await db.update(vsmConfigurations).set({
      ...updates,
      updatedAt: now,
    }).where(eq(vsmConfigurations.id, id));
    const result = await db.select().from(vsmConfigurations).where(eq(vsmConfigurations.id, id)).limit(1);
    return result[0];
  }

  async deleteVsmConfiguration(id: string): Promise<boolean> {
    const result = await db.delete(vsmConfigurations).where(eq(vsmConfigurations.id, id));
    return !!result;
  }
}

export const storage = new DatabaseStorage();
