import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertMachineSchema, insertVsmConfigurationSchema, machineStatuses, insertPartSchema, insertCharacteristicSchema, insertSpcMeasurementSchema } from "@shared/schema";
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

  // ============ PARTS ROUTES ============

  app.get('/api/parts', async (_req, res) => {
    try {
      const allParts = await storage.getParts();
      res.json(allParts);
    } catch (err) {
      console.error('Error fetching parts', err);
      res.status(500).json({ message: 'Failed to fetch parts' });
    }
  });

  app.post('/api/parts', async (req, res) => {
    try {
      const validated = insertPartSchema.parse(req.body);
      const part = await storage.createPart(validated);
      res.status(201).json(part);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid part data', details: err.errors });
      }
      console.error('Error creating part', err);
      res.status(500).json({ message: 'Failed to create part' });
    }
  });

  app.patch('/api/parts/:id', async (req, res) => {
    try {
      const partial = insertPartSchema.partial().parse(req.body);
      const updated = await storage.updatePart(req.params.id, partial);
      if (!updated) return res.status(404).json({ message: 'Part not found' });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid part data', details: err.errors });
      }
      console.error('Error updating part', err);
      res.status(500).json({ message: 'Failed to update part' });
    }
  });

  app.delete('/api/parts/:id', async (req, res) => {
    try {
      const success = await storage.deletePart(req.params.id);
      if (!success) return res.status(404).json({ message: 'Part not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting part', err);
      res.status(500).json({ message: 'Failed to delete part' });
    }
  });

  // ============ CHARACTERISTICS ROUTES ============

  app.get('/api/characteristics', async (_req, res) => {
    try {
      const chars = await storage.getCharacteristics();
      res.json(chars);
    } catch (err) {
      console.error('Error fetching characteristics', err);
      res.status(500).json({ message: 'Failed to fetch characteristics' });
    }
  });

  app.get('/api/parts/:id/characteristics', async (req, res) => {
    try {
      const chars = await storage.getCharacteristicsByPart(req.params.id);
      res.json(chars);
    } catch (err) {
      console.error('Error fetching characteristics for part', err);
      res.status(500).json({ message: 'Failed to fetch characteristics' });
    }
  });

  app.post('/api/characteristics', async (req, res) => {
    try {
      const validated = insertCharacteristicSchema.parse(req.body);
      const char = await storage.createCharacteristic(validated);
      res.status(201).json(char);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid characteristic data', details: err.errors });
      }
      console.error('Error creating characteristic', err);
      res.status(500).json({ message: 'Failed to create characteristic' });
    }
  });

  app.patch('/api/characteristics/:id', async (req, res) => {
    try {
      const partial = insertCharacteristicSchema.partial().parse(req.body);
      const updated = await storage.updateCharacteristic(req.params.id, partial);
      if (!updated) return res.status(404).json({ message: 'Characteristic not found' });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid characteristic data', details: err.errors });
      }
      console.error('Error updating characteristic', err);
      res.status(500).json({ message: 'Failed to update characteristic' });
    }
  });

  app.delete('/api/characteristics/:id', async (req, res) => {
    try {
      const success = await storage.deleteCharacteristic(req.params.id);
      if (!success) return res.status(404).json({ message: 'Characteristic not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting characteristic', err);
      res.status(500).json({ message: 'Failed to delete characteristic' });
    }
  });

  // ============ SPC MEASUREMENTS ROUTES ============

  app.post('/api/measurements', async (req, res) => {
    try {
      const validated = insertSpcMeasurementSchema.parse(req.body);
      const measurement = await storage.createMeasurement(validated);
      res.status(201).json(measurement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid measurement data', details: err.errors });
      }
      console.error('Error creating measurement', err);
      res.status(500).json({ message: 'Failed to create measurement' });
    }
  });

  app.patch('/api/measurements/:id', async (req, res) => {
    try {
      const partial = insertSpcMeasurementSchema.partial().parse(req.body);
      const updated = await storage.updateMeasurement(req.params.id, partial);
      if (!updated) return res.status(404).json({ message: 'Measurement not found' });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid measurement data', details: err.errors });
      }
      console.error('Error updating measurement', err);
      res.status(500).json({ message: 'Failed to update measurement' });
    }
  });

  app.delete('/api/measurements/:id', async (req, res) => {
    try {
      const success = await storage.deleteMeasurement(req.params.id);
      if (!success) return res.status(404).json({ message: 'Measurement not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting measurement', err);
      res.status(500).json({ message: 'Failed to delete measurement' });
    }
  });

  // ============ LEGACY / BACKWARD-COMPAT SPC ROUTES ============
  // These return flat joined records for the existing frontend

  app.get('/api/audit-findings', async (_req, res) => {
    try {
      const findings = await storage.getAuditFindings();
      res.json(findings);
    } catch (err) {
      console.error('Error fetching audit findings', err);
      res.status(500).json({ message: 'Failed to fetch audit findings' });
    }
  });

  app.get('/api/machines/:id/findings', async (req, res) => {
    try {
      const findings = await storage.getFindingsByMachine(req.params.id);
      res.json(findings);
    } catch (err) {
      console.error('Error fetching findings for machine', err);
      res.status(500).json({ message: 'Failed to fetch findings' });
    }
  });

  app.post('/api/machines/:id/findings', async (req, res) => {
    try {
      const payload = { ...req.body, machineId: req.params.id };
      const created = await storage.createAuditFinding(payload);
      res.status(201).json(created);
    } catch (err) {
      console.error('Error creating audit finding', err);
      res.status(500).json({ message: 'Failed to create audit finding' });
    }
  });

  // Bulk import audit findings (from CSV import)
  app.post('/api/bulk-findings', async (req, res) => {
    try {
      const items = req.body?.findings;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Expected a non-empty "findings" array.' });
      }
      const created: any[] = [];
      const errors: string[] = [];
      for (let i = 0; i < items.length; i++) {
        try {
          const result = await storage.createAuditFinding(items[i]);
          created.push(result);
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? err.errors.map(e => e.message).join(', ')
            : String(err);
          errors.push(`Item ${i}: ${msg}`);
        }
      }
      res.status(201).json({ created: created.length, errors });
    } catch (err) {
      console.error('Error in bulk import', err);
      res.status(500).json({ message: 'Bulk import failed' });
    }
  });

  // Update a finding (legacy flat update)
  app.patch('/api/findings/:id', async (req, res) => {
    try {
      const updated = await storage.updateAuditFinding(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: 'Audit finding not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating audit finding', err);
      res.status(500).json({ message: 'Failed to update audit finding' });
    }
  });

  // Delete a finding
  app.delete('/api/findings/:id', async (req, res) => {
    try {
      const success = await storage.deleteAuditFinding(req.params.id);
      if (!success) return res.status(404).json({ message: 'Audit finding not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting audit finding', err);
      res.status(500).json({ message: 'Failed to delete audit finding' });
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
