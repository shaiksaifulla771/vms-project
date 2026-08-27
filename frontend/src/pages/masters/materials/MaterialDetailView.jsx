import React from 'react';
import MasterPageWrapper from '../../../components/masters/MasterPageWrapper';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ChevronLeft, Edit2 } from 'lucide-react';

export default function MaterialDetailView({ material, onBack, onEdit }) {
  if (!material) return null;

  return (
    <MasterPageWrapper direction={1} className="space-y-4">
      {/* Top Navigation Row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Materials
        </button>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => onEdit(material)}
            variant="outline"
            className="h-8 text-xs font-bold bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Material
          </Button>
        </div>
      </div>

      {/* Header & Badges */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {material.name || 'Material Detail'}
          </h1>
          <span className="font-mono text-xs px-2.5 py-0.5 font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            {material.code}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 font-semibold">
            Category: {material.type || 'Raw Material'}
          </Badge>
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 font-semibold uppercase">
            UOM: {material.unit || 'PCS'}
          </Badge>
          <Badge variant="outline" className="bg-white border-slate-200 text-slate-700">
            Sub-Category: {material.subcategory || '-'}
          </Badge>
          <Badge
            variant="outline"
            className={
              material.status === 'Active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                : 'bg-slate-100 text-slate-600 border-slate-200 font-semibold'
            }
          >
            {material.status || 'Active'}
          </Badge>
        </div>
      </div>

      {/* Description Card - No symbols, no lines, no duplicated data */}
      <Card className="border border-slate-200 bg-white shadow-2xs rounded-lg overflow-hidden">
        <CardHeader className="py-2.5 px-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Description & Quality Notes
          </h3>
        </CardHeader>
        <CardContent className="p-4 text-xs text-slate-800 leading-relaxed min-h-[60px]">
          {material.description || <span className="text-slate-400 italic">No description or quality notes recorded.</span>}
        </CardContent>
      </Card>
    </MasterPageWrapper>
  );
}
