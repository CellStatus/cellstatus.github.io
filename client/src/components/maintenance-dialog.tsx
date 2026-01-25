import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function MaintenanceDialog({ open = false, onOpenChange = () => {}, onSubmit = () => {} } : any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Maintenance</DialogTitle>
        </DialogHeader>
        <div className="p-4">Maintenance dialog placeholder</div>
      </DialogContent>
    </Dialog>
  );
}
