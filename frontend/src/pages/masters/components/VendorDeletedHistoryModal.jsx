import React from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Trash2, RefreshCw } from 'lucide-react';

export default function VendorDeletedHistoryModal({
  isOpen,
  onClose,
  deletedVendorsHistory = [],
  onRestoreVendor
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Deleted Rows & Removed Vendor Sheets History"
      className="!max-w-[65vw] !w-[65vw] !rounded-xl"
    >
      <div className="space-y-4 text-xs">
        <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-red-800 font-semibold flex items-center justify-between">
          <div>
            <span className="font-bold block text-sm">Removed Vendor Rows & Sheets Log</span>
            <span className="text-[11px] text-red-600 block">
              List of deleted vendor rows and removed sheets. Click Restore to return any record back to your active data grid.
            </span>
          </div>
          <Badge className="bg-red-100 text-red-800 border-red-200 text-xs font-bold">
            {deletedVendorsHistory.length} Removed Items
          </Badge>
        </div>

        {deletedVendorsHistory.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-1">
            <Trash2 className="h-8 w-8 mx-auto text-slate-300" />
            <span className="font-bold text-xs block text-slate-500">No deleted rows or sheets in history</span>
            <span className="text-[11px] text-slate-400 block">
              When you delete vendor rows or remove sheets, they will appear here for easy restoration.
            </span>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {deletedVendorsHistory.map((item, idx) => (
              <div key={idx} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="font-mono font-bold text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">
                    {item.vendorId || 'ROW'}
                  </span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-800 text-xs capitalize">{item.name}</span>
                      <Badge className={item.deletionType === 'Deleted Sheet' ? 'bg-red-100 text-red-700 border-red-200 text-[9px]' : 'bg-amber-100 text-amber-700 border-amber-200 text-[9px]'}>
                        {item.deletionType || 'Deleted Row'}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-slate-500 block">{item.company || 'Company'} • {item.email || '-'}</span>
                    <span className="text-[10px] text-slate-400 block">
                      Deleted at: {item.deletedAt ? new Date(item.deletedAt).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onRestoreVendor(item)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Restore Record</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 flex justify-end border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close History Log
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
