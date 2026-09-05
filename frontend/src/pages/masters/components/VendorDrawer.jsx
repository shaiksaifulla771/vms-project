import React from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Printer } from 'lucide-react';

export default function VendorDrawer({ isOpen, onClose, viewingVendor, onPrintPdf }) {
  if (!viewingVendor) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Vendor Profile — ${viewingVendor.vendorId || ''}`}
      className="!max-w-[70vw] !w-[70vw] !rounded-xl"
    >
      <div className="space-y-4 text-xs">
        <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="font-mono font-extrabold text-blue-400 text-sm bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
              {viewingVendor.vendorId || '-'}
            </span>
            <div>
              <span className="font-extrabold text-sm block capitalize">{viewingVendor.name}</span>
              <span className="text-xs text-slate-300 block">{viewingVendor.company} • {viewingVendor.category}</span>
            </div>
          </div>
          <Badge className={viewingVendor.status === 'Active' ? 'bg-emerald-500 text-white text-xs font-bold' : 'bg-slate-700 text-white text-xs font-bold'}>
            {viewingVendor.status || 'Active'}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Primary Email</span>
            <span className="text-xs font-bold text-slate-700">{viewingVendor.email || '-'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Phone Number</span>
            <span className="text-xs font-bold text-slate-700">{viewingVendor.phone || '-'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Primary Contact Person</span>
            <span className="text-xs font-bold text-slate-700">{viewingVendor.primaryContactName || '-'} ({viewingVendor.primaryContactDesignation || 'Contact'})</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Sourcing Category</span>
            <span className="text-xs font-bold text-slate-700">{viewingVendor.category || '-'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Sub-Category</span>
            <span className="text-xs font-bold text-slate-700">{viewingVendor.subCategory || '-'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">GSTIN / Tax Registration</span>
            <span className="text-xs font-mono font-bold text-blue-600">
              {(viewingVendor.gstList && viewingVendor.gstList.length > 0) ? viewingVendor.gstList.map(g => `${g.state}: ${g.gstin}`).join(' | ') : (viewingVendor.gstin || 'No GST')}
            </span>
          </div>
        </div>

        {/* Certifications Block */}
        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">FFSC 2200 Certification</span>
            <span className="text-xs font-bold text-slate-800">
              {viewingVendor.ffsc2200 ? `✓ Certified (Lic No: ${viewingVendor.ffsc2200LicenseNo || viewingVendor.ffsc2200Qty || 'Active'})` : '✕ Not Certified'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">FSSAI Certification</span>
            <span className="text-xs font-bold text-slate-800">
              {viewingVendor.fssai ? `✓ Certified (Lic No: ${viewingVendor.fssaiLicenseNo || viewingVendor.fssaiQty || 'Active'})` : '✕ Not Certified'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-lg border border-slate-200">
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">
              Primary Plant / Office Address {viewingVendor.addressName ? `(${viewingVendor.addressName})` : ''}
            </span>
            <span className="text-xs text-slate-700 font-medium">
              {viewingVendor.address || 'N/A'} {viewingVendor.address2 ? `, ${viewingVendor.address2}` : ''} {viewingVendor.city ? `, ${viewingVendor.city}` : ''} {viewingVendor.state ? `, ${viewingVendor.state}` : ''} {viewingVendor.zipCode ? `- ${viewingVendor.zipCode}` : ''}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Secondary Plant Addresses</span>
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
              {viewingVendor.secondaryAddresses && viewingVendor.secondaryAddresses.length > 0 ? (
                viewingVendor.secondaryAddresses.map((addr, idx) => (
                  <div key={idx} className="text-xs text-slate-700 font-medium border-b border-slate-100 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
                    <span className="font-semibold text-slate-600">{addr.locationName || `Location #${idx + 1}`}: </span>
                    {addr.address || ''} {addr.address2 ? `, ${addr.address2}` : ''} {addr.city ? `, ${addr.city}` : ''} {addr.state ? `, ${addr.state}` : ''} {addr.zipCode ? `- ${addr.zipCode}` : ''}
                    {addr.gstOption === 'separate' && addr.gstin && (
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5">GSTIN: {addr.gstin} ({addr.gstState})</div>
                    )}
                  </div>
                ))
              ) : (
                <span className="text-xs text-slate-400 italic font-medium">No secondary addresses registered</span>
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 flex items-center justify-between border-t border-slate-100">
          <Button
            onClick={onPrintPdf}
            size="sm"
            className="font-bold flex items-center space-x-1.5 px-4 btn-premium"
          >
            <Printer className="h-4 w-4" />
            <span>Print PDF Profile</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Profile
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
