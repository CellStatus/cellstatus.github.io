import React from 'react';
import type { Machine } from '@shared/schema';

export function MachineStatusCard({ machine, operator, ...rest }: any) {
  return (
    <div className="p-2 border rounded bg-card">
      <div className="text-sm font-semibold">{machine.name}</div>
      <div className="text-xs text-muted-foreground">ID: {machine.machineId}</div>
      {operator && <div className="text-xs text-muted-foreground">Operator: {operator.name}</div>}
    </div>
  );
}
