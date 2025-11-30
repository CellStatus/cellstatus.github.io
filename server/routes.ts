import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertMachineSchema, insertOperatorSchema, insertMaintenanceLogSchema, machineStatuses } from "@shared/schema";
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

  // === REPORTS ===

  // Get efficiency box plot data grouped by machine and operator
  app.get("/api/reports/efficiency", async (_req, res) => {
    try {
      const stats = await storage.getProductionStats();
      const machines = await storage.getMachines();
      const operators = await storage.getOperators();

      // Create lookup maps
      const machineMap = new Map(machines.map(m => [m.id, m]));
      const operatorMap = new Map(operators.map(o => [o.id, o]));

      // Group stats by machineId and createdBy (operator)
      type GroupKey = string;
      const groups = new Map<GroupKey, number[]>();

      for (const stat of stats) {
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
        const stats = calculateStats(values);

        return {
          machineId,
          machineName: machine?.name || "Unknown Machine",
          operatorId,
          operatorName: operator?.name || (operatorId === "unknown" ? "Unassigned" : "Unknown"),
          count: values.length,
          ...stats,
        };
      }).sort((a, b) => {
        if (a.machineName !== b.machineName) {
          return a.machineName.localeCompare(b.machineName);
        }
        return a.operatorName.localeCompare(b.operatorName);
      });

      res.json({ data: reportData });
    } catch (error) {
      console.error("Failed to generate efficiency report:", error);
      res.status(500).json({ error: "Failed to generate efficiency report" });
    }
  });

  return httpServer;
}
