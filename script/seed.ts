import "dotenv/config";
import { db } from "../server/db";
import { machines, cellConfigurations, scrapIncidents } from "../shared/schema";
import { randomUUID } from "crypto";

const machineStatuses = ["running", "idle", "maintenance", "down", "setup"] as const;
const shifts = ["Day", "Afternoon", "Midnight"];
const maintenanceTypes = ["preventive", "corrective", "inspection", "calibration"];
const maintenanceStatuses = ["scheduled", "in-progress", "completed"];

const operatorData = [
  { name: "John Smith", initials: "JS", shift: "Day" },
  { name: "Sarah Johnson", initials: "SJ", shift: "Day" },
  { name: "Mike Chen", initials: "MC", shift: "Afternoon" },
  { name: "Emily Davis", initials: "ED", shift: "Afternoon" },
  { name: "Robert Taylor", initials: "RT", shift: "Midnight" },
  { name: "Lisa Anderson", initials: "LA", shift: "Midnight" },
];

const machineData = [
  { name: "CNC Mill #1", machineId: "CNC-001", cycleTime: 180 },
  { name: "CNC Mill #2", machineId: "CNC-002", cycleTime: 175 },
  { name: "Lathe A", machineId: "L-A-100", cycleTime: 240 },
  { name: "Lathe B", machineId: "L-B-101", cycleTime: 235 },
  { name: "Broach Station", machineId: "BR-001", cycleTime: 120 },
  { name: "Grinding Machine", machineId: "GR-200", cycleTime: 300 },
  { name: "Press #1", machineId: "PR-301", cycleTime: 90 },
  { name: "Press #2", machineId: "PR-302", cycleTime: 85 },
  { name: "Assembly Station A", machineId: "AS-A-01", cycleTime: 150 },
  { name: "Assembly Station B", machineId: "AS-B-02", cycleTime: 155 },
];

type SeedCellOperation = {
  id: string;
  name: string;
  cycleTimeSec: number;
  parallelMachines: number;
  wipBefore: number;
};

type SeedCell = {
  name: string;
  description: string;
  status: string;
  operations: SeedCellOperation[];
};

const sampleCells: SeedCell[] = [
  {
    name: "Cell A - Pinion Core",
    description: "Turning, drilling, and grinding flow for pinion core parts",
    status: "active",
    operations: [
      { id: randomUUID(), name: "Turning", cycleTimeSec: 95, parallelMachines: 1, wipBefore: 14 },
      { id: randomUUID(), name: "Drilling", cycleTimeSec: 88, parallelMachines: 2, wipBefore: 9 },
      { id: randomUUID(), name: "Grinding", cycleTimeSec: 120, parallelMachines: 1, wipBefore: 18 },
    ],
  },
  {
    name: "Cell B - Spline Finish",
    description: "Hobbing through polish operations for spline finish",
    status: "active",
    operations: [
      { id: randomUUID(), name: "Hobbing", cycleTimeSec: 110, parallelMachines: 2, wipBefore: 20 },
      { id: randomUUID(), name: "Heat Treat Queue", cycleTimeSec: 180, parallelMachines: 1, wipBefore: 35 },
      { id: randomUUID(), name: "Polish", cycleTimeSec: 72, parallelMachines: 1, wipBefore: 11 },
    ],
  },
  {
    name: "Cell C - Press & Assemble",
    description: "Press and assembly flow for finished subassemblies",
    status: "pilot",
    operations: [
      { id: randomUUID(), name: "Press", cycleTimeSec: 54, parallelMachines: 2, wipBefore: 10 },
      { id: randomUUID(), name: "Deburr", cycleTimeSec: 66, parallelMachines: 1, wipBefore: 8 },
      { id: randomUUID(), name: "Assembly", cycleTimeSec: 92, parallelMachines: 2, wipBefore: 16 },
    ],
  },
];

function randomFromArray<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

async function seed() {
  console.log("🌱 Seeding database with dummy data...\n");

  try {
    // Clear existing machines and cells and insert a small set
    console.log("🗑️  Clearing machines/cells and seeding baseline data...");
    await db.delete(machines);
    await db.delete(cellConfigurations);
    await db.delete(scrapIncidents);

    console.log("🏭 Creating machines...");
    const createdMachineIds: string[] = [];
    for (const machine of machineData) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const status = randomFromArray(machineStatuses);
      await db.insert(machines).values({
        id,
        name: machine.name,
        machineId: machine.machineId,
        status,
        cell: null,
        idealCycleTime: machine.cycleTime,
        batchSize: null,
        uptimePercent: null,
        setupTime: null,
        statusUpdate: null,
        createdAt: now,
        updatedAt: now,
      });
      createdMachineIds.push(id);
      console.log(`  ✓ ${machine.name} (${status})`);
    }

    console.log("\n🏗️  Creating sample cell configurations...");
    for (const cell of sampleCells) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const operationRates = cell.operations.map((operation) => (3600 / operation.cycleTimeSec) * Math.max(1, operation.parallelMachines));
      const throughputUph = operationRates.length > 0 ? Math.min(...operationRates) : 0;
      const totalWip = cell.operations.reduce((sum, operation) => sum + operation.wipBefore, 0);

      await db.insert(cellConfigurations).values({
        id,
        name: cell.name,
        description: cell.description,
        status: cell.status,
        operationsJson: cell.operations,
        throughputUph,
        totalWip,
        notes: `Seeded sample cell with ${cell.operations.length} operations`,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`  ✓ ${cell.name} (${throughputUph.toFixed(1)} UPH, WIP ${totalWip})`);
    }

    console.log("\n🧾 Creating sample scrap incidents...");
    if (createdMachineIds.length > 0) {
      const now = new Date().toISOString();
      const samples = [
        { machineId: createdMachineIds[0], characteristic: "Pinion OD", quantity: 12, estimatedCost: 480, status: "open" },
        { machineId: createdMachineIds[1], characteristic: "Spline Width", quantity: 6, estimatedCost: 210, status: "open" },
        { machineId: createdMachineIds[2], characteristic: "Face Runout", quantity: 4, estimatedCost: 160, status: "closed" },
      ];
      for (const sample of samples) {
        await db.insert(scrapIncidents).values({
          id: randomUUID(),
          machineId: sample.machineId,
          characteristic: sample.characteristic,
          quantity: sample.quantity,
          estimatedCost: sample.estimatedCost,
          status: sample.status,
          createdAt: now,
          updatedAt: now,
        });
        console.log(`  ✓ ${sample.characteristic} ($${sample.estimatedCost})`);
      }
    }

    console.log("\n✅ Database seeding completed successfully!");
  } catch (error) {
    console.error("\n❌ Error seeding database:", error);
    process.exit(1);
  }
  process.exit(0);
}

seed();
