import "dotenv/config";
import { db } from "../server/db";
import { machines } from "../shared/schema";
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
    // Clear existing machines and insert a small set
    console.log("🗑️  Clearing machines and seeding basic machine data...");
    await db.delete(machines);

    console.log("🏭 Creating machines...");
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
      console.log(`  ✓ ${machine.name} (${status})`);
    }

    console.log("\n✅ Database seeding completed successfully!");
  } catch (error) {
    console.error("\n❌ Error seeding database:", error);
    process.exit(1);
  }
  process.exit(0);
}

seed();
