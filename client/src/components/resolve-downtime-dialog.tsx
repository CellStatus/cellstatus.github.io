import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function ResolveDowntimeDialog({ open = false, onOpenChange = () => {}, onResolve = () => {} } : any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Downtime</DialogTitle>
        </DialogHeader>
        <div className="p-4">Resolve downtime placeholder</div>
      </DialogContent>
    </Dialog>
  );
}
