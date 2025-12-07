// Shared types for reports page

export interface MachineLog {
  machineId: string;
  machineName: string;
  status: string;
  operatorName: string;
  statsCount: number;
  avgOEE: string;
  completedShifts: string[];
  createdAt: string;
  createdBy: string;
  lastUpdated: string;
  lastUpdatedBy: string;
}

export interface JobSetterActivity {
  operatorName: string;
  operatorId: string;
  type: string;
  target: string;
  timestamp: string;
  details: string;
}

export interface MaintenanceLog {
  id: string;
  machineId: string;
  machineName: string;
  type: string;
  description: string;
  status: string;
  scheduledDate: string;
  completedDate: string;
  technician: string;
  notes: string;
  createdAt: string;
  createdBy: string;
}

export interface ReportResponse {
  data: any[];
  machineLogs: MachineLog[];
  jobSetterActivities: JobSetterActivity[];
  maintenanceLogs: MaintenanceLog[];
}

export interface MachineHistoryResponse {
  machines: MachineHistory[];
}

export interface MachineHistory {
  machineId: string;
  machineName: string;
  machineIdTag: string;
  status: string;
  currentOperator: string;
  createdAt: string;
  updatedAt: string;
  summary: {
    totalProductionStats: number;
    avgOEE: number | null;
    totalMaintenanceRecords: number;
    openMaintenance: number;
    completedMaintenance: number;
  };
  productionStats: ProductionStatHistory[];
  maintenance: MaintenanceHistory[];
}

export interface ProductionStatHistory {
  id: string;
  date: string;
  shift: string;
  goodPartsRan: number;
  scrapParts: number;
  idealCycleTime: number | null;
  downtime: number;
  oee: number | null;
  createdAt: string;
  createdBy: string;
}

export interface MaintenanceHistory {
  id: string;
  type: string;
  description: string;
  status: string;
  scheduledDate: string;
  completedDate: string;
  technician: string;
  notes: string;
  createdAt: string;
  createdBy: string;
}

export interface DowntimeStats {
  summary: {
    totalIncidents: number;
    totalDowntimeMinutes: number;
    totalDowntimeHours: number;
    activeIncidents: number;
    todayDowntimeMinutes: number;
    todayDowntimeHours: number;
    avgDurationMinutes: number;
  };
  byReasonCode: Record<string, { count: number; totalMinutes: number }>;
  byCategory: Record<string, { count: number; totalMinutes: number }>;
  byMachine: Record<string, { count: number; totalMinutes: number; machineName: string }>;
}
