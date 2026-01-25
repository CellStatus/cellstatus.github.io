import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function AssignOperatorDialog({ open = false, onOpenChange = () => {}, onAssign = () => {} } : any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Operator</DialogTitle>
        </DialogHeader>
        <div className="p-4">Assign operator placeholder</div>
      </DialogContent>
    </Dialog>
  );
}
