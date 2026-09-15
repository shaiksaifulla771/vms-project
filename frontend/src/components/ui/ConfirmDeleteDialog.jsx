import React from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDeleteDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirm Deletion",
  message = "Are you sure you want to delete this item? This action will move it to the deleted history.",
  itemCount = 1 
}) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} className="max-w-md">
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          {itemCount > 1 ? `Delete ${itemCount} items?` : 'Confirm to delete?'}
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          {message}
        </p>
        
        <div className="flex w-full space-x-3">
          <Button variant="outline" className="flex-1 font-semibold" onClick={onClose}>
            No, Cancel
          </Button>
          <Button 
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold border-0 shadow-sm" 
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Yes, Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
