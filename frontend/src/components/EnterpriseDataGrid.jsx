import React, { useState } from 'react';
import { Copy, Check, Edit2, Trash2, Eye } from 'lucide-react';

const EnterpriseDataGrid = ({ 
  mode = 'material', 
  data = null, 
  onEdit, 
  onDelete, 
  onView,
  onCopySuccess 
}) => {
  const [copiedCode, setCopiedCode] = useState(null);

  // Fallback Mock Data matching VMS UI structure if data is omitted
  const materialData = [
    { name: 'Cashew7', code: 'M1030', uom: 'gm', category: 'Raw Material', sub: 'Fresh', status: 'Active', desc: 'Raw component item sourced from M/S Shri Krishna Agro Cold Storage' },
    { name: 'Grpes5090', code: 'M1029', uom: 'kg', category: 'Raw Material', sub: 'Fresh', status: 'Active', desc: 'Raw component item sourced from M/S Shri Krishna Agro Cold Storage' },
  ];

  const vendorData = [
    { name: 'Shri Krishna Agro Cold Storage', code: 'V1001', uom: 'N/A', category: 'Logistics', sub: 'Cold Chain', status: 'Active', desc: 'Primary cold storage vendor for raw fruits and cashews.' },
    { name: 'Foodpro Packaging Pvt Ltd', code: 'V1002', uom: 'N/A', category: 'Packaging', sub: 'Retail Pouches', status: 'Active', desc: 'Supplier for spout pouches and retort packaging films.' },
  ];

  const activeData = data && Array.isArray(data) && data.length > 0 
    ? data 
    : (mode === 'vendor' ? vendorData : materialData);

  const handleCopyToClipboard = (text, code) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    setCopiedCode(code);
    if (onCopySuccess) onCopySuccess(text);
    
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden font-sans text-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[768px]">
          {/* Table Header */}
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              <th className="px-4 py-2.5 border-r border-slate-200">{mode === 'vendor' ? 'VENDOR NAME' : 'MATERIAL NAME'}</th>
              <th className="px-4 py-2.5 border-r border-slate-200">CODE</th>
              <th className="px-4 py-2.5 border-r border-slate-200">{mode === 'vendor' ? 'TYPE' : 'UOM'}</th>
              <th className="px-4 py-2.5 border-r border-slate-200">CATEGORY</th>
              <th className="px-4 py-2.5 border-r border-slate-200">SUB-CATEGORY</th>
              <th className="px-4 py-2.5 border-r border-slate-200">STATUS</th>
              <th className="px-4 py-2.5 border-r border-slate-200">DESCRIPTION</th>
              <th className="px-4 py-2.5 text-center">ACTIONS</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {activeData.map((row, index) => {
              const nameVal = row.name || row.company || '-';
              const codeVal = row.code || row.vendorId || '-';
              const uomVal = row.uom || row.unit || (mode === 'vendor' ? 'N/A' : 'pcs');
              const categoryVal = row.category || row.type || '-';
              const subVal = row.sub || row.subcategory || row.subCategory || '-';
              const statusVal = row.status || 'Active';
              const descVal = row.desc || row.description || '-';

              return (
                <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2.5 border-r border-slate-100 font-medium text-slate-900 capitalize">
                    {nameVal}
                  </td>
                  <td className="px-4 py-2.5 border-r border-slate-100 font-mono text-blue-600 font-semibold">
                    <button 
                      onClick={() => onView && onView(row)}
                      className="hover:underline focus:outline-none text-left"
                      title="View Details"
                    >
                      {codeVal}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 border-r border-slate-100 text-slate-500 font-medium">
                    {uomVal}
                  </td>
                  <td className="px-4 py-2.5 border-r border-slate-100 text-slate-600 capitalize">
                    {categoryVal}
                  </td>
                  <td className="px-4 py-2.5 border-r border-slate-100 text-slate-500 capitalize">
                    {subVal}
                  </td>
                  <td className="px-4 py-2.5 border-r border-slate-100">
                    <span className={`font-semibold px-2 py-0.5 rounded border text-[10px] ${
                      statusVal === 'Active' 
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : statusVal === 'Deleted'
                        ? 'text-red-700 bg-red-50 border-red-200'
                        : 'text-slate-600 bg-slate-100 border-slate-200'
                    }`}>
                      {statusVal}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 border-r border-slate-100 text-slate-400 max-w-xs truncate" title={descVal}>
                    {descVal}
                  </td>
                  
                  {/* Dynamic Action Cell */}
                  <td className="px-4 py-2.5 text-center whitespace-nowrap">
                    {mode === 'vendor' ? (
                      /* Full Edit Options for Vendor Master */
                      <div className="flex justify-center items-center space-x-2 text-slate-400">
                        {onView && (
                          <button 
                            onClick={() => onView(row)}
                            className="p-1 rounded hover:text-blue-600 hover:bg-blue-50 transition-colors" 
                            title="View Vendor Profile"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => onEdit && onEdit(row)}
                          className="p-1 rounded hover:text-emerald-600 hover:bg-emerald-50 transition-colors" 
                          title="Edit Vendor"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => onDelete && onDelete(row)}
                          className="p-1 rounded hover:text-red-600 hover:bg-red-50 transition-colors" 
                          title="Delete Vendor"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      /* Read & Copy Only Options for Material Master */
                      <div className="flex justify-center items-center">
                        <button 
                          onClick={() => handleCopyToClipboard(`${nameVal} [${codeVal}]`, codeVal)}
                          className={`border px-2.5 py-1 rounded transition-all flex items-center space-x-1.5 text-[10px] font-semibold ${
                            copiedCode === codeVal
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border-slate-200'
                          }`}
                          title="Copy Ledger Details"
                        >
                          {copiedCode === codeVal ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EnterpriseDataGrid;
