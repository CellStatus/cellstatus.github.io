import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertMachineSchema, insertVsmConfigurationSchema, machineStatuses } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      const start = Date.now();
      const machines = await storage.getMachines();
      const duration = Date.now() - start;
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, machinesSample: machines.slice(0, 2).map(m => ({ id: m.id, name: m.name })), dbLatencyMs: duration });
    } catch (err) {
      res.status(500).json({ ok: false, error: "DB check failed" });
    }
  });

  // ============ MACHINES ROUTES ============
  
  app.get("/api/machines", async (_req, res) => {
    try {
      const machines = await storage.getMachines();
      res.json(machines);
    } catch (error) {
      console.error("Error fetching machines:", error);
      res.status(500).json({ message: "Failed to fetch machines" });
    }
  });

  app.get("/api/machines/:id", async (req, res) => {
    try {
      const machine = await storage.getMachine(req.params.id);
      if (!machine) {
        return res.status(404).json({ message: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      console.error("Error fetching machine:", error);
      res.status(500).json({ message: "Failed to fetch machine" });
    }
  });

  app.post("/api/machines", async (req, res) => {
    try {
      const validated = insertMachineSchema.parse(req.body);
      const machine = await storage.createMachine(validated);
      res.status(201).json(machine);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid machine data", details: error.errors });
      }
      console.error("Error creating machine:", error);
      res.status(500).json({ message: "Failed to create machine" });
    }
  });

  app.patch("/api/machines/:id", async (req, res) => {
    try {
      const partialSchema = insertMachineSchema.partial();
      const validated = partialSchema.parse(req.body);
      const machine = await storage.updateMachine(req.params.id, validated);
      if (!machine) {
        return res.status(404).json({ message: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid machine data", details: error.errors });
      }
      console.error("Error updating machine:", error);
      res.status(500).json({ message: "Failed to update machine" });
    }
  });

  app.patch("/api/machines/:id/status", async (req, res) => {
    try {
      const statusSchema = z.object({
        status: z.enum(machineStatuses),
      });
      const { status } = statusSchema.parse(req.body);
      const machine = await storage.updateMachineStatus(req.params.id, status);
      if (!machine) {
        return res.status(404).json({ message: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      console.error("Error updating machine status:", error);
      res.status(500).json({ message: "Failed to update machine status" });
    }
  });

  app.patch("/api/machines/:id/status-update", async (req, res) => {
    try {
      const { statusUpdate } = req.body;
      const machine = await storage.updateMachineStatusUpdate(req.params.id, statusUpdate);
      if (!machine) {
        return res.status(404).json({ message: "Machine not found" });
      }
      res.json(machine);
    } catch (error) {
      console.error("Error updating machine status update:", error);
      res.status(500).json({ message: "Failed to update machine status update" });
    }
  });

  app.delete("/api/machines/:id", async (req, res) => {
    try {
      const success = await storage.deleteMachine(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Machine not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting machine:", error);
      res.status(500).json({ message: "Failed to delete machine" });
    }
  });

  // ============ VSM CONFIGURATIONS ROUTES ============

  app.get("/api/vsm-configurations", async (_req, res) => {
    try {
      const configurations = await storage.getVsmConfigurations();
      res.json(configurations);
    } catch (error) {
      console.error("Error fetching VSM configurations:", error);
      res.status(500).json({ message: "Failed to fetch VSM configurations" });
    }
  });

  app.get("/api/vsm-configurations/:id", async (req, res) => {
    try {
      const configuration = await storage.getVsmConfiguration(req.params.id);
      if (!configuration) {
        return res.status(404).json({ message: "VSM configuration not found" });
      }
      res.json(configuration);
    } catch (error) {
      console.error("Error fetching VSM configuration:", error);
      res.status(500).json({ message: "Failed to fetch VSM configuration" });
    }
  });

  app.post("/api/vsm-configurations", async (req, res) => {
    try {
      const validated = insertVsmConfigurationSchema.parse(req.body);
      const configuration = await storage.createVsmConfiguration(validated);
      res.status(201).json(configuration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid VSM configuration data", details: error.errors });
      }
      console.error("Error creating VSM configuration:", error);
      res.status(500).json({ message: "Failed to create VSM configuration" });
    }
  });

  app.put("/api/vsm-configurations/:id", async (req, res) => {
    try {
      const configuration = await storage.updateVsmConfiguration(req.params.id, req.body);
      if (!configuration) {
        return res.status(404).json({ message: "VSM configuration not found" });
      }
      res.json(configuration);
    } catch (error) {
      console.error("Error updating VSM configuration:", error);
      res.status(500).json({ message: "Failed to update VSM configuration" });
    }
  });

  app.delete("/api/vsm-configurations/:id", async (req, res) => {
    try {
      const success = await storage.deleteVsmConfiguration(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "VSM configuration not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting VSM configuration:", error);
      res.status(500).json({ message: "Failed to delete VSM configuration" });
    }
  });

  return httpServer;
}
