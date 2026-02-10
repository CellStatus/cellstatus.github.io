import { 
  type Machine, type InsertMachine,
  type MachineStatus,
  type VsmConfiguration, type InsertVsmConfiguration,
  type Part, type InsertPart,
  type Characteristic, type InsertCharacteristic,
  type SpcMeasurement, type InsertSpcMeasurement,
  type SpcRecordFlat,
  machines, vsmConfigurations,
  parts, characteristics, spcMeasurements,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

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

  // Parts
  getParts(): Promise<Part[]>;
  getPartByNumber(partNumber: string): Promise<Part | undefined>;
  createPart(part: InsertPart): Promise<Part>;
  updatePart(id: string, updates: Partial<InsertPart>): Promise<Part | undefined>;
  deletePart(id: string): Promise<boolean>;

  // Characteristics
  getCharacteristics(): Promise<Characteristic[]>;
  getCharacteristicsByPart(partId: string): Promise<Characteristic[]>;
  getCharacteristic(id: string): Promise<Characteristic | undefined>;
  findCharacteristic(partId: string, charNumber: string): Promise<Characteristic | undefined>;
  createCharacteristic(char: InsertCharacteristic): Promise<Characteristic>;
  updateCharacteristic(id: string, updates: Partial<InsertCharacteristic>): Promise<Characteristic | undefined>;
  deleteCharacteristic(id: string): Promise<boolean>;

  // SPC Measurements
  getMeasurements(): Promise<SpcMeasurement[]>;
  getMeasurementsByCharacteristic(characteristicId: string): Promise<SpcMeasurement[]>;
  createMeasurement(measurement: InsertSpcMeasurement): Promise<SpcMeasurement>;
  updateMeasurement(id: string, updates: Partial<InsertSpcMeasurement>): Promise<SpcMeasurement | undefined>;
  deleteMeasurement(id: string): Promise<boolean>;

  // Flat joined view (backward compat)
  getSpcRecordsFlat(): Promise<SpcRecordFlat[]>;
  getSpcRecordsFlatByMachine(machineId: string): Promise<SpcRecordFlat[]>;

  // Legacy aliases
  getAuditFindings(): Promise<SpcRecordFlat[]>;
  getFindingsByMachine(machineId: string): Promise<SpcRecordFlat[]>;
  getDistinctPartNumbers(): Promise<{ partNumber: string; partName?: string }[]>;
  createAuditFinding(finding: any): Promise<SpcRecordFlat>;
  updateAuditFinding(id: string, updates: any): Promise<SpcRecordFlat | undefined>;
  deleteAuditFinding(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Machines
  async getMachines(): Promise<Machine[]> {
    return await db.select({
      id: machines.id,
      name: machines.name,
      machineId: machines.machineId,
      status: machines.status,
      cell: machines.cell,
      idealCycleTime: machines.idealCycleTime,
      batchSize: machines.batchSize,
      uptimePercent: machines.uptimePercent,
      setupTime: machines.setupTime,
      statusUpdate: machines.statusUpdate,
      createdAt: machines.createdAt,
      updatedAt: machines.updatedAt,
    }).from(machines);
  }

  async getMachine(id: string): Promise<Machine | undefined> {
    const result = await db.select({
      id: machines.id,
      name: machines.name,
      machineId: machines.machineId,
      status: machines.status,
      cell: machines.cell,
      idealCycleTime: machines.idealCycleTime,
      batchSize: machines.batchSize,
      uptimePercent: machines.uptimePercent,
      setupTime: machines.setupTime,
      statusUpdate: machines.statusUpdate,
      createdAt: machines.createdAt,
      updatedAt: machines.updatedAt,
    }).from(machines).where(eq(machines.id, id)).limit(1);
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

  // SPC records — normalized 3NF operations
  // ─── Parts ───
  async getParts(): Promise<Part[]> {
    return await db.select().from(parts).orderBy(parts.partNumber);
  }

  async getPartByNumber(partNumber: string): Promise<Part | undefined> {
    const result = await db.select().from(parts).where(eq(parts.partNumber, partNumber)).limit(1);
    return result[0];
  }

  async createPart(part: InsertPart): Promise<Part> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(parts).values({ id, ...part, createdAt: now });
    const result = await db.select().from(parts).where(eq(parts.id, id)).limit(1);
    return result[0]!;
  }

  async updatePart(id: string, updates: Partial<InsertPart>): Promise<Part | undefined> {
    await db.update(parts).set(updates).where(eq(parts.id, id));
    const result = await db.select().from(parts).where(eq(parts.id, id)).limit(1);
    return result[0];
  }

  async deletePart(id: string): Promise<boolean> {
    await db.delete(parts).where(eq(parts.id, id));
    return true;
  }

  // ─── Characteristics ───
  async getCharacteristics(): Promise<Characteristic[]> {
    return await db.select().from(characteristics).orderBy(characteristics.charNumber);
  }

  async getCharacteristicsByPart(partId: string): Promise<Characteristic[]> {
    return await db.select().from(characteristics).where(eq(characteristics.partId, partId)).orderBy(characteristics.charNumber);
  }

  async getCharacteristic(id: string): Promise<Characteristic | undefined> {
    const result = await db.select().from(characteristics).where(eq(characteristics.id, id)).limit(1);
    return result[0];
  }

  async findCharacteristic(partId: string, charNumber: string): Promise<Characteristic | undefined> {
    const result = await db.select().from(characteristics)
      .where(and(eq(characteristics.partId, partId), eq(characteristics.charNumber, charNumber)))
      .limit(1);
    return result[0];
  }

  async createCharacteristic(char: InsertCharacteristic): Promise<Characteristic> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(characteristics).values({ id, ...char, createdAt: now });
    const result = await db.select().from(characteristics).where(eq(characteristics.id, id)).limit(1);
    return result[0]!;
  }

  async updateCharacteristic(id: string, updates: Partial<InsertCharacteristic>): Promise<Characteristic | undefined> {
    const updateObj: any = {};
    if (updates.charNumber !== undefined) updateObj.charNumber = updates.charNumber;
    if (updates.charName !== undefined) updateObj.charName = updates.charName;
    if (updates.charMax !== undefined) updateObj.charMax = updates.charMax;
    if (updates.charMin !== undefined) updateObj.charMin = updates.charMin;
    if (updates.tolerance !== undefined) updateObj.tolerance = updates.tolerance;
    if (updates.opName !== undefined) updateObj.opName = updates.opName;
    if (updates.partId !== undefined) updateObj.partId = updates.partId;
    if (Object.keys(updateObj).length > 0) {
      await db.update(characteristics).set(updateObj).where(eq(characteristics.id, id));
    }
    const result = await db.select().from(characteristics).where(eq(characteristics.id, id)).limit(1);
    return result[0];
  }

  async deleteCharacteristic(id: string): Promise<boolean> {
    // Also delete measurements for this characteristic
    await db.delete(spcMeasurements).where(eq(spcMeasurements.characteristicId, id));
    await db.delete(characteristics).where(eq(characteristics.id, id));
    return true;
  }

  // ─── Measurements ───
  async getMeasurements(): Promise<SpcMeasurement[]> {
    return await db.select().from(spcMeasurements).orderBy(spcMeasurements.createdAt);
  }

  async getMeasurementsByCharacteristic(characteristicId: string): Promise<SpcMeasurement[]> {
    return await db.select().from(spcMeasurements).where(eq(spcMeasurements.characteristicId, characteristicId)).orderBy(spcMeasurements.createdAt);
  }

  async createMeasurement(measurement: InsertSpcMeasurement): Promise<SpcMeasurement> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(spcMeasurements).values({ id, ...measurement, createdAt: now });
    const result = await db.select().from(spcMeasurements).where(eq(spcMeasurements.id, id)).limit(1);
    return result[0]!;
  }

  async updateMeasurement(id: string, updates: Partial<InsertSpcMeasurement>): Promise<SpcMeasurement | undefined> {
    const updateObj: any = {};
    if (updates.measuredValue !== undefined) updateObj.measuredValue = updates.measuredValue;
    if (updates.status !== undefined) updateObj.status = updates.status;
    if (updates.recordNote !== undefined) updateObj.recordNote = updates.recordNote;
    if (updates.machineId !== undefined) updateObj.machineId = updates.machineId;
    if (updates.characteristicId !== undefined) updateObj.characteristicId = updates.characteristicId;
    if (Object.keys(updateObj).length > 0) {
      await db.update(spcMeasurements).set(updateObj).where(eq(spcMeasurements.id, id));
    }
    const result = await db.select().from(spcMeasurements).where(eq(spcMeasurements.id, id)).limit(1);
    return result[0];
  }

  async deleteMeasurement(id: string): Promise<boolean> {
    await db.delete(spcMeasurements).where(eq(spcMeasurements.id, id));
    return true;
  }

  // ─── Flat joined view (backward compat for dashboard + frontend) ───
  private async buildFlatRecords(whereClause?: any): Promise<SpcRecordFlat[]> {
    let query = db
      .select({
        id: spcMeasurements.id,
        machineId: spcMeasurements.machineId,
        characteristicId: spcMeasurements.characteristicId,
        partId: characteristics.partId,
        partNumber: parts.partNumber,
        partName: parts.partName,
        charNumber: characteristics.charNumber,
        charName: characteristics.charName,
        charMax: characteristics.charMax,
        charMin: characteristics.charMin,
        tolerance: characteristics.tolerance,
        opName: characteristics.opName,
        measuredValue: spcMeasurements.measuredValue,
        status: spcMeasurements.status,
        recordNote: spcMeasurements.recordNote,
        createdAt: spcMeasurements.createdAt,
      })
      .from(spcMeasurements)
      .innerJoin(characteristics, eq(spcMeasurements.characteristicId, characteristics.id))
      .innerJoin(parts, eq(characteristics.partId, parts.id))
      .orderBy(spcMeasurements.createdAt);

    if (whereClause) {
      return await (query as any).where(whereClause);
    }
    return await query;
  }

  async getSpcRecordsFlat(): Promise<SpcRecordFlat[]> {
    return this.buildFlatRecords();
  }

  async getSpcRecordsFlatByMachine(machineId: string): Promise<SpcRecordFlat[]> {
    return this.buildFlatRecords(eq(spcMeasurements.machineId, machineId));
  }

  // ─── Legacy aliases for API backward compat ───
  async getAuditFindings(): Promise<SpcRecordFlat[]> {
    return this.getSpcRecordsFlat();
  }

  async getDistinctPartNumbers(): Promise<{ partNumber: string; partName?: string }[]> {
    const allParts = await this.getParts();
    return allParts
      .filter(p => p.partNumber && p.partNumber.length > 0)
      .map(p => ({ partNumber: p.partNumber, partName: p.partName ?? undefined }));
  }

  async getFindingsByMachine(machineId: string): Promise<SpcRecordFlat[]> {
    return this.getSpcRecordsFlatByMachine(machineId);
  }

  /**
   * Legacy create: accepts flat payload, resolves or creates part + characteristic,
   * then creates measurement. Returns flat record.
   */
  async createAuditFinding(finding: any): Promise<SpcRecordFlat> {
    const partNumber = (finding.partNumber || '').toString();
    const partName = finding.partName || null;
    const charNumber = (finding.charNumber || finding.characteristic || '').toString();
    const charName = finding.charName || null;

    // Resolve or create Part
    let part = partNumber ? await this.getPartByNumber(partNumber) : undefined;
    if (!part && partNumber) {
      part = await this.createPart({ partNumber, partName });
    } else if (part && partName && part.partName !== partName) {
      part = await this.updatePart(part.id, { partName }) ?? part;
    }
    if (!part) {
      // Fallback: create with placeholder
      part = await this.createPart({ partNumber: partNumber || '(no-part)', partName });
    }

    // Resolve or create Characteristic
    let char = charNumber ? await this.findCharacteristic(part.id, charNumber) : undefined;
    if (!char) {
      char = await this.createCharacteristic({
        partId: part.id,
        charNumber: charNumber || '(unknown)',
        charName,
        charMax: finding.charMax || null,
        charMin: finding.charMin || null,
        tolerance: finding.tolerance || null,
        opName: finding.opName || null,
      });
    }

    // Create measurement
    const measurement = await this.createMeasurement({
      characteristicId: char.id,
      machineId: finding.machineId,
      measuredValue: finding.measuredValue,
      status: finding.status || 'open',
      recordNote: finding.correctiveAction || finding.recordNote || null,
    });

    // Return flat record
    const flat = await this.buildFlatRecords(eq(spcMeasurements.id, measurement.id));
    return flat[0]!;
  }

  /**
   * Legacy update: accepts flat payload. Updates measurement fields on spc_measurements,
   * and characteristic fields on characteristics table.
   */
  async updateAuditFinding(id: string, updates: any): Promise<SpcRecordFlat | undefined> {
    // First get the measurement to find its characteristic
    const meas = await db.select().from(spcMeasurements).where(eq(spcMeasurements.id, id)).limit(1);
    if (!meas[0]) return undefined;

    // Update measurement fields
    const measUpdates: any = {};
    if (updates.measuredValue !== undefined) measUpdates.measuredValue = updates.measuredValue;
    if (updates.status !== undefined) measUpdates.status = updates.status;
    if (updates.correctiveAction !== undefined) measUpdates.recordNote = updates.correctiveAction;
    if (updates.recordNote !== undefined) measUpdates.recordNote = updates.recordNote;
    if (updates.machineId !== undefined) measUpdates.machineId = updates.machineId;
    if (Object.keys(measUpdates).length > 0) {
      await db.update(spcMeasurements).set(measUpdates).where(eq(spcMeasurements.id, id));
    }

    // Update characteristic fields if any provided
    const charUpdates: any = {};
    if (updates.charName !== undefined) charUpdates.charName = updates.charName;
    if (updates.charMax !== undefined) charUpdates.charMax = updates.charMax;
    if (updates.charMin !== undefined) charUpdates.charMin = updates.charMin;
    if (updates.tolerance !== undefined) charUpdates.tolerance = updates.tolerance;
    if (updates.opName !== undefined) charUpdates.opName = updates.opName;
    if (updates.charNumber !== undefined) charUpdates.charNumber = updates.charNumber;
    if (Object.keys(charUpdates).length > 0) {
      await db.update(characteristics).set(charUpdates).where(eq(characteristics.id, meas[0].characteristicId));
    }

    // Update part fields if any provided
    if (updates.partNumber !== undefined || updates.partName !== undefined) {
      const char = await db.select().from(characteristics).where(eq(characteristics.id, meas[0].characteristicId)).limit(1);
      if (char[0]) {
        const partUpdates: any = {};
        if (updates.partNumber !== undefined) partUpdates.partNumber = updates.partNumber;
        if (updates.partName !== undefined) partUpdates.partName = updates.partName;
        await db.update(parts).set(partUpdates).where(eq(parts.id, char[0].partId));
      }
    }

    const flat = await this.buildFlatRecords(eq(spcMeasurements.id, id));
    return flat[0];
  }

  async deleteAuditFinding(id: string): Promise<boolean> {
    return this.deleteMeasurement(id);
  }
}

export const storage = new DatabaseStorage();
