import React, { useState } from 'react';
import { Boxes, Building2, Barcode } from 'lucide-react';
import MPNMaster from './masters/MPNMaster';
import MaterialsTab from './masters/MaterialsTab';
import VendorsTab from './masters/VendorsTab';

const tabs = [
  { id: 'materials', label: 'Materials' },
  { id: 'vendors', label: 'Vendors' }
];

const Masters = ({ initialTab = 'materials' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);

  React.useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-1 font-sans text-slate-900 w-full">
      {/* Master Tabs */}
      <div className="sticky top-12 z-20 flex border-b border-slate-300 bg-slate-100 px-2 pt-1 overflow-x-auto gap-1 select-none shadow-2xs">
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
        {activeTab === 'vendors' ? (
          <VendorsTab />
        ) : (
          <MaterialsTab />
        )}
      </div>
    </div>
  );
};

export default Masters;
