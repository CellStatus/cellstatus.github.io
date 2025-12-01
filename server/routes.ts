import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertMachineSchema, insertOperatorSchema, insertMaintenanceLogSchema, machineStatuses, users } from "@shared/schema";
import { db } from "./db";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // === AUTH ROUTES ===

  // Get current user endpoint (protected)
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      // In local development mode without REPL_ID, return a mock user
      if (!process.env.REPL_ID) {
        return res.json({
          id: 'local-dev-user',
          email: 'dev@local.host',
          firstName: 'Local',
          lastName: 'Developer',
          profileImageUrl: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // === MACHINES ===
  
  // Get all machines
  app.get("/api/machines", async (_req, res) => {
    try {
      const machines = await storage.getMachines();
      res.json(machines);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch machines" });
    }
  });

  // Get single machine
  app.get("/api/machines/:id", async (req, res) => {
    try {
      const machine = await storage.getMachine(req.params.id);
      if (!machine) {
        return res.status(404).json({ error: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch machine" });
    }
  });

  // Create machine
  app.post("/api/machines", async (req, res) => {
    try {
      const validatedData = insertMachineSchema.parse(req.body);
      const operatorId = req.operatorId;
      const machine = await storage.createMachine(validatedData, operatorId);
      res.status(201).json(machine);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid machine data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create machine" });
    }
  });

  // Update machine
  app.patch("/api/machines/:id", async (req, res) => {
    try {
      const partialSchema = insertMachineSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      const operatorId = req.operatorId;
      const machine = await storage.updateMachine(req.params.id, validatedData, operatorId);
      if (!machine) {
        return res.status(404).json({ error: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid machine data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update machine" });
    }
  });

  // Update machine status
  app.patch("/api/machines/:id/status", async (req, res) => {
    try {
      const statusSchema = z.object({
        status: z.enum(machineStatuses),
      });
      const { status } = statusSchema.parse(req.body);
      const operatorId = req.operatorId;
      const machine = await storage.updateMachineStatus(req.params.id, status, operatorId);
      if (!machine) {
        return res.status(404).json({ error: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      res.status(500).json({ error: "Failed to update machine status" });
    }
  });

  // Assign operator to machine
  app.patch("/api/machines/:id/operator", async (req, res) => {
    try {
      const { operatorId } = req.body;
      const machine = await storage.updateMachineOperator(req.params.id, operatorId ?? null);
      if (!machine) {
        return res.status(404).json({ error: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign operator" });
    }
  });

  // Delete machine
  app.delete("/api/machines/:id", async (req, res) => {
    try {
      const success = await storage.deleteMachine(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Machine not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete machine" });
    }
  });

  // === OPERATORS ===

  // Get all operators
  app.get("/api/operators", async (_req, res) => {
    try {
      const operators = await storage.getOperators();
      res.json(operators);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch operators" });
    }
  });

  // Get single operator
  app.get("/api/operators/:id", async (req, res) => {
    try {
      const operator = await storage.getOperator(req.params.id);
      if (!operator) {
        return res.status(404).json({ error: "Operator not found" });
      }
      res.json(operator);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch operator" });
    }
  });

  // Create operator
  app.post("/api/operators", async (req, res) => {
    try {
      const validatedData = insertOperatorSchema.parse(req.body);
      const operator = await storage.createOperator(validatedData);
      res.status(201).json(operator);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid operator data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create operator" });
    }
  });

  // Update operator
  app.patch("/api/operators/:id", async (req, res) => {
    try {
      const partialSchema = insertOperatorSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      const operator = await storage.updateOperator(req.params.id, validatedData);
      if (!operator) {
        return res.status(404).json({ error: "Operator not found" });
      }
      res.json(operator);
    } catch (error) {
      res.status(500).json({ error: "Failed to update operator" });
    }
  });

  // Delete operator
  app.delete("/api/operators/:id", async (req, res) => {
    try {
      const success = await storage.deleteOperator(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Operator not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete operator" });
    }
  });

  // === MAINTENANCE LOGS ===

  // Get all maintenance logs
  app.get("/api/maintenance", async (_req, res) => {
    try {
      const logs = await storage.getMaintenanceLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch maintenance logs" });
    }
  });

  // Get logs by machine
  app.get("/api/maintenance/machine/:machineId", async (req, res) => {
    try {
      const logs = await storage.getMaintenanceLogsByMachine(req.params.machineId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch maintenance logs" });
    }
  });

  // Get single log
  app.get("/api/maintenance/:id", async (req, res) => {
    try {
      const log = await storage.getMaintenanceLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: "Maintenance log not found" });
      }
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch maintenance log" });
    }
  });

  // Create maintenance log
  app.post("/api/maintenance", async (req, res) => {
    try {
      const validatedData = insertMaintenanceLogSchema.parse(req.body);
      const operatorId = req.operatorId;
      const log = await storage.createMaintenanceLog(validatedData, operatorId);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid maintenance data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create maintenance log" });
    }
  });

  // Update maintenance log
  app.patch("/api/maintenance/:id", async (req, res) => {
    try {
      const partialSchema = insertMaintenanceLogSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      const operatorId = req.operatorId;
      const log = await storage.updateMaintenanceLog(req.params.id, validatedData, operatorId);
      if (!log) {
        return res.status(404).json({ error: "Maintenance log not found" });
      }
      res.json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid maintenance data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update maintenance log" });
    }
  });

  // Delete maintenance log
  app.delete("/api/maintenance/:id", async (req, res) => {
    try {
      const success = await storage.deleteMaintenanceLog(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Maintenance log not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete maintenance log" });
    }
  });

  // === PRODUCTION STATS ===

  // Get all production stats
  app.get("/api/production-stats", async (_req, res) => {
    try {
      const stats = await storage.getProductionStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch production stats" });
    }
  });

  // Get production stats by machine
  app.get("/api/machines/:machineId/production-stats", async (req, res) => {
    try {
      const stats = await storage.getProductionStatsByMachine(req.params.machineId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch production stats" });
    }
  });

  // Create production stat
  app.post("/api/production-stats", async (req, res) => {
    try {
      const { insertProductionStatSchema } = await import("@shared/schema");
      const validatedData = insertProductionStatSchema.parse(req.body);
      const operatorId = req.operatorId;
      const stat = await storage.createProductionStat(validatedData, operatorId);
      res.status(201).json(stat);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid production stat data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create production stat" });
    }
  });

  // Delete production stat
  app.delete("/api/production-stats/:id", async (req, res) => {
    try {
      const success = await storage.deleteProductionStat(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Production stat not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete production stat" });
    }
  });

  // Bulk delete production stats by machine and date to avoid rate limits
  app.delete("/api/production-stats/by-date", async (req, res) => {
    try {
      const { machineId, date, shift } = req.query as Record<string, string | undefined>;
      if (!machineId || !date) {
        return res.status(400).json({ error: "machineId and date are required" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      }
      const deleted = shift
        ? await storage.deleteProductionStatsByMachineDateShift(machineId, date, shift)
        : await storage.deleteProductionStatsByMachineAndDate(machineId, date);
      res.json({ deleted });
    } catch (error) {
      res.status(500).json({ error: "Failed to bulk delete production stats" });
    }
  });

  // === REPORTS ===

  // Get machine history with production stats and maintenance records
  app.get("/api/reports/machine-history", async (req, res) => {
    try {
      const machines = await storage.getMachines();
      const stats = await storage.getProductionStats();
      const maintenanceLogs = await storage.getMaintenanceLogs();
      const operators = await storage.getOperators();

      // Parse optional filters: machines (comma-separated ids/names). Date filtering disabled.
      const { machines: machinesParam } = req.query as Record<string, string | undefined>;

      // Date range filtering removed: include all records

      const machineFilters: string[] = (machinesParam || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.toLowerCase());

      // Create lookup maps
      const operatorMap = new Map(operators.map(o => [o.id, o]));

      // Optionally filter machines by id/name/machineId
      const filteredMachines = machineFilters.length === 0 ? machines : machines.filter(m => {
        const name = (m.name || "").toLowerCase();
        const tag = (m.machineId || "").toLowerCase();
        const id = (m.id || "").toLowerCase();
        return machineFilters.some(f => id === f || tag === f || name.includes(f));
      });

      // Build history for each machine
      const machineHistories = filteredMachines.map(machine => {
        // Get all production stats for this machine, sorted by date desc
        const productionStats = stats
          .filter(s => s.machineId === machine.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map(stat => ({
            id: stat.id,
            date: stat.date,
            shift: stat.shift,
            unitsProduced: stat.unitsProduced,
            targetUnits: stat.targetUnits,
            downtime: stat.downtime,
            efficiency: stat.efficiency,
            createdAt: stat.createdAt,
            createdBy: stat.createdBy ? operatorMap.get(stat.createdBy)?.name : "System",
          }));

        // Get all maintenance records for this machine, sorted by date desc
        const maintenance = maintenanceLogs
          .filter(log => log.machineId === machine.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map(log => ({
            id: log.id,
            type: log.type,
            description: log.description,
            status: log.status,
            scheduledDate: log.scheduledDate,
            completedDate: log.completedDate,
            technician: log.technician,
            notes: log.notes,
            createdAt: log.createdAt,
            createdBy: log.createdBy ? operatorMap.get(log.createdBy)?.name : "System",
          }));

        // Calculate summary stats
        const totalStats = productionStats.length;
        const totalUnitsProduced = productionStats.reduce((sum, s) => sum + s.unitsProduced, 0);
        const avgEfficiency = productionStats.length > 0
          ? productionStats.reduce((sum, s) => sum + (s.efficiency || 0), 0) / productionStats.length
          : null;

        const totalMaintenance = maintenance.length;
        const openMaintenance = maintenance.filter(m => m.status !== "completed").length;
        const completedMaintenance = maintenance.filter(m => m.status === "completed").length;

        return {
          machineId: machine.id,
          machineName: machine.name,
          machineIdTag: machine.machineId,
          status: machine.status,
          currentOperator: machine.operatorId ? operatorMap.get(machine.operatorId)?.name : "Unassigned",
          createdAt: machine.createdAt,
          updatedAt: machine.updatedAt,
          summary: {
            totalProductionStats: totalStats,
            totalUnitsProduced,
            avgEfficiency: avgEfficiency !== null ? parseFloat(avgEfficiency.toFixed(1)) : null,
            totalMaintenanceRecords: totalMaintenance,
            openMaintenance,
            completedMaintenance,
          },
          productionStats,
          maintenance,
        };
      }).sort((a, b) => a.machineName.localeCompare(b.machineName));

      res.json({ machines: machineHistories });
    } catch (error) {
      console.error("Failed to generate machine history report:", error);
      res.status(500).json({ error: "Failed to generate machine history report" });
    }
  });

  // Get efficiency box plot data grouped by machine and operator
  app.get("/api/reports/efficiency", async (req, res) => {
    try {
      const stats = await storage.getProductionStats();
      const machines = await storage.getMachines();
      const operators = await storage.getOperators();
      const maintenanceLogs = await storage.getMaintenanceLogs();

      // Optional date filters (YYYY-MM-DD), default last 30 days
      const { startDate, endDate } = req.query as Record<string, string | undefined>;
      const today = new Date();
      const defaultEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const defaultStart = new Date(defaultEnd);
      defaultStart.setUTCDate(defaultStart.getUTCDate() - 30);
      const toYMD = (d: Date) => d.toISOString().split("T")[0];
      const start = (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) ? startDate : toYMD(defaultStart);
      const end = (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) ? endDate : toYMD(defaultEnd);
      const explicitRange = typeof startDate !== "undefined" || typeof endDate !== "undefined";

      // Get users for authenticated user lookup
      const allUsers = await db.select().from(users);
      const userMap = new Map(allUsers.map((u: any) => [u.id, u]));

      // Create lookup maps
      const machineMap = new Map(machines.map(m => [m.id, m]));
      const operatorMap = new Map(operators.map(o => [o.id, o]));

      // Group stats by machineId and createdBy (operator)
      type GroupKey = string;
      const groups = new Map<GroupKey, number[]>();

      // Date filtering disabled: include all production stats
      const filteredStats = stats;

      for (const stat of filteredStats) {
        if (stat.efficiency !== null && stat.efficiency !== undefined) {
          const key = `${stat.machineId}|${stat.createdBy || "unknown"}`;
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(stat.efficiency);
        }
      }

      // Calculate quartiles and other statistics
      const calculateStats = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        const min = sorted[0];
        const max = sorted[n - 1];
        const mean = values.reduce((a, b) => a + b, 0) / n;

        // Calculate median
        const median = n % 2 === 0
          ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
          : sorted[Math.floor(n / 2)];

        // Calculate Q1 (25th percentile)
        const q1Index = (n - 1) * 0.25;
        const q1 = sorted[Math.floor(q1Index)] +
          (q1Index % 1) * (sorted[Math.ceil(q1Index)] - sorted[Math.floor(q1Index)]);

        // Calculate Q3 (75th percentile)
        const q3Index = (n - 1) * 0.75;
        const q3 = sorted[Math.floor(q3Index)] +
          (q3Index % 1) * (sorted[Math.ceil(q3Index)] - sorted[Math.floor(q3Index)]);

        return { min, q1, median, q3, max, mean };
      };

      // Build report data
      const reportData = Array.from(groups.entries()).map(([key, values]) => {
        const [machineId, operatorId] = key.split("|");
        const machine = machineMap.get(machineId);
        const operator = operatorMap.get(operatorId);
        const statsCalc = calculateStats(values);

        return {
          machineId,
          machineName: machine?.name || "Unknown Machine",
          operatorId,
          operatorName: operator?.name || (operatorId === "unknown" ? "Unassigned" : "Unknown"),
          count: values.length,
          ...statsCalc,
        };
      }).sort((a, b) => {
        if (a.machineName !== b.machineName) {
          return a.machineName.localeCompare(b.machineName);
        }
        return a.operatorName.localeCompare(b.operatorName);
      });

      // Build machine logs with stats (with sensible efficiency fallbacks)
      const todayLocalYMD = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();
      const machineLogs = machines.map(machine => {
        const machineStats = filteredStats.filter(s => s.machineId === machine.id);

        // Use only non-null efficiency values from stats
        const statEffs = machineStats
          .map(s => s.efficiency)
          .filter((e): e is number => typeof e === "number");

        const avgFromStats = statEffs.length > 0
          ? statEffs.reduce((sum, e) => sum + e, 0) / statEffs.length
          : null;

        // Use machine fallbacks unconditionally (no explicit date filtering)
        const useFallbacks = true;

        const fallbackEff = typeof machine.efficiency === "number"
          ? machine.efficiency
          : (machine.targetUnits && machine.targetUnits > 0
              ? (machine.unitsProduced / machine.targetUnits) * 100
              : 0);

        const avgEfficiency = avgFromStats ?? (useFallbacks ? fallbackEff : 0);

        // If no stats rows, show 0 when filtering explicitly; else sum from stats or fallback to machine units
        const totalUnits = machineStats.length > 0
          ? machineStats.reduce((sum, s) => sum + s.unitsProduced, 0)
          : (useFallbacks ? machine.unitsProduced : 0);
        
        // Get list of shifts that have submitted for today's local date (YYYY-MM-DD)
        const completedShifts = stats
          .filter(s => s.machineId === machine.id && s.date === todayLocalYMD)
          .map(s => s.shift);

        return {
          machineId: machine.id,
          machineName: machine.name,
          status: machine.status,
          operatorName: machine.operatorId ? operatorMap.get(machine.operatorId)?.name : "Unassigned",
          statsCount: machineStats.length,
          totalUnitsProduced: totalUnits,
          avgEfficiency: avgEfficiency.toFixed(1),
          completedShifts,
          createdAt: machine.createdAt,
          createdBy: machine.createdBy ? operatorMap.get(machine.createdBy)?.name : "System",
          lastUpdated: machine.updatedAt,
          lastUpdatedBy: machine.updatedBy ? operatorMap.get(machine.updatedBy)?.name : "System",
        };
      });

      // Build job setter activities (operator activities from all tables)
      const activities = new Map<string, any[]>();
      
      machines.forEach(m => {
        if (m.createdBy) {
          if (!activities.has(m.createdBy)) activities.set(m.createdBy, []);
          activities.get(m.createdBy)!.push({
            type: "Created Machine",
            target: m.name,
            timestamp: m.createdAt,
            details: `Machine "${m.name}" was created`
          });
        }
        if (m.updatedBy) {
          if (!activities.has(m.updatedBy)) activities.set(m.updatedBy, []);
          activities.get(m.updatedBy)!.push({
            type: "Updated Machine",
            target: m.name,
            timestamp: m.updatedAt,
            details: `Machine "${m.name}" was updated (Status: ${m.status})`
          });
        }
      });


      // Only include completed maintenance logs in activities
      maintenanceLogs.filter(log => log.status === "completed").forEach(log => {
        if (log.createdBy) {
          if (!activities.has(log.createdBy)) activities.set(log.createdBy, []);
          activities.get(log.createdBy)!.push({
            type: "Completed Maintenance",
            target: machineMap.get(log.machineId)?.name || "Unknown",
            timestamp: log.createdAt,
            details: `${log.type} - ${log.description}`
          });
        }
      });

      const jobSetterActivities = Array.from(activities.entries()).flatMap(([operatorId, ops]) => {
        const operator = operatorMap.get(operatorId);
        const user = userMap.get(operatorId);
        const operatorName = operator?.name || user?.email || user?.firstName || "Unknown";
        return ops.map(activity => ({
          operatorName,
          operatorId,
          ...activity
        }));
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Build maintenance logs with machine names
      const maintenanceLogsReport = maintenanceLogs
        .map(log => ({
        id: log.id,
        machineId: log.machineId,
        machineName: machineMap.get(log.machineId)?.name || "Unknown",
        type: log.type,
        description: log.description,
        status: log.status,
        scheduledDate: log.scheduledDate,
        completedDate: log.completedDate,
        technician: log.technician,
        notes: log.notes,
        createdAt: log.createdAt,
        createdBy: log.createdBy ? (userMap.get(log.createdBy)?.email || userMap.get(log.createdBy)?.firstName || "Unknown") : "System",
      }));

      res.json({ 
        data: reportData,
        machineLogs,
        jobSetterActivities,
        maintenanceLogs: maintenanceLogsReport
      });
    } catch (error) {
      console.error("Failed to generate efficiency report:", error);
      res.status(500).json({ error: "Failed to generate efficiency report" });
    }
  });

  return httpServer;
}
