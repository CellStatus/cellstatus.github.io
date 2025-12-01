import "dotenv/config";
import { db } from "../server/db";
import { machines, operators, productionStats, maintenanceLogs } from "../shared/schema";
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
    // Clear existing data
    console.log("🗑️  Clearing existing data...");
    await db.delete(productionStats);
    await db.delete(maintenanceLogs);
    await db.delete(machines);
    await db.delete(operators);

    // Insert operators
    console.log("👷 Creating operators...");
    const createdOperators = [];
    for (const op of operatorData) {
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.insert(operators).values({
        id,
        name: op.name,
        initials: op.initials,
        shift: op.shift,
        password: "demo123",
        createdAt: now,
        updatedAt: now,
      });
      createdOperators.push({ id, ...op });
      console.log(`  ✓ ${op.name} (${op.shift} shift)`);
    }

    // Insert machines
    console.log("\n🏭 Creating machines...");
    const createdMachines = [];
    for (const machine of machineData) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const status = randomFromArray(machineStatuses);
      const operator = randomFromArray(createdOperators);
      const targetUnits = randomInt(80, 150);
      const unitsProduced = randomInt(Math.floor(targetUnits * 0.6), targetUnits);
      const efficiency = (unitsProduced / targetUnits) * 100;

      await db.insert(machines).values({
        id,
        name: machine.name,
        machineId: machine.machineId,
        status,
        operatorId: Math.random() > 0.2 ? operator.id : null, // 80% have operators
        unitsProduced,
        targetUnits,
        cycleTime: machine.cycleTime,
        efficiency: parseFloat(efficiency.toFixed(1)),
        lastUpdated: "Just now",
        createdAt: now,
        updatedAt: now,
        createdBy: null,
        updatedBy: null,
      });
      createdMachines.push({ id, ...machine });
      console.log(`  ✓ ${machine.name} (${status})`);
    }

    // Insert production stats (past 30 days)
    console.log("\n📊 Creating production statistics...");
    let statsCount = 0;
    for (const machine of createdMachines) {
      // Generate 5-15 stats per machine over past 30 days
      const numStats = randomInt(5, 15);
      for (let i = 0; i < numStats; i++) {
        const daysAgo = randomInt(0, 30);
        const date = getDateDaysAgo(daysAgo);
        const operator = randomFromArray(createdOperators);
        const targetUnits = randomInt(80, 150);
        const unitsProduced = randomInt(Math.floor(targetUnits * 0.65), Math.min(targetUnits, Math.floor(targetUnits * 1.1)));
        const efficiency = Math.min(100, (unitsProduced / targetUnits) * 100);
        const downtime = randomInt(0, 60);

        await db.insert(productionStats).values({
          id: randomUUID(),
          machineId: machine.id,
          shift: operator.shift,
          date,
          unitsProduced,
          targetUnits,
          downtime,
          efficiency: parseFloat(efficiency.toFixed(2)),
          createdAt: new Date().toISOString(),
          createdBy: operator.id,
        });
        statsCount++;
      }
    }
    console.log(`  ✓ Created ${statsCount} production stats entries`);

    // Insert maintenance logs
    console.log("\n🔧 Creating maintenance records...");
    let maintenanceCount = 0;
    for (const machine of createdMachines) {
      // Generate 2-6 maintenance records per machine
      const numRecords = randomInt(2, 6);
      for (let i = 0; i < numRecords; i++) {
        const daysAgo = randomInt(1, 90);
        const scheduledDate = getDateDaysAgo(daysAgo);
        const status = randomFromArray(maintenanceStatuses);
        const completedDate = status === "completed" ? getDateDaysAgo(daysAgo - randomInt(1, 3)) : null;
        const type = randomFromArray(maintenanceTypes);
        const technician = randomFromArray(["Tech-" + randomInt(1, 5), "External Vendor", "Operator"]);
        const operator = randomFromArray(createdOperators);

        const descriptions = {
          preventive: ["Routine lubrication and inspection", "Filter replacement", "Belt tension adjustment", "Coolant system flush"],
          corrective: ["Bearing replacement", "Motor repair", "Alignment correction", "Electrical fault repair"],
          inspection: ["Annual safety inspection", "Quality control check", "Calibration verification", "Performance assessment"],
          calibration: ["Sensor calibration", "Tool offset calibration", "Measurement system calibration", "Temperature probe calibration"],
        };

        await db.insert(maintenanceLogs).values({
          id: randomUUID(),
          machineId: machine.id,
          type,
          description: randomFromArray(descriptions[type as keyof typeof descriptions]),
          status,
          scheduledDate,
          completedDate,
          technician,
          notes: status === "completed" ? "Work completed successfully" : status === "in-progress" ? "Work in progress" : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: operator.id,
          updatedBy: null,
        });
        maintenanceCount++;
      }
    }
    console.log(`  ✓ Created ${maintenanceCount} maintenance records`);

    console.log("\n✅ Database seeding completed successfully!");
    console.log(`\n📈 Summary:`);
    console.log(`   ${createdOperators.length} operators`);
    console.log(`   ${createdMachines.length} machines`);
    console.log(`   ${statsCount} production stats`);
    console.log(`   ${maintenanceCount} maintenance records`);

  } catch (error) {
    console.error("\n❌ Error seeding database:", error);
    process.exit(1);
  }

  process.exit(0);
}

seed();
