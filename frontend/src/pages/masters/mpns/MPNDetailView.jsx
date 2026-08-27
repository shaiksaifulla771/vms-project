import React from 'react';
import MasterPageWrapper from '../../../components/masters/MasterPageWrapper';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ChevronLeft, Edit2 } from 'lucide-react';

export default function MPNDetailView({ mpn, onBack, onEdit }) {
  if (!mpn) return null;

  return (
    <MasterPageWrapper direction={1} className="space-y-4">
      {/* Top Navigation Row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to MPNs
        </button>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => onEdit(mpn)}
            variant="outline"
            className="h-8 text-xs font-bold bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit MPN
          </Button>
        </div>
      </div>

      {/* Header & Badges */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {mpn.mpnNumber || mpn.mfrPartNumber || 'MPN Specification'}
          </h1>
          <span className="font-mono text-xs px-2.5 py-0.5 font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            {mpn.mpnId || mpn.code || 'MPN'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 font-semibold">
            Manufacturer: {mpn.manufacturerName || mpn.manufacturer || '-'}
          </Badge>
          {mpn.isDirectFromManufacturer && (
            <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 font-semibold">
              Same as Vendor
            </Badge>
          )}
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700">
            Price: ₹{Number(mpn.unitPrice || mpn.price || 0).toLocaleString()}
          </Badge>
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700">
            MOQ: {mpn.moq || 1} units
          </Badge>
          <Badge
            variant="outline"
            className={
              mpn.status === 'Active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                : 'bg-slate-100 text-slate-600 border-slate-200 font-semibold'
            }
          >
            {mpn.status || 'Active'}
          </Badge>
        </div>
      </div>

      {/* Pure Read-Only Specifications Card - No icons, no lines */}
      <Card className="border border-slate-200 bg-white shadow-2xs rounded-lg overflow-hidden">
        <CardHeader className="py-2.5 px-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Sourcing Linkages & Notes
          </h3>
        </CardHeader>
        <CardContent className="p-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Linked Internal Material</span>
              <div className="text-slate-900 font-semibold text-xs mt-1 truncate">
                {mpn.materialName || (typeof mpn.material === 'object' ? mpn.material?.name : mpn.material) || '-'}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Approved Sourcing Vendor</span>
              <div className="text-slate-900 font-semibold text-xs mt-1 truncate">
                {mpn.vendorName || (typeof mpn.vendor === 'object' ? mpn.vendor?.name : mpn.vendor) || '-'}
              </div>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Datasheet Notes & Specifications</span>
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-slate-800 leading-relaxed text-xs min-h-[48px]">
              {mpn.description || mpn.partDescription || <span className="text-slate-400 italic">No notes entered.</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </MasterPageWrapper>
  );
}
