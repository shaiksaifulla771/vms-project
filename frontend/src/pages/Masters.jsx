import React, { useState } from 'react';
import { Boxes, Building2, Barcode } from 'lucide-react';
import MPNMaster from './masters/MPNMaster';
import MaterialsTab from './masters/MaterialsTab';
import VendorsTab from './masters/VendorsTab';

const tabs = [
  { id: 'materials', label: 'Materials' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'mpns', label: 'MPN' }
];

const Masters = () => {
  const [activeTab, setActiveTab] = useState('materials');

  return (
    <div className="space-y-0 font-sans text-slate-900 min-h-screen">
      {/* Excel Sheet Tabs */}
      <div className="flex border-b border-slate-300 bg-slate-100/80 px-2 pt-1 overflow-x-auto gap-1 select-none">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 font-bold text-xs transition-all border border-b-0 -mb-px flex items-center rounded-t ${
              activeTab === tab.id
                ? 'bg-white border-slate-300 text-blue-700 shadow-2xs font-bold border-t-2 border-t-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white p-0">
        {activeTab === 'materials' ? (
          <MaterialsTab />
        ) : activeTab === 'vendors' ? (
          <VendorsTab />
        ) : (
          <MPNMaster />
        )}
      </div>
    </div>
  );
};

export default Masters;
