import React from 'react';
import MasterPageWrapper from '../../../components/masters/MasterPageWrapper';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ChevronLeft, Edit2 } from 'lucide-react';

export default function VendorDetailView({ vendor, onBack, onEdit }) {
  if (!vendor) return null;

  return (
    <MasterPageWrapper direction={1} className="space-y-4">
      {/* Top Navigation Row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Vendors
        </button>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => onEdit(vendor)}
            variant="outline"
            className="h-8 text-xs font-bold bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Vendor
          </Button>
        </div>
      </div>

      {/* Header & Badges */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {vendor.company || vendor.name || 'Vendor Profile'}
          </h1>
          <span className="font-mono text-xs px-2.5 py-0.5 font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            {vendor.vendorId || vendor.code}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 font-semibold">
            Category: {vendor.category || 'Supplier'}
          </Badge>
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700">
            Rep: {vendor.name || '-'}
          </Badge>
          {vendor.gstin && (
            <Badge variant="outline" className="bg-white border-slate-200 font-mono text-slate-700">
              GSTIN: {vendor.gstin}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={
              vendor.status === 'Active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                : 'bg-slate-100 text-slate-600 border-slate-200 font-semibold'
            }
          >
            {vendor.status || 'Active'}
          </Badge>
        </div>
      </div>

      {/* Pure Read-Only Cards Grid - No icons, no lines */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Company & Contact Profile */}
        <Card className="border border-slate-200 bg-white shadow-2xs rounded-lg overflow-hidden">
          <CardHeader className="py-2.5 px-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Contact & Address
            </h3>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Email Address</span>
                <div className="text-slate-800 font-medium text-xs mt-1 truncate">{vendor.email || '-'}</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Phone Number</span>
                <div className="text-slate-800 font-medium text-xs mt-1">{vendor.phone || '-'}</div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Registered Business Address</span>
              <div className="text-slate-800 text-xs mt-1 leading-relaxed">
                {vendor.address ? (
                  <div>
                    {vendor.address}{vendor.address2 ? `, ${vendor.address2}` : ''}, {vendor.city || ''} {vendor.state || ''} {vendor.zipCode ? `- ${vendor.zipCode}` : ''}
                  </div>
                ) : (
                  <span className="text-slate-400 italic">No registered address specified.</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Banking & Settlement Profile */}
        <Card className="border border-slate-200 bg-white shadow-2xs rounded-lg overflow-hidden">
          <CardHeader className="py-2.5 px-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Banking & Tax Credentials
            </h3>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Bank Name</span>
                <div className="font-bold text-slate-900 text-xs mt-1 truncate">{vendor.bankName || '-'}</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Account Number</span>
                <div className="font-mono font-bold text-slate-900 text-xs mt-1 truncate">{vendor.bankAccountNumber || '-'}</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">IFSC Code</span>
                <div className="font-mono font-bold text-blue-700 text-xs mt-1">{vendor.ifscCode || '-'}</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Account Holder</span>
                <div className="font-medium text-slate-900 text-xs mt-1 truncate">{vendor.bankAccountHolder || '-'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MasterPageWrapper>
  );
}
