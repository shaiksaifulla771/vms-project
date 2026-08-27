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
      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-3 pt-1.5 rounded-t-xl overflow-x-auto gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-3 shadow-2xs">
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
