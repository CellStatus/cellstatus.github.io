import { 
  type Machine, type InsertMachine,
  type Operator, type InsertOperator,
  type MaintenanceLog, type InsertMaintenanceLog,
  type ProductionStat, type InsertProductionStat,
  type MachineStatus,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
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

export class MemStorage implements IStorage {
  private machines: Map<string, Machine>;
  private operators: Map<string, Operator>;
  private maintenanceLogs: Map<string, MaintenanceLog>;
  private productionStats: Map<string, ProductionStat>;

  constructor() {
    this.machines = new Map();
    this.operators = new Map();
    this.maintenanceLogs = new Map();
    this.productionStats = new Map();
    
    // Add sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    const now = new Date().toISOString();
    
    // Sample operators
    const operators: Operator[] = [
      { id: "op-1", name: "John Smith", initials: "JS", shift: "Day", password: "123456", createdAt: now, updatedAt: now },
      { id: "op-2", name: "Maria Garcia", initials: "MG", shift: "Day", password: "123456", createdAt: now, updatedAt: now },
      { id: "op-3", name: "Mike Johnson", initials: "MJ", shift: "Swing", password: "123456", createdAt: now, updatedAt: now },
      { id: "op-4", name: "Sarah Chen", initials: "SC", shift: "Night", password: "123456", createdAt: now, updatedAt: now },
    ];
    operators.forEach(op => this.operators.set(op.id, op));

    // Sample machines
    const machines: Machine[] = [
      { 
        id: "m-1", 
        name: "CNC Mill #1", 
        machineId: "M-001", 
        status: "running", 
        operatorId: "op-1",
        unitsProduced: 85,
        targetUnits: 100,
        cycleTime: 45.2,
        efficiency: 92,
        lastUpdated: "2 min ago",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-1",
        updatedBy: "op-1"
      },
      { 
        id: "m-2", 
        name: "CNC Mill #2", 
        machineId: "M-002", 
        status: "running", 
        operatorId: "op-2",
        unitsProduced: 72,
        targetUnits: 100,
        cycleTime: 48.5,
        efficiency: 88,
        lastUpdated: "5 min ago",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-2",
        updatedBy: "op-2"
      },
      { 
        id: "m-3", 
        name: "Lathe #1", 
        machineId: "L-001", 
        status: "idle", 
        operatorId: null,
        unitsProduced: 45,
        targetUnits: 80,
        cycleTime: 32.1,
        efficiency: 75,
        lastUpdated: "15 min ago",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-3",
        updatedBy: null
      },
      { 
        id: "m-4", 
        name: "Press #1", 
        machineId: "P-001", 
        status: "maintenance", 
        operatorId: null,
        unitsProduced: 0,
        targetUnits: 150,
        cycleTime: null,
        efficiency: null,
        lastUpdated: "1 hour ago",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-4",
        updatedBy: null
      },
      { 
        id: "m-5", 
        name: "Welder #1", 
        machineId: "W-001", 
        status: "running", 
        operatorId: "op-3",
        unitsProduced: 120,
        targetUnits: 100,
        cycleTime: 28.7,
        efficiency: 95,
        lastUpdated: "1 min ago",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-3",
        updatedBy: "op-3"
      },
      { 
        id: "m-6", 
        name: "Assembly Station", 
        machineId: "A-001", 
        status: "setup", 
        operatorId: "op-4",
        unitsProduced: 0,
        targetUnits: 50,
        cycleTime: null,
        efficiency: null,
        lastUpdated: "30 min ago",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-4",
        updatedBy: "op-4"
      },
    ];
    machines.forEach(m => this.machines.set(m.id, m));

    // Sample maintenance logs
    const maintenanceLogs: MaintenanceLog[] = [
      {
        id: "ml-1",
        machineId: "m-4",
        type: "corrective",
        description: "Hydraulic system leak repair",
        status: "in-progress",
        scheduledDate: "2024-01-15",
        completedDate: null,
        technician: "Bob Wilson",
        notes: "Waiting for replacement seals",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-1",
        updatedBy: null
      },
      {
        id: "ml-2",
        machineId: "m-1",
        type: "preventive",
        description: "Monthly spindle inspection",
        status: "scheduled",
        scheduledDate: "2024-01-20",
        completedDate: null,
        technician: "Tom Davis",
        notes: null,
        createdAt: now,
        updatedAt: now,
        createdBy: "op-2",
        updatedBy: null
      },
      {
        id: "ml-3",
        machineId: "m-2",
        type: "inspection",
        description: "Tool wear assessment",
        status: "completed",
        scheduledDate: "2024-01-10",
        completedDate: "2024-01-10",
        technician: "Tom Davis",
        notes: "All tools within tolerance",
        createdAt: now,
        updatedAt: now,
        createdBy: "op-3",
        updatedBy: "op-3"
      },
    ];
    maintenanceLogs.forEach(ml => this.maintenanceLogs.set(ml.id, ml));
  }

  // Machines
  async getMachines(): Promise<Machine[]> {
    return Array.from(this.machines.values());
  }

  async getMachine(id: string): Promise<Machine | undefined> {
    return this.machines.get(id);
  }

  async createMachine(machine: InsertMachine, operatorId?: string): Promise<Machine> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newMachine: Machine = { 
      ...machine, 
      id,
      unitsProduced: machine.unitsProduced ?? 0,
      targetUnits: machine.targetUnits ?? 100,
      cycleTime: machine.cycleTime ?? null,
      efficiency: machine.efficiency ?? null,
      operatorId: machine.operatorId ?? null,
      lastUpdated: `Created at ${now}`,
      createdAt: now,
      updatedAt: now,
      createdBy: operatorId ?? null,
      updatedBy: null
    };
    this.machines.set(id, newMachine);
    return newMachine;
  }

  async updateMachine(id: string, updates: Partial<InsertMachine>, operatorId?: string): Promise<Machine | undefined> {
    const machine = this.machines.get(id);
    if (!machine) return undefined;
    
    const now = new Date().toISOString();
    const updatedMachine: Machine = { 
      ...machine, 
      ...updates,
      lastUpdated: `Updated at ${now}`,
      updatedAt: now,
      updatedBy: operatorId ?? null
    };
    this.machines.set(id, updatedMachine);
    return updatedMachine;
  }

  async updateMachineStatus(id: string, status: MachineStatus, operatorId?: string): Promise<Machine | undefined> {
    const machine = this.machines.get(id);
    if (!machine) return undefined;
    
    const now = new Date().toISOString();
    const updatedMachine: Machine = { 
      ...machine, 
      status,
      lastUpdated: "Just now",
      updatedAt: now,
      updatedBy: operatorId ?? null
    };
    this.machines.set(id, updatedMachine);
    return updatedMachine;
  }

  async updateMachineOperator(id: string, operatorId: string | null): Promise<Machine | undefined> {
    const machine = this.machines.get(id);
    if (!machine) return undefined;
    
    const now = new Date().toISOString();
    const updatedMachine: Machine = { 
      ...machine, 
      operatorId,
      lastUpdated: "Just now",
      updatedAt: now,
      updatedBy: operatorId ?? null
    };
    this.machines.set(id, updatedMachine);
    return updatedMachine;
  }

  async deleteMachine(id: string): Promise<boolean> {
    return this.machines.delete(id);
  }

  // Operators
  async getOperators(): Promise<Operator[]> {
    return Array.from(this.operators.values());
  }

  async getOperator(id: string): Promise<Operator | undefined> {
    return this.operators.get(id);
  }

  async getOperatorByInitials(initials: string): Promise<Operator | undefined> {
    return Array.from(this.operators.values()).find(op => op.initials.toUpperCase() === initials.toUpperCase());
  }

  async createOperator(operator: InsertOperator): Promise<Operator> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newOperator: Operator = { 
      ...operator, 
      id,
      password: operator.password ?? "",
      createdAt: now,
      updatedAt: now
    };
    this.operators.set(id, newOperator);
    return newOperator;
  }

  async updateOperator(id: string, updates: Partial<InsertOperator>): Promise<Operator | undefined> {
    const operator = this.operators.get(id);
    if (!operator) return undefined;
    
    const now = new Date().toISOString();
    const updatedOperator: Operator = { 
      ...operator, 
      ...updates,
      updatedAt: now
    };
    this.operators.set(id, updatedOperator);
    return updatedOperator;
  }

  async deleteOperator(id: string): Promise<boolean> {
    // Unassign this operator from any machines
    for (const [machineId, machine] of this.machines) {
      if (machine.operatorId === id) {
        this.machines.set(machineId, { ...machine, operatorId: null });
      }
    }
    return this.operators.delete(id);
  }

  // Maintenance Logs
  async getMaintenanceLogs(): Promise<MaintenanceLog[]> {
    return Array.from(this.maintenanceLogs.values());
  }

  async getMaintenanceLog(id: string): Promise<MaintenanceLog | undefined> {
    return this.maintenanceLogs.get(id);
  }

  async getMaintenanceLogsByMachine(machineId: string): Promise<MaintenanceLog[]> {
    return Array.from(this.maintenanceLogs.values()).filter(
      log => log.machineId === machineId
    );
  }

  async createMaintenanceLog(log: InsertMaintenanceLog, operatorId?: string): Promise<MaintenanceLog> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newLog: MaintenanceLog = { 
      ...log, 
      id,
      scheduledDate: log.scheduledDate ?? null,
      completedDate: log.completedDate ?? null,
      technician: log.technician ?? null,
      notes: log.notes ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: operatorId ?? null,
      updatedBy: null
    };
    this.maintenanceLogs.set(id, newLog);
    
    // If maintenance is being logged, update machine status
    if (log.status === "in-progress") {
      const machine = this.machines.get(log.machineId);
      if (machine) {
        const now = new Date().toISOString();
        this.machines.set(log.machineId, { 
          ...machine, 
          status: "maintenance" as MachineStatus,
          updatedAt: now,
          updatedBy: operatorId ?? null
        });
      }
    }
    
    return newLog;
  }

  async updateMaintenanceLog(id: string, updates: Partial<InsertMaintenanceLog>, operatorId?: string): Promise<MaintenanceLog | undefined> {
    const log = this.maintenanceLogs.get(id);
    if (!log) return undefined;
    
    const now = new Date().toISOString();
    const updatedLog: MaintenanceLog = { 
      ...log, 
      ...updates,
      updatedAt: now,
      updatedBy: operatorId ?? null
    };
    this.maintenanceLogs.set(id, updatedLog);
    return updatedLog;
  }

  async deleteMaintenanceLog(id: string): Promise<boolean> {
    return this.maintenanceLogs.delete(id);
  }

  // Production Stats
  async getProductionStats(): Promise<ProductionStat[]> {
    return Array.from(this.productionStats.values());
  }

  async getProductionStatsByMachine(machineId: string): Promise<ProductionStat[]> {
    return Array.from(this.productionStats.values()).filter(
      stat => stat.machineId === machineId
    );
  }

  async createProductionStat(stat: InsertProductionStat, operatorId?: string): Promise<ProductionStat> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newStat: ProductionStat = { 
      ...stat, 
      id,
      downtime: stat.downtime ?? 0,
      efficiency: stat.efficiency ?? null,
      createdAt: now,
      createdBy: operatorId ?? null
    };
    this.productionStats.set(id, newStat);
    return newStat;
  }
}

export const storage = new MemStorage();
