import React from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';

export default function VendorAuditModal({ isOpen, onClose, viewingVendorAudit }) {
  if (!viewingVendorAudit) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Revision Log & Audit Trail"
      className="!max-w-[450px] !w-[450px]"
    >
      <div className="space-y-4">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Selected Vendor</div>
          <div className="text-sm font-semibold text-slate-900 mt-1 capitalize">{viewingVendorAudit.name}</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
            Company: {viewingVendorAudit.company} | Category: {viewingVendorAudit.category}
          </div>
        </div>

        <div className="relative pl-6 border-l border-slate-200 space-y-4 text-xs ml-2">
          <div className="relative">
            <div className="absolute -left-[30px] top-1 bg-blue-600 rounded-full h-2 w-2 border border-white ring-4 ring-blue-50" />
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
              <span>10-Jul-2026 10:30 AM</span>
              <span className="font-semibold text-slate-700">Admin</span>
            </div>
            <p className="font-bold text-slate-800 mt-0.5">Status set to {viewingVendorAudit.status}</p>
            <p className="text-slate-500 mt-0.5 text-[11px]">System action triggered via status toggle interface.</p>
          </div>

          <div className="relative">
            <div className="absolute -left-[30px] top-1 bg-slate-400 rounded-full h-2 w-2 border border-white ring-4 ring-slate-50" />
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
              <span>08-Jul-2026 02:40 PM</span>
              <span className="font-semibold text-slate-700">Procurement Lead</span>
            </div>
            <p className="font-bold text-slate-800 mt-0.5">Vendor Information Updated</p>
            <p className="text-slate-500 mt-0.5 text-[11px]">GST details verified against national tax database.</p>
          </div>

          <div className="relative">
            <div className="absolute -left-[30px] top-1 bg-slate-400 rounded-full h-2 w-2 border border-white ring-4 ring-slate-50" />
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
              <span>05-Jul-2026 09:15 AM</span>
              <span className="font-semibold text-slate-700">System Agent</span>
            </div>
            <p className="font-bold text-slate-800 mt-0.5">Vendor Profile Registered</p>
            <p className="text-slate-500 mt-0.5 text-[11px]">
              Profile created and designated sourcing category set to {viewingVendorAudit.category}.
            </p>
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end border-t border-slate-100 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Log
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
