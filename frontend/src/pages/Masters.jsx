import React, { useState } from 'react';
import MPNMaster from './masters/MPNMaster';
import MaterialsTab from './masters/MaterialsTab';
import VendorsTab from './masters/VendorsTab';
import BomList from './bom/BomList';

const Masters = () => {
  const [activeTab, setActiveTab] = useState('materials');

  return (
    <div className="space-y-4 font-sans text-slate-900 bg-slate-50 min-h-screen p-2">
      {/* INAPP TEMPLATE HORIZONTAL UNDERLINE TABS */}
      <div className="flex border-b border-slate-200 bg-white px-4 pt-2 rounded-t-xl">
        <button
          onClick={() => setActiveTab('materials')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'materials'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-box-seam fs-5"></i>
          <span>Material Master</span>
        </button>
        <button
          onClick={() => setActiveTab('vendors')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'vendors'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-building-store fs-5"></i>
          <span>Vendor Master</span>
        </button>
        <button
          onClick={() => setActiveTab('mpns')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'mpns'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-barcode fs-5"></i>
          <span>MPN Master</span>
        </button>
        <button
          onClick={() => setActiveTab('boms')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'boms'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-receipt fs-5"></i>
          <span>BOM / Recipes</span>
        </button>
      </div>

      <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-4 shadow-2xs">
        {activeTab === 'materials' ? (
          <MaterialsTab />
        ) : activeTab === 'vendors' ? (
          <VendorsTab />
        ) : activeTab === 'mpns' ? (
          <MPNMaster />
        ) : (
          <BomList />
        )}
      </div>
    </div>
  );
};

export default Masters;
