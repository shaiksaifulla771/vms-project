import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select, TextArea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Drawer } from '../components/ui/Drawer';
import { Search, Plus, Edit2, ToggleLeft, ToggleRight, Trash2, Save, ArrowLeft, ArrowRight, ShieldCheck, Printer, MoreVertical, Filter, Info } from 'lucide-react';

const Masters = () => {
  const [activeTab, setActiveTab] = useState('materials');

  return (
    <div className="space-y-3">
      {/* Tab select bar */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('materials')}
          className={`px-4 py-1.5 font-bold text-xs transition-all border-b-2 -mb-px ${
            activeTab === 'materials'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Material Master
        </button>
        <button
          onClick={() => setActiveTab('vendors')}
          className={`px-4 py-1.5 font-bold text-xs transition-all border-b-2 -mb-px ${
            activeTab === 'vendors'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Vendor Master
        </button>
      </div>

      {activeTab === 'materials' ? <MaterialsTab /> : <VendorsTab />}
    </div>
  );
};

// -------------------------------------------------------------
// MATERIALS TAB COMPONENT
// -------------------------------------------------------------
let toastIdCounter = 0;

const MaterialsTab = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [currentFileName, setCurrentFileName] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [isAutoEntry, setIsAutoEntry] = useState(true);
  const [importTargetType, setImportTargetType] = useState('new');
  const [newSheetName, setNewSheetName] = useState('');
  const [selectedExistingSheet, setSelectedExistingSheet] = useState('');
  const [showFunctionList, setShowFunctionList] = useState(false);
  const [editableAcceptedItems, setEditableAcceptedItems] = useState([]);
  const [editingPreviewIdx, setEditingPreviewIdx] = useState(null);
  const [previewRowData, setPreviewRowData] = useState({});
  const [batchEditItems, setBatchEditItems] = useState([]);
  const [batchEditIdx, setBatchEditIdx] = useState(0);
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
  const [showVendorFunctionList, setShowVendorFunctionList] = useState(false);
  const [hasInitializedSourceFilter, setHasInitializedSourceFilter] = useState(false);
  const uniqueImportSources = React.useMemo(() => {
    const sources = new Set();
    materials.forEach(m => {
      if (m.importSource) {
        sources.add(m.importSource);
      }
    });
    return Array.from(sources);
  }, [materials]);


  const [error, setError] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [viewingMaterialAudit, setViewingMaterialAudit] = useState(null);
  const [activeFilterCol, setActiveFilterCol] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [tempFilters, setTempFilters] = useState({});
  const [filterSearchText, setFilterSearchText] = useState({});
  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    unit: 'pcs',
    type: 'Raw Material',
    subcategory: 'Fresh',
    status: 'Active',
    description: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const autoSaveIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  const [autoPrefix, setAutoPrefix] = useState(() => localStorage.getItem('erp_auto_prefix') || 'DCODE');
  const [toasts, setToasts] = useState([]);
  const [editingRowId, setEditingRowId] = useState(null);
  const [confirmedReplacements, setConfirmedReplacements] = useState(new Set());
  const [skippedItems, setSkippedItems] = useState(new Set());
  const [bulkUpdateTab, setBulkUpdateTab] = useState('changed');
  const [selectedRowIds, setSelectedRowIds] = useState(new Set()); // multi-checkbox selection for Edit Selected
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [editRowData, setEditRowData] = useState({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [importSearch, setImportSearch] = useState('');

  // Reset search when modal is closed
  useEffect(() => {
    if (!isImportModalOpen) {
      setImportSearch('');
    }
  }, [isImportModalOpen]);

  // Bulk update applies reviewed spreadsheet changes from the final import action.
  const unresolvedCount = React.useMemo(() => {
    return 0;
  }, []);

  useEffect(() => {
    localStorage.setItem('erp_auto_prefix', autoPrefix);
  }, [autoPrefix]);

  const showToast = (message, type = 'success') => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };
  const [drafts, setDrafts] = useState(() => {
    try {
      const saved = localStorage.getItem('erp_material_drafts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [showDraftsList, setShowDraftsList] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Sub-category dictionary maps main categories to options
  const subcategoryMap = {
    'Raw Material': [
      { value: 'Fresh', label: 'Fresh' },
      { value: 'Standardized', label: 'Standardized' },
      { value: 'Retail', label: 'Retail' }
    ],
    'Raw': [
      { value: 'Fresh', label: 'Fresh' },
      { value: 'Standardized', label: 'Standardized' },
      { value: 'Retail', label: 'Retail' }
    ],
    'Finished Goods': [
      { value: 'Puree', label: 'Puree' },
      { value: 'Porridge', label: 'Porridge' },
      { value: 'Yogurt Melts', label: 'Yogurt Melts' }
    ],
    'Finished': [
      { value: 'Puree', label: 'Puree' },
      { value: 'Porridge', label: 'Porridge' },
      { value: 'Yogurt Melts', label: 'Yogurt Melts' }
    ],
    'Semi-Finished': [
      { value: 'Puree', label: 'Puree' },
      { value: 'Porridge', label: 'Porridge' },
      { value: 'Yogurt Melts', label: 'Yogurt Melts' }
    ],
    'Packing Material': [
      { value: 'Primary', label: 'Primary' },
      { value: 'Secondary', label: 'Secondary' },
      { value: 'Tertiary', label: 'Tertiary' }
    ],
    'Packing': [
      { value: 'Primary', label: 'Primary' },
      { value: 'Secondary', label: 'Secondary' },
      { value: 'Tertiary', label: 'Tertiary' }
    ]
  };

  const fetchMaterials = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(search && { search }),
        ...(typeFilter && { type: typeFilter })
      };
      const res = await api.get('/api/materials', { params });
      if (res.data && res.data.success) {
        setMaterials(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch materials from warehouse databases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, [typeFilter]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchMaterials();
    }, 450);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Form Auto-save Draft (Supports up to 10 drafts, FIFO priority Queue)
  useEffect(() => {
    if (isModalOpen && !editingId) {
      const timer = setInterval(() => {
        setFormData((currData) => {
          // Prevent saving empty forms on open
          if (!currData.name.trim() && currData.code === '0001') {
            return currData;
          }

          setDrafts((prevDrafts) => {
            const now = new Date().toLocaleTimeString();
            let targetId = currentDraftId;
            let updated = [...prevDrafts];

            if (!targetId) {
              targetId = `draft_${Date.now()}`;
              setCurrentDraftId(targetId);
            }

            const existingIndex = updated.findIndex((d) => d.id === targetId);
            const draftEntry = {
              id: targetId,
              timestamp: now,
              data: currData
            };

            if (existingIndex >= 0) {
              updated[existingIndex] = draftEntry;
            } else {
              updated.unshift(draftEntry); // Newest draft first
            }

            // FIFO: Queue size restricted to 10
            if (updated.length > 10) {
              updated = updated.slice(0, 10);
            }

            localStorage.setItem('erp_material_drafts', JSON.stringify(updated));
            setDraftMessage(`Draft autosaved at ${now}`);
            return updated;
          });

          return currData;
        });
      }, 3000); // Auto-save frequency: 3s

      return () => clearInterval(timer);
    } else {
      setDraftMessage('');
    }
  }, [isModalOpen, editingId, currentDraftId]);

  const handleLoadDraft = (draft) => {
    setEditingId(null);
    setCurrentDraftId(draft.id);
    setFormData(draft.data);
    setFormErrors({});
    setIsModalOpen(true);
    setShowDraftsList(false);
    setDraftMessage(`Restored draft from ${draft.timestamp}`);
  };

  const handleDiscardDraft = (draftId, e) => {
    e.stopPropagation();
    if (!window.confirm('Discard this draft?')) return;
    setDrafts((prev) => {
      const filtered = prev.filter((d) => d.id !== draftId);
      localStorage.setItem('erp_material_drafts', JSON.stringify(filtered));
      return filtered;
    });
  };

  const handleViewDetails = (mat) => {
    setViewingMaterial(mat);
    setIsViewModalOpen(true);
  };

  const toggleFilterPopup = (col, e) => {
    e.stopPropagation();
    if (activeFilterCol === col) {
      setActiveFilterCol(null);
    } else {
      setActiveFilterCol(col);
      setTempFilters({
        ...tempFilters,
        [col]: columnFilters[col] || []
      });
      setFilterSearchText({
        ...filterSearchText,
        [col]: ''
      });
    }
  };

  const handleCheckboxChange = (col, val, checked) => {
    const current = tempFilters[col] || [];
    if (checked) {
      setTempFilters({
        ...tempFilters,
        [col]: [...current, val]
      });
    } else {
      setTempFilters({
        ...tempFilters,
        [col]: current.filter(x => x !== val)
      });
    }
  };

  const applyColumnFilter = (col) => {
    setColumnFilters(prev => ({
      ...prev,
      [col]: tempFilters[col] || []
    }));
    setActiveFilterCol(null);
  };

  const clearColumnFilter = (col) => {
    setColumnFilters(prev => ({
      ...prev,
      [col]: []
    }));
    setTempFilters(prev => ({
      ...prev,
      [col]: []
    }));
    setActiveFilterCol(null);
  };

  const handleResetAllFilters = () => {
    setSearch('');
    setTypeFilter('');
    setSourceFilter('');
    setColumnFilters({});
    setTempFilters({});
    setFilterSearchText({});
  };

  const renderFilterPopupContent = (col) => {
    let rawOptions = [];
    if (col === 'status') {
      rawOptions = ["Active", "Inactive"];
    } else {
      rawOptions = getUniqueValues(col);
    }

    const searchStr = (filterSearchText[col] || '').toLowerCase().trim();
    const filteredOptions = rawOptions.filter(val => {
      if (val.toLowerCase().includes(searchStr)) return true;
      if (col === 'name') {
        const matchingMaterials = materials.filter(m => m.name.toLowerCase() === val.toLowerCase());
        const hasMatchingCategory = matchingMaterials.some(m => 
          (m.type || '').toLowerCase().includes(searchStr) || 
          (m.subcategory || '').toLowerCase().includes(searchStr)
        );
        if (hasMatchingCategory) return true;
      }
      return false;
    });

    if (filteredOptions.length === 0) {
      return (
        <div className="py-3 text-center space-y-1">
          <span className="text-[11px] text-slate-400 font-semibold block">No matching options found</span>
          <div className="flex items-center justify-center space-x-1.5 pt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFilterSearchText({ ...filterSearchText, [col]: '' });
              }}
              className="text-[10px] text-blue-600 hover:underline font-bold"
            >
              Clear Search
            </button>
            <span className="text-slate-300 text-[10px]">|</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearColumnFilter(col);
              }}
              className="text-[10px] text-slate-500 hover:underline font-bold"
            >
              Clear Filter
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
        {filteredOptions.map(val => (
          <label key={val} className="flex items-center space-x-1.5 cursor-pointer text-slate-700 hover:text-slate-900 text-[11px] font-medium font-sans">
            <input
              type="checkbox"
              checked={(tempFilters[col] || []).includes(val)}
              onChange={(e) => handleCheckboxChange(col, val, e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-0 h-3 w-3 cursor-pointer"
            />
            <span className={col === 'unit' ? 'uppercase' : col === 'name' ? '' : 'capitalize'}>
              {col === 'name' || col === 'unit' ? val : val.toLowerCase()}
            </span>
          </label>
        ))}
      </div>
    );
  };

  const handlePrintPdf = () => {
    if (!viewingMaterial) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Material Report - ${viewingMaterial.code}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; margin: 0; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
            .title { font-size: 18px; font-weight: bold; color: #0f172a; }
            .subtitle { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: bold; }
            .grid { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
            .field { display: flex; flex-direction: column; gap: 4px; }
            .label { font-size: 10px; color: #0f172a; font-weight: bold; text-transform: uppercase; }
            .value { font-size: 13px; color: #000000; font-weight: bold; padding: 6px 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; text-transform: capitalize; }
            .value-code { font-family: monospace; font-size: 12px; color: #1e3a8a; }
            .desc-val { font-size: 12px; line-height: 1.5; color: #000000; font-weight: bold; min-height: 60px; text-transform: none; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 8px; color: #94a3b8; text-align: center; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="subtitle">Enterprise Resource Planning Portal</div>
              <div class="title">Material Report</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; font-weight: bold; color: #2563eb; font-family: monospace;">CODE: ${viewingMaterial.code}</div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">Date Generated: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div class="grid">
            <div class="field">
              <div class="label">Material Name</div>
              <div class="value">${viewingMaterial.name.toLowerCase()}</div>
            </div>
            <div class="field">
              <div class="label">Unique Code</div>
              <div class="value value-code">${viewingMaterial.code}</div>
            </div>
            <div class="field">
              <div class="label">Unit of Measure (UOM)</div>
              <div class="value" style="text-transform: uppercase;">${viewingMaterial.unit}</div>
            </div>
            <div class="field">
              <div class="label">Category</div>
              <div class="value">${viewingMaterial.type}</div>
            </div>
            <div class="field">
              <div class="label">Sub Category</div>
              <div class="value">${viewingMaterial.subcategory || '-'}</div>
            </div>
            <div class="field">
              <div class="label">Operational Status</div>
              <div class="value">${viewingMaterial.status || 'Active'}</div>
            </div>
            <div class="field">
              <div class="label">Material Description & Notes</div>
              <div class="value desc-val">${viewingMaterial.description || 'No description provided.'}</div>
            </div>
          </div>

          <div class="footer">
            ERP Portal Material Specification Document. Confidential & Internal Use Only.
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getNextManualCode = () => {
    let maxCounter = 1000;
    materials.forEach(m => {
      if (m.code) {
        const match = m.code.toString().match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxCounter) {
            maxCounter = num;
          }
        }
      }
    });
    return `M${maxCounter + 1}`;
  };

  const getNextAutoCounter = (baseSequence = null) => {
    if (baseSequence) return baseSequence;
    
    // Fallback if sequence fails
    let maxCounter = 1000;
    materials.forEach(m => {
      if (m.code) {
        const match = m.code.toString().match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxCounter) {
            maxCounter = num;
          }
        }
      }
    });
    return maxCounter + 1;
  };

  const handleOpenAddModal = async () => {
    setEditingId(null);
    setCurrentDraftId(null);
    setFormErrors({});
    
    // Default fallback code
    let nextCodeStr = "M1001";
    try {
      const res = await api.get('/api/materials/sequence-peek');
      if (res.data && res.data.nextCode) {
        nextCodeStr = `M${res.data.nextCode}`;
      }
    } catch (e) {
      console.warn("Failed to fetch sequence peek", e);
      nextCodeStr = getNextManualCode(); // fallback
    }

    setFormData({ 
      name: '', 
      code: nextCodeStr, 
      unit: 'pcs', 
      type: 'Raw Material', 
      subcategory: 'Fresh', 
      status: 'Active',
      description: '' 
    });
    setIsModalOpen(true);
  };

  const handleExportData = () => {
    const dataToExport = filteredMaterials.map(m => ({
      "Material Name": m.name,
      "Material Code": m.code,
      "UOM": m.unit,
      "Category": m.type,
      "Sub Category": m.subcategory || '',
      "Status": m.status || 'Active',
      "Description": m.description || ''
    }));

    if (dataToExport.length === 0) {
      showToast("No data to export", "error");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Master");
    XLSX.writeFile(wb, "material_master_export.xlsx");
    showToast(`Exported ${dataToExport.length} materials successfully!`);
  };

  const handleAddToAllMaterials = async () => {
    if (!sourceFilter) return;
    if (!window.confirm(`Are you sure you want to add all materials from "${sourceFilter}" to All Materials? This will merge them into the master list and remove the sheet isolation.`)) return;
    
    setSubmitLoading(true);
    try {
      const sheetMaterials = materials.filter(m => m.importSource === sourceFilter);
      if (sheetMaterials.length === 0) {
        showToast("No materials found in this sheet.", "error");
        setSubmitLoading(false);
        return;
      }

      const itemsToUpdate = sheetMaterials.map(m => ({
        name: m.name,
        code: m.code,
        unit: m.unit,
        type: m.type,
        subcategory: m.subcategory,
        description: m.description || '',
        status: m.status || 'Active'
      }));

      const res = await api.post('/api/materials/batch', {
        items: itemsToUpdate,
        importSource: ''
      });

      if (res.data && res.data.success) {
        showToast(`Successfully merged ${sheetMaterials.length} materials into All Materials.`, "success");
        setSourceFilter('');
        fetchMaterials();
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || "Failed to merge sheet data";
      showToast(errMsg, "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      { name: "Raw Cumin Powder", code: "00001", unit: "kg", type: "Raw Material", subcategory: "Fresh", status: "Active", description: "Fresh premium raw cumin seeds grinded" },
      { name: "Premium Mango Puree", code: "02000", unit: "L", type: "Finished Goods", subcategory: "Puree", status: "Active", description: "Processed mango puree ready for packaging" }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Template");
    XLSX.writeFile(wb, "material_import_template.xlsx");
    showToast("Template downloaded successfully!");
  };

  const getRowValueIgnoreCase = (row, keys) => {
    for (const rowKey in row) {
      const normalizedRowKey = rowKey.trim().toLowerCase().replace(/[\s_-]/g, '');
      for (const key of keys) {
        const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
        if (normalizedRowKey === normalizedKey) {
          return row[rowKey];
        }
      }
    }
    return null;
  };

  const validateRowData = (item, isAutoEntryVal, systemExistingCodes, importedCodesInBatch, autoCounterRef, fullMaterialsList) => {
    const errors = [];
    const warnings = [];
    const name = (item.name || '').toString().trim();
    const code = (item.code || '').toString().trim();
    const unit = (item.unit || '').toString().trim().toLowerCase();
    const type = (item.type || '').toString().trim();
    const subcategory = (item.subcategory || '').toString().trim();
    const description = (item.description || '').toString().trim();
    const status = (item.status || 'Active').toString().trim();

    if (!name) {
      errors.push("Material Name is missing.");
    }

    // UOM: case-insensitive, accept L/l/ltr/litre, kg, gm, pcs
    const validUnits = ['pcs', 'kg', 'gm', 'l', 'ltr', 'litre', 'liters', 'nos', 'box', 'pack', 'set', 'mtr', 'cm', 'mm'];
    if (!validUnits.includes(unit.toLowerCase())) {
      warnings.push(`UOM '${unit || ''}' is non-standard. It will be saved as entered.`);
    }

    const normalizedType = type === 'Raw' || type === 'Raw Material' ? 'Raw Material' 
                         : type === 'Finished' || type === 'Finished Goods' ? 'Finished Goods'
                         : type === 'Packing' || type === 'Packing Material' ? 'Packing Material' : null;
    if (!normalizedType) {
      errors.push(`Invalid Category '${type || ''}'. Must be Raw Material, Finished Goods, or Packing Material.`);
    }

    let matchedSubcat = null;
    if (normalizedType && subcategory) {
      matchedSubcat = (subcategoryMap[normalizedType] || []).find(s => s.value.toLowerCase() === subcategory.toLowerCase());
      if (!matchedSubcat) {
        // Accept as-is but warn — do NOT block the import
        warnings.push(`Sub-Category '${subcategory}' is not in the predefined list for '${normalizedType}'. It will be saved as entered.`);
        matchedSubcat = { value: subcategory }; // use the raw value
      }
    } else if (!subcategory) {
      // Missing sub-category is a warning, not an error
      warnings.push("Sub-Category is missing. It will be left blank.");
    }

    let finalCode = '';
    let isUpdatingExisting = false;
    let fieldChanges = [];

    if (isAutoEntryVal) {
      // ─── BULK ENTRY MODE ─────────────────────────────────────────────────────
      // Ignore Excel codes. Look up by Name + Type.
      // Found in DB → mark existing (Replace/Skip dialog)
      // Not found   → auto-generate code from 2001+

      const existingByName = (fullMaterialsList || []).find(m =>
        m.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        m.type.trim().toLowerCase() === (normalizedType || type).trim().toLowerCase()
      );

      if (existingByName) {
        finalCode = existingByName.code.toUpperCase();
        isUpdatingExisting = true;
        warnings.push(`'${name}' already exists in the database (Code: ${existingByName.code}). Please choose to Replace or Skip.`);
      } else {
        let nextVal = autoCounterRef.val;
        finalCode = `M${nextVal}`;
        autoCounterRef.val++;
        while (systemExistingCodes.includes(finalCode) || importedCodesInBatch.has(finalCode)) {
          nextVal = autoCounterRef.val;
          finalCode = `M${nextVal}`;
          autoCounterRef.val++;
        }
      }

    } else {
      // ─── BULK UPDATE MODE ────────────────────────────────────────────────────
      // Match by CODE from Excel → compute field-level diff → Accept/Skip per row

      const excelCode = (code || '').toString().trim().toUpperCase();

      if (excelCode) {
        // Automatically prepend 'M' if it's just a number
        const isPureNum = /^\d+$/.test(excelCode);
        finalCode = isPureNum ? `M${excelCode}` : excelCode;

        const existingByCode = (fullMaterialsList || []).find(
          m => m.code.toUpperCase().trim() === finalCode
        );

        if (existingByCode) {
          isUpdatingExisting = true;

          const newStatus = ['active', 'inactive'].includes(status.toLowerCase())
            ? (status.toLowerCase() === 'active' ? 'Active' : 'Inactive')
            : 'Active';
          const newSubcat = matchedSubcat ? matchedSubcat.value : subcategory;
          const newType   = normalizedType || type;

          const fieldDefs = [
            { label: 'Name',         oldVal: existingByCode.name        || '', newVal: name        },
            { label: 'UOM',          oldVal: existingByCode.unit        || '', newVal: unit        },
            { label: 'Category',     oldVal: existingByCode.type        || '', newVal: newType     },
            { label: 'Sub-Category', oldVal: existingByCode.subcategory || '', newVal: newSubcat   },
            { label: 'Status',       oldVal: existingByCode.status      || '', newVal: newStatus   },
            { label: 'Description',  oldVal: existingByCode.description || '', newVal: description },
          ];

          fieldChanges = fieldDefs.filter(f =>
            f.oldVal.toString().trim().toLowerCase() !== f.newVal.toString().trim().toLowerCase()
          );

          if (fieldChanges.length === 0) {
            warnings.push(`Code '${finalCode}': No changes detected — data is identical to the database record.`);
          } else {
            warnings.push(`Code '${finalCode}': ${fieldChanges.length} field(s) will be updated. Review and confirm.`);
          }
        }
        // else: code not in DB → treat as new, use provided code as-is

      } else {
        // No code in Excel — fall back to name+type lookup
        const existingByName = (fullMaterialsList || []).find(m =>
          m.name.trim().toLowerCase() === name.trim().toLowerCase() &&
          m.type.trim().toLowerCase() === (normalizedType || type).trim().toLowerCase()
        );
        if (existingByName) {
          finalCode = existingByName.code.toUpperCase();
          isUpdatingExisting = true;
          warnings.push(`'${name}' matched by name in database (Code: ${existingByName.code}). Review and confirm.`);
        } else {
          // Genuinely new — auto-generate code
          let nextVal = autoCounterRef.val;
          finalCode = `M${nextVal}`;
          autoCounterRef.val++;
          while (systemExistingCodes.includes(finalCode) || importedCodesInBatch.has(finalCode)) {
            nextVal = autoCounterRef.val;
            finalCode = `M${nextVal}`;
            autoCounterRef.val++;
          }
        }
      }
    }

    return {
      errors,
      warnings,
      isUpdatingExisting,
      fieldChanges,
      item: {
        name,
        code: finalCode,
        unit,
        type: normalizedType || type,
        subcategory: matchedSubcat ? matchedSubcat.value : subcategory,
        description,
        status: ['active', 'inactive'].includes(status.toLowerCase())
          ? (status.toLowerCase() === 'active' ? 'Active' : 'Inactive')
          : 'Active'
      }
    };
  };


  const recalculateImportSummary = (allItemsList, systemExistingCodes, isAutoEntryVal, baseSequence = null) => {
    const importedCodesInBatch = new Set();
    const autoCounter = getNextAutoCounter(baseSequence);
    const autoCounterRef = { val: autoCounter };

    const processedItems = allItemsList.map((item, index) => {
      const rowNum = index + 1;
      
      const rawItem = {
        name: item.name,
        code: item.code,
        unit: item.unit,
        type: item.type,
        subcategory: item.subcategory,
        description: item.description,
        status: item.status
      };

      const validation = validateRowData(rawItem, isAutoEntryVal, systemExistingCodes, importedCodesInBatch, autoCounterRef, materials);
      
      let isDuplicate = false;
      let duplicateMsg = '';
      const isExistingMatch = validation.isUpdatingExisting || false;

      // Only check for in-spreadsheet code collisions on TRULY NEW items.
      // Existing DB matches reuse the DB code — two rows matching the same DB
      // record is expected and should show in the Replace/Skip dialog, NOT as errors.
      if (!isExistingMatch && validation.item.code) {
        const checkCode = validation.item.code.toUpperCase();
        if (importedCodesInBatch.has(checkCode)) {
          isDuplicate = true;
          duplicateMsg = `Duplicate Entry: Code '${validation.item.code}' appears multiple times in this spreadsheet.`;
        }
      }

      if (isDuplicate) {
        validation.errors.push(duplicateMsg);
      } else if (validation.errors.length === 0 && validation.item.code && !isExistingMatch) {
        // Only track auto-generated codes for collision detection
        importedCodesInBatch.add(validation.item.code.toUpperCase());
      }

      // Attach existing material details for the confirmation UI
      let existingMaterialDetails = null;
      if (isExistingMatch && validation.item.code) {
        const existingMat = materials.find(m => m.code.toUpperCase().trim() === validation.item.code.toUpperCase());
        if (existingMat) {
          existingMaterialDetails = {
            name: existingMat.name,
            code: existingMat.code,
            unit: existingMat.unit,
            type: existingMat.type,
            subcategory: existingMat.subcategory || '',
            status: existingMat.status || 'Active'
          };
        }
      }

      return {
        ...validation.item,
        isDuplicate,
        isExistingMatch,
        fieldChanges: validation.fieldChanges || [],
        existingMaterialDetails,
        validationErrors: validation.errors.map(err => `Row ${rowNum}: ${err}`),
        validationWarnings: validation.warnings.map(warn => `Row ${rowNum}: ${warn}`)
      };
    });

    const acceptedItems = processedItems.filter(item => item.validationErrors.length === 0 && !item.isExistingMatch);
    const existingMatchItems = processedItems.filter(item => item.isExistingMatch && item.validationErrors.length === 0);
    const duplicateItems = processedItems.filter(item => item.isDuplicate);
    const rejectedItems = processedItems.filter(item => item.validationErrors.length > 0 && !item.isDuplicate);

    return {
      processedItems,
      summary: {
        total: processedItems.length,
        acceptedCount: acceptedItems.length,
        existingMatchCount: existingMatchItems.length,
        duplicateCount: duplicateItems.length,
        rejectedCount: rejectedItems.length,
        accepted: acceptedItems,
        existingMatches: existingMatchItems,
        duplicates: duplicateItems,
        rejected: processedItems.filter(item => item.validationErrors.length > 0).reduce((acc, curr) => acc.concat(curr.validationErrors), [])
      }
    };
  };

  const processExcelFile = async (file) => {
    let baseSequence = null;
    try {
      const seqRes = await api.get('/api/materials/sequence-peek');
      if (seqRes.data && seqRes.data.nextCode) {
        baseSequence = seqRes.data.nextCode;
      }
    } catch (e) {
      console.warn("Failed to fetch sequence peek", e);
    }
    setCurrentFileName(file.name);
    setNewSheetName(file.name);
    setImportTargetType('new');
    setConfirmedReplacements(new Set());
    setSkippedItems(new Set());
    if (uniqueImportSources.length > 0) {
      setSelectedExistingSheet(uniqueImportSources[0]);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet);
        if (!Array.isArray(rows) || rows.length === 0) {
          showToast("Import file is empty", "error");
          return;
        }

        const rawRowsMapped = rows.map(row => {
          return {
            name: (getRowValueIgnoreCase(row, ["materialname", "name", "material_name", "material name"]) || '').toString().trim(),
            code: (getRowValueIgnoreCase(row, ["materialcode", "code", "material_code", "material code"]) || '').toString().trim(),
            unit: (getRowValueIgnoreCase(row, ["unit", "uom", "unitofmeasurement", "unit of measurement"]) || '').toString().trim(),
            type: (getRowValueIgnoreCase(row, ["type", "category", "materialtype", "material type"]) || '').toString().trim(),
            subcategory: (getRowValueIgnoreCase(row, ["subcategory", "sub-category", "sub category", "sub_category"]) || '').toString().trim(),
            description: (getRowValueIgnoreCase(row, ["description", "desc", "notes", "materialdescription", "material description"]) || '').toString().trim(),
            status: (getRowValueIgnoreCase(row, ["status", "state"]) || 'Active').toString().trim()
          };
        });

        // Deduplicate rows where name, type, subcategory, status, description, and code/unit are identical
        const seenKeys = new Set();
        const deduplicatedRows = [];
        rawRowsMapped.forEach(row => {
          const key = `${row.name}|${row.type}|${row.subcategory}|${row.status}|${row.description}|${row.code}|${row.unit}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            deduplicatedRows.push(row);
          }
        });

        const systemExistingCodes = materials.map(m => m.code.toUpperCase().trim());
        const { processedItems, summary } = recalculateImportSummary(deduplicatedRows, systemExistingCodes, isAutoEntry, baseSequence);

        if (!isAutoEntry && summary.existingMatchCount === 0 && summary.acceptedCount > 0) {
          showToast("Bulk update will not work when all materials are new. Please add materials through Bulk Entry or Manual Entry.", "error");
          // Abort process, don't open modal
          setIsImportModalOpen(false);
          setImportSummary(null);
          return; // Exit completely
        }

        setImportSummary(summary);
        setEditableAcceptedItems(processedItems);
        setEditingPreviewIdx(null);
        setImportSearch('');
      } catch (err) {
        console.error(err);
        showToast("Error reading Excel data files", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBatchImportSubmit = async (customSource) => {
    // Auto-accept items with no field changes (identical to DB) — no manual action needed
    const noChangeItems = editableAcceptedItems
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.isExistingMatch && item.validationErrors.length === 0 && (!item.fieldChanges || item.fieldChanges.length === 0));

    const validToImport = editableAcceptedItems.filter((item, idx) => {
      if (item.validationErrors.length > 0) return false;
      if (item.isDuplicate) return false;
      if (item.isExistingMatch) {
        if (!isAutoEntry) {
          return !skippedItems.has(idx);
        }
        // Auto-include no-change records; include confirmed replacements.
        const isNoChange = !item.fieldChanges || item.fieldChanges.length === 0;
        return isNoChange || confirmedReplacements.has(idx);
      }
      return true; // new items always included
    });

    if (validToImport.length === 0) {
      showToast("No items to import. All existing matches may have been skipped.", "error");
      return;
    }

    setSubmitLoading(true);
    try {
      const finalSource = '';

      const res = await api.post('/api/materials/batch', {
        items: validToImport,
        importSource: finalSource
      });

      if (res.data && res.data.success) {
        const inserted  = res.data.insertedCount || 0;
        const updated   = res.data.updatedCount  || 0;
        const skipped   = skippedItems.size;
        const autoKept  = noChangeItems.length;
        const errors    = (importSummary.rejectedCount || 0) + (importSummary.duplicateCount || 0) + (res.data.errorsCount || 0);

        let parts = [];
        if (inserted > 0)  parts.push(`${inserted} new added`);
        if (updated > 0)   parts.push(`${updated} updated`);
        if (autoKept > 0)  parts.push(`${autoKept} unchanged kept`);
        if (skipped > 0)   parts.push(`${skipped} skipped`);
        if (errors > 0)    parts.push(`${errors} errors`);

        showToast(`✅ Import complete — ${parts.join(', ')}`, 'success');

        setSourceFilter('');
        setConfirmedReplacements(new Set());
        setSkippedItems(new Set());
        fetchMaterials();

        if (res.data.errorsCount > 0) {
          alert(`Import complete.\nCreated: ${inserted}\nUpdated: ${updated}\nSkipped: ${skipped}\nErrors: ${errors}\n\nDetails:\n` + res.data.errors.join('\n'));
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to save batch to database', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleInlineSave = async (id) => {
    if (!editRowData.name.trim()) {
      showToast("Material Name is required", "error");
      return;
    }
    if (!editRowData.code.trim()) {
      showToast("Material Code is required", "error");
      return;
    }

    let finalCode = editRowData.code.trim().toUpperCase();
    const parsedNum = parseInt(finalCode, 10);
    if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 1999) {
      finalCode = parsedNum.toString().padStart(5, '0');
    }

    const codeConflict = materials.some(m => m._id !== id && m.code.toUpperCase() === finalCode);
    if (codeConflict) {
      showToast(`Material Code '${finalCode}' is already in use`, "error");
      return;
    }

    try {
      const res = await api.put(`/api/materials/${id}`, {
        name: editRowData.name,
        code: finalCode,
        unit: editRowData.unit,
        type: editRowData.type,
        subcategory: editRowData.subcategory,
        status: editRowData.status,
        description: editRowData.description
      });
      if (res.data && res.data.success) {
        showToast("Material configurations updated successfully.");
        setEditingRowId(null);
        fetchMaterials();
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || "Failed to persist modifications.";
      showToast(errMsg, "error");
    }
  };

  const handleOpenEditModal = (mat) => {
    setEditingId(mat._id);
    const normalizedType = mat.type === 'Raw' || mat.type === 'Raw Material' ? 'Raw Material' 
                         : mat.type === 'Finished' || mat.type === 'Finished Goods' ? 'Finished Goods'
                         : mat.type === 'Packing' || mat.type === 'Packing Material' ? 'Packing Material' : 'Raw Material';
    
    const subcats = subcategoryMap[normalizedType] || [];
    const matched = subcats.find(s => s.value.toLowerCase() === (mat.subcategory || '').toLowerCase());
    const finalSubcat = matched ? matched.value : (subcats.length > 0 ? subcats[0].value : '');

    setFormData({
      name: mat.name,
      code: mat.code,
      unit: mat.unit,
      type: normalizedType,
      subcategory: finalSubcat,
      status: mat.status || 'Active',
      description: mat.description || ''
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentDraftId(null); // Reset draft state context
  };

  const saveCurrentFormState = (idx) => {
    const updated = [...batchEditItems];
    if (updated[idx]) {
      updated[idx] = {
        ...updated[idx],
        name: formData.name,
        code: formData.code,
        unit: formData.unit,
        type: formData.type,
        subcategory: formData.subcategory,
        status: formData.status,
        description: formData.description
      };
      setBatchEditItems(updated);
    }
    return updated;
  };

  const handleBatchWizardSaveCurrent = async () => {
    if (!validateForm()) return;
    
    setSubmitLoading(true);
    try {
      const activeItem = batchEditItems[batchEditIdx];
      let finalCode = formData.code.trim().toUpperCase();
      const parsedNum = parseInt(finalCode, 10);
      if (!isNaN(parsedNum) && parsedNum >= 1001 && parsedNum <= 1999) {
        finalCode = parsedNum.toString();
      }

      const formattedData = {
        ...formData,
        name: formData.name.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        code: finalCode,
        description: formData.description.trim()
      };

      await api.put(`/api/materials/${activeItem._id}`, formattedData);

      // Save locally
      const latestItems = saveCurrentFormState(batchEditIdx);

      if (batchEditIdx < latestItems.length - 1) {
        const nextIdx = batchEditIdx + 1;
        setBatchEditIdx(nextIdx);
        const nextItem = latestItems[nextIdx];
        const normalizedType = nextItem.type === 'Raw' || nextItem.type === 'Raw Material' ? 'Raw Material' 
                             : nextItem.type === 'Finished' || nextItem.type === 'Finished Goods' ? 'Finished Goods'
                             : nextItem.type === 'Packing' || nextItem.type === 'Packing Material' ? 'Packing Material' : 'Raw Material';
        const subcats = subcategoryMap[normalizedType] || [];
        const matched = subcats.find(s => s.value.toLowerCase() === (nextItem.subcategory || '').toLowerCase());
        const finalSubcat = matched ? matched.value : (subcats.length > 0 ? subcats[0].value : '');

        setFormData({
          name: nextItem.name,
          code: nextItem.code,
          unit: nextItem.unit,
          type: normalizedType,
          subcategory: finalSubcat,
          status: nextItem.status || 'Active',
          description: nextItem.description || ''
        });
        setFormErrors({});
      } else {
        showToast("Batch editing completed successfully!", "success");
        setIsBatchEditModalOpen(false);
        fetchMaterials();
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || "Failed to save edits.";
      showToast(errMsg, "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleBatchWizardBack = () => {
    if (batchEditIdx > 0) {
      // 1. Save current form edits locally first
      const latestItems = saveCurrentFormState(batchEditIdx);
      
      // 2. Go back
      const prevIdx = batchEditIdx - 1;
      setBatchEditIdx(prevIdx);
      const prevItem = latestItems[prevIdx];
      const normalizedType = prevItem.type === 'Raw' || prevItem.type === 'Raw Material' ? 'Raw Material' 
                           : prevItem.type === 'Finished' || prevItem.type === 'Finished Goods' ? 'Finished Goods'
                           : prevItem.type === 'Packing' || prevItem.type === 'Packing Material' ? 'Packing Material' : 'Raw Material';
      const subcats = subcategoryMap[normalizedType] || [];
      const matched = subcats.find(s => s.value.toLowerCase() === (prevItem.subcategory || '').toLowerCase());
      const finalSubcat = matched ? matched.value : (subcats.length > 0 ? subcats[0].value : '');

      setFormData({
        name: prevItem.name,
        code: prevItem.code,
        unit: prevItem.unit,
        type: normalizedType,
        subcategory: finalSubcat,
        status: prevItem.status || 'Active',
        description: prevItem.description || ''
      });
      setFormErrors({});
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Material Name is required';
    if (!formData.code.trim()) errors.code = 'Material Code is required';
    if (!formData.unit.trim()) errors.unit = 'Unit of measurement is required';
    if (!formData.subcategory) errors.subcategory = 'Sub-category is required';

    let finalCode = formData.code.trim().toUpperCase();
    const parsedNum = parseInt(finalCode, 10);
    if (!isNaN(parsedNum) && parsedNum >= 1001 && parsedNum <= 1999) {
      finalCode = parsedNum.toString();
    }

    const activeId = isBatchEditModalOpen 
      ? (batchEditItems[batchEditIdx]?._id) 
      : editingId;

    const exists = materials.some(m => m._id !== activeId && m.code.toUpperCase() === finalCode);
    if (exists) {
      errors.code = `Material Code '${finalCode}' is already in use`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      let finalCode = formData.code.trim().toUpperCase();
      const parsedNum = parseInt(finalCode, 10);
      if (!isNaN(parsedNum) && parsedNum >= 1001 && parsedNum <= 1999) {
        finalCode = parsedNum.toString();
      }

      const formattedData = {
        ...formData,
        name: formData.name.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        code: finalCode,
        description: formData.description.trim()
      };

      if (editingId) {
        await api.put(`/api/materials/${editingId}`, formattedData);
        showToast("Material configurations updated successfully.");
      } else {
        await api.post('/api/materials', formattedData);
        showToast("Successfully added 1 new material record.");
        
        // Evict draft from FIFO queue on successful register
        if (currentDraftId) {
          setDrafts((prev) => {
            const filtered = prev.filter((d) => d.id !== currentDraftId);
            localStorage.setItem('erp_material_drafts', JSON.stringify(filtered));
            return filtered;
          });
        }
      }
      fetchMaterials();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit material details.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteMaterial = async (id) => {
    if (!window.confirm('Delete this material definition? This checks Bill of Materials (BOM) references.')) return;
    try {
      await api.delete(`/api/materials/${id}`);
      if (selectedMaterialId === id) {
        setSelectedMaterialId(null);
      }
      fetchMaterials();
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'Validation error: Active stock or BOM dependencies prevent deleting this material.';
      alert(`Relational Integrity Check: ${errorMsg}`);
    }
  };

  const handleDeleteSelectedMaterials = async () => {
    const ids = Array.from(selectedRowIds);
    if (ids.length === 0) {
      showToast('Select at least one material to delete.', 'error');
      return;
    }

    if (!window.confirm(`Delete ${ids.length} selected material(s)? This will update MongoDB, BOM, production, quality, purchase, inventory, and related records.`)) return;

    try {
      const res = await api.post('/api/materials/batch-delete', { ids });
      showToast(res.data?.message || `Deleted ${ids.length} selected material(s).`, 'success');
      setSelectedRowIds(new Set());
      setIsSelectionMode(false);
      setSelectedMaterialId(null);
      fetchMaterials();
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'Validation error: one or more selected materials could not be deleted.';
      showToast(errorMsg, 'error');
      alert(`Relational Integrity Check: ${errorMsg}`);
    }
  };

  const handleToggleMaterialStatus = async (material) => {
    try {
      const newStatus = material.status === 'Active' ? 'Inactive' : 'Active';
      await api.put(`/api/materials/${material._id}`, {
        name: material.name,
        code: material.code,
        unit: material.unit,
        type: material.type,
        subcategory: material.subcategory,
        status: newStatus,
        description: material.description
      });
      fetchMaterials();
    } catch (err) {
      console.error(err);
      alert('Failed to toggle material status.');
    }
  };

  const getUniqueValues = (col) => {
    const baseData = materials.filter(mat => {
      if (sourceFilter) {
        if (sourceFilter === 'Manual Entry') {
          if (mat.importSource) return false;
        } else {
          if (mat.importSource !== sourceFilter) return false;
        }
      }
      return true;
    });

    let vals = [];
    if (col === 'unit') {
      vals = baseData.map(m => m.unit);
    } else if (col === 'type') {
      vals = baseData.map(m => m.type);
    } else {
      vals = baseData.map(m => m[col]);
    }
    return Array.from(new Set(vals.map(v => (v || '').toString().trim()))).filter(Boolean).sort();
  };

  const filteredMaterials = materials.filter(mat => {
    // 1. Search Query Filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const nameMatch = (mat.name || '').toLowerCase().includes(q);
      const codeMatch = (mat.code || '').toLowerCase().includes(q);
      if (!nameMatch && !codeMatch) return false;
    }

    // 2. Category Type Filter
    if (typeFilter && mat.type !== typeFilter) {
      return false;
    }

    // 3. Import Source File Filter
    if (sourceFilter) {
      if (sourceFilter === 'Manual Entry') {
        if (mat.importSource) return false;
      } else {
        if (mat.importSource !== sourceFilter) return false;
      }
    }

    // 4. Grid Column Filters
    for (const col in columnFilters) {
      const selectedVals = columnFilters[col];
      if (selectedVals && selectedVals.length > 0) {
        let attrVal = '';
        if (col === 'unit') {
          attrVal = (mat.unit || '');
        } else if (col === 'type') {
          attrVal = (mat.type || '');
        } else {
          attrVal = (mat[col] || '');
        }
        const val = attrVal.toString().trim().toLowerCase();
        if (!selectedVals.map(sv => sv.toString().trim().toLowerCase()).includes(val)) {
          return false;
        }
      }
    }
    return true;
  });

  const isEditSelectedActive = React.useMemo(() => {
    return selectedRowIds.size > 0;
  }, [selectedRowIds]);

  // Reset row selection when filters change
  React.useEffect(() => {
    setSelectedMaterialId(null);
    setSelectedRowIds(new Set());
  }, [search, typeFilter, sourceFilter, columnFilters]);

  return (
    <div className="space-y-3 w-full">
      {/* Search & Filters */}
      <Card className="shadow-none border border-slate-200 overflow-visible relative z-30">
        <CardContent className="p-1 flex flex-col md:flex-row items-center justify-between gap-2 bg-slate-50/50 overflow-visible">
          <div className="flex items-center space-x-2 w-full md:w-auto">
            <div className="relative w-48">
              <input
                type="text"
                placeholder="Search materials by name/code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-2 py-0.5 h-7 pr-7 border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none text-[10px] font-bold"
                  title="Clear Search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1.5 w-full md:w-auto shrink-0 justify-end">
            {drafts.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowDraftsList(!showDraftsList)} 
                className="flex items-center space-x-1 border-blue-200 text-blue-700 bg-blue-50/40 h-7 rounded-md font-bold px-2.5"
              >
                <span>Drafts ({drafts.length})</span>
              </Button>
            )}

            {(search || typeFilter || sourceFilter || Object.values(columnFilters).some(v => v && v.length > 0)) && (
              <button
                onClick={handleResetAllFilters}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded h-7 border border-slate-200 transition-colors"
              >
                Clear All Filters
              </button>
            )}

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-0.5 h-7 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
            >
              <option value="">All Types</option>
              <option value="Raw Material">Raw Materials</option>
              <option value="Finished Goods">Finished Goods</option>
              <option value="Packing Material">Packing Materials</option>
            </select>



            {/* Single 'Select All' checkbox — professional, no per-row clutter */}
            <label className={`flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded border transition-all text-xs font-semibold ${
              selectedRowIds.size > 0
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`} title="Show material checkboxes">
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelectionMode}
                onChange={e => {
                  setIsSelectionMode(e.target.checked);
                  if (!e.target.checked) setSelectedRowIds(new Set());
                }}
              />
              {selectedRowIds.size > 0
                ? <span>{selectedRowIds.size} selected</span>
                : <span>Select</span>}
            </label>

            {isSelectionMode && (
              <button
                onClick={() => {
                  setSelectedRowIds(new Set());
                  setIsSelectionMode(false);
                }}
                className="h-7 px-3 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 text-xs font-semibold transition-colors"
                title="Clear selection and hide checkboxes"
              >
                Clear
              </button>
            )}

            {selectedRowIds.size > 0 && (
              <button
                onClick={handleDeleteSelectedMaterials}
                className="h-7 px-3 rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Delete selected materials"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            )}

            <div className="relative">
              <Button
                size="sm"
                onClick={() => setShowFunctionList(!showFunctionList)}
                className="h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                title="Access resource functions list"
              >
                <span>Function List</span>
                <span className="text-[9px]">▼</span>
              </Button>

              {showFunctionList && (
                <>
                  <div 
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setShowFunctionList(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1 text-left">
                    <button
                      onClick={() => {
                        setShowFunctionList(false);
                        handleOpenAddModal();
                      }}
                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 text-left font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-400" />
                      <span>Manual Entry</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowFunctionList(false);
                        setImportSummary(null);
                        setIsAutoEntry(true);
                        setIsImportModalOpen(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 text-left font-medium"
                    >
                      <Save className="h-3.5 w-3.5 text-slate-400" />
                      <span>Bulk Entry</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowFunctionList(false);
                        setImportSummary(null);
                        setIsAutoEntry(false);
                        setIsImportModalOpen(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 text-left font-medium"
                    >
                      <Save className="h-3.5 w-3.5 text-slate-400" />
                      <span>Bulk Update</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowFunctionList(false);
                        const ids = selectedRowIds.size > 0 ? selectedRowIds : null;
                        const itemsToEdit = ids
                          ? filteredMaterials.filter(m => ids.has(m._id))
                          : filteredMaterials;
                        if (itemsToEdit.length === 0) {
                          showToast('No records to edit', 'error');
                          return;
                        }
                        let startIdx = ids
                          ? filteredMaterials.findIndex(m => ids.has(m._id))
                          : filteredMaterials.findIndex(m => m._id === selectedMaterialId);
                        if (startIdx === -1) startIdx = 0;
                        setBatchEditItems(itemsToEdit);
                        setBatchEditIdx(0);
                        const activeItem = itemsToEdit[0];
                        const normalizedType = activeItem.type === 'Raw' || activeItem.type === 'Raw Material' ? 'Raw Material'
                          : activeItem.type === 'Finished' || activeItem.type === 'Finished Goods' ? 'Finished Goods'
                          : activeItem.type === 'Packing' || activeItem.type === 'Packing Material' ? 'Packing Material' : 'Raw Material';
                        const subcats = subcategoryMap[normalizedType] || [];
                        const matched = subcats.find(s => s.value.toLowerCase() === (activeItem.subcategory || '').toLowerCase());
                        const finalSubcat = matched ? matched.value : (subcats.length > 0 ? subcats[0].value : '');
                        setFormData({
                          name: activeItem.name,
                          code: activeItem.code,
                          unit: activeItem.unit,
                          type: normalizedType,
                          subcategory: finalSubcat,
                          status: activeItem.status || 'Active',
                          description: activeItem.description || ''
                        });
                        setFormErrors({});
                        setIsBatchEditModalOpen(true);
                      }}
                      className={`w-full px-3 py-1.5 text-xs flex items-center space-x-1.5 text-left font-medium ${
                        isEditSelectedActive
                          ? 'text-slate-700 hover:bg-slate-50' 
                          : 'text-slate-300 bg-slate-50/30 cursor-not-allowed pointer-events-none'
                      }`}
                      disabled={!isEditSelectedActive}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        {selectedRowIds.size > 0
                          ? `Edit Selected (${selectedRowIds.size})`
                          : 'Edit Selected'}
                      </span>
                    </button>

                    <div className="border-t border-slate-100 my-1" />

                    <button
                      onClick={() => {
                        setShowFunctionList(false);
                        handleExportData();
                      }}
                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 text-left font-medium"
                    >
                      <Save className="h-3.5 w-3.5 text-slate-400" />
                      <span>Export Grid</span>
                    </button>

                    {sourceFilter && sourceFilter !== 'Manual Entry' && (
                      <>
                        <div className="border-t border-slate-100 my-1" />
                        <button
                          onClick={async () => {
                            setShowFunctionList(false);
                            if (window.confirm(`Are you sure you want to delete all materials imported from "${sourceFilter}"? This action cannot be undone.`)) {
                              try {
                                const res = await api.post('/api/materials/batch-delete-source', { source: sourceFilter });
                                if (res.data && res.data.success) {
                                  showToast(`Successfully deleted materials from "${sourceFilter}"`, "success");
                                  setSourceFilter('');
                                  fetchMaterials();
                                }
                              } catch (err) {
                                const errMsg = err.response?.data?.error || err.message || "Failed to delete sheet data";
                                showToast(errMsg, "error");
                              }
                            }
                          }}
                          className="w-full px-3 py-1.5 text-xs text-red-650 hover:bg-red-50 flex items-center space-x-1.5 text-left font-semibold"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          <span>Delete Sheet Data</span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
        {/* Active Filter Tags & Sheet Workspace Actions */}
        {(() => {
          const activeTags = [];

            if (search) {
              activeTags.push({
                id: 'search',
                label: `Search: "${search}"`,
                onClear: () => setSearch('')
              });
            }
            if (typeFilter) {
              activeTags.push({
                id: 'typeFilter',
                label: `Category: ${typeFilter}`,
                onClear: () => setTypeFilter('')
              });
            }

            // Column filters
            Object.entries(columnFilters).forEach(([col, vals]) => {
              if (vals && vals.length > 0) {
                const prettyCol = col === 'unit' ? 'UOM' 
                                : col === 'type' ? 'Category' 
                                : col === 'subcategory' ? 'Sub-Category' 
                                : col.charAt(0).toUpperCase() + col.slice(1);
                vals.forEach(val => {
                  activeTags.push({
                    id: `col-${col}-${val}`,
                    label: `${prettyCol}: ${val}`,
                    onClear: () => {
                      setColumnFilters(prev => ({
                        ...prev,
                        [col]: prev[col].filter(v => v !== val)
                      }));
                    }
                  });
                });
              }
            });

            if (activeTags.length === 0) return null;

            return (
              <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pt-0.5 bg-slate-50/50 border-t border-slate-100 rounded-b-md">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Active Filters:</span>
                {activeTags.map(tag => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center space-x-1 bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm hover:border-slate-300 transition-all"
                  >
                    <span>{tag.label}</span>
                    <button
                      onClick={tag.onClear}
                      className="text-slate-400 hover:text-red-500 font-black focus:outline-none ml-0.5 text-[8px]"
                      title="Remove filter"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <button
                  onClick={handleResetAllFilters}
                  className="text-[9px] text-red-600 hover:text-red-800 font-bold ml-1.5 focus:outline-none hover:underline"
                >
                  Clear All
                </button>
              </div>
            );
        })()}
      </Card>

      {/* Drafts List Card */}
      {showDraftsList && (
        <Card className="border-slate-200 bg-slate-50/50 shadow-none border">
          <CardHeader className="py-1 px-2.5 border-b border-slate-200 flex items-center justify-end">
            <button 
              onClick={() => setShowDraftsList(false)}
              className="text-[10px] text-slate-500 hover:text-slate-700 font-bold"
            >
              Hide drafts
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {drafts.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 font-medium">No pending drafts found.</div>
            ) : (
              <Table className="border-t border-slate-200">
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="!px-2.5 !py-1 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200">Material Name Draft</TableHead>
                    <TableHead className="!px-2.5 !py-1 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200">Category Type</TableHead>
                    <TableHead className="!px-2.5 !py-1 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200">Last Autosaved</TableHead>
                    <TableHead className="!px-2.5 !py-1 text-right text-slate-600 font-bold text-[11px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((d) => (
                    <TableRow key={d.id} className="hover:bg-slate-50/50 border-b border-slate-200">
                      <TableCell className="!px-2.5 !py-1 font-semibold text-xs text-slate-800 text-left capitalize border-r border-slate-200">
                        {d.data.name ? d.data.name.toLowerCase() : <span className="text-slate-400 italic">untitled material</span>}
                      </TableCell>
                      <TableCell className="!px-2.5 !py-1 text-xs text-slate-600 border-r border-slate-200">{d.data.type}</TableCell>
                      <TableCell className="!px-2.5 !py-1 text-xs text-slate-500 font-mono border-r border-slate-200">{d.timestamp}</TableCell>
                      <TableCell className="!px-2.5 !py-1 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleLoadDraft(d)}
                            className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-0.5 rounded transition-colors"
                          >
                            Continue
                          </button>
                          <button
                            onClick={(e) => handleDiscardDraft(d.id, e)}
                            className="text-[10px] text-red-600 hover:text-red-800 font-bold px-1"
                          >
                            Discard
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid */}
      <Card className="shadow-none border border-slate-200 overflow-visible bg-white">
        <CardContent className="p-0 overflow-visible">
          {error && <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50">{error}</div>}

          {loading ? (
            <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
              <div className="divide-y divide-slate-100">
                <div className="bg-slate-50 p-2.5 flex items-center justify-between border-b border-slate-200">
                  <div className="w-1/4 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-16 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-12 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-20 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-20 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-16 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-1/4 h-3 rounded bg-slate-300 animate-pulse" />
                </div>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between space-x-4">
                    <div className="w-1/4 h-3.5 rounded animate-shimmer" />
                    <div className="w-16 h-3 rounded animate-shimmer" />
                    <div className="w-12 h-3 rounded animate-shimmer" />
                    <div className="w-20 h-3.5 rounded animate-shimmer" />
                    <div className="w-20 h-3.5 rounded animate-shimmer" />
                    <div className="w-16 h-3 rounded animate-shimmer" />
                    <div className="w-1/4 h-3.5 rounded animate-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          ) : materials.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium">No materials registered.</div>
          ) : (
            <>
              <Table className="border border-slate-200 w-full table-fixed">
              <TableHeader className="bg-slate-50 border-b border-slate-200 relative z-20">
                <TableRow>
                  {/* Name Filter */}
                  <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[160px] max-w-[160px] whitespace-nowrap relative group ${activeFilterCol === 'name' ? 'z-50' : 'z-10'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {isSelectionMode && (
                          <input
                            type="checkbox"
                            checked={selectedRowIds.size > 0 && selectedRowIds.size === filteredMaterials.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRowIds(new Set(filteredMaterials.map(m => m._id)));
                                setIsSelectionMode(true);
                              } else {
                                setSelectedRowIds(new Set());
                                setIsSelectionMode(false);
                              }
                            }}
                            className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                        )}
                        <span>Material Name</span>
                      </div>
                      <button
                        onClick={(e) => toggleFilterPopup('name', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['name'] && columnFilters['name'].length > 0) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Material Name"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'name' && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterCol(null); }} />
                        <div className="absolute left-1 top-full mt-1.5 w-48 bg-white border border-slate-200 rounded shadow-md z-50 p-2 text-left font-normal normal-case">
                          <div className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pb-1 border-b">Filter Name</div>
                          <input
                            type="text"
                            placeholder="Search categories..."
                            value={filterSearchText['name'] || ''}
                            onChange={(e) => setFilterSearchText({ ...filterSearchText, name: e.target.value })}
                            className="w-full px-1.5 py-0.5 mb-1.5 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-blue-500 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renderFilterPopupContent('name')}
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <button onClick={() => clearColumnFilter('name')} className="text-[10px] text-slate-500 hover:underline">Clear</button>
                            <button onClick={() => applyColumnFilter('name')} className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded">Apply</button>
                          </div>
                        </div>
                      </>
                    )}
                  </TableHead>

                  {/* Code Filter */}
                  <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[80px] max-w-[80px] whitespace-nowrap relative group ${activeFilterCol === 'code' ? 'z-50' : 'z-10'}`}>
                    <div className="flex items-center justify-between">
                      <span>Code</span>
                      <button
                        onClick={(e) => toggleFilterPopup('code', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['code'] && columnFilters['code'].length > 0) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Code"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'code' && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterCol(null); }} />
                        <div className="absolute left-1 top-full mt-1.5 w-36 bg-white border border-slate-200 rounded shadow-md z-50 p-2 text-left font-normal normal-case">
                          <div className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pb-1 border-b">Filter Code</div>
                          <input
                            type="text"
                            placeholder="Search codes..."
                            value={filterSearchText['code'] || ''}
                            onChange={(e) => setFilterSearchText({ ...filterSearchText, code: e.target.value })}
                            className="w-full px-1.5 py-0.5 mb-1.5 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-blue-500 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renderFilterPopupContent('code')}
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <button onClick={() => clearColumnFilter('code')} className="text-[10px] text-slate-500 hover:underline">Clear</button>
                            <button onClick={() => applyColumnFilter('code')} className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded">Apply</button>
                          </div>
                        </div>
                      </>
                    )}
                  </TableHead>

                  {/* UOM Filter */}
                  <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[65px] max-w-[65px] whitespace-nowrap relative group ${activeFilterCol === 'unit' ? 'z-50' : 'z-10'}`}>
                    <div className="flex items-center justify-between">
                      <span>UOM</span>
                      <button
                        onClick={(e) => toggleFilterPopup('unit', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['unit'] && columnFilters['unit'].length > 0) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter UOM"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'unit' && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterCol(null); }} />
                        <div className="absolute left-1 top-full mt-1.5 w-32 bg-white border border-slate-200 rounded shadow-md z-50 p-2 text-left font-normal normal-case">
                          <div className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pb-1 border-b">Filter UOM</div>
                          <input
                            type="text"
                            placeholder="Search UOMs..."
                            value={filterSearchText['unit'] || ''}
                            onChange={(e) => setFilterSearchText({ ...filterSearchText, unit: e.target.value })}
                            className="w-full px-1.5 py-0.5 mb-1.5 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-blue-500 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renderFilterPopupContent('unit')}
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <button onClick={() => clearColumnFilter('unit')} className="text-[10px] text-slate-500 hover:underline">Clear</button>
                            <button onClick={() => applyColumnFilter('unit')} className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded">Apply</button>
                          </div>
                        </div>
                      </>
                    )}
                  </TableHead>

                  {/* Category Filter */}
                  <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[110px] max-w-[110px] whitespace-nowrap relative group ${activeFilterCol === 'type' ? 'z-50' : 'z-10'}`}>
                    <div className="flex items-center justify-between">
                      <span>Category</span>
                      <button
                        onClick={(e) => toggleFilterPopup('type', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['type'] && columnFilters['type'].length > 0) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Category"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'type' && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterCol(null); }} />
                        <div className="absolute left-1 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded shadow-md z-50 p-2 text-left font-normal normal-case">
                          <div className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pb-1 border-b">Filter Category</div>
                          <input
                            type="text"
                            placeholder="Search categories..."
                            value={filterSearchText['type'] || ''}
                            onChange={(e) => setFilterSearchText({ ...filterSearchText, type: e.target.value })}
                            className="w-full px-1.5 py-0.5 mb-1.5 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-blue-500 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renderFilterPopupContent('type')}
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <button onClick={() => clearColumnFilter('type')} className="text-[10px] text-slate-500 hover:underline">Clear</button>
                            <button onClick={() => applyColumnFilter('type')} className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded">Apply</button>
                          </div>
                        </div>
                      </>
                    )}
                  </TableHead>

                  {/* Sub-category Filter */}
                  <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[130px] max-w-[130px] whitespace-nowrap relative group ${activeFilterCol === 'subcategory' ? 'z-50' : 'z-10'}`}>
                    <div className="flex items-center justify-between">
                      <span>Sub-Category</span>
                      <button
                        onClick={(e) => toggleFilterPopup('subcategory', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['subcategory'] && columnFilters['subcategory'].length > 0) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Sub-Category"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'subcategory' && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterCol(null); }} />
                        <div className="absolute right-1 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded shadow-md z-50 p-2 text-left font-normal normal-case">
                          <div className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pb-1 border-b">Filter Sub-Category</div>
                          <input
                            type="text"
                            placeholder="Search sub-categories..."
                            value={filterSearchText['subcategory'] || ''}
                            onChange={(e) => setFilterSearchText({ ...filterSearchText, subcategory: e.target.value })}
                            className="w-full px-1.5 py-0.5 mb-1.5 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-blue-500 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renderFilterPopupContent('subcategory')}
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <button onClick={() => clearColumnFilter('subcategory')} className="text-[10px] text-slate-500 hover:underline">Clear</button>
                            <button onClick={() => applyColumnFilter('subcategory')} className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded">Apply</button>
                          </div>
                        </div>
                      </>
                    )}
                  </TableHead>

                  {/* Status Filter */}
                  <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[75px] max-w-[75px] whitespace-nowrap relative group ${activeFilterCol === 'status' ? 'z-50' : 'z-10'}`}>
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <button
                        onClick={(e) => toggleFilterPopup('status', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['status'] && columnFilters['status'].length > 0) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Status"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'status' && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterCol(null); }} />
                        <div className="absolute right-1 top-full mt-1.5 w-32 bg-white border border-slate-200 rounded shadow-md z-50 p-2 text-left font-normal normal-case">
                          <div className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pb-1 border-b">Filter Status</div>
                          <input
                            type="text"
                            placeholder="Search status..."
                            value={filterSearchText['status'] || ''}
                            onChange={(e) => setFilterSearchText({ ...filterSearchText, status: e.target.value })}
                            className="w-full px-1.5 py-0.5 mb-1.5 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-blue-500 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renderFilterPopupContent('status')}
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <button onClick={() => clearColumnFilter('status')} className="text-[10px] text-slate-500 hover:underline">Clear</button>
                            <button onClick={() => applyColumnFilter('status')} className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded">Apply</button>
                          </div>
                        </div>
                      </>
                    )}
                  </TableHead>

                  {/* Description Filter */}
                  <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-auto relative group ${activeFilterCol === 'description' ? 'z-50' : 'z-10'}`}>
                    <div className="flex items-center justify-between">
                      <span>Description</span>
                      <button
                        onClick={(e) => toggleFilterPopup('description', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['description'] && columnFilters['description'].length > 0) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Description"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'description' && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterCol(null); }} />
                        <div className="absolute right-1 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded shadow-md z-50 p-2 text-left font-normal normal-case">
                          <div className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pb-1 border-b">Filter Description</div>
                          <input
                            type="text"
                            placeholder="Search description..."
                            value={filterSearchText['description'] || ''}
                            onChange={(e) => setFilterSearchText({ ...filterSearchText, description: e.target.value })}
                            className="w-full px-1.5 py-0.5 mb-1.5 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-blue-500 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renderFilterPopupContent('description')}
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <button onClick={() => clearColumnFilter('description')} className="text-[10px] text-slate-500 hover:underline">Clear</button>
                            <button onClick={() => applyColumnFilter('description')} className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded">Apply</button>
                          </div>
                        </div>
                      </>
                    )}
                  </TableHead>

                  <TableHead className="!px-2 !py-0.5 text-right text-slate-600 font-bold text-[11px] w-[110px] max-w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaterials.map((mat) => (
                  <TableRow
                    key={mat._id}
                    onClick={() => setSelectedMaterialId(selectedMaterialId === mat._id ? null : mat._id)}
                    className={`hover:bg-slate-50/50 border-b border-slate-200 cursor-pointer transition-all ${
                      selectedRowIds.has(mat._id)
                        ? 'bg-blue-50/40 hover:bg-blue-50/50'
                        : selectedMaterialId === mat._id ? 'bg-blue-50/40 hover:bg-blue-50/50 border-l-2 border-l-blue-600' : ''
                    }`}
                  >
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[160px] max-w-[160px] whitespace-nowrap">
                      <div className="flex items-center gap-2 max-w-[220px]">
                        {isSelectionMode && (
                          <input
                            type="checkbox"
                            checked={selectedRowIds.has(mat._id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedRowIds(prev => {
                                const next = new Set(prev);
                                if (next.has(mat._id)) next.delete(mat._id);
                                else next.add(mat._id);
                                return next;
                              });
                            }}
                            className="w-3.5 h-3.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      <div className="relative group min-w-0 flex-1">
                        <span className="block truncate text-xs text-slate-500 cursor-pointer capitalize">
                          {mat.name.toLowerCase()}
                        </span>
                        {/* Compact side-pop tooltip on hover matching font-size */}
                        <div className="absolute hidden group-hover:block left-full ml-2 top-1/2 -translate-y-1/2 z-50 bg-slate-900 text-white text-xs py-0.5 px-2 rounded border border-slate-800 shadow-md whitespace-nowrap font-semibold pointer-events-none capitalize">
                          {mat.name.toLowerCase()}
                        </div>
                      </div>
                      </div>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 font-mono text-[11px] border-r border-slate-200 w-[80px] max-w-[80px] whitespace-nowrap">
                      <div className="relative group max-w-[80px]">
                        <button
                          onClick={() => handleViewDetails(mat)}
                          className="block truncate text-blue-600 font-bold hover:underline focus:outline-none text-left w-full text-[11px] cursor-pointer"
                          title="View material details"
                        >
                          {mat.code}
                        </button>
                        {/* Custom sideways hover tooltip showing full code next to it */}
                        <div className="absolute hidden group-hover:block left-full ml-2 top-1/2 -translate-y-1/2 z-50 bg-slate-900 text-white text-xs py-0.5 px-2 rounded border border-slate-800 shadow-md whitespace-nowrap font-semibold pointer-events-none font-sans capitalize-none">
                          {mat.code}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 font-semibold text-xs text-slate-600 border-r border-slate-200 w-[65px] max-w-[65px] truncate whitespace-nowrap">{mat.unit}</TableCell>
                    <TableCell className="!px-2 !py-0.5 border-r border-slate-200 w-[110px] max-w-[110px] truncate whitespace-nowrap">
                      <span className="text-xs text-slate-700 capitalize block truncate" title={mat.type}>
                        {mat.type}
                      </span>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 border-r border-slate-200 w-[130px] max-w-[130px] truncate whitespace-nowrap">
                      {mat.subcategory ? (
                        <span className="text-xs text-slate-700 capitalize block truncate cursor-pointer text-left" title={mat.subcategory}>
                          {mat.subcategory}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-xs block text-left pl-2">-</span>
                      )}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 border-r border-slate-200 w-[75px] max-w-[75px] truncate whitespace-nowrap">
                      <span className={`text-xs font-semibold whitespace-nowrap ${
                        mat.status === 'Active' ? 'text-green-600' : 'text-slate-500'
                      }`}>
                        {mat.status || 'Active'}
                      </span>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-xs text-slate-500 border-r border-slate-200 w-auto whitespace-nowrap">
                      <div className="relative group w-full">
                        <span className="block truncate cursor-pointer text-xs text-slate-500">
                          {mat.description || '-'}
                        </span>
                        {/* Custom hover tooltip showing full description above it to prevent overlapping buttons */}
                        {mat.description && (
                          <div className="absolute hidden group-hover:block bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs py-0.5 px-2 rounded border border-slate-800 shadow-md whitespace-nowrap font-semibold pointer-events-none">
                            {mat.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-right w-[110px] max-w-[110px] whitespace-nowrap relative overflow-visible">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleToggleMaterialStatus(mat)}
                          title="Toggle Status"
                          className="p-0.5 rounded hover:bg-slate-150 text-slate-500 hover:text-slate-700"
                        >
                          {mat.status === 'Active' ? <ToggleRight className="h-3.5 w-3.5 text-blue-600" /> : <ToggleLeft className="h-3.5 w-3.5 text-slate-400" />}
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(mat)}
                          className="p-0.5 rounded hover:bg-slate-150 text-slate-500 hover:text-slate-700"
                          title="Edit Record"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(mat._id)}
                          className="p-0.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === mat._id ? null : mat._id);
                            }}
                            className="p-0.5 rounded hover:bg-slate-150 text-slate-500 hover:text-slate-700 focus:outline-none"
                            title="More actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                          {openDropdownId === mat._id && (
                            <>
                              <div 
                                className="fixed inset-0 z-40 cursor-default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(null);
                                }}
                              />
                              <div className="absolute right-0 top-full mt-1.5 w-36 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1 text-left">
                                <button
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    handleViewDetails(mat);
                                  }}
                                  className="w-full px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 text-left font-medium"
                                >
                                  <span>View Registered Data</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    setViewingMaterialAudit(mat);
                                    setIsAuditModalOpen(true);
                                  }}
                                  className="w-full px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 text-left font-medium"
                                >
                                  <span>Revision History</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>      {/* CRUD Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit Material Details' : 'Register New Material'}
        className="!max-w-[50vw] !w-[50vw] !rounded-none"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-sm text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          {/* 1. Material Code */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-600">Material Code</label>
            <input
              type="text"
              placeholder="e.g. 00005"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full px-2 py-0.5 border border-slate-200 rounded-md text-[11px] font-mono h-7 font-semibold bg-slate-50 text-slate-500 cursor-not-allowed"
              required
              disabled={true}
            />
            {formErrors.code && <span className="text-xs text-red-500 font-medium">{formErrors.code}</span>}
          </div>
          
          {/* 2. Material Name */}
          <Input
            label="Material Name"
            id="name"
            placeholder="e.g. raw cumin powder"
            value={formData.name}
            onChange={(e) => {
              const val = e.target.value.replace(/(^\w|\s\w)/g, c => c.toUpperCase());
              setFormData({ ...formData, name: val });
            }}
            error={formErrors.name}
            required
            className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md"
          />

          {/* 3. Unit of Measure */}
          <Select
            label="Unit of Measure"
            id="unit"
            options={[
              { value: 'pcs', label: 'pcs (Pieces)' },
              { value: 'kg', label: 'kg (Kilograms)' },
              { value: 'gm', label: 'gm (Grams)' },
              { value: 'L', label: 'L (Liters)' }
            ]}
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            required
            className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md"
          />

          {/* 4. Category */}
          <Select
            label="Category"
            id="type"
            options={[
              { value: 'Raw Material', label: 'Raw Material' },
              { value: 'Finished Goods', label: 'Finished Goods' },
              { value: 'Packing Material', label: 'Packing Material' }
            ]}
            value={formData.type}
            onChange={(e) => {
              const newType = e.target.value;
              const newSubcats = subcategoryMap[newType] || [];
              setFormData({
                ...formData,
                type: newType,
                subcategory: newSubcats.length > 0 ? newSubcats[0].value : '',
                status: formData.status || 'Active'
              });
            }}
            required
            className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md"
          />

          {/* 5. Sub-Category */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-600">Sub-Category</label>
            <select
              value={formData.subcategory}
              onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
              className="w-full px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none cursor-pointer h-7"
              required
            >
              {(subcategoryMap[formData.type] || []).map(sub => (
                <option key={sub.value} value={sub.value}>{sub.label}</option>
              ))}
            </select>
            {formErrors.subcategory && <span className="text-xs text-red-500 font-medium">{formErrors.subcategory}</span>}
          </div>

          {/* 6. Material Description */}
          <TextArea
            label="Material Description"
            id="description"
            placeholder="operational purpose, notes, or storage conditions..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full !text-[11px] !px-2 !py-1 !rounded-md h-16"
          />

          {/* 7. Material Status */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-600">Material Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none cursor-pointer h-7"
              required
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          {draftMessage && (
            <div className="flex items-center space-x-1.5 text-xs text-blue-500 font-bold bg-blue-50 py-1.5 px-3 rounded-md">
              <Save className="h-4 w-4 shrink-0" />
              <span>{draftMessage}</span>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100 mt-4">
            <Button variant="outline" size="sm" onClick={handleCloseModal}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={submitLoading}>
              {editingId ? 'Save changes' : 'Register material'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Batch Edit Wizard Modal */}
      <Dialog
        isOpen={isBatchEditModalOpen}
        onClose={() => setIsBatchEditModalOpen(false)}
        title={`Batch Edit - Item ${batchEditIdx + 1} of ${batchEditItems.length}`}
        className="!max-w-[50vw] !w-[50vw] !rounded-none"
      >
        <div className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-sm text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          {/* 1. Material Code (Non-editable during batch edits) */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-600">Material Code</label>
            <input
              type="text"
              value={formData.code}
              className="w-full px-2 py-0.5 border border-slate-200 rounded-md text-[11px] font-mono h-7 font-semibold bg-slate-50 text-slate-500 cursor-not-allowed"
              disabled
            />
          </div>
          
          {/* 2. Material Name */}
          <Input
            label="Material Name"
            id="name"
            placeholder="e.g. raw cumin powder"
            value={formData.name}
            onChange={(e) => {
              const val = e.target.value.replace(/(^\w|\s\w)/g, c => c.toUpperCase());
              setFormData({ ...formData, name: val });
            }}
            error={formErrors.name}
            required
            className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md"
          />

          {/* 3. Unit of Measure */}
          <Select
            label="Unit of Measure"
            id="unit"
            options={[
              { value: 'pcs', label: 'pcs (Pieces)' },
              { value: 'kg', label: 'kg (Kilograms)' },
              { value: 'gm', label: 'gm (Grams)' },
              { value: 'L', label: 'L (Liters)' }
            ]}
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            required
            className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md"
          />

          {/* 4. Category */}
          <Select
            label="Category"
            id="type"
            options={[
              { value: 'Raw Material', label: 'Raw Material' },
              { value: 'Finished Goods', label: 'Finished Goods' },
              { value: 'Packing Material', label: 'Packing Material' }
            ]}
            value={formData.type}
            onChange={(e) => {
              const newType = e.target.value;
              const newSubcats = subcategoryMap[newType] || [];
              setFormData({
                ...formData,
                type: newType,
                subcategory: newSubcats.length > 0 ? newSubcats[0].value : '',
                status: formData.status || 'Active'
              });
            }}
            required
            className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md"
          />

          {/* 5. Sub-Category */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-600">Sub-Category</label>
            <select
              value={formData.subcategory}
              onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
              className="w-full px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none cursor-pointer h-7"
              required
            >
              {(subcategoryMap[formData.type] || []).map(sub => (
                <option key={sub.value} value={sub.value}>{sub.label}</option>
              ))}
            </select>
            {formErrors.subcategory && <span className="text-xs text-red-500 font-medium">{formErrors.subcategory}</span>}
          </div>

          {/* 6. Material Description */}
          <TextArea
            label="Material Description"
            id="description"
            placeholder="operational purpose, notes, or storage conditions..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full !text-[11px] !px-2 !py-1 !rounded-md h-16"
          />

          {/* 7. Material Status */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-600">Material Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none cursor-pointer h-7"
              required
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-slate-100 mt-4">
            <Button variant="outline" size="sm" onClick={() => setIsBatchEditModalOpen(false)}>
              Cancel
            </Button>
            
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleBatchWizardBack}
                disabled={batchEditIdx === 0}
                className={batchEditIdx === 0 ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
              >
                Back
              </Button>
              <Button 
                size="sm" 
                onClick={handleBatchWizardSaveCurrent} 
                isLoading={submitLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {batchEditIdx === batchEditItems.length - 1 ? 'Save & Finish' : 'Save & Next'}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Excel Import Modal */}
      <Dialog
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={isAutoEntry ? 'Bulk Entry (Auto-assigning M-codes)' : 'Bulk Update Materials (Apply spreadsheet details)'}
        className={isAutoEntry ? "!max-w-[65vw] !w-[65vw] !rounded-none" : "!max-w-[92vw] !w-[92vw] !rounded-none"}
      >
        <div className="space-y-4">


          <div className="border border-slate-200 rounded-lg p-8 text-center bg-slate-50 relative flex flex-col items-center justify-center space-y-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
              <Save className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-700 block">
                {isAutoEntry ? 'Bulk Entry Ingestion' : 'Upload Spreadsheet for Bulk Update'}
              </span>
              <span className="text-[10px] text-slate-400 block font-semibold mt-0.5">
                Supports Microsoft Excel files (.xlsx, .xls)
              </span>
            </div>
            
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx, .xls"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) processExcelFile(file);
                }}
                className="hidden"
              />
              <Button 
                size="sm" 
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 flex items-center space-x-1.5 rounded shadow"
              >
                <span>Upload</span>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
            <span className="text-slate-500 font-medium">Need the format template?</span>
            <button
              onClick={handleDownloadTemplate}
              className="text-blue-600 hover:underline font-bold text-xs focus:outline-none"
            >
              Excel Template
            </button>
          </div>

          {importSummary && (
            <div className="space-y-3 p-3 border border-slate-200 rounded-md bg-white">
              {!isAutoEntry && (
                <div className="flex gap-2 justify-center mb-2">
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 font-bold text-xs rounded-full border border-amber-200">Changed ({importSummary.existingMatchCount || 0})</span>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full border border-emerald-200">New ({(importSummary.acceptedCount || 0) + (importSummary.duplicateCount || 0)})</span>
                </div>
              )}
              {/* File Uploaded Successfully Banner */}
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-md flex items-center space-x-2 text-emerald-800 font-semibold mb-1">
                <div className="p-0.5 bg-emerald-100 rounded-full text-emerald-600">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <span className="block text-xs font-bold">File read and validated successfully!</span>
                  <span className="block font-mono text-[10px] text-emerald-600 mt-0.5">{currentFileName}</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-b pb-1.5 mb-1.5">
                <span className="text-xs font-bold text-slate-700">Validation Results Summary</span>
                <span className="text-[10px] bg-slate-100 text-slate-605 font-bold px-1.5 py-0.5 rounded">
                  Total: {importSummary.total} rows
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 border border-emerald-100 p-1.5 rounded">
                  <span className="text-[10px] text-emerald-600 font-bold block">✅ New Materials</span>
                  <span className="text-sm font-extrabold text-emerald-700">{importSummary.acceptedCount}</span>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-1.5 rounded">
                  <span className="text-[10px] text-amber-700 font-bold block">⚠️ Already Existing</span>
                  <span className="text-sm font-extrabold text-amber-700">{importSummary.existingMatchCount || 0}</span>
                </div>
                <div className="bg-red-50 border border-red-100 p-1.5 rounded">
                  <span className="text-[10px] text-red-600 font-bold block">❌ Errors</span>
                  <span className="text-sm font-extrabold text-red-700">{(importSummary.rejectedCount || 0) + (importSummary.duplicateCount || 0)}</span>
                </div>
              </div>

              {importSummary.rejected.length > 0 && (
                <div className="max-h-24 overflow-y-auto border border-red-100 rounded p-1.5 bg-red-50/20 space-y-1">
                  <span className="text-[10px] text-red-700 font-bold block uppercase">Error Details:</span>
                  {importSummary.rejected.map((err, idx) => (
                    <span key={idx} className="text-[10px] text-red-650 font-medium block leading-tight">• {err}</span>
                  ))}
                </div>
              )}

              {/* Editable Preview Table of Accepted Items */}
              

              {/* ── BULK ENTRY: Replace / Skip panel ── */}
              {isAutoEntry && importSummary.acceptedCount > 0 && (
                <div className="space-y-2 p-3 border border-emerald-200 rounded-md bg-emerald-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center space-x-1.5">
                      <Info className="h-3.5 w-3.5" />
                      <span>New Materials to Add</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                      {importSummary.acceptedCount} new
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-700 font-medium">
                    These materials are new and will be added directly to All Materials with the assigned codes below.
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {editableAcceptedItems.map((item, idx) => {
                      if (item.isExistingMatch || item.validationErrors.length > 0 || item.isDuplicate) return null;
                      return (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 rounded border border-emerald-200 bg-white text-xs font-semibold">
                          <div className="flex-1 min-w-0">
                            <span className="font-bold block truncate text-slate-800 capitalize">{item.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">Code: {item.code} • {item.type} • {item.unit}</span>
                          </div>
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full ml-3">NEW</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isAutoEntry && (importSummary.existingMatchCount || 0) > 0 && (
                <div className="space-y-2 p-3 border border-amber-200 rounded-md bg-amber-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center space-x-1.5">
                      <Info className="h-3.5 w-3.5" />
                      <span>Already in Database — Replace or Skip?</span>
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">
                      {confirmedReplacements.size + skippedItems.size} / {importSummary.existingMatchCount} resolved
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-700 font-medium">
                    These materials already exist. Choose <strong>Replace</strong> to overwrite with new data, or <strong>Skip</strong> to keep existing data.
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {editableAcceptedItems.map((item, idx) => {
                      if (!item.isExistingMatch || item.validationErrors.length > 0) return null;
                      const isConfirmed = confirmedReplacements.has(idx);
                      const isSkipped = skippedItems.has(idx);
                      return (
                        <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded border text-xs font-semibold transition-all ${
                          isConfirmed ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                          isSkipped   ? 'bg-slate-50 border-slate-200 text-slate-400' :
                                        'bg-white border-amber-200 text-slate-700'
                        }`}>
                          <div className="flex-1 min-w-0">
                            <span className={`font-bold block truncate ${isSkipped ? 'line-through' : ''}`}>{item.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">Code: {item.code} • {item.type}</span>
                            {item.existingMaterialDetails && !isSkipped && (
                              <span className="text-[10px] text-amber-600 block">
                                DB: {item.existingMaterialDetails.name} • {item.existingMaterialDetails.unit} • {item.existingMaterialDetails.status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 ml-3 flex-shrink-0">
                            {(isConfirmed || isSkipped) ? (
                              <>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {isConfirmed ? '✓ Will Replace' : '✗ Skipped'}
                                </span>
                                <button onClick={() => { setConfirmedReplacements(prev => { const n = new Set(prev); n.delete(idx); return n; }); setSkippedItems(prev => { const n = new Set(prev); n.delete(idx); return n; }); }} className="text-[10px] text-slate-400 hover:text-slate-600 font-bold hover:underline">Undo</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setConfirmedReplacements(prev => { const n = new Set(prev); n.add(idx); return n; }); setSkippedItems(prev => { const n = new Set(prev); n.delete(idx); return n; }); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-[10px] transition-colors">Replace</button>
                                <button onClick={() => { setSkippedItems(prev => { const n = new Set(prev); n.add(idx); return n; }); setConfirmedReplacements(prev => { const n = new Set(prev); n.delete(idx); return n; }); }} className="bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 font-bold px-2.5 py-1 rounded text-[10px] border border-slate-200 hover:border-red-200 transition-colors">Skip</button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(importSummary.existingMatchCount || 0) > 1 && (
                    <div className="flex items-center space-x-2 pt-1.5 border-t border-amber-200">
                      <button onClick={() => { const s = new Set(); editableAcceptedItems.forEach((item, i) => { if (item.isExistingMatch && item.validationErrors.length === 0) s.add(i); }); setConfirmedReplacements(s); setSkippedItems(new Set()); }} className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold hover:underline">✓ Replace All</button>
                      <span className="text-slate-300">|</span>
                      <button onClick={() => { const s = new Set(); editableAcceptedItems.forEach((item, i) => { if (item.isExistingMatch && item.validationErrors.length === 0) s.add(i); }); setSkippedItems(s); setConfirmedReplacements(new Set()); }} className="text-[10px] text-red-600 hover:text-red-700 font-bold hover:underline">✗ Skip All</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── BULK UPDATE: Professional Field-level diff panel ── */}
              {!isAutoEntry && (importSummary.existingMatchCount || 0) > 0 && (() => {
                const allExisting = editableAcceptedItems.filter(it => it.isExistingMatch && it.validationErrors.length === 0);
                const changedItems = allExisting.filter(it => it.fieldChanges && it.fieldChanges.length > 0);
                const noChangeItems = allExisting.filter(it => !it.fieldChanges || it.fieldChanges.length === 0);
                const newItems = editableAcceptedItems.filter(it => !it.isExistingMatch && it.validationErrors.length === 0 && !it.isDuplicate);
                const totalNeedingAction = changedItems.length;
                const resolved = changedItems.filter((_, i) => {
                  const realIdx = editableAcceptedItems.indexOf(changedItems[i]);
                  return confirmedReplacements.has(realIdx) || skippedItems.has(realIdx);
                }).length;
                const accepted = changedItems.filter((_, i) => {
                  const realIdx = editableAcceptedItems.indexOf(changedItems[i]);
                  return confirmedReplacements.has(realIdx);
                }).length;
                const progressPct = totalNeedingAction > 0 ? Math.round((resolved / totalNeedingAction) * 100) : 100;
                const allResolved = totalNeedingAction === 0 || resolved >= totalNeedingAction;

                return (
                  <div className="space-y-2.5 p-3 border border-blue-200 rounded-lg bg-gradient-to-b from-blue-50/60 to-white">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5" />
                        Bulk Update Review
                      </span>
                      <div className="flex items-center gap-2">
                        {noChangeItems.length > 0 && (
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                            {noChangeItems.length} unchanged (auto-kept)
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Ready to import
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {totalNeedingAction > 0 && (
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            allResolved ? 'bg-emerald-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    )}


                    {/* Filter tabs */}
                    {(() => {
                      const tabs = [
                        { key: 'changed',   label: `Changed (${changedItems.length})`,    color: 'text-orange-600 border-orange-400',  active: 'bg-orange-50 border-orange-400' },
                        { key: 'nochange',  label: `No Change (${noChangeItems.length})`, color: 'text-slate-500 border-slate-200',     active: 'bg-slate-50 border-slate-400' },
                        { key: 'new',       label: `New (${newItems.length})`,            color: 'text-emerald-600 border-emerald-300', active: 'bg-emerald-50 border-emerald-400' },
                      ];
                      const filteredItems = editableAcceptedItems.map((item, idx) => ({ item, idx })).filter(({ item }) => {
                        if (!item || item.validationErrors.length > 0 || item.isDuplicate) return false;

                        // Apply internal search filter
                        if (importSearch.trim()) {
                          const q = importSearch.toLowerCase().trim();
                          const nameMatch = (item.name || '').toLowerCase().includes(q);
                          const codeMatch = (item.code || '').toLowerCase().includes(q);
                          if (!nameMatch && !codeMatch) return false;
                        }

                        if (bulkUpdateTab === 'changed')  return item.isExistingMatch && item.fieldChanges && item.fieldChanges.length > 0;
                        if (bulkUpdateTab === 'nochange') return item.isExistingMatch && (!item.fieldChanges || item.fieldChanges.length === 0);
                        if (bulkUpdateTab === 'new')      return !item.isExistingMatch;
                        return true;
                      });


                      return (
                        <>
                          {/* Tabs row with search */}
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              {tabs.map(tab => (
                                <button
                                  key={tab.key}
                                  onClick={() => setBulkUpdateTab(tab.key)}
                                  className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-all ${
                                    bulkUpdateTab === tab.key ? tab.active + ' ' + tab.color : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>

                            {/* Search Box */}
                            <div className="relative w-full lg:w-[360px]">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                              <input
                                type="text"
                                value={importSearch}
                                onChange={(e) => setImportSearch(e.target.value)}
                                placeholder="Search material name or code to edit..."
                                className="w-full pl-8 pr-7 py-2 border border-blue-200 rounded-md text-xs focus:outline-none focus:border-blue-500 bg-white font-semibold shadow-sm"
                              />
                              {importSearch && (
                                <button
                                  onClick={() => setImportSearch('')}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 text-xs font-bold"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                            {/* Quick bulk actions */}
                            {bulkUpdateTab === 'changed' && changedItems.length > 1 && (
                              <div className="ml-auto flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    const s = new Set(confirmedReplacements);
                                    editableAcceptedItems.forEach((item, i) => {
                                      if (item.isExistingMatch && item.fieldChanges && item.fieldChanges.length > 0 && item.validationErrors.length === 0)
                                        s.add(i);
                                    });
                                    setConfirmedReplacements(s);
                                    editableAcceptedItems.forEach((item, i) => {
                                      if (item.isExistingMatch && item.fieldChanges && item.fieldChanges.length > 0)
                                        setSkippedItems(prev => { const n = new Set(prev); n.delete(i); return n; });
                                    });
                                  }}
                                  className="text-[10px] text-blue-700 hover:text-blue-900 font-bold hover:underline"
                                >✓ Accept All</button>
                                <span className="text-slate-200">|</span>
                                <button
                                  onClick={() => {
                                    const s = new Set(skippedItems);
                                    editableAcceptedItems.forEach((item, i) => {
                                      if (item.isExistingMatch && item.fieldChanges && item.fieldChanges.length > 0 && item.validationErrors.length === 0)
                                        s.add(i);
                                    });
                                    setSkippedItems(s);
                                    editableAcceptedItems.forEach((item, i) => {
                                      if (item.isExistingMatch && item.fieldChanges && item.fieldChanges.length > 0)
                                        setConfirmedReplacements(prev => { const n = new Set(prev); n.delete(i); return n; });
                                    });
                                  }}
                                  className="text-[10px] text-red-600 hover:text-red-800 font-bold hover:underline"
                                >✗ Skip All</button>
                              </div>
                            )}

                          {/* Items list */}
                          <div className="max-h-[58vh] overflow-y-auto space-y-2 pr-0.5">
                            {filteredItems.length === 0 && (
                              <div className="text-center py-4 text-slate-400 text-[11px] italic">No items in this category.</div>
                            )}
                            {filteredItems.map(({ item, idx }) => {
                              const isConfirmed = confirmedReplacements.has(idx);
                              const isSkipped   = skippedItems.has(idx);
                              const hasChanges  = item.fieldChanges && item.fieldChanges.length > 0;
                              const isEditing = editingPreviewIdx === idx;
                              return (
                                <div key={idx} className={`rounded-lg border text-xs transition-all ${
                                  item.isExistingMatch
                                    ? isConfirmed ? 'border-emerald-200 bg-emerald-50'
                                    : isSkipped   ? 'border-slate-200 bg-slate-50 opacity-50'
                                    :               'border-blue-200 bg-white shadow-sm'
                                    : 'border-emerald-100 bg-emerald-50/30'
                                }`}>
                                  {/* Row header */}
                                  <div className="flex items-center justify-between px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`font-bold ${
                                        isSkipped ? 'line-through text-slate-400' : 'text-slate-800'
                                      }`}>{item.name}</span>
                                      <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">#{item.code}</span>
                                      {!item.isExistingMatch && <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full">NEW</span>}
                                      <button
                                        onClick={() => {
                                          if (!item.isExistingMatch) {
                                            alert('New materials cannot be edited in Bulk Update. Add them through Bulk Entry or Material Master first.');
                                            return;
                                          }
                                          const subcats = subcategoryMap[item.type || 'Raw Material'] || [];
                                          const matched = subcats.find(s => s.value.toLowerCase() === (item.subcategory || '').toLowerCase());
                                          setEditingPreviewIdx(idx);
                                          setPreviewRowData({
                                            ...item,
                                            subcategory: matched ? matched.value : (subcats.length > 0 ? subcats[0].value : '')
                                          });
                                        }}
                                        className={item.isExistingMatch
                                          ? 'bg-white hover:bg-blue-50 text-blue-700 font-bold px-2.5 py-0.5 rounded text-[10px] border border-blue-200 transition-colors'
                                          : 'bg-slate-100 text-slate-400 font-bold px-2.5 py-0.5 rounded text-[10px] border border-slate-200 cursor-not-allowed'}
                                        title={item.isExistingMatch ? 'Edit this material update' : 'New materials cannot be edited in Bulk Update'}
                                      >
                                        Edit
                                      </button>
                                      {item.isExistingMatch && !hasChanges && <span className="text-[9px] text-slate-400 italic ml-1">✓ No changes</span>}
                                    </div>
                                    {/* Action buttons — only for changed items */}
                                    {item.isExistingMatch && hasChanges && (
                                      <div className="flex items-center gap-1.5">
                                        {(isConfirmed || isSkipped) ? (
                                          <>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                              isConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                            }`}>{isConfirmed ? '✓ Will Update' : '✗ Skipped'}</span>
                                            <button
                                              onClick={() => {
                                                setConfirmedReplacements(prev => { const n = new Set(prev); n.delete(idx); return n; });
                                                setSkippedItems(prev => { const n = new Set(prev); n.delete(idx); return n; });
                                              }}
                                              className="text-[10px] text-slate-400 hover:text-slate-700 font-semibold hover:underline"
                                            >Undo</button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => {
                                                setConfirmedReplacements(prev => { const n = new Set(prev); n.add(idx); return n; });
                                                setSkippedItems(prev => { const n = new Set(prev); n.delete(idx); return n; });
                                              }}
                                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1 rounded text-[10px] transition-colors shadow-sm"
                                            >✓ Accept</button>
                                            <button
                                              onClick={() => {
                                                setSkippedItems(prev => { const n = new Set(prev); n.add(idx); return n; });
                                                setConfirmedReplacements(prev => { const n = new Set(prev); n.delete(idx); return n; });
                                              }}
                                              className="bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 font-bold px-3 py-1 rounded text-[10px] border border-slate-200 hover:border-red-200 transition-colors"
                                            >✗ Skip</button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {isEditing && (
                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 px-3 py-2 border-t border-blue-100 bg-blue-50/40">
                                      <input
                                        type="text"
                                        value={previewRowData.name || ''}
                                        onChange={(e) => setPreviewRowData({ ...previewRowData, name: e.target.value })}
                                        className="md:col-span-2 px-2 py-1 border border-blue-200 rounded text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white"
                                        placeholder="Material name"
                                      />
                                      <select
                                        value={previewRowData.unit || 'pcs'}
                                        onChange={(e) => setPreviewRowData({ ...previewRowData, unit: e.target.value })}
                                        className="px-2 py-1 border border-blue-200 rounded text-xs font-semibold bg-white"
                                      >
                                        <option value="pcs">pcs</option>
                                        <option value="kg">kg</option>
                                        <option value="gm">gm</option>
                                        <option value="l">L</option>
                                        <option value="nos">nos</option>
                                        <option value="box">box</option>
                                      </select>
                                      <select
                                        value={previewRowData.type || 'Raw Material'}
                                        onChange={(e) => {
                                          const newType = e.target.value;
                                          const subcats = subcategoryMap[newType] || [];
                                          setPreviewRowData({
                                            ...previewRowData,
                                            type: newType,
                                            subcategory: subcats.length > 0 ? subcats[0].value : ''
                                          });
                                        }}
                                        className="px-2 py-1 border border-blue-200 rounded text-xs font-semibold bg-white"
                                      >
                                        <option value="Raw Material">Raw Material</option>
                                        <option value="Finished Goods">Finished Goods</option>
                                        <option value="Packing Material">Packing Material</option>
                                      </select>
                                      <select
                                        value={previewRowData.subcategory || ''}
                                        onChange={(e) => setPreviewRowData({ ...previewRowData, subcategory: e.target.value })}
                                        className="px-2 py-1 border border-blue-200 rounded text-xs font-semibold bg-white"
                                      >
                                        {(subcategoryMap[previewRowData.type || 'Raw Material'] || []).map(sub => (
                                          <option key={sub.value} value={sub.value}>{sub.label}</option>
                                        ))}
                                      </select>
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => {
                                            const updatedItemRaw = {
                                              name: (previewRowData.name || '').trim(),
                                              code: previewRowData.code,
                                              unit: previewRowData.unit,
                                              type: previewRowData.type,
                                              subcategory: previewRowData.subcategory,
                                              description: previewRowData.description || '',
                                              status: previewRowData.status || 'Active'
                                            };
                                            const updatedList = [...editableAcceptedItems];
                                            updatedList[idx] = updatedItemRaw;
                                            const systemExistingCodes = materials.map(m => m.code.toUpperCase().trim());
                                            const { processedItems: nextProcessed, summary: nextSummary } = recalculateImportSummary(updatedList, systemExistingCodes, isAutoEntry);
                                            setEditableAcceptedItems(nextProcessed);
                                            setImportSummary(nextSummary);
                                            setEditingPreviewIdx(null);
                                            showToast('Material update edited successfully.', 'success');
                                          }}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded text-[10px]"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={() => setEditingPreviewIdx(null)}
                                          className="bg-white hover:bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded text-[10px] border border-slate-200"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {/* Field diff table */}
                                  {hasChanges && !isSkipped && (
                                    <div className="px-3 pb-2 pt-0 border-t border-slate-100">
                                      <table className="w-full text-[10px] mt-1.5">
                                        <thead>
                                          <tr className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                                            <td className="pb-1 w-24">Field</td>
                                            <td className="pb-1">Current (in DB)</td>
                                            <td className="pb-1 text-center w-5"></td>
                                            <td className="pb-1">New (from Excel)</td>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {item.fieldChanges.map((change, ci) => (
                                            <tr key={ci} className="border-t border-slate-50">
                                              <td className="py-1 font-bold text-slate-500">{change.label}</td>
                                              <td className="py-1">
                                                <span className="text-red-500 line-through bg-red-50 px-1 rounded">{change.oldVal || '—'}</span>
                                              </td>
                                              <td className="py-1 text-center text-slate-300 font-bold">→</td>
                                              <td className="py-1">
                                                <span className="text-emerald-700 font-bold bg-emerald-50 px-1 rounded">{change.newVal || '—'}</span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                        </>
                      );
                    })()}
                  </div>
                );
              })()}

              {false && editableAcceptedItems.length > 0 && (
                <div className="pt-2 border-t mt-3 space-y-3">
                  {/* Virtual Data Sheet Destination Config */}
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-2">
                    <span className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                      Virtual Ingestion Destination
                    </span>
                    
                    <div className="flex items-center space-x-4 text-xs font-semibold text-slate-600">
                      <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="importTargetType"
                          value="new"
                          checked={importTargetType === 'new'}
                          onChange={() => setImportTargetType('new')}
                          className="text-blue-600 focus:ring-0 h-3.5 w-3.5"
                        />
                        <span>Create New Virtual Sheet</span>
                      </label>
                      
                      {uniqueImportSources.length > 0 && (
                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="importTargetType"
                            value="existing"
                            checked={importTargetType === 'existing'}
                            onChange={() => setImportTargetType('existing')}
                            className="text-blue-600 focus:ring-0 h-3.5 w-3.5"
                          />
                          <span>Append to Existing Virtual Sheet</span>
                        </label>
                      )}
                    </div>

                    {importTargetType === 'new' ? (
                      <div className="flex flex-col space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold">New Sheet Reference Name</label>
                        <input
                          type="text"
                          value={newSheetName}
                          onChange={(e) => setNewSheetName(e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-500 bg-white font-semibold"
                          placeholder="e.g. Imported Cumin Batch A"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold">Select Existing Virtual Sheet</label>
                        <select
                          value={selectedExistingSheet}
                          onChange={(e) => setSelectedExistingSheet(e.target.value)}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs focus:outline-none bg-white font-semibold cursor-pointer"
                        >
                          {uniqueImportSources.map(src => (
                            <option key={src} value={src}>{src}</option>
                          ))}
                        </select>
                      </div>
                    )}
                              </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100 mt-4">
            {importSummary ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportSummary(null)}>
                  Cancel / Re-upload
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await handleBatchImportSubmit();
                    setIsImportModalOpen(false);
                  }}
                  isLoading={submitLoading}
                  disabled={submitLoading || (
                    isAutoEntry
                      ? (importSummary?.existingMatchCount || 0) > 0 && (confirmedReplacements.size + skippedItems.size) < (importSummary?.existingMatchCount || 0)
                      : false
                  )}
                  className={
                    submitLoading
                      ? 'bg-slate-300 text-slate-500 font-bold cursor-not-allowed'
                      : isAutoEntry
                        ? ((importSummary?.existingMatchCount || 0) > 0 && (confirmedReplacements.size + skippedItems.size) < (importSummary?.existingMatchCount || 0)
                            ? 'bg-slate-300 text-slate-500 font-bold cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold')
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
                  }
                >
                  {isAutoEntry
                    ? ((importSummary?.existingMatchCount || 0) > 0 && (confirmedReplacements.size + skippedItems.size) < (importSummary?.existingMatchCount || 0)
                        ? `Resolve ${(importSummary?.existingMatchCount || 0) - confirmedReplacements.size - skippedItems.size} item(s) first`
                        : '✓ Save & Import Batch')
                    : (unresolvedCount > 0
                        ? `Resolve ${unresolvedCount} changed item(s) first`
                        : '✓ Save & Import Updates')}
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setIsImportModalOpen(false)}>Exit</Button>
          </div>
        </div>
      </Dialog>

      {/* View Details Modal */}
      <Drawer
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Material details"
      >
        {viewingMaterial && (
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3.5">
              <Input
                label="Material Code"
                id="view_code"
                value={viewingMaterial.code}
                disabled
                className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <Input
                label="Material Name"
                id="view_name"
                value={viewingMaterial.name}
                disabled
                className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed capitalize"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <Input
                label="Unit of Measure"
                id="view_unit"
                value={viewingMaterial.unit}
                disabled
                className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed uppercase"
              />
              <Input
                label="Category"
                id="view_type"
                value={viewingMaterial.type}
                disabled
                className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <Input
                label="Sub-Category"
                id="view_subcategory"
                value={viewingMaterial.subcategory || '-'}
                disabled
                className="w-full !h-7 !text-[11px] !px-2 !py-0.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed capitalize"
              />
              <div className="flex flex-col space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-600">Material Status</label>
                <div className="h-7 flex items-center">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                    viewingMaterial.status === 'Active'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : viewingMaterial.status === 'Inactive'
                      ? 'bg-slate-50 text-slate-500 border-slate-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {viewingMaterial.status || 'Active'}
                  </span>
                </div>
              </div>
            </div>

            <TextArea
              label="Material Description"
              id="view_description"
              value={viewingMaterial.description || 'No description provided.'}
              disabled
              rows={2}
              className="w-full !text-[11px] !px-2 !py-1 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed h-16"
            />

            <div className="pt-2 flex items-center justify-end border-t border-slate-100 mt-4 space-x-2">
              <Button
                onClick={handlePrintPdf}
                size="sm"
                className="flex items-center space-x-1 border border-blue-200 text-blue-700 bg-blue-50/40 hover:bg-blue-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print PDF</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Revision History Modal */}
      <Dialog
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Revision Log & Audit Trail"
        className="!max-w-[450px] !w-[450px]"
      >
        {viewingMaterialAudit && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Selected Material</div>
              <div className="text-sm font-semibold text-slate-900 mt-1 capitalize">{viewingMaterialAudit.name}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">Code: {viewingMaterialAudit.code} | Category: {viewingMaterialAudit.type}</div>
            </div>

            <div className="relative pl-6 border-l border-slate-200 space-y-4 text-xs ml-2">
              <div className="relative">
                <div className="absolute -left-[30px] top-1 bg-blue-600 rounded-full h-2 w-2 border border-white ring-4 ring-blue-50" />
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                  <span>10-Jul-2026 10:30 AM</span>
                  <span className="font-semibold text-slate-700">Admin</span>
                </div>
                <p className="font-bold text-slate-800 mt-0.5">Operational status set to {viewingMaterialAudit.status}</p>
                <p className="text-slate-500 mt-0.5 text-[11px]">System action triggered via status toggle interface.</p>
              </div>

              <div className="relative">
                <div className="absolute -left-[30px] top-1 bg-slate-400 rounded-full h-2 w-2 border border-white ring-4 ring-slate-50" />
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                  <span>08-Jul-2026 02:40 PM</span>
                  <span className="font-semibold text-slate-700">Procurement Lead</span>
                </div>
                <p className="font-bold text-slate-800 mt-0.5">Record Fields Updated</p>
                <p className="text-slate-500 mt-0.5 text-[11px]">Unit of Measure aligned and sub-category set to {viewingMaterialAudit.subcategory || '-'}.</p>
              </div>

              <div className="relative">
                <div className="absolute -left-[30px] top-1 bg-slate-400 rounded-full h-2 w-2 border border-white ring-4 ring-slate-50" />
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                  <span>05-Jul-2026 09:15 AM</span>
                  <span className="font-semibold text-slate-700">System Agent</span>
                </div>
                <p className="font-bold text-slate-800 mt-0.5">Material Created & Registered</p>
                <p className="text-slate-500 mt-0.5 text-[11px]">Unique code auto-generated and validation checks completed.</p>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end border-t border-slate-100 mt-4">
              <Button variant="outline" size="sm" onClick={() => setIsAuditModalOpen(false)}>Close Log</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Floating Toast Notification Container */}
      <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between space-x-2 px-3.5 py-2.5 rounded-lg shadow-xl border text-xs font-extrabold transition-all duration-300 transform translate-y-0 opacity-100 ${
              t.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-slate-400 hover:text-slate-600 font-extrabold ml-2 focus:outline-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// VENDORS TAB COMPONENT (Reused from our previous VMS build)
// -------------------------------------------------------------
const VendorsTab = () => {
  const [isVendorImportModalOpen, setIsVendorImportModalOpen] = useState(false);
  const [isVendorAutoEntry, setIsVendorAutoEntry] = useState(false);
  const [vendorImportSummary, setVendorImportSummary] = useState(null);
  const [vendorImportSearch, setVendorImportSearch] = useState('');
  
  // Bulk Edit / Import logic for Vendors
  const handleVendorImportExcel = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('spreadsheet', file);
    formData.append('isAutoEntry', isVendorAutoEntry);
    
    setSubmitLoading(true);
    try {
      const res = await api.post('/api/vendors/batch-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        showToast(`Successfully processed vendor spreadsheet`, 'success');
        setVendorImportSummary({
          inserted: res.data.insertedCount,
          updated: res.data.updatedCount,
          errors: res.data.errors,
          errorsCount: res.data.errorsCount
        });
        fetchVendors();
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to import vendors';
      showToast(msg, 'error');
    } finally {
      setSubmitLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const gstStateMap = {
    '01': 'Jammu and Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
    '38': 'Ladakh'
  };

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [viewingVendorAudit, setViewingVendorAudit] = useState(null);
  const [showVendorFunctionList, setShowVendorFunctionList] = useState(false);
  const [activeFilterCol, setActiveFilterCol] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [tempFilters, setTempFilters] = useState({});
  const [filterSearchText, setFilterSearchText] = useState({});

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewingVendor, setViewingVendor] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [showDraftsList, setShowDraftsList] = useState(false);
  
  const [formData, setFormData] = useState({
    vendorId: '',
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    address2: '',
    zipCode: '',
    city: '',
    state: '',
    country: '',
    gstin: '',
    gstList: [{ state: '', gstin: '' }],
    hasNoGst: false,
    
    contactQualityName: '',
    contactQualityPhone: '',
    contactAccountsName: '',
    contactAccountsPhone: '',
    contactLogisticsName: '',
    contactLogisticsPhone: '',
    notes: '',
    category: 'Food Processor',
    subCategory: '',
    ffsc2200: false,
    ffsc2200Expiry: '',
    ffsc2200Qty: '',
    fssai: false,
    fssaiExpiry: '',
    fssaiQty: '',
    bankAccountHolder: '',
    bankAccountNumber: '',
    bankName: '',
    ifscCode: '',
    status: 'Active'
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const autoSaveIntervalRef = useRef(null);

  const categoryOptions = [
    { value: 'Food Processor', label: 'Food Processor' },
    { value: 'Contract Manufacturer', label: 'Contract Manufacturer' },
    { value: 'Retail Brand', label: 'Retail Brand' },
    { value: 'Fresh Fruits Supplier', label: 'Fresh Fruits Supplier' },
    { value: 'Other', label: 'Other' }
  ];

  const fetchVendors = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        limit: 100,
        ...(search && { search }),
        ...(category && { category }),
        ...(status && { status })
      };
      const res = await api.get('/api/vendors', { params });
      if (res.data && res.data.success) {
        setVendors(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch vendors.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [category, status]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchVendors();
    }, 450);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Load saved drafts on mount
  useEffect(() => {
    const saved = localStorage.getItem('erp_vendor_drafts');
    if (saved) {
      try {
        setDrafts(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Form Auto-save Draft with FIFO queue (max 10)
  useEffect(() => {
    if (isModalOpen && !editingId) {
      const timer = setInterval(() => {
        setFormData((currData) => {
          if (!currData.name && !currData.company && !currData.email && !currData.phone && !currData.address) {
            return currData;
          }

          const now = new Date().toLocaleTimeString();
          const draftId = currentDraftId || `draft_vendor_${Date.now()}`;
          if (!currentDraftId) {
            setCurrentDraftId(draftId);
          }

          setDrafts((prev) => {
            const existingIdx = prev.findIndex((d) => d.id === draftId);
            let updated = [...prev];
            const newDraft = {
              id: draftId,
              timestamp: now,
              data: currData
            };

            if (existingIdx >= 0) {
              updated[existingIdx] = newDraft;
            } else {
              updated = [newDraft, ...updated];
            }

            if (updated.length > 10) {
              updated = updated.slice(0, 10);
            }

            localStorage.setItem('erp_vendor_drafts', JSON.stringify(updated));
            setDraftMessage(`Draft autosaved at ${now}`);
            return updated;
          });

          return currData;
        });
      }, 3000);

      return () => clearInterval(timer);
    } else {
      setDraftMessage('');
    }
  }, [isModalOpen, editingId, currentDraftId]);

  const handleLoadDraft = (draft) => {
    setEditingId(null);
    setCurrentDraftId(draft.id);
    setFormData(draft.data);
    setFormErrors({});
    setIsModalOpen(true);
    setShowDraftsList(false);
    setDraftMessage(`Restored draft from ${draft.timestamp}`);
  };

  const handleDiscardDraft = (draftId, e) => {
    e.stopPropagation();
    if (!window.confirm('Discard this draft?')) return;
    setDrafts((prev) => {
      const filtered = prev.filter((d) => d.id !== draftId);
      localStorage.setItem('erp_vendor_drafts', JSON.stringify(filtered));
      return filtered;
    });
  };

  const handleOpenAddModal = async () => {
    setEditingId(null);
    setCurrentDraftId(null); // Clear active draft pointer
    setFormErrors({});
    
    let nextCodeStr = "V1001";
    try {
      const res = await api.get('/api/vendors/sequence-peek');
      if (res.data && res.data.nextCode) {
        nextCodeStr = res.data.nextCode;
      }
    } catch (e) {
      console.warn("Failed to fetch sequence peek", e);
    }

    setFormData({ 
      vendorId: nextCodeStr,
      name: '', company: '', email: '', phone: '', address: '', address2: '',
      zipCode: '', city: '', state: '', country: '',
      gstin: '', gstList: [{ state: '', gstin: '' }], hasNoGst: false,
      
      contactQualityName: '', contactQualityPhone: '',
      contactAccountsName: '', contactAccountsPhone: '',
      contactLogisticsName: '', contactLogisticsPhone: '',
      notes: '', category: 'Food Processor', subCategory: '', 
      ffsc2200: false, ffsc2200Expiry: '', ffsc2200Qty: '',
      fssai: false, fssaiExpiry: '', fssaiQty: '',
      bankAccountHolder: '', bankAccountNumber: '', bankName: '', ifscCode: '',
      status: 'Active' 
    });
    
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (vendor) => {
    setEditingId(vendor._id);
    setFormData({
      vendorId: vendor.vendorId || '',
      name: vendor.name || '',
      company: vendor.company || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      address2: vendor.address2 || '',
      zipCode: vendor.zipCode || '',
      city: vendor.city || '',
      state: vendor.state || '',
      country: vendor.country || '',
      gstin: vendor.gstin || '',
      gstList: vendor.gstList && vendor.gstList.length > 0 ? vendor.gstList : [{ state: '', gstin: '' }],
      hasNoGst: vendor.hasNoGst || false,
      
      contacts: vendor.contacts || [],
      notes: vendor.notes || '',
      category: vendor.category || 'Food Processor',
      subCategory: vendor.subCategory || '',
      ffsc2200: vendor.ffsc2200 || false,
      ffsc2200Expiry: vendor.ffsc2200Expiry ? vendor.ffsc2200Expiry.substring(0, 10) : '',
      ffsc2200Qty: vendor.ffsc2200Qty || '',
      fssai: vendor.fssai || false,
      fssaiExpiry: vendor.fssaiExpiry ? vendor.fssaiExpiry.substring(0, 10) : '',
      fssaiQty: vendor.fssaiQty || '',
      bankAccountHolder: vendor.bankAccountHolder || '',
      bankAccountNumber: vendor.bankAccountNumber || '',
      bankName: vendor.bankName || '',
      ifscCode: vendor.ifscCode || '',
      status: vendor.status || 'Active'
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentDraftId(null); // Reset draft state context
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Vendor representative name is required';
    if (!formData.company.trim()) errors.company = 'Company name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Invalid email address format';
    }
    if (!formData.phone.trim()) errors.phone = 'Phone is required';
    if (!formData.address.trim()) errors.address = 'Address is required';
    if (!formData.category) errors.category = 'Sourcing Category is required';

    // Validate GST registrations if checkbox not checked
    if (!formData.hasNoGst) {
      if (!formData.gstList || formData.gstList.length === 0) {
        errors.gstListStr = 'At least one GSTIN registration is required, or check "No GSTIN"';
      } else {
        const gstErrors = [];
        formData.gstList.forEach((gst, index) => {
          const rowError = {};
          if (!gst.state) rowError.state = 'State is required';
          if (!gst.gstin.trim()) {
            rowError.gstin = 'GSTIN is required';
          } else {
            const gstinVal = gst.gstin.trim().toUpperCase();
            if (gstinVal.length !== 15) {
              rowError.gstin = 'GSTIN must be exactly 15 characters';
            } else {
              // Check state code prefix match
              const prefix = gstinVal.substring(0, 2);
              const mappedState = gstStateMap[prefix];
              if (!mappedState) {
                rowError.gstin = 'Invalid GSTIN state prefix';
              } else if (mappedState !== gst.state) {
                rowError.gstin = `GSTIN prefix ${prefix} belongs to ${mappedState}, not ${gst.state}`;
              }
            }
          }
          if (Object.keys(rowError).length > 0) {
            gstErrors[index] = rowError;
          }
        });
        if (gstErrors.length > 0) {
          errors.gstList = gstErrors;
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      const formattedData = {
        ...formData,
        name: formData.name.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        company: formData.company.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        email: formData.email.trim().toLowerCase(),
        primaryContactName: formData.primaryContactName.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        primaryContactDesignation: formData.primaryContactDesignation.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        gstList: formData.gstList.map(gst => ({
          state: gst.state,
          gstin: gst.gstin.trim().toUpperCase()
        }))
      };

      if (editingId) {
        await api.put(`/api/vendors/${editingId}`, formattedData);
      } else {
        await api.post('/api/vendors', formattedData);

        // Evict draft from FIFO queue on successful register
        if (currentDraftId) {
          setDrafts((prev) => {
            const filtered = prev.filter((d) => d.id !== currentDraftId);
            localStorage.setItem('erp_vendor_drafts', JSON.stringify(filtered));
            return filtered;
          });
        }
      }
      fetchVendors();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit vendor details.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleStatus = async (vendor) => {
    try {
      await api.patch(`/api/vendors/${vendor._id}/status`);
      setVendors(vendors.map(v => 
        v._id === vendor._id ? { ...v, status: v.status === 'Active' ? 'Inactive' : 'Active' } : v
      ));
    } catch (err) {
      console.error(err);
      alert('Failed to toggle status.');
    }
  };

  const handleDeleteVendor = async (id) => {
    if (!window.confirm('Delete this vendor record? Checks active Purchase Orders (PO) references.')) return;
    try {
      await api.delete(`/api/vendors/${id}`);
      fetchVendors();
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'Operational safety: linked Purchase Orders prevent deleting this vendor.';
      alert(`Relational Integrity Check: ${errorMsg}`);
    }
  };

  const getUniqueValues = (col) => {
    let vals = [];
    if (col === 'gstList') {
      vals = vendors.flatMap(v => (v.gstList || []).map(g => g.gstin));
    } else {
      vals = vendors.map(v => v[col]);
    }
    return Array.from(new Set(vals.map(v => (v || '').toString().trim()))).filter(Boolean).sort();
  };

  const toggleFilterPopup = (col, e) => {
    e.stopPropagation();
    if (activeFilterCol === col) {
      setActiveFilterCol(null);
    } else {
      setActiveFilterCol(col);
      setTempFilters({
        ...tempFilters,
        [col]: columnFilters[col] || []
      });
      setFilterSearchText({
        ...filterSearchText,
        [col]: ''
      });
    }
  };

  const handleCheckboxChange = (col, val, checked) => {
    const current = tempFilters[col] || [];
    if (checked) {
      setTempFilters({
        ...tempFilters,
        [col]: [...current, val]
      });
    } else {
      setTempFilters({
        ...tempFilters,
        [col]: current.filter(x => x !== val)
      });
    }
  };

  const applyColumnFilter = (col) => {
    setColumnFilters(prev => ({
      ...prev,
      [col]: tempFilters[col] || []
    }));
    setActiveFilterCol(null);
  };

  const clearColumnFilter = (col) => {
    setColumnFilters(prev => ({
      ...prev,
      [col]: []
    }));
    setTempFilters(prev => ({
      ...prev,
      [col]: []
    }));
    setActiveFilterCol(null);
  };

  const handleResetAllFilters = () => {
    setSearch('');
    setCategory('');
    setStatus('');
    setColumnFilters({});
    setTempFilters({});
    setFilterSearchText({});
  };

  const renderFilterPopupContent = (col) => {
    let rawOptions = [];
    if (col === 'status') {
      rawOptions = ["Active", "Inactive"];
    } else {
      rawOptions = getUniqueValues(col);
    }
    const searchStr = (filterSearchText[col] || '').toLowerCase().trim();
    const filteredOptions = rawOptions.filter(val => {
      if (val.toLowerCase().includes(searchStr)) return true;
      if (col === 'name') {
        const matchingVendors = vendors.filter(v => v.name.toLowerCase() === val.toLowerCase());
        const hasMatchingInfo = matchingVendors.some(v => 
          (v.company || '').toLowerCase().includes(searchStr) || 
          (v.category || '').toLowerCase().includes(searchStr)
        );
        if (hasMatchingInfo) return true;
      }
      return false;
    });

    if (filteredOptions.length === 0) {
      return (
        <div className="py-3 text-center space-y-1">
          <span className="text-[11px] text-slate-400 font-semibold block">No matching options found</span>
          <div className="flex items-center justify-center space-x-1.5 pt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFilterSearchText({ ...filterSearchText, [col]: '' });
              }}
              className="text-[10px] text-blue-600 hover:underline font-bold"
            >
              Clear Search
            </button>
            <span className="text-slate-300 text-[10px]">|</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearColumnFilter(col);
              }}
              className="text-[10px] text-slate-500 hover:underline font-bold"
            >
              Clear Filter
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
        {filteredOptions.map(val => (
          <label key={val} className="flex items-center space-x-1.5 cursor-pointer text-slate-700 hover:text-slate-900 text-[11px] font-medium font-sans">
            <input
              type="checkbox"
              checked={(tempFilters[col] || []).includes(val)}
              onChange={(e) => handleCheckboxChange(col, val, e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-0 h-3 w-3 cursor-pointer"
            />
            <span className={col === 'email' ? 'lowercase' : col === 'gstList' ? 'font-mono' : 'capitalize'}>
              {col === 'email' || col === 'gstList' ? val : val.toLowerCase()}
            </span>
          </label>
        ))}
      </div>
    );
  };

  const filteredVendors = vendors.filter(v => {
    for (const col in columnFilters) {
      const selectedVals = columnFilters[col];
      if (selectedVals && selectedVals.length > 0) {
        let attrVal = '';
        if (col === 'gstList') {
          const gstinValues = (v.gstList || []).map(g => g.gstin.toString().trim().toLowerCase());
          if (!selectedVals.some(sv => gstinValues.includes(sv.toString().trim().toLowerCase()))) {
            return false;
          }
          continue;
        } else {
          attrVal = (v[col] || '');
        }
        const val = attrVal.toString().trim().toLowerCase();
        if (!selectedVals.map(sv => sv.toString().trim().toLowerCase()).includes(val)) {
          return false;
        }
      }
    }
    return true;
  });

  const handlePrintPdf = () => {
    if (!viewingVendor) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Vendor Profile - ${viewingVendor.company}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; margin: 0; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
            .title { font-size: 18px; font-weight: bold; color: #0f172a; }
            .subtitle { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: bold; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
            .field { display: flex; flex-direction: column; gap: 4px; }
            .label { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; }
            .value { font-size: 12px; color: #0f172a; font-weight: bold; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; text-transform: capitalize; }
            .value-code { font-family: monospace; font-size: 11px; color: #2563eb; text-transform: uppercase; }
            .desc { grid-column: span 2; }
            .desc-val { font-size: 11px; line-height: 1.5; color: #334155; min-height: 60px; text-transform: none; }
            .section-title { grid-column: span 2; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; margin-top: 8px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 8px; color: #94a3b8; text-align: center; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="subtitle">Enterprise Resource Planning Portal</div>
              <div class="title">Vendor Sourcing Record</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; font-weight: bold; color: #2563eb;">CATEGORY: ${viewingVendor.category}</div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">Date Generated: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div class="grid">
            <div class="field">
              <div class="label">Vendor Name</div>
              <div class="value">${viewingVendor.name}</div>
            </div>
            <div class="field">
              <div class="label">Company Name</div>
              <div class="value">${viewingVendor.company}</div>
            </div>
            <div class="field">
              <div class="label">Email Address</div>
              <div class="value" style="text-transform: none; font-family: monospace;">${viewingVendor.email}</div>
            </div>
            <div class="field">
              <div class="label">Phone Number</div>
              <div class="value">${viewingVendor.phone}</div>
            </div>
            <div class="field">
              <div class="label">Office Address</div>
              <div class="value">${viewingVendor.address}</div>
            </div>
            <div class="field">
              <div class="label">Alternative Address</div>
              <div class="value">${viewingVendor.address2 || '-'}</div>
            </div>
            <div class="field desc">
              <div class="label">GST Registrations</div>
              <div class="value desc-val">
                ${viewingVendor.hasNoGst 
                  ? 'Unregistered Vendor (No GSTIN)' 
                  : (viewingVendor.gstList || []).map(gst => `<div style="margin-bottom: 4px;"><strong>${gst.state}:</strong> <span style="font-family: monospace; color: #2563eb;">${gst.gstin}</span></div>`).join('')
                }
              </div>
            </div>

            <div class="section-title">Primary Sourcing Contact</div>
            <div class="field">
              <div class="label">Contact Name</div>
              <div class="value">${viewingVendor.primaryContactName || '-'}</div>
            </div>
            <div class="field">
              <div class="label">Contact Phone</div>
              <div class="value">${viewingVendor.primaryContactPhone || '-'}</div>
            </div>
            <div class="field">
              <div class="label">Designation</div>
              <div class="value">${viewingVendor.primaryContactDesignation || '-'}</div>
            </div>
            <div class="field">
              <div class="label">Status</div>
              <div class="value">${viewingVendor.status}</div>
            </div>

            <div class="field desc">
              <div class="label">Vendor Sourcing Notes</div>
              <div class="value desc-val">${viewingVendor.notes || 'No notes provided.'}</div>
            </div>
          </div>

          <div class="footer">
            ERP Portal Vendor Profile Document. Confidential & Internal Use Only.
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-3">
      {/* Search & Filters */}
      <Card className="shadow-none border border-slate-200 overflow-visible">
        <CardContent className="p-1 flex flex-col md:flex-row items-center justify-between gap-2 bg-slate-50/50 overflow-visible">
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search vendors by name/company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-0.5 h-7 pr-7 border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none text-[10px] font-bold"
                title="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center space-x-1.5 w-full md:w-auto shrink-0 justify-end">
            {drafts.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowDraftsList(!showDraftsList)} 
                className="flex items-center space-x-1 border-blue-200 text-blue-700 bg-blue-50/40 h-7 rounded-md font-bold px-2.5"
              >
                <span>Drafts ({drafts.length})</span>
              </Button>
            )}

            {(search || category || status || Object.values(columnFilters).some(v => v && v.length > 0)) && (
              <button
                onClick={handleResetAllFilters}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded h-7 border border-slate-200 transition-colors"
              >
                Clear All Filters
              </button>
            )}

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-2.5 py-0.5 h-7 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
            >
              <option value="">All Categories</option>
              {categoryOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-2.5 py-0.5 h-7 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            <div className="relative">
              <Button
                size="sm"
                onClick={() => setShowVendorFunctionList(!showVendorFunctionList)}
                className="h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                <span>Function List</span>
                <span className="text-[9px]">▼</span>
              </Button>

              {showVendorFunctionList && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowVendorFunctionList(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1 text-left">
                    <button onClick={() => { setShowVendorFunctionList(false); handleOpenAddModal(); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 font-medium">
                      <Plus className="h-3.5 w-3.5 text-slate-400" /><span>Manual Entry</span>
                    </button>
                    <button onClick={() => { setShowVendorFunctionList(false); setIsVendorAutoEntry(true); setIsVendorImportModalOpen(true); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 font-medium">
                      <Save className="h-3.5 w-3.5 text-slate-400" /><span>Auto Entry</span>
                    </button>
                    <button onClick={() => { setShowVendorFunctionList(false); setIsVendorAutoEntry(false); setIsVendorImportModalOpen(true); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 font-medium">
                      <Save className="h-3.5 w-3.5 text-slate-400" /><span>Bulk Update</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
        {/* Active Filter Tags */}
        {(() => {
          const activeTags = [];

          if (search) {
            activeTags.push({
              id: 'search',
              label: `Search: "${search}"`,
              onClear: () => setSearch('')
            });
          }
          if (category) {
            activeTags.push({
              id: 'category',
              label: `Category: ${category}`,
              onClear: () => setCategory('')
            });
          }
          if (status) {
            activeTags.push({
              id: 'status',
              label: `Status: ${status}`,
              onClear: () => setStatus('')
            });
          }

          // Column filters
          Object.entries(columnFilters).forEach(([col, vals]) => {
            if (vals && vals.length > 0) {
              const prettyCol = col === 'company' ? 'Company' 
                              : col === 'gstList' ? 'GST Registrations' 
                              : col.charAt(0).toUpperCase() + col.slice(1);
              vals.forEach(val => {
                activeTags.push({
                  id: `col-${col}-${val}`,
                  label: `${prettyCol}: ${val}`,
                  onClear: () => {
                    setColumnFilters(prev => ({
                      ...prev,
                      [col]: prev[col].filter(v => v !== val)
                    }));
                  }
                });
              });
            }
          });

          if (activeTags.length === 0) return null;

          return (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pt-0.5 bg-slate-50/50 border-t border-slate-100 rounded-b-md">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Active Filters:</span>
              {activeTags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center space-x-1 bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm hover:border-slate-300 transition-all"
                >
                  <span>{tag.label}</span>
                  <button
                    onClick={tag.onClear}
                    className="text-slate-400 hover:text-red-500 font-black focus:outline-none ml-0.5 text-[8px]"
                    title="Remove filter"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                onClick={handleResetAllFilters}
                className="text-[9px] text-red-600 hover:text-red-800 font-bold ml-1.5 focus:outline-none hover:underline"
              >
                Clear All
              </button>
            </div>
          );
        })()}
      </Card>

      {/* Drafts List Card */}
      {showDraftsList && (
        <Card className="border-slate-200 bg-slate-50/50 shadow-none border">
          <CardHeader className="py-1 px-2.5 border-b border-slate-200 flex items-center justify-end">
            <button 
              onClick={() => setShowDraftsList(false)}
              className="text-[10px] text-slate-500 hover:text-slate-700 font-bold"
            >
              Hide drafts
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {drafts.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 font-medium">No pending drafts found.</div>
            ) : (
              <Table className="border-t border-slate-200">
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="!px-2.5 !py-1 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200">Vendor Name Draft</TableHead>
                    <TableHead className="!px-2.5 !py-1 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200">Company Draft</TableHead>
                    <TableHead className="!px-2.5 !py-1 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200">Last Autosaved</TableHead>
                    <TableHead className="!px-2.5 !py-1 text-right text-slate-600 font-bold text-[11px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((d) => (
                    <TableRow key={d.id} className="hover:bg-slate-50/50 border-b border-slate-200">
                      <TableCell className="!px-2.5 !py-1 font-semibold text-xs text-slate-800 text-left capitalize border-r border-slate-200">
                        {d.data.name ? d.data.name.toLowerCase() : <span className="text-slate-400 italic">untitled vendor</span>}
                      </TableCell>
                      <TableCell className="!px-2.5 !py-1 text-xs text-slate-600 border-r border-slate-200">
                        {d.data.company ? d.data.company : <span className="text-slate-400 italic">-</span>}
                      </TableCell>
                      <TableCell className="!px-2.5 !py-1 text-xs text-slate-500 font-mono border-r border-slate-200">{d.timestamp}</TableCell>
                      <TableCell className="!px-2.5 !py-1 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleLoadDraft(d)}
                            className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-0.5 rounded transition-colors"
                          >
                            Continue
                          </button>
                          <button
                            onClick={(e) => handleDiscardDraft(d.id, e)}
                            className="text-[10px] text-red-600 hover:text-red-800 font-bold px-1"
                          >
                            Discard
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid */}
      <Card className="shadow-none border border-slate-200 overflow-visible bg-white">
        <CardContent className="p-0 overflow-visible">
          {error && <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50">{error}</div>}

          {loading ? (
            <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
              <div className="divide-y divide-slate-100">
                <div className="bg-slate-50 p-2.5 flex items-center justify-between border-b border-slate-200">
                  <div className="w-1/4 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-20 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-1/5 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-16 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-20 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-16 h-3 rounded bg-slate-300 animate-pulse" />
                  <div className="w-1/4 h-3 rounded bg-slate-300 animate-pulse" />
                </div>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between space-x-4">
                    <div className="w-1/4 h-3.5 rounded animate-shimmer" />
                    <div className="w-20 h-3.5 rounded animate-shimmer" />
                    <div className="w-1/5 h-3.5 rounded animate-shimmer" />
                    <div className="w-16 h-3.5 rounded animate-shimmer" />
                    <div className="w-20 h-3.5 rounded animate-shimmer" />
                    <div className="w-16 h-3 rounded animate-shimmer" />
                    <div className="w-1/4 h-3.5 rounded animate-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          ) : vendors.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium">No vendors registered.</div>
          ) : (
            <Table className="border border-slate-200 w-full table-fixed">
              <TableHeader className="bg-slate-50 border-b border-slate-200 relative z-20">
                <TableRow>
                  <TableHead className="!px-3 !py-1 w-[40px] max-w-[40px] text-center border-r border-slate-200 relative z-20">
                    <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[120px] max-w-[120px] whitespace-nowrap">Vendor Name</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap">Company</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap">Notes/Desc</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap">GST Reg</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap">Category</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[110px] max-w-[110px] whitespace-nowrap">Status</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-right text-slate-600 font-bold text-[11px] w-[120px] max-w-[120px] border-r border-slate-200">Actions</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] whitespace-nowrap">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVendors.map((v) => (
                  <TableRow key={v._id} className="hover:bg-slate-50/50 border-b border-slate-200">
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[40px] max-w-[40px] text-center">
                      <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[120px] max-w-[120px]">
                      <div className="flex items-center justify-between group/code">
                        <div className="w-full">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-600">{v.vendorId}</span>
                          </div>
                          <span className="block truncate text-xs font-semibold text-slate-800 capitalize">{v.name ? v.name.toLowerCase() : "-"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-[11px] text-slate-700 font-medium truncate max-w-[120px]">
                      {v.company || "-"}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-[10px] text-slate-500 truncate max-w-[120px]">
                      {v.notes || "-"}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200">
                      {v.gstList && v.gstList.length > 0 && v.gstList[0].gstin ? (
                        <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {v.gstList[0].gstin}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No GST</span>
                      )}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium inline-block border border-slate-200 capitalize shadow-sm">
                        {v.category}
                      </span>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[110px] max-w-[110px]">
                      <span className={"px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm inline-flex items-center space-x-1 " + (v.status === "Active" ? "bg-green-100 text-green-700 border border-green-200" : v.status === "Draft" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-red-100 text-red-700 border border-red-200")}>
                        <span className={"h-1.5 w-1.5 rounded-full " + (v.status === "Active" ? "bg-green-500" : v.status === "Draft" ? "bg-amber-500" : "bg-red-500")}></span>
                        <span>{v.status}</span>
                      </span>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-right border-r border-slate-200 w-[120px] max-w-[120px]">
                      <div className="flex items-center justify-end space-x-2">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(v); }} className="p-1 hover:bg-blue-50 hover:text-blue-600 rounded text-slate-400 transition-colors" title="Edit Vendor">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v._id); }} className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-slate-400 transition-colors" title="Delete Vendor">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left text-[11px] text-slate-600 truncate max-w-[120px]">
                      {v.email || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CRUD Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit Vendor details' : 'Register new vendor'}
        className="!max-w-[50vw] !w-[50vw] !rounded-none"
      >
        <form onSubmit={handleFormSubmit} className="space-y-6">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold shadow-sm">
              {formErrors.form}
            </div>
          )}

          {/* Section 1: Basic Information */}
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Basic Information</h4>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4 bg-white">
              <Input
                label="Vendor ID"
                id="vvendorId"
                value={formData.vendorId || ''}
                disabled={true}
                className="!text-xs !py-1.5 !px-2.5 !h-9 !rounded-md font-mono text-slate-500 bg-slate-50 cursor-not-allowed font-bold"
              />
              <Input
                label="Vendor Name"
                id="vname"
                placeholder="e.g. Acme Supplies Ltd"
                value={formData.name}
                onChange={(e) => {
                  const val = e.target.value.replace(/(^\w|\s\w)/g, c => c.toUpperCase());
                  setFormData({ ...formData, name: val });
                }}
                className="!text-xs !py-1.5 !px-2.5 !h-9 !rounded-md"
                required
              />
              <div className="flex flex-col space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none h-9"
                >
                  <option value="Food Processor">Food Processor</option>
                  <option value="Contract Manufacturer">Contract Manufacturer</option>
                  <option value="Retail Brand">Retail Brand</option>
                  <option value="Fresh Fruits Supplier">Fresh Fruits Supplier</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <Input
                label="Sub-Category"
                id="vsubcategory"
                placeholder="e.g. Packaging, Raw Material"
                value={formData.subCategory}
                onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                className="!text-xs !py-1.5 !px-2.5 !h-9 !rounded-md"
              />
              <Input
                label="Primary Email"
                id="vemail"
                type="email"
                placeholder="vendor@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
                className="!text-xs !py-1.5 !px-2.5 !h-9 !rounded-md"
                required
              />
              <div className="flex flex-col space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none h-9"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Contact List */}
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Contacts Directory</h4>
            </div>
            <div className="p-4 bg-white space-y-4">
              <div className="space-y-3">
                {(formData.contacts || []).length === 0 && (
                  <div className="text-xs text-slate-400 italic py-2">No contacts added yet.</div>
                )}
                {(formData.contacts || []).map((contact, idx) => (
                  <div key={idx} className="flex items-end space-x-3 bg-slate-50 p-3 rounded-md border border-slate-200">
                    <div className="flex-1 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Role / Dept</label>
                      <select
                        value={contact.role}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], role: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5"
                      >
                        <option value="Primary">Primary</option>
                        <option value="Quality">Quality</option>
                        <option value="Accounts">Accounts</option>
                        <option value="Logistics">Logistics</option>
                        <option value="Sales">Sales</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="flex-1 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Name</label>
                      <input
                        type="text"
                        value={contact.name}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5"
                      />
                    </div>
                    <div className="flex-1 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Phone Number</label>
                      <input
                        type="text"
                        value={contact.phone}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], phone: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5 font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(formData.contacts || [])];
                        updated.splice(idx, 1);
                        setFormData({ ...formData, contacts: updated });
                      }}
                      className="text-red-500 hover:text-red-700 text-xs font-bold pb-1.5 px-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ 
                      ...formData, 
                      contacts: [...(formData.contacts || []), { role: 'Primary', name: '', phone: '' }] 
                    });
                  }}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1 mt-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Contact</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Location Details */}
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Address & Location</h4>
            </div>
            <div className="p-4 bg-white space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Address Line 1" id="vaddress1" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="!text-xs !h-9" />
                <Input label="Address Line 2" id="vaddress2" value={formData.address2} onChange={(e) => setFormData({ ...formData, address2: e.target.value })} className="!text-xs !h-9" />
              </div>
              
              <div className="grid grid-cols-4 gap-4">
                <Input 
                  label="Zip Code (PIN)" 
                  id="vzip" 
                  value={formData.zipCode} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, zipCode: val });
                    if (val.length === 6) {
                      handleZipCodeBlur(val);
                    }
                  }} 
                  onBlur={() => { if (formData.zipCode && formData.zipCode.length === 6) handleZipCodeBlur(formData.zipCode); }}
                  className="!text-xs !h-9 font-mono" 
                />
                <Input label="City" id="vcity" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="!text-xs !h-9" />
                <Input label="State" id="vstate" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="!text-xs !h-9" />
                <Input label="Country" id="vcountry" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="!text-xs !h-9" />
              </div>

              <div className="border-t border-slate-100 pt-3 mt-3">
                <div className="flex items-center space-x-2 mb-3">
                  <input
                    type="checkbox"
                    id="hasNoGst"
                    checked={formData.hasNoGst}
                    onChange={(e) => {
                      setFormData({ 
                        ...formData, 
                        hasNoGst: e.target.checked,
                        gstList: e.target.checked ? [] : [{ state: '', gstin: '' }]
                      });
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                  />
                  <label htmlFor="hasNoGst" className="text-[11px] font-semibold text-slate-700">No GSTIN (Composition/Unregistered)</label>
                </div>

                {!formData.hasNoGst && (
                  <div className="space-y-3">
                    {formData.gstList.map((gst, idx) => (
                      <div key={idx} className="flex items-end space-x-3 bg-slate-50 p-3 rounded-md border border-slate-200">
                        <div className="flex-1 flex flex-col space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
                          <select
                            value={gst.state}
                            onChange={(e) => {
                              const selectedState = e.target.value;
                              const foundCode = Object.keys(gstStateMap).find(code => gstStateMap[code] === selectedState);
                              const updatedList = [...formData.gstList];
                              let currentGstin = updatedList[idx].gstin;
                              if (foundCode) {
                                if (currentGstin.length >= 2) {
                                  currentGstin = foundCode + currentGstin.substring(2);
                                } else {
                                  currentGstin = foundCode;
                                }
                              }
                              updatedList[idx] = { state: selectedState, gstin: currentGstin };
                              setFormData({ ...formData, gstList: updatedList });
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5"
                          >
                            <option value="">Select State</option>
                            {Object.values(gstStateMap).map(st => (
                              <option key={st} value={st}>{st}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 flex flex-col space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">GSTIN Code</label>
                          <input
                            type="text"
                            placeholder="15-char GSTIN"
                            value={gst.gstin}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase().trim();
                              let detectedState = gst.state;
                              if (val.length >= 2) {
                                const prefix = val.substring(0, 2);
                                if (gstStateMap[prefix]) {
                                  detectedState = gstStateMap[prefix];
                                }
                              }
                              const updatedList = [...formData.gstList];
                              updatedList[idx] = { state: detectedState, gstin: val };
                              setFormData({ ...formData, gstList: updatedList });
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5 font-mono"
                          />
                        </div>
                        {formData.gstList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = formData.gstList.filter((_, i) => i !== idx);
                              setFormData({ ...formData, gstList: updated });
                            }}
                            className="text-red-500 hover:text-red-700 text-xs font-bold pb-1.5 px-2"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ 
                          ...formData, 
                          gstList: [...formData.gstList, { state: '', gstin: '' }] 
                        });
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1 mt-2"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Another GST Registration</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Certifications */}
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Certifications</h4>
            </div>
            <div className="p-4 bg-white grid grid-cols-2 gap-6">
              
              {/* FFSC2200 */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="vffsc2200"
                    checked={formData.ffsc2200}
                    onChange={(e) => setFormData({ ...formData, ffsc2200: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300"
                  />
                  <label htmlFor="vffsc2200" className="text-xs font-bold text-slate-800">FFSC2200 Certified</label>
                </div>
                {formData.ffsc2200 && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <Input label="Expiry Date" type="date" value={formData.ffsc2200Expiry} onChange={(e) => setFormData({ ...formData, ffsc2200Expiry: e.target.value })} className="!text-xs !h-8" />
                    <Input label="Quantity" type="number" value={formData.ffsc2200Qty} onChange={(e) => setFormData({ ...formData, ffsc2200Qty: e.target.value })} className="!text-xs !h-8" />
                  </div>
                )}
              </div>

              {/* FSSAI */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="vfssai"
                    checked={formData.fssai}
                    onChange={(e) => setFormData({ ...formData, fssai: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300"
                  />
                  <label htmlFor="vfssai" className="text-xs font-bold text-slate-800">FSSAI Certified</label>
                </div>
                {formData.fssai && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <Input label="Expiry Date" type="date" value={formData.fssaiExpiry} onChange={(e) => setFormData({ ...formData, fssaiExpiry: e.target.value })} className="!text-xs !h-8" />
                    <Input label="Quantity" type="number" value={formData.fssaiQty} onChange={(e) => setFormData({ ...formData, fssaiQty: e.target.value })} className="!text-xs !h-8" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Bank Details */}
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bank Details</h4>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4 bg-white">
              <Input label="Account Holder Name" value={formData.bankAccountHolder} onChange={(e) => setFormData({ ...formData, bankAccountHolder: e.target.value })} className="!text-xs !h-9" />
              <Input label="Account Number" type="text" value={formData.bankAccountNumber} onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })} className="!text-xs !h-9 font-mono" />
              <Input label="Bank Name" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="!text-xs !h-9" />
              <Input label="IFSC Code" value={formData.ifscCode} onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })} className="!text-xs !h-9 font-mono uppercase" />
            </div>
          </div>

          {draftMessage && (
            <div className="flex items-center space-x-1.5 text-[10px] text-emerald-600 font-bold bg-emerald-50 py-1.5 px-3 rounded-md shadow-sm border border-emerald-100">
              <Save className="h-3.5 w-3.5 shrink-0" />
              <span>{draftMessage}</span>
            </div>
          )}

          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-200 mt-4">
            <Button variant="outline" type="button" onClick={handleCloseModal}>Cancel</Button>
            <Button type="submit" isLoading={submitLoading} className="bg-blue-600 hover:bg-blue-700 shadow-sm px-6">
              {editingId ? 'Save Changes' : 'Register Vendor'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* View Details Modal */}
      <Drawer
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Vendor details"
      >
        {viewingVendor && (
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3.5">
              <Input
                label="Name"
                id="view_vname"
                value={viewingVendor.name}
                disabled
                className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed capitalize"
              />
              <Input
                label="Company Name"
                id="view_vcompany"
                value={viewingVendor.company}
                disabled
                className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <Input
                label="Email Address"
                id="view_vemail"
                value={viewingVendor.email}
                disabled
                className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <Input
                label="Phone Number"
                id="view_vphone"
                value={viewingVendor.phone}
                disabled
                className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <Input
                label="Address"
                id="view_vaddress"
                value={viewingVendor.address}
                disabled
                className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <Input
                label="Alternative Address"
                id="view_vaddress2"
                value={viewingVendor.address2 || '-'}
                disabled
                className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>

            {/* GST Registrations */}
            <div className="border-t border-slate-100 pt-2.5 mt-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">GST Registrations</h4>
              {viewingVendor.hasNoGst ? (
                <div className="text-xs text-slate-500 italic">Unregistered Vendor (No GSTIN)</div>
              ) : (
                <div className="space-y-1.5">
                  {(viewingVendor.gstList || []).map((gst, idx) => (
                    <div key={idx} className="flex justify-between bg-slate-50 p-1.5 rounded border border-slate-100 text-xs">
                      <span className="font-semibold text-slate-700">{gst.state}</span>
                      <span className="font-mono font-bold text-blue-600 uppercase">{gst.gstin}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sourcing Category and Status Fields grouped together */}
            <div className="grid grid-cols-2 gap-3.5 mt-2">
              <Input
                label="Category Type"
                id="view_vcat"
                value={viewingVendor.category}
                disabled
                className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Status</label>
                <div className="h-8.5 flex items-center">
                  <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                    viewingVendor.status === 'Active'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    {viewingVendor.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Sourcing Contact */}
            <div className="border-t border-slate-100 pt-2.5 mt-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Primary Contact Details</h4>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Contact Name"
                  id="view_vpcontact_name"
                  value={viewingVendor.primaryContactName || '-'}
                  disabled
                  className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed capitalize"
                />
                <Input
                  label="Contact Phone"
                  id="view_vpcontact_phone"
                  value={viewingVendor.primaryContactPhone || '-'}
                  disabled
                  className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <Input
                  label="Designation"
                  id="view_vpcontact_desig"
                  value={viewingVendor.primaryContactDesignation || '-'}
                  disabled
                  className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="mt-2">
                <TextArea
                  label="Notes"
                  id="view_vnotes"
                  value={viewingVendor.notes || 'No notes provided.'}
                  disabled
                  className="!text-xs !py-1.5 !px-2.5 !rounded-md bg-slate-50 text-slate-500 cursor-not-allowed !h-12"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end border-t border-slate-100 mt-4 space-x-2">
              <Button
                onClick={handlePrintPdf}
                size="sm"
                className="flex items-center space-x-1 border border-blue-200 text-blue-700 bg-blue-50/40 hover:bg-blue-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print PDF</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Revision History Modal */}
      <Dialog
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Revision Log & Audit Trail"
        className="!max-w-[450px] !w-[450px]"
      >
        {viewingVendorAudit && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Selected Vendor</div>
              <div className="text-sm font-semibold text-slate-900 mt-1 capitalize">{viewingVendorAudit.name}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">Company: {viewingVendorAudit.company} | Category: {viewingVendorAudit.category}</div>
            </div>

            <div className="relative pl-6 border-l border-slate-200 space-y-4 text-xs ml-2">
              <div className="relative">
                <div className="absolute -left-[30px] top-1 bg-blue-600 rounded-full h-2 w-2 border border-white ring-4 ring-blue-50" />
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                  <span>10-Jul-2026 10:30 AM</span>
                  <span className="font-semibold text-slate-700">Admin</span>
                </div>
                <p className="font-bold text-slate-800 mt-0.5">Status set to {viewingVendorAudit.status}</p>
                <p className="text-slate-500 mt-0.5 text-[11px]">System action triggered via status toggle interface.</p>
              </div>

              <div className="relative">
                <div className="absolute -left-[30px] top-1 bg-slate-400 rounded-full h-2 w-2 border border-white ring-4 ring-slate-50" />
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                  <span>08-Jul-2026 02:40 PM</span>
                  <span className="font-semibold text-slate-700">Procurement Lead</span>
                </div>
                <p className="font-bold text-slate-800 mt-0.5">Vendor Information Updated</p>
                <p className="text-slate-500 mt-0.5 text-[11px]">GST details verified against national tax database.</p>
              </div>

              <div className="relative">
                <div className="absolute -left-[30px] top-1 bg-slate-400 rounded-full h-2 w-2 border border-white ring-4 ring-slate-50" />
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                  <span>05-Jul-2026 09:15 AM</span>
                  <span className="font-semibold text-slate-700">System Agent</span>
                </div>
                <p className="font-bold text-slate-800 mt-0.5">Vendor Profile Registered</p>
                <p className="text-slate-500 mt-0.5 text-[11px]">Profile created and designated sourcing category set to {viewingVendorAudit.category}.</p>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end border-t border-slate-100 mt-4">
              <Button variant="outline" size="sm" onClick={() => setIsAuditModalOpen(false)}>Close Log</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default Masters;
