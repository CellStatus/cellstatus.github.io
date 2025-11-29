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

  return httpServer;
}
