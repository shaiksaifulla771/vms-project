import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select, TextArea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Drawer } from '../components/ui/Drawer';
import { Search, Plus, Edit2, ToggleLeft, ToggleRight, Trash2, Save, ArrowLeft, ArrowRight, ShieldCheck, Printer, MoreVertical, Eye, Filter, Info, FileSpreadsheet, Download, RefreshCw } from 'lucide-react';
import BulkVendorUploadGrid from '../components/BulkVendorUploadGrid';

import MPNMaster from './masters/MPNMaster';
import MaterialsTab from './masters/MaterialsTab';
import VendorsTab from './masters/VendorsTab';

const Masters = () => {
  const [activeTab, setActiveTab] = useState('materials');

  return (
    <div className="space-y-3">
      {/* Tab select bar */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('materials')}
          className={`px-4 py-1.5 font-bold text-xs transition-all border-b-2 -mb-px ${activeTab === 'materials'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
        >
          Material Master
        </button>
        <button
          onClick={() => setActiveTab('vendors')}
          className={`px-4 py-1.5 font-bold text-xs transition-all border-b-2 -mb-px ${activeTab === 'vendors'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
        >
          Vendor Master
        </button>
        <button
          onClick={() => setActiveTab('mpns')}
          className={`px-4 py-1.5 font-bold text-xs transition-all border-b-2 -mb-px ${activeTab === 'mpns'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
        >
          MPN Master
        </button>
      </div>

      {activeTab === 'materials' ? (
        <MaterialsTab />
      ) : activeTab === 'vendors' ? (
        <VendorsTab />
      ) : (
        <MPNMaster />
      )}
    </div>
  );
};

// -------------------------------------------------------------
// MATERIALS TAB COMPONENT
export default Masters;
