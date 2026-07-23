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
}

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
}

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
}


const MaterialsTab = () => {
  const [deletedMaterialsHistory, setDeletedMaterialsHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('erp_deleted_materials_history');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const handleRestoreMaterial = async (item) => {
    // Conflict Check
    const hasConflict = materials.some(m => (m.code || '').toUpperCase().trim() === (item.code || '').toUpperCase().trim());
    if (hasConflict) {
      alert(`Restoration Conflict Validation: The Material Code "${item.code}" is already used by an active material. Restoral aborted.`);
      showToast(`Conflict Check Failed: Material Code ${item.code} already exists in active grid.`, "error");
      return;
    }

    try {
      const payload = { ...item };
      delete payload._id;
      delete payload.deletedAt;
      delete payload.deletionType;
      await api.post('/api/materials', payload);
      setDeletedMaterialsHistory((prev) => {
        const updated = prev.filter(d => (d._id && d._id !== item._id) || d.code !== item.code || d.name !== item.name);
        localStorage.setItem('erp_deleted_materials_history', JSON.stringify(updated));
        return updated;
      });
      showToast(`Success Notification: Material ${item.code || item.name || ''} restored successfully!`, "success");
      fetchMaterials();
    } catch (err) {
      console.error(err);
      showToast("Failed to restore material record.", "error");
    }
  };
  const [isDeletedMaterialsModalOpen, setIsDeletedMaterialsModalOpen] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [searchInputVal, setSearchInputVal] = useState('');
  const [materialBlockingPopupMessage, setMaterialBlockingPopupMessage] = useState('');
  const [isEditingDeletedRecord, setIsEditingDeletedRecord] = useState(false);

  const handleSearchChange = (val) => {
    setSearchInputVal(val);
    if (val === '' || val.length >= 3) {
      setSearch(val);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setSearch(searchInputVal);
    }
  };
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
    const formattedMsg = message.startsWith('Success') || message.startsWith('Failed') || message.startsWith('Update') || message.startsWith('Notice')
      ? message
      : `${type === 'success' ? 'Success Notification' : 'System Notice'}: ${message}`;
    setToasts(prev => [...prev, { id, message: formattedMsg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
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
            window.print();
            setTimeout(function() { window.close(); }, 500);
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

        // Duplication check against active and deleted items
        const activeCodes = new Set(materials.map(m => (m.code || '').toUpperCase().trim()));
        const deletedCodes = new Set(deletedMaterialsHistory.map(d => (d.code || '').toUpperCase().trim()));
        let foundConflict = false;
        for (const row of rawRowsMapped) {
          const rowCode = (row.code || '').toUpperCase().trim();
          if (rowCode && (activeCodes.has(rowCode) || deletedCodes.has(rowCode))) {
            foundConflict = true;
            break;
          }
        }
        if (foundConflict) {
          setMaterialBlockingPopupMessage("This file data already is in database which is presented in deleted rows & sheets status.");
          setImportSummary(null);
          setEditableAcceptedItems([]);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const systemExistingCodes = materials.map(m => m.code.toUpperCase().trim());
        const { processedItems, summary } = recalculateImportSummary(deduplicatedRows, systemExistingCodes, isAutoEntry, baseSequence);

        if (!isAutoEntry && summary.existingMatchCount === 0 && summary.acceptedCount > 0) {
          showToast("System Notice: Bulk update will not work when all materials are new. Please add materials through Bulk Entry or Manual Entry", "error");
          setIsImportModalOpen(false);
          setImportSummary(null);
          return;
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

    // Duplication Check against Active and Deleted Tables
    const activeCodes = new Set(materials.map(m => (m.code || '').toUpperCase().trim()));
    const deletedCodes = new Set(deletedMaterialsHistory.map(d => (d.code || '').toUpperCase().trim()));
    const duplicates = validToImport.filter(item => {
      const code = (item.code || '').toUpperCase().trim();
      return code && (activeCodes.has(code) || deletedCodes.has(code));
    });
    if (duplicates.length > 0) {
      alert("This file data already is in database which is presented in deleted rows & sheets status.");
      showToast("Ingestion aborted: Duplicate data detected.", "error");
      return;
    }

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
    setIsEditingDeletedRecord(!!mat.isDeletedHistoryItem);
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
    setIsEditingDeletedRecord(false);
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

    const existsInActive = materials.some(m => m._id !== activeId && m.code.toUpperCase() === finalCode);
    const existsInDeleted = deletedMaterialsHistory.some(d => d._id !== activeId && d.code.toUpperCase() === finalCode);
    if (existsInActive || existsInDeleted) {
      alert("This file data already is in database which is presented in deleted rows & sheets status.");
      errors.code = `Material Code '${finalCode}' is already in use (active or deleted).`;
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

      if (isEditingDeletedRecord) {
        setDeletedMaterialsHistory(prev => {
          const updated = prev.map(d => d._id === editingId ? { ...d, ...formattedData } : d);
          localStorage.setItem('erp_deleted_materials_history', JSON.stringify(updated));
          return updated;
        });
        showToast("Deleted material record updated locally.", "success");
        setIsModalOpen(false);
        setEditingId(null);
        setIsEditingDeletedRecord(false);
        setSubmitLoading(false);
        return;
      }

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
    const target = materials.find(m => m._id === id);
    if (!window.confirm('Delete this material definition? This checks Bill of Materials (BOM) references.')) return;
    try {
      await api.delete(`/api/materials/${id}`);
      if (target) {
        setDeletedMaterialsHistory(prev => {
          const updated = [{ ...target, deletionType: 'Deleted Row', deletedAt: new Date().toISOString() }, ...prev];
          localStorage.setItem('erp_deleted_materials_history', JSON.stringify(updated));
          return updated;
        });
      }
      if (selectedMaterialId === id) {
        setSelectedMaterialId(null);
      }
      fetchMaterials();
      showToast(`Material ${target ? target.code : ''} moved to Deleted Sheets & Rows History.`);
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'Validation error: Active stock or BOM dependencies prevent deleting this material.';
      alert(`Relational Integrity Check: ${errorMsg}`);
    }
  };

  const handleRestoreSelectedMaterials = async () => {
    const ids = Array.from(selectedRowIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Restore ${ids.length} selected material(s)?`)) return;
    let restored = 0, failed = 0;
    const restoredMaterialIds = [];
    for (const id of ids) {
      const item = deletedMaterialsHistory.find(m => m._id === id);
      if (item) {
        // Conflict Check
        const hasConflict = materials.some(m => (m.code || '').toUpperCase().trim() === (item.code || '').toUpperCase().trim());
        if (hasConflict) {
          alert(`Restoration Conflict Validation: The Material Code "${item.code}" is already used by an active material. Skipping restoral for this record.`);
          failed++;
          continue;
        }

        try {
          const payload = { ...item };
          delete payload._id;
          delete payload.deletedAt;
          delete payload.deletionType;
          delete payload.isDeletedHistoryItem;
          await api.post('/api/materials', payload);
          restored++;
          restoredMaterialIds.push(id);
        } catch (e) {
          console.error(e);
          failed++;
        }
      }
    }
    if (restoredMaterialIds.length > 0) {
      setDeletedMaterialsHistory(prev => {
        const updated = prev.filter(d => !restoredMaterialIds.includes(d._id));
        localStorage.setItem('erp_deleted_materials_history', JSON.stringify(updated));
        return updated;
      });
    }
    showToast(`Success Notification: ${restored} material(s) restored successfully!`, "success");
    setSelectedRowIds(new Set());
    fetchMaterials();
  };

  const handleDeleteSelectedMaterials = async () => {
    const ids = Array.from(selectedRowIds);
    if (ids.length === 0) {
      showToast('Select at least one material to delete.', 'error');
      return;
    }

    if (!window.confirm(`Delete ${ids.length} selected material(s)? This will update MongoDB, BOM, production, quality, purchase, inventory, and related records.`)) return;

    try {
      const deletedItems = [];
      ids.forEach(id => {
        const target = materials.find(m => m._id === id);
        if (target) {
          deletedItems.push({ ...target, deletionType: 'Deleted Row', deletedAt: new Date().toISOString() });
        }
      });
      const res = await api.post('/api/materials/batch-delete', { ids });
      if (deletedItems.length > 0) {
        setDeletedMaterialsHistory(prev => {
          const updated = [...deletedItems, ...prev];
          localStorage.setItem('erp_deleted_materials_history', JSON.stringify(updated));
          return updated;
        });
      }
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

  const filteredMaterials = (() => {
    let list = materials;
    if (typeFilter === 'Deleted') {
      list = deletedMaterialsHistory.map(d => ({ ...d, type: 'Deleted', isDeletedHistoryItem: true }));
    }
    return list.filter(mat => {
      // 1. Search Query Filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const nameMatch = (mat.name || '').toLowerCase().includes(q);
        const codeMatch = (mat.code || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch) return false;
      }

      // 2. Category Type Filter
      if (typeFilter && typeFilter !== 'Deleted' && mat.type !== typeFilter) {
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
  })();

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
                value={searchInputVal}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full px-2 py-0.5 h-7 pr-7 border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
              />
              {search && (
                <button
                  onClick={() => { setSearchInputVal(''); setSearch(''); }}
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
              <option value="">All Status</option>
              <option value="Raw Material">Raw Materials</option>
              <option value="Finished Goods">Finished Goods</option>
              <option value="Packing Material">Packing Materials</option>
              <option value="Deleted">Deleted Sheets & Rows ({deletedMaterialsHistory.length})</option>
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

            {(isSelectionMode || typeFilter === "Deleted") && (
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

            {selectedRowIds.size > 0 && typeFilter === 'Deleted' && (
              <button
                onClick={handleRestoreSelectedMaterials}
                className="h-7 px-3 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 text-xs font-semibold flex items-center gap-1.5 transition-colors animate-pulse"
                title="Restore selected materials to active grid"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Restore Selected ({selectedRowIds.size})</span>
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
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowFunctionList(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1 text-left">
                    <button onClick={() => { setShowFunctionList(false); handleOpenAddModal(); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium">
                      <Plus className="h-3.5 w-3.5 text-blue-600" /><span>Manual Entry</span>
                    </button>
                    <button onClick={() => { setShowFunctionList(false); setImportSummary(null); setIsAutoEntry(true); setIsImportModalOpen(true); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /><span>Bulk Entry</span>
                    </button>
                    <button onClick={() => { setShowFunctionList(false); setImportSummary(null); setIsAutoEntry(false); setIsImportModalOpen(true); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium">
                      <RefreshCw className="h-3.5 w-3.5 text-amber-600" /><span>Bulk Update</span>
                    </button>
                    <button onClick={() => { setShowFunctionList(false); handleExportData(); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium border-t border-slate-100">
                      <Download className="h-3.5 w-3.5 text-purple-600" /><span>Export Grid to Excel</span>
                    </button>

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
                onClear: () => { setSearchInputVal(''); setSearch(''); }
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
          ) : (typeFilter === 'Deleted' ? deletedMaterialsHistory.length === 0 : materials.length === 0) ? (
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
                        {(isSelectionMode || typeFilter === "Deleted") && (
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
                        {(isSelectionMode || typeFilter === "Deleted") && (
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
                        {mat.isDeletedHistoryItem ? (
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenEditModal(mat); }}
                              className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit Deleted Material details locally"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
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
                                  <div 
                                    className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => {
                                        setViewingMaterialAudit(mat);
                                        setIsAuditModalOpen(true);
                                        setOpenDropdownId(null);
                                      }}
                                      className="w-full px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-1.5 text-left font-medium text-xs text-slate-700"
                                    >
                                      <span>Revision History</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>      {/* CRUD Form Modal — Expanded Big Screen */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit Material Details' : 'Register New Material'}
        className="!max-w-[75vw] !w-[75vw] !rounded-2xl p-6 shadow-2xl border border-slate-200"
      >
        <form onSubmit={handleFormSubmit} className="space-y-5">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 font-bold">
              {formErrors.form}
            </div>
          )}

          {/* Banner Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 text-white rounded-lg font-mono font-extrabold text-sm shadow-sm">
                {formData.code || 'M-AUTO'}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Material Registration Portal</span>
                <span className="text-[11px] text-slate-500 block">Enter comprehensive specifications for this material item.</span>
              </div>
            </div>
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs font-bold px-3 py-1">
              {formData.type || 'Raw Material'}
            </Badge>
          </div>

          {/* Row 1: Code (1 col) & Name (2 cols) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col space-y-1">
              <label className="text-xs font-bold text-slate-700">Material Code *</label>
              <input
                type="text"
                placeholder="e.g. M1001"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-600 cursor-not-allowed h-9"
                required
                disabled={true}
              />
              {formErrors.code && <span className="text-xs text-red-500 font-semibold">{formErrors.code}</span>}
            </div>

            <div className="md:col-span-2">
              <Input
                label="Material Name *"
                id="name"
                placeholder="e.g. Raw Cumin Powder (Grade A)"
                value={formData.name}
                onChange={(e) => {
                  const val = e.target.value.replace(/(^\w|\s\w)/g, c => c.toUpperCase());
                  setFormData({ ...formData, name: val });
                }}
                error={formErrors.name}
                required
                className="w-full !h-9 !text-xs !px-3 !py-1.5 !rounded-lg font-semibold text-slate-800"
              />
            </div>
          </div>

          {/* Row 2: Unit, Category, Sub-Category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Unit of Measure *"
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
              className="w-full !h-9 !text-xs !px-3 !py-1.5 !rounded-lg"
            />

            <Select
              label="Category *"
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
              className="w-full !h-9 !text-xs !px-3 !py-1.5 !rounded-lg"
            />

            <div className="flex flex-col space-y-1">
              <label className="text-xs font-bold text-slate-700">Sub-Category *</label>
              <select
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer h-9"
                required
              >
                {(subcategoryMap[formData.type] || []).map(sub => (
                  <option key={sub.value} value={sub.value}>{sub.label}</option>
                ))}
              </select>
              {formErrors.subcategory && <span className="text-xs text-red-500 font-semibold">{formErrors.subcategory}</span>}
            </div>
          </div>

          {/* Row 3: Status & Description */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Material Status *</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer h-9"
                required
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Draft">Draft</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <TextArea
                label="Material Description & Storage Notes"
                id="description"
                placeholder="Specify operational usage, storage temperature, or quality specifications..."
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full !text-xs !px-3 !py-2 !rounded-lg"
              />
            </div>
          </div>

          {draftMessage && (
            <div className="flex items-center space-x-2 text-xs text-blue-600 font-bold bg-blue-50 py-2 px-3 rounded-xl border border-blue-100">
              <Save className="h-4 w-4 shrink-0" />
              <span>{draftMessage}</span>
            </div>
          )}

          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100 mt-4">
            <Button variant="outline" size="sm" onClick={handleCloseModal} className="!px-4 !py-2 text-xs font-bold">
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={submitLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold !px-6 !py-2 text-xs shadow-md">
              {editingId ? 'Save Material Changes' : '✓ Register Material'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Deleted Materials Sheets & Rows History Modal */}
      <Dialog
        isOpen={isDeletedMaterialsModalOpen}
        onClose={() => setIsDeletedMaterialsModalOpen(false)}
        title="Deleted Rows & Removed Material Sheets History"
        className="!max-w-[65vw] !w-[65vw] !rounded-xl"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-red-800 font-semibold flex items-center justify-between">
            <div>
              <span className="font-bold block text-sm">Removed Material Rows & Sheets Log</span>
              <span className="text-[11px] text-red-600 block">List of deleted material rows and removed sheets. Click Restore to return any record back to your active data grid.</span>
            </div>
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs font-bold">
              {deletedMaterialsHistory.length} Removed Items
            </Badge>
          </div>

          {deletedMaterialsHistory.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-1">
              <Trash2 className="h-8 w-8 mx-auto text-slate-300" />
              <span className="font-bold text-xs block text-slate-500">No deleted rows or sheets in history</span>
              <span className="text-[11px] text-slate-400 block">When you delete material rows or remove sheets, they will appear here for easy restoration.</span>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {deletedMaterialsHistory.map((item, idx) => (
                <div key={idx} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-bold text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">{item.code || 'MAT'}</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800 text-xs capitalize">{item.name}</span>
                        <Badge className={item.deletionType === 'Deleted Sheet' ? 'bg-red-100 text-red-700 border-red-200 text-[9px]' : 'bg-amber-100 text-amber-700 border-amber-200 text-[9px]'}>
                          {item.deletionType || 'Deleted Row'}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-slate-500 block">{item.type} • {item.subcategory} • Unit: {item.unit}</span>
                      <span className="text-[10px] text-slate-400 block">Deleted at: {new Date(item.deletedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleRestoreMaterial(item)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Restore Record</span>
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 flex justify-end border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setIsDeletedMaterialsModalOpen(false)}>
              Close History Log
            </Button>
          </div>
        </div>
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
                                            // Duplication check against active and deleted items
        const activeCodes = new Set(materials.map(m => (m.code || '').toUpperCase().trim()));
        const deletedCodes = new Set(deletedMaterialsHistory.map(d => (d.code || '').toUpperCase().trim()));
        let foundConflict = false;
        for (const row of rawRowsMapped) {
          const rowCode = (row.code || '').toUpperCase().trim();
          if (rowCode && (activeCodes.has(rowCode) || deletedCodes.has(rowCode))) {
            foundConflict = true;
            break;
          }
        }
        if (foundConflict) {
          setMaterialBlockingPopupMessage("This file data already is in database which is presented in deleted rows & sheets status.");
          setImportSummary(null);
          setEditableAcceptedItems([]);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

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
      
      {/* Blocking Popup for Bulk Upload Conflicts */}
      {materialBlockingPopupMessage && (
        <Dialog
          isOpen={true}
          onClose={() => setMaterialBlockingPopupMessage('')}
          title="Ingestion Blocked — Duplication Detected"
          className="!max-w-[420px] !w-[420px] !rounded-xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 font-semibold flex items-start space-x-2">
              <span className="text-sm shrink-0 mt-0.5">⚠️</span>
              <span>{materialBlockingPopupMessage}</span>
            </div>
            <div className="flex justify-end pt-2 border-t">
              <Button size="sm" className="bg-slate-700 hover:bg-slate-800 text-white font-bold" onClick={() => setMaterialBlockingPopupMessage('')}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}
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
  const vendorFileInputRef = useRef(null);

  // Consolidated States at Top of VendorsTab
  const [vendors, setVendors] = useState([]);
  const [searchInputVal, setSearchInputVal] = useState('');
  const [vendorBlockingPopupMessage, setVendorBlockingPopupMessage] = useState('');
  const [isEditingDeletedRecord, setIsEditingDeletedRecord] = useState(false);

  const handleSearchChange = (val) => {
    setSearchInputVal(val);
    if (val === '' || val.length >= 3) {
      setSearch(val);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setSearch(searchInputVal);
    }
  };
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);

  const [viewingVendor, setViewingVendor] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  const [isVendorImportModalOpen, setIsVendorImportModalOpen] = useState(false);
  const [isVendorAutoEntry, setIsVendorAutoEntry] = useState(false);
  const [vendorImportSummary, setVendorImportSummary] = useState(null);
  const [vendorImportSearch, setVendorImportSearch] = useState('');
  const [vendorBulkUpdateTab, setVendorBulkUpdateTab] = useState('new');
  const [editableVendorItems, setEditableVendorItems] = useState([]);
  const [vendorConfirmedReplacements, setVendorConfirmedReplacements] = useState(new Set());
  const [vendorQueueSearchTerm, setVendorQueueSearchTerm] = useState('');
  const [vendorSkippedItems, setVendorSkippedItems] = useState(new Set());
  const [vendorCurrentFileName, setVendorCurrentFileName] = useState('');
  const [activeVendorQueueIdx, setActiveVendorQueueIdx] = useState(0);
  const [confirmActionType, setConfirmActionType] = useState(null);

  const validateQueueItem = (item) => {
    const missing = [];
    if (!item.name || !item.name.trim()) missing.push("Vendor Name");
    if (!item.email || !item.email.trim()) missing.push("Primary Email");
    if (!item.category || !item.category.trim()) missing.push("Category");
    return missing;
  };

  const handleQueueFieldChange = (field, val) => {
    setEditableVendorItems(prev => {
      const next = [...prev];
      next[activeVendorQueueIdx] = { ...next[activeVendorQueueIdx], [field]: val };
      return next;
    });
  };

  const handleAcceptQueueItem = (idx) => {
    const item = editableVendorItems[idx];
    if (!item) return;

    // Required fields validation check
    const missing = validateQueueItem(item);
    if (missing.length > 0) {
      alert(`Validation Notice: The following required fields are missing in this record: ${missing.join(', ')}. Please fill them before accepting.`);
      showToast(`Required fields missing: ${missing.join(', ')}`, 'error');
      return;
    }

    setEditableVendorItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], userAction: 'accept' };
      return next;
    });
    setVendorConfirmedReplacements(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setVendorSkippedItems(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });

    showToast(`Vendor ${item.name || item.vendorId || ''} accepted and queued for update.`, 'success');

    // Find the next pending index
    const nextPendingIdx = editableVendorItems.findIndex((x, i) => i > idx && !vendorConfirmedReplacements.has(i) && !vendorSkippedItems.has(i) && x.userAction !== 'accept' && x.userAction !== 'skip');
    if (nextPendingIdx !== -1) {
      setActiveVendorQueueIdx(nextPendingIdx);
    } else {
      const firstPendingIdx = editableVendorItems.findIndex((x, i) => !vendorConfirmedReplacements.has(i) && !vendorSkippedItems.has(i) && x.userAction !== 'accept' && x.userAction !== 'skip');
      if (firstPendingIdx !== -1) {
        setActiveVendorQueueIdx(firstPendingIdx);
      }
    }
  };

  const handleSkipQueueItem = (idx) => {
    const item = editableVendorItems[idx];
    if (!item) return;

    setEditableVendorItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], userAction: 'skip' };
      return next;
    });
    setVendorSkippedItems(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setVendorConfirmedReplacements(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });

    showToast(`Vendor ${item.name || item.vendorId || ''} skipped.`, 'warning');

    // Find the next pending index
    const nextPendingIdx = editableVendorItems.findIndex((x, i) => i > idx && !vendorConfirmedReplacements.has(i) && !vendorSkippedItems.has(i) && x.userAction !== 'accept' && x.userAction !== 'skip');
    if (nextPendingIdx !== -1) {
      setActiveVendorQueueIdx(nextPendingIdx);
    } else {
      const firstPendingIdx = editableVendorItems.findIndex((x, i) => !vendorConfirmedReplacements.has(i) && !vendorSkippedItems.has(i) && x.userAction !== 'accept' && x.userAction !== 'skip');
      if (firstPendingIdx !== -1) {
        setActiveVendorQueueIdx(firstPendingIdx);
      }
    }
  };

  const handleConfirmAcceptAll = () => {
    // Process all pending rows
    const updatedItems = editableVendorItems.map((item, idx) => {
      if (!vendorConfirmedReplacements.has(idx) && !vendorSkippedItems.has(idx) && item.userAction !== 'accept' && item.userAction !== 'skip') {
        return { ...item, userAction: 'accept' };
      }
      return item;
    });

    setEditableVendorItems(updatedItems);
    setVendorConfirmedReplacements(prev => {
      const next = new Set(prev);
      updatedItems.forEach((_, idx) => {
        if (!vendorSkippedItems.has(idx)) {
          next.add(idx);
        }
      });
      return next;
    });

    setConfirmActionType(null);
    showToast("All remaining pending vendors marked as Accepted in the queue. Please click Save & Import to proceed.", "success");
  };

  const handleConfirmSkipAll = () => {
    setConfirmActionType(null);
    setVendorImportSummary(null);
    setEditableVendorItems([]);
    setVendorConfirmedReplacements(new Set());
    setVendorSkippedItems(new Set());
    showToast("Bulk entry cancelled. All remaining records skipped.", 'warning');
    setIsVendorImportModalOpen(false);
  };
  const [editingVendorPreviewIdx, setEditingVendorPreviewIdx] = useState(null);
  const [vendorPreviewFormData, setVendorPreviewFormData] = useState({});
  const [vendorPreviewRowData, setVendorPreviewRowData] = useState({});

  const [isVendorSelectionMode, setIsVendorSelectionMode] = useState(false);
  const [selectedVendorRowIds, setSelectedVendorRowIds] = useState(new Set());
  const [vendorBatchEditItems, setVendorBatchEditItems] = useState([]);
  const [vendorBatchEditIdx, setVendorBatchEditIdx] = useState(0);
  const [isVendorBatchEditModalOpen, setIsVendorBatchEditModalOpen] = useState(false);

  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [viewingVendorAudit, setViewingVendorAudit] = useState(null);
  const [deletedVendorsHistory, setDeletedVendorsHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('erp_deleted_vendors_history');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const handleRestoreVendor = async (item) => {
    // Conflict Check
    const hasConflict = vendors.some(v => (v.vendorId || '').toUpperCase().trim() === (item.vendorId || '').toUpperCase().trim());
    if (hasConflict) {
      alert(`Restoration Conflict Validation: The Vendor Code "${item.vendorId}" is already used by an active vendor. Restoral aborted.`);
      showToast(`Conflict Check Failed: Vendor Code ${item.vendorId} already exists in active grid.`, "error");
      return;
    }

    try {
      const payload = { ...item };
      delete payload._id;
      delete payload.deletedAt;
      delete payload.deletionType;
      const res = await api.post('/api/vendors', payload);
      setDeletedVendorsHistory((prev) => {
        const updated = prev.filter(d => (d._id && d._id !== item._id) || d.vendorId !== item.vendorId || d.name !== item.name);
        localStorage.setItem('erp_deleted_vendors_history', JSON.stringify(updated));
        return updated;
      });
      showToast(`Success Notification: Vendor ${item.vendorId || item.name || ''} restored successfully!`, "success");
      await fetchVendors();
    } catch (err) {
      console.error(err);
      showToast("Failed to restore vendor record.", "error");
    }
  };
  const [isDeletedVendorsModalOpen, setIsDeletedVendorsModalOpen] = useState(false);
  const [showVendorFunctionList, setShowVendorFunctionList] = useState(false);

  const [activeFilterCol, setActiveFilterCol] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [tempFilters, setTempFilters] = useState({});
  const [filterSearchText, setFilterSearchText] = useState({});

  const [drafts, setDrafts] = useState([]);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [showDraftsList, setShowDraftsList] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [vendorToasts, setVendorToasts] = useState([]);

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
        limit: 1000,
        ...(search && { search }),
        ...(category && { category }),
        ...(status && { status })
      };
      const res = await api.get('/api/vendors', { params });
      if (res.data && res.data.success) {
        const sorted = [...res.data.data].sort((a, b) => {
          const numA = parseInt((a.vendorId || '').replace(/\D/g, '') || '0', 10);
          const numB = parseInt((b.vendorId || '').replace(/\D/g, '') || '0', 10);
          return numB - numA;
        });
        setVendors(sorted);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch vendors.');
    } finally {
      setLoading(false);
    }
  };

  // Reset wizard on modal close
  React.useEffect(() => {
    if (!isVendorImportModalOpen) {
      setVendorImportSearch('');
      setVendorImportSummary(null);
      setEditableVendorItems([]);
      setVendorConfirmedReplacements(new Set());
      setVendorSkippedItems(new Set());
      setActiveVendorQueueIdx(0);
      setConfirmActionType(null);
    }
  }, [isVendorImportModalOpen]);

  // Bulk Edit selected rows
  const handleVendorBatchEdit = () => {
    const itemsToEdit = vendors.filter(v => selectedVendorRowIds.has(v._id));
    if (itemsToEdit.length > 0) {
      setVendorBatchEditItems(itemsToEdit.map(i => ({...i})));
      setVendorBatchEditIdx(0);
      setIsVendorBatchEditModalOpen(true);
    }
  };

  const handleVendorRowSelect = (id) => {
    const newSet = new Set(selectedVendorRowIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedVendorRowIds(newSet);
  };

  const handleRestoreSelectedVendors = async () => {
    if (selectedVendorRowIds.size === 0) return;
    if (!window.confirm(`Restore ${selectedVendorRowIds.size} selected vendor(s)?`)) return;
    let restored = 0, failed = 0;
    const restoredVendorIds = [];
    for (const id of selectedVendorRowIds) {
      const item = deletedVendorsHistory.find(v => v._id === id);
      if (item) {
        // Conflict Check
        const hasConflict = vendors.some(v => (v.vendorId || '').toUpperCase().trim() === (item.vendorId || '').toUpperCase().trim());
        if (hasConflict) {
          alert(`Restoration Conflict Validation: The Vendor Code "${item.vendorId}" is already used by an active vendor. Skipping restoral for this record.`);
          failed++;
          continue;
        }

        try {
          const payload = { ...item };
          delete payload._id;
          delete payload.deletedAt;
          delete payload.deletionType;
          await api.post('/api/vendors', payload);
          restored++;
          restoredVendorIds.push(id);
        } catch (e) {
          console.error(e);
          failed++;
        }
      }
    }
    if (restoredVendorIds.length > 0) {
      setDeletedVendorsHistory(prev => {
        const updated = prev.filter(d => !restoredVendorIds.includes(d._id));
        localStorage.setItem('erp_deleted_vendors_history', JSON.stringify(updated));
        return updated;
      });
    }
    showToast(`Success Notification: ${restored} vendor(s) restored successfully!`, "success");
    setSelectedVendorRowIds(new Set());
    fetchVendors();
  };

  // Delete selected vendors
  const handleDeleteSelectedVendors = async () => {
    if (selectedVendorRowIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedVendorRowIds.size} selected vendor(s)?`)) return;
    let deleted = 0, failed = 0;
    const deletedItems = [];
    for (const id of selectedVendorRowIds) {
      const target = vendors.find(v => v._id === id);
      try {
        await api.delete(`/api/vendors/${id}`);
        deleted++;
        if (target) {
          deletedItems.push({ ...target, deletionType: 'Deleted Row', deletedAt: new Date().toISOString() });
        }
      } catch (e) {
        console.error(e);
        failed++;
      }
    }
    if (deletedItems.length > 0) {
      setDeletedVendorsHistory(prev => {
        const updated = [...deletedItems, ...prev];
        localStorage.setItem('erp_deleted_vendors_history', JSON.stringify(updated));
        return updated;
      });
    }
    showToast(`${deleted} vendor(s) deleted${failed > 0 ? `, ${failed} failed` : ''}`, deleted > 0 ? 'success' : 'error');
    setSelectedVendorRowIds(new Set());
    fetchVendors();
  };

  // Helper: case-insensitive column key lookup
  const getVendorRowVal = (row, keys) => {
    for (const rowKey in row) {
      const nk = rowKey.trim().toLowerCase().replace(/[\s_-]/g, '');
      for (const key of keys) {
        if (nk === key.toLowerCase().replace(/[\s_-]/g, '')) return row[rowKey];
      }
    }
    return null;
  };

  // Validate and classify a vendor row from Excel
  const getNextVendorAutoCounter = (baseSequence = null) => {
    if (baseSequence) return baseSequence;
    let maxCounter = 1000;
    vendors.forEach(v => {
      if (v.vendorId) {
        const match = v.vendorId.toString().match(/\d+/);
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

  const validateVendorRow = (item, isAutoEntryVal, systemExistingCodes, importedCodesInBatch, autoCounterRef, fullVendorsList) => {
    const errors = [];
    const warnings = [];
    const name = (item.name || '').toString().trim();
    const company = (item.company || name || '').toString().trim();
    const email = (item.email || '').toString().trim().toLowerCase();
    const phone = (item.phone || '').toString().trim();
    const category = (item.category || 'Food Processor').toString().trim();
    const subCategory = (item.subCategory || '').toString().trim();
    const status = (item.status || 'Active').toString().trim();
    const address = (item.address || '').toString().trim();
    const city = (item.city || '').toString().trim();
    const state = (item.state || '').toString().trim();
    const country = (item.country || 'India').toString().trim();
    const zipCode = (item.zipCode || '').toString().trim();
    const gstin = (item.gstin || '').toString().trim().toUpperCase();
    const notes = (item.notes || '').toString().trim();

    if (!name) errors.push("Vendor Name is missing.");
    if (!email) {
      errors.push("Email is missing.");
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.push(`Invalid email address format: '${email}'`);
    }

    let finalVendorId = '';
    let isUpdatingExisting = false;
    let fieldChanges = [];
    let matchedVendorId = null;

    if (isAutoEntryVal) {
      // Match by Email, Phone, or Name
      const existingVendor = (fullVendorsList || []).find(v =>
        (email && v.email && v.email.toLowerCase() === email) ||
        (phone && v.phone && v.phone.trim() === phone) ||
        (name && v.name && v.name.toLowerCase() === name.toLowerCase())
      );

      if (existingVendor) {
        finalVendorId = existingVendor.vendorId ? existingVendor.vendorId.toUpperCase() : '';
        isUpdatingExisting = true;
        matchedVendorId = existingVendor._id;
        warnings.push(`'${name}' (${email}) matches an existing vendor in the database (Code: ${existingVendor.vendorId}). Choose Replace or Skip.`);
      } else {
        let nextVal = autoCounterRef.val;
        finalVendorId = `V${nextVal}`;
        autoCounterRef.val++;
        while (systemExistingCodes.includes(finalVendorId) || importedCodesInBatch.has(finalVendorId)) {
          nextVal = autoCounterRef.val;
          finalVendorId = `V${nextVal}`;
          autoCounterRef.val++;
        }
      }
    } else {
      // Bulk Update Mode: Match by Code, Email, or Phone
      const excelCode = (item.vendorId || '').toString().trim().toUpperCase();
      let existingVendor = null;

      if (excelCode) {
        const isPureNum = /^\d+$/.test(excelCode);
        finalVendorId = isPureNum ? `V${excelCode}` : excelCode;
        existingVendor = (fullVendorsList || []).find(v => (v.vendorId || '').toUpperCase().trim() === finalVendorId);
      }
      if (!existingVendor && email) {
        existingVendor = (fullVendorsList || []).find(v => (v.email || '').toLowerCase().trim() === email);
      }
      if (!existingVendor && phone) {
        existingVendor = (fullVendorsList || []).find(v => (v.phone || '').trim() === phone);
      }

      if (existingVendor) {
        isUpdatingExisting = true;
        matchedVendorId = existingVendor._id;
        finalVendorId = existingVendor.vendorId || finalVendorId;

        const fieldDefs = [
          { label: 'Vendor Name', oldVal: existingVendor.name || '', newVal: name },
          { label: 'Company', oldVal: existingVendor.company || '', newVal: company },
          { label: 'Email', oldVal: existingVendor.email || '', newVal: email },
          { label: 'Phone', oldVal: existingVendor.phone || '', newVal: phone },
          { label: 'Category', oldVal: existingVendor.category || '', newVal: category },
          { label: 'Sub-Category', oldVal: existingVendor.subCategory || '', newVal: subCategory },
          { label: 'Address', oldVal: existingVendor.address || '', newVal: address },
          { label: 'GSTIN', oldVal: existingVendor.gstin || '', newVal: gstin },
          { label: 'Status', oldVal: existingVendor.status || 'Active', newVal: status },
          { label: 'Notes', oldVal: existingVendor.notes || '', newVal: notes }
        ];

        fieldChanges = fieldDefs.filter(f => f.oldVal.toString().trim().toLowerCase() !== f.newVal.toString().trim().toLowerCase());

        if (fieldChanges.length === 0) {
          warnings.push(`Vendor '${name}': No changes detected — data is identical to database record.`);
        } else {
          warnings.push(`Vendor '${name}': ${fieldChanges.length} field(s) will be updated. Review and confirm.`);
        }
      }
    }

    return {
      item: {
        name,
        company: company || name,
        email,
        phone,
        vendorId: finalVendorId,
        category,
        subCategory,
        address,
        city,
        state,
        country,
        zipCode,
        gstin,
        notes,
        status: ['active','inactive','draft'].includes(status.toLowerCase()) ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Active'
      },
      errors,
      warnings,
      isUpdatingExisting,
      fieldChanges,
      matchedVendorId
    };
  };

  const recalculateVendorImportSummary = (allItemsList, systemExistingCodes, isAutoEntryVal, baseSequence = null) => {
    const importedCodesInBatch = new Set();
    const autoCounter = getNextVendorAutoCounter(baseSequence);
    const autoCounterRef = { val: autoCounter };

    const processedItems = allItemsList.map((item, index) => {
      const rawItem = {
        name: item.name,
        company: item.company,
        email: item.email,
        phone: item.phone,
        vendorId: item.vendorId,
        primaryContactName: item.primaryContactName,
        primaryContactPhone: item.primaryContactPhone,
        primaryContactDesignation: item.primaryContactDesignation,
        address: item.address,
        city: item.city,
        state: item.state,
        country: item.country,
        zipCode: item.zipCode,
        gstin: item.gstin,
        bankName: item.bankName,
        bankAccountNumber: item.bankAccountNumber,
        bankAccountHolder: item.bankAccountHolder,
        ifscCode: item.ifscCode,
        category: item.category,
        subCategory: item.subCategory,
        status: item.status,
        notes: item.notes
      };

      const validation = validateVendorRow(rawItem, isAutoEntryVal, systemExistingCodes, importedCodesInBatch, autoCounterRef, vendors);

      let isDuplicate = false;
      let duplicateMsg = '';
      const isExistingMatch = validation.isUpdatingExisting || false;

      if (!isExistingMatch && validation.item.vendorId) {
        const checkCode = validation.item.vendorId.toUpperCase();
        if (importedCodesInBatch.has(checkCode)) {
          isDuplicate = true;
          duplicateMsg = `Duplicate Entry: Code '${validation.item.vendorId}' appears multiple times in spreadsheet.`;
        }
      }

      if (isDuplicate) {
        validation.errors.push(duplicateMsg);
      } else if (validation.errors.length === 0 && validation.item.vendorId && !isExistingMatch) {
        importedCodesInBatch.add(validation.item.vendorId.toUpperCase());
      }

      let existingVendorDetails = null;
      if (isExistingMatch && validation.matchedVendorId) {
        const existingV = vendors.find(v => v._id === validation.matchedVendorId);
        if (existingV) {
          existingVendorDetails = {
            name: existingV.name,
            vendorId: existingV.vendorId,
            company: existingV.company,
            email: existingV.email,
            phone: existingV.phone,
            category: existingV.category,
            status: existingV.status || 'Active'
          };
        }
      }

      return {
        ...validation.item,
        isDuplicate,
        isExistingMatch,
        matchedVendorId: validation.matchedVendorId,
        fieldChanges: validation.fieldChanges || [],
        validationErrors: validation.errors.map(e => `Row ${index + 1}: ${e}`),
        validationWarnings: validation.warnings,
        existingVendorDetails
      };
    });

    const validNew = processedItems.filter(i => !i.isExistingMatch && i.validationErrors.length === 0 && !i.isDuplicate);
    const existingMatch = processedItems.filter(i => i.isExistingMatch && i.validationErrors.length === 0 && !i.isDuplicate);
    const rejected = processedItems.filter(i => i.validationErrors.length > 0 || i.isDuplicate).map(i => i.validationErrors.join(', '));

    return {
      processedItems,
      summary: {
        total: processedItems.length,
        acceptedCount: validNew.length,
        existingMatchCount: existingMatch.length,
        rejectedCount: rejected.length,
        duplicateCount: 0,
        rejected
      }
    };
  };

  const handleOpenVendorPreviewEdit = (origIdx) => {
    setEditingVendorPreviewIdx(origIdx);
    setVendorPreviewFormData({ ...editableVendorItems[origIdx] });
  };

  const handleSaveVendorPreviewRow = () => {
    if (editingVendorPreviewIdx === null) return;
    setEditableVendorItems(prev => {
      const list = [...prev];
      const updated = { ...vendorPreviewFormData };

      const errors = [];
      if (!updated.name || !updated.name.trim()) errors.push("Vendor Name is missing.");
      if (!updated.email || !updated.email.trim()) {
        errors.push("Email is missing.");
      } else if (!/\S+@\S+\.\S+/.test(updated.email.trim())) {
        errors.push(`Invalid email: ${updated.email}`);
      }

      updated.validationErrors = errors;

      if (updated.isExistingMatch && updated.matchedVendorId) {
        const existingVendor = vendors.find(v => v._id === updated.matchedVendorId);
        if (existingVendor) {
          const fieldDefs = [
            { label: 'Vendor Name', oldVal: existingVendor.name || '', newVal: updated.name || '' },
            { label: 'Company', oldVal: existingVendor.company || '', newVal: updated.company || '' },
            { label: 'Email', oldVal: existingVendor.email || '', newVal: updated.email || '' },
            { label: 'Phone', oldVal: existingVendor.phone || '', newVal: updated.phone || '' },
            { label: 'Category', oldVal: existingVendor.category || '', newVal: updated.category || '' },
            { label: 'Sub-Category', oldVal: existingVendor.subCategory || '', newVal: updated.subCategory || '' },
            { label: 'Address', oldVal: existingVendor.address || '', newVal: updated.address || '' },
            { label: 'GSTIN', oldVal: existingVendor.gstin || '', newVal: updated.gstin || '' },
            { label: 'Status', oldVal: existingVendor.status || 'Active', newVal: updated.status || 'Active' },
            { label: 'Notes', oldVal: existingVendor.notes || '', newVal: updated.notes || '' }
          ];

          updated.fieldChanges = fieldDefs.filter(f => f.oldVal.toString().trim().toLowerCase() !== f.newVal.toString().trim().toLowerCase());
        }
      }

      list[editingVendorPreviewIdx] = updated;

      const validNew = list.filter(i => !i.isExistingMatch && i.validationErrors.length === 0 && !i.isDuplicate);
      const existingMatch = list.filter(i => i.isExistingMatch && i.validationErrors.length === 0 && !i.isDuplicate);
      const rejected = list.filter(i => i.validationErrors.length > 0 || i.isDuplicate).map(i => i.validationErrors.join(', '));

      setVendorImportSummary({
        total: list.length,
        acceptedCount: validNew.length,
        existingMatchCount: existingMatch.length,
        rejectedCount: rejected.length,
        duplicateCount: 0,
        rejected
      });

      return list;
    });

    setEditingVendorPreviewIdx(null);
    showToast("Row updated successfully in preview wizard.");
  };

  const handleUpdateIncompleteVendorRow = (idx, field, val) => {
    setEditableVendorItems(prev => {
      const list = [...prev];
      const item = { ...list[idx], [field]: val };
      
      const errors = [];
      if (!item.name || !item.name.trim()) errors.push("Vendor Name is missing.");
      if (!item.email || !item.email.trim()) {
        errors.push("Email is missing.");
      } else if (!/\S+@\S+\.\S+/.test(item.email.trim())) {
        errors.push(`Invalid email: ${item.email}`);
      }

      item.validationErrors = errors;

      if (errors.length === 0) {
        if (!item.vendorId) {
          // Duplication check against active and deleted items
        const activeCodes = new Set(vendors.map(v => (v.vendorId || '').toUpperCase().trim()));
        const deletedCodes = new Set(deletedVendorsHistory.map(d => (d.vendorId || '').toUpperCase().trim()));
        let foundConflict = false;
        for (const row of rawRowsMapped) {
          const rowCode = (row.vendorId || '').toUpperCase().trim();
          if (rowCode && (activeCodes.has(rowCode) || deletedCodes.has(rowCode))) {
            foundConflict = true;
            break;
          }
        }
        if (foundConflict) {
          setVendorBlockingPopupMessage("This file data already is in database which is presented in deleted rows & sheets status.");
          setVendorImportSummary(null);
          setEditableVendorItems([]);
          if (vendorFileInputRef.current) vendorFileInputRef.current.value = '';
          return;
        }

        const systemExistingCodes = vendors.map(v => (v.vendorId || '').toUpperCase().trim());
          const usedCodes = new Set([
            ...systemExistingCodes,
            ...list.map(i => (i.vendorId || '').toUpperCase().trim()).filter(Boolean)
          ]);
          let num = 1001;
          let code = `V${num}`;
          while (usedCodes.has(code)) {
            num++;
            code = `V${num}`;
          }
          item.vendorId = code;
        }
      }

      list[idx] = item;

      const validNew = list.filter(i => !i.isExistingMatch && i.validationErrors.length === 0 && !i.isDuplicate);
      const existingMatch = list.filter(i => i.isExistingMatch && i.validationErrors.length === 0 && !i.isDuplicate);
      const rejected = list.filter(i => i.validationErrors.length > 0 || i.isDuplicate).map(i => i.validationErrors.join(', '));

      setVendorImportSummary({
        total: list.length,
        acceptedCount: validNew.length,
        existingMatchCount: existingMatch.length,
        rejectedCount: rejected.length,
        duplicateCount: 0,
        rejected
      });

      return list;
    });
  };

  const processVendorExcelFile = async (file) => {
    let baseSequence = null;
    try {
      const seqRes = await api.get('/api/vendors/sequence-peek');
      if (seqRes.data && seqRes.data.nextCode) {
        const match = seqRes.data.nextCode.match(/\d+/);
        if (match) baseSequence = parseInt(match[0], 10);
      }
    } catch (e) {
      console.warn("Failed to fetch sequence peek", e);
    }

    setVendorCurrentFileName(file.name);
    setVendorConfirmedReplacements(new Set());
    setVendorSkippedItems(new Set());
    setActiveVendorQueueIdx(0);
    setConfirmActionType(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (!Array.isArray(rows) || rows.length === 0) {
          showToast("Import file is empty", "error");
          return;
        }

        const rawRowsMapped = rows.map(row => ({
          name: (getVendorRowVal(row, ["vendorname", "name", "vendor_name", "vendor name"]) || '').toString().trim(),
          company: (getVendorRowVal(row, ["company", "companyname", "company_name", "company name"]) || '').toString().trim(),
          email: (getVendorRowVal(row, ["email", "emailaddress", "email_address", "primary email"]) || '').toString().trim().toLowerCase(),
          phone: (getVendorRowVal(row, ["phone", "phonenumber", "phone_number", "mobile"]) || '').toString().trim(),
          vendorId: (getVendorRowVal(row, ["vendorid", "vendor id", "vendor code", "vendor_code"]) || '').toString().trim(),
          primaryContactName: (getVendorRowVal(row, ["primarycontactname", "contactname", "primary contact"]) || '').toString().trim(),
          primaryContactPhone: (getVendorRowVal(row, ["primarycontactphone", "contactphone"]) || '').toString().trim(),
          primaryContactDesignation: (getVendorRowVal(row, ["primarycontactdesignation", "designation"]) || '').toString().trim(),
          address: (getVendorRowVal(row, ["address", "addressline1", "address line 1"]) || '').toString().trim(),
          city: (getVendorRowVal(row, ["city"]) || '').toString().trim(),
          state: (getVendorRowVal(row, ["state"]) || '').toString().trim(),
          country: (getVendorRowVal(row, ["country"]) || '').toString().trim(),
          zipCode: (getVendorRowVal(row, ["zipcode", "zip", "pincode", "pin"]) || '').toString().trim(),
          gstin: (getVendorRowVal(row, ["gstin", "gst", "gstnumber", "gst number"]) || '').toString().trim().toUpperCase(),
          bankName: (getVendorRowVal(row, ["bankname", "bank name", "bank"]) || '').toString().trim(),
          bankAccountNumber: (getVendorRowVal(row, ["bankaccountnumber", "accountnumber", "acc no"]) || '').toString().trim(),
          bankAccountHolder: (getVendorRowVal(row, ["bankaccountholder", "accountholder"]) || '').toString().trim(),
          ifscCode: (getVendorRowVal(row, ["ifsccode", "ifsc"]) || '').toString().trim(),
          category: (getVendorRowVal(row, ["category", "vendortype", "type"]) || 'Food Processor').toString().trim(),
          subCategory: (getVendorRowVal(row, ["subcategory", "sub-category", "sub category"]) || '').toString().trim(),
          status: (getVendorRowVal(row, ["status", "state"]) || 'Active').toString().trim(),
          notes: (getVendorRowVal(row, ["notes", "description", "remarks"]) || '').toString().trim()
        }));

        const seenKeys = new Set();
        const deduplicatedRows = [];
        rawRowsMapped.forEach(row => {
          const key = `${row.name}|${row.email}|${row.phone}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            deduplicatedRows.push(row);
          }
        });

        // Duplication check against active and deleted items
        const activeCodes = new Set(vendors.map(v => (v.vendorId || '').toUpperCase().trim()));
        const deletedCodes = new Set(deletedVendorsHistory.map(d => (d.vendorId || '').toUpperCase().trim()));
        let foundConflict = false;
        for (const row of rawRowsMapped) {
          const rowCode = (row.vendorId || '').toUpperCase().trim();
          if (rowCode && (activeCodes.has(rowCode) || deletedCodes.has(rowCode))) {
            foundConflict = true;
            break;
          }
        }
        if (foundConflict) {
          setVendorBlockingPopupMessage("This file data already is in database which is presented in deleted rows & sheets status.");
          setVendorImportSummary(null);
          setEditableVendorItems([]);
          if (vendorFileInputRef.current) vendorFileInputRef.current.value = '';
          return;
        }

        const systemExistingCodes = vendors.map(v => (v.vendorId || '').toUpperCase().trim());
        const { processedItems, summary } = recalculateVendorImportSummary(deduplicatedRows, systemExistingCodes, isVendorAutoEntry, baseSequence);

        if (!isVendorAutoEntry && summary.existingMatchCount === 0 && summary.acceptedCount > 0) {
          showToast("System Notice: Bulk update will not work when all vendors are new. Please add vendors through Bulk Entry or Manual Entry", "error");
          setIsVendorImportModalOpen(false);
          setVendorImportSummary(null);
          return;
        }

        setVendorImportSummary(summary);
        setEditableVendorItems(processedItems);
        setVendorImportSearch('');
      } catch (err) {
        console.error(err);
        showToast("Error reading Excel data file", "error");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleVendorBatchImportSubmit = async (customItems = null) => {
    const itemsList = customItems || editableVendorItems;
    const validToImport = itemsList.filter((item, idx) => {
      if (item.validationErrors && item.validationErrors.length > 0) return false;
      if (item.isDuplicate) return false;
      if (item.userAction === 'skip' || vendorSkippedItems.has(idx)) return false;
      return true;
    });

    // Required fields check for all accepted/importing items
    for (let i = 0; i < validToImport.length; i++) {
      const item = validToImport[i];
      const missing = validateQueueItem(item);
      if (missing.length > 0) {
        alert(`Validation Notice: Required fields are missing in record #${i+1} (${missing.join(', ')}). Please fill all missing fields.`);
        showToast(`Import aborted: Record #${i+1} is missing required fields.`, 'error');
        const origIndex = itemsList.indexOf(item);
        if (origIndex !== -1) {
          setActiveVendorQueueIdx(origIndex);
        }
        return;
      }
    }

    // Duplication Check against Active and Deleted Tables
    const activeCodes = new Set(vendors.map(v => (v.vendorId || '').toUpperCase().trim()));
    const deletedCodes = new Set(deletedVendorsHistory.map(d => (d.vendorId || '').toUpperCase().trim()));
    const duplicates = validToImport.filter(item => {
      const code = (item.vendorId || '').toUpperCase().trim();
      return code && (activeCodes.has(code) || deletedCodes.has(code));
    });
    if (duplicates.length > 0) {
      alert("This file data already is in database which is presented in deleted rows & sheets status.");
      showToast("Ingestion aborted: Duplicate data detected.", "error");
      return;
    }

    if (validToImport.length === 0) {
      showToast("No items to import.", "error");
      return;
    }

    setSubmitLoading(true);
    try {
      let inserted = 0, updated = 0, skipped = 0;
      for (const item of validToImport) {
        try {
          if (item.isExistingMatch && item.matchedVendorId) {
            await api.put(`/api/vendors/${item.matchedVendorId}`, item);
            updated++;
          } else {
            await api.post('/api/vendors', item);
            inserted++;
          }
        } catch (e) {
          console.error(e);
          skipped++;
        }
      }

      const parts = [];
      if (inserted > 0) parts.push(`${inserted} added`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (skipped > 0) parts.push(`${skipped} failed`);
      showToast(`Success Notification: ${parts.join(', ')} via Bulk Entry!`, 'success');
      fetchVendors();
      setIsVendorImportModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Failed to save batch to database", "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleVendorImportExcel = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    processVendorExcelFile(e.target.files[0]);
    if (vendorFileInputRef.current) vendorFileInputRef.current.value = '';
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

  

  const handleViewDetails = (vendor) => {
    setViewingVendor(vendor);
    setSelectedVendor(vendor);
    setIsViewModalOpen(true);
  };

  
  
  
  
  
  
  
  
  
  
  

  const handleExportVendorGrid = () => {
    try {
      const dataToExport = filteredVendors.map(v => ({
        'Vendor Code': v.vendorId || '',
        'Vendor Name': v.name || '',
        'Company': v.company || '',
        'Primary Email': v.email || '',
        'Phone': v.phone || '',
        'Category': v.category || '',
        'Sub-Category': v.subCategory || '',
        'Address': v.address || '',
        'City': v.city || '',
        'State': v.state || '',
        'Zip Code': v.zipCode || '',
        'GSTIN': (v.gstList && v.gstList.length > 0) ? v.gstList.map(g => `${g.state}:${g.gstin}`).join('; ') : (v.gstin || ''),
        'Status': v.status || 'Active',
        'Notes': v.notes || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendors Grid');
      XLSX.writeFile(workbook, `Vendor_Master_Grid_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast("Vendor grid exported successfully to Excel.");
    } catch (err) {
      console.error(err);
      showToast("Failed to export vendor grid.", "error");
    }
  };

  
  
  
  

  // Form Modal State
  
  
  
  
  
  
  
  
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
  
  
  
  
  const autoSaveIntervalRef = useRef(null);

  

  

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
    setIsEditingDeletedRecord(!!vendor.isDeletedHistoryItem);
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
      
      contacts: (vendor.contacts || []).map(c => ({
        role: c.role || 'Primary',
        department: c.department || 'Sourcing',
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || ''
      })),
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
    setIsEditingDeletedRecord(false);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name || !formData.name.trim()) {
      errors.name = 'Vendor representative name is required';
    }

    // Validate email address of primary contact from contacts list
    const primaryContact = (formData.contacts || []).find(c => c.role === 'Primary') || (formData.contacts || [])[0];
    const contactEmail = primaryContact ? (primaryContact.email || '').trim() : '';
    if (contactEmail) {
      if (!/\S+@\S+\.\S+/.test(contactEmail)) {
        errors.email = 'Primary contact email address format is invalid';
      }
    }

    // Optional field defaults
    if (!formData.company || !formData.company.trim()) {
      formData.company = formData.name ? formData.name.trim() : 'Company';
    }
    if (!formData.category) formData.category = 'Food Processor';

    // Optional GSTIN format check
    if (!formData.hasNoGst && Array.isArray(formData.gstList)) {
      const gstErrors = [];
      formData.gstList.forEach((gst, index) => {
        if (gst && (gst.gstin || gst.state)) {
          const gstinVal = (gst.gstin || '').trim().toUpperCase();
          const stateVal = gst.state || '';
          if (gstinVal && gstinVal.length !== 15) {
            gstErrors[index] = { gstin: 'GSTIN must be exactly 15 characters' };
          } else if (gstinVal && stateVal) {
            const prefix = gstinVal.substring(0, 2);
            const mappedState = gstStateMap[prefix];
            if (mappedState && mappedState !== stateVal) {
              gstErrors[index] = { gstin: `GSTIN prefix ${prefix} belongs to ${mappedState}, not ${stateVal}` };
            }
          }
        }
      });
      if (gstErrors.length > 0) {
        errors.gstList = gstErrors;
      }
    }

    // Duplicate validation checks for Vendor Code
    const activeId = editingId;
    const finalCode = (formData.vendorId || '').toUpperCase().trim();
    if (finalCode) {
      const existsInActive = vendors.some(v => v._id !== activeId && (v.vendorId || '').toUpperCase().trim() === finalCode);
      const existsInDeleted = deletedVendorsHistory.some(d => d._id !== activeId && (d.vendorId || '').toUpperCase().trim() === finalCode);
      if (existsInActive || existsInDeleted) {
        alert("This file data already is in database which is presented in deleted rows & sheets status.");
        errors.vendorId = `Vendor Code '${finalCode}' is already in use (active or deleted).`;
      }
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstErr = errors.name || errors.vendorId || errors.email || 'Please check required fields';
      showToast(`Validation Notice: ${firstErr}`, "error");
    }
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
        company: (formData.company && formData.company.trim()) ? formData.company.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()) : formData.name.trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        email: ((formData.contacts || []).find(c => c.role === "Primary") || (formData.contacts || [])[0] || {}).email || formData.email || `vendor_${Date.now()}@company.com`,
        phone: formData.phone ? formData.phone.trim() : '',
        address: formData.address ? formData.address.trim() : '',
        category: formData.category || 'Food Processor',
        primaryContactName: (formData.primaryContactName || '').trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        primaryContactDesignation: (formData.primaryContactDesignation || '').trim().replace(/(^\w|\s\w)/g, c => c.toUpperCase()),
        gstList: (formData.gstList || []).map(gst => ({
          state: gst.state || '',
          gstin: (gst.gstin || '').trim().toUpperCase()
        }))
      };

      if (isEditingDeletedRecord) {
        setDeletedVendorsHistory(prev => {
          const updated = prev.map(d => d._id === editingId ? { ...d, ...formattedData } : d);
          localStorage.setItem('erp_deleted_vendors_history', JSON.stringify(updated));
          return updated;
        });
        showToast("Deleted vendor record updated locally.", "success");
        setIsModalOpen(false);
        setEditingId(null);
        setIsEditingDeletedRecord(false);
        setSubmitLoading(false);
        return;
      }

      if (editingId) {
        const res = await api.put(`/api/vendors/${editingId}`, formattedData);
        if (res.data && res.data.data) {
          setVendors(prev => prev.map(v => v._id === editingId ? res.data.data : v));
        }
        showToast("Vendor configurations updated successfully.");
      } else {
        const res = await api.post('/api/vendors', formattedData);
        if (res.data && res.data.data) {
          setVendors(prev => {
          const list = [res.data.data, ...prev];
          return list.sort((a, b) => {
            const numA = parseInt((a.vendorId || '').replace(/\D/g, '') || '0', 10);
            const numB = parseInt((b.vendorId || '').replace(/\D/g, '') || '0', 10);
            return numB - numA;
          });
        });
        }
        showToast("Successfully added 1 new vendor record.");

        if (currentDraftId) {
          setDrafts((prev) => {
            const filtered = prev.filter((d) => d.id !== currentDraftId);
            localStorage.setItem('erp_vendor_drafts', JSON.stringify(filtered));
            return filtered;
          });
        }
      }
      await fetchVendors();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit vendor details.';
      setFormErrors({ form: msg });
      showToast(msg, 'error');
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
    const target = vendors.find(v => v._id === id);
    if (!target) return;
    if (!window.confirm(`Are you sure you want to delete vendor "${target.name}" (${target.vendorId})?`)) return;
    try {
      await api.delete(`/api/vendors/${id}`);
      setVendors(prev => prev.filter(v => v._id !== id));
      setDeletedVendorsHistory(prev => [{ ...target, deletionType: 'Deleted Row', deletedAt: new Date().toISOString() }, ...prev]);
      setSelectedVendorRowIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast(`Vendor ${target.vendorId} moved to Deleted Sheets & Rows History.`);
    } catch (err) {
      console.error(err);
      showToast("Failed to delete vendor.", "error");
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

    return (
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b">
          Filter {col === 'name' ? 'Vendor Name' : col.charAt(0).toUpperCase() + col.slice(1)}
        </div>
        <input
          type="text"
          placeholder="Search options..."
          value={filterSearchText[col] || ''}
          onChange={(e) => setFilterSearchText({ ...filterSearchText, [col]: e.target.value })}
          className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-500 bg-white"
        />

        <div className="max-h-36 overflow-y-auto space-y-1 py-1">
          {filteredOptions.length === 0 ? (
            <div className="text-[10px] text-slate-400 italic text-center py-2">No matching options</div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const checked = (tempFilters[col] || []).includes(opt);
              return (
                <label key={idx} className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => handleCheckboxChange(col, opt, e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearColumnFilter(col);
            }}
            className="text-[10px] text-slate-500 hover:text-slate-700 font-bold underline px-1"
          >
            Clear Filter
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              applyColumnFilter(col);
            }}
            className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded transition-colors"
          >
            Apply Filter
          </button>
        </div>
      </div>
    );
  };

  const filteredVendors = (() => {
    let list = vendors;
    if (status === 'Deleted') {
      list = deletedVendorsHistory.map(d => ({ ...d, status: 'Deleted', isDeletedHistoryItem: true }));
    }
    return list.filter(v => {
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
  })();

  const handlePrintPdf = () => {
    if (!viewingVendor) return;

    const displayVal = (val, isCode = false) => {
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '') || val === false) {
        return '<span style="color: #94a3b8; font-style: italic; font-weight: normal;">[Not Filled]</span>';
      }
      if (val === true) {
        return '<span style="color: #10b981; font-weight: bold;">Yes / Active</span>';
      }
      return isCode ? `<span class="value-code">${val}</span>` : val;
    };

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Vendor Profile - ${viewingVendor.company || viewingVendor.name || 'Vendor Details'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; margin: 0; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
            .title { font-size: 18px; font-weight: bold; color: #0f172a; }
            .subtitle { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: bold; }
            
            .section-title { font-size: 11px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px; margin-bottom: 12px; }
            
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
            .field { display: flex; flex-direction: column; gap: 3px; }
            .label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
            .value { font-size: 11px; color: #0f172a; font-weight: bold; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
            .value-code { font-family: monospace; font-size: 11px; color: #2563eb; text-transform: uppercase; }
            
            .desc { grid-column: span 3; }
            .desc-val { font-size: 11px; line-height: 1.5; color: #334155; min-height: 45px; }
            
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
              <div style="font-size: 12px; font-weight: bold; color: #2563eb;">VENDOR ID: ${viewingVendor.vendorId || '-'}</div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">Date Generated: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <!-- Section 1: Basic Information -->
          <div class="section-title">1. Basic Information</div>
          <div class="grid">
            <div class="field">
              <div class="label">Representative Name</div>
              <div class="value">${displayVal(viewingVendor.name)}</div>
            </div>
            <div class="field">
              <div class="label">Company Name</div>
              <div class="value">${displayVal(viewingVendor.company)}</div>
            </div>
            <div class="field">
              <div class="label">Category</div>
              <div class="value">${displayVal(viewingVendor.category)}</div>
            </div>
            <div class="field">
              <div class="label">Sub-Category</div>
              <div class="value">${displayVal(viewingVendor.subCategory)}</div>
            </div>
            <div class="field">
              <div class="label">Status</div>
              <div class="value">${displayVal(viewingVendor.status)}</div>
            </div>
            <div class="field desc">
              <div class="label">Vendor Description / Sourcing Notes</div>
              <div class="value desc-val">${displayVal(viewingVendor.notes)}</div>
            </div>
          </div>

          <!-- Section 2: Contact & Location Details -->
          <div class="section-title">2. Contact & Location Details</div>
          <div class="grid">
            <div class="field">
              <div class="label">Primary Email</div>
              <div class="value" style="text-transform: none; font-family: monospace;">${displayVal(viewingVendor.email)}</div>
            </div>
            <div class="field">
              <div class="label">Phone Number</div>
              <div class="value">${displayVal(viewingVendor.phone)}</div>
            </div>
            <div class="field">
              <div class="label">Country</div>
              <div class="value">${displayVal(viewingVendor.country)}</div>
            </div>
            <div class="field">
              <div class="label">Office Address Line 1</div>
              <div class="value">${displayVal(viewingVendor.address)}</div>
            </div>
            <div class="field">
              <div class="label">Office Address Line 2</div>
              <div class="value">${displayVal(viewingVendor.address2)}</div>
            </div>
            <div class="field">
              <div class="label">City</div>
              <div class="value">${displayVal(viewingVendor.city)}</div>
            </div>
            <div class="field">
              <div class="label">State</div>
              <div class="value">${displayVal(viewingVendor.state)}</div>
            </div>
            <div class="field">
              <div class="label">Zip Code / PIN</div>
              <div class="value font-mono">${displayVal(viewingVendor.zipCode)}</div>
            </div>
          </div>

          <!-- Section 3: GST & Tax Configurations -->
          <div class="section-title">3. GST & Tax Configurations</div>
          <div class="grid">
            <div class="field desc">
              <div class="label">GST Registrations</div>
              <div class="value desc-val">
                ${viewingVendor.hasNoGst 
                  ? '<span style="color: #e11d48; font-weight: bold;">Unregistered Vendor (No GSTIN)</span>' 
                  : (viewingVendor.gstList && viewingVendor.gstList.length > 0)
                    ? viewingVendor.gstList.map(gst => `<div style="margin-bottom: 4px;"><strong>${gst.state || '[No State]'}:</strong> <span style="font-family: monospace; color: #2563eb;">${gst.gstin || '[No GSTIN]'}</span></div>`).join('')
                    : (viewingVendor.gstin 
                      ? `<div style="margin-bottom: 4px;"><strong>Default:</strong> <span style="font-family: monospace; color: #2563eb;">${viewingVendor.gstin}</span></div>`
                      : '<span style="color: #94a3b8; font-style: italic; font-weight: normal;">[Not Filled]</span>'
                    )
                }
              </div>
            </div>
          </div>

          <!-- Section 4: Primary Sourcing Contact -->
          <div class="section-title">4. Primary Sourcing Contact</div>
          <div class="grid">
            <div class="field">
              <div class="label">Contact Name</div>
              <div class="value">${displayVal(viewingVendor.primaryContactName)}</div>
            </div>
            <div class="field">
              <div class="label">Contact Phone</div>
              <div class="value">${displayVal(viewingVendor.primaryContactPhone)}</div>
            </div>
            <div class="field">
              <div class="label">Designation</div>
              <div class="value">${displayVal(viewingVendor.primaryContactDesignation)}</div>
            </div>
          </div>

          <!-- Section 5: Certifications -->
          <div class="section-title">5. Certifications</div>
          <div class="grid">
            <div class="field">
              <div class="label">Has FSSAI License</div>
              <div class="value">${displayVal(viewingVendor.fssai)}</div>
            </div>
            <div class="field">
              <div class="label">FSSAI Expiry Date</div>
              <div class="value">${displayVal(viewingVendor.fssaiExpiry ? viewingVendor.fssaiExpiry.substring(0,10) : '')}</div>
            </div>
            <div class="field">
              <div class="label">FSSAI Quantity Limit (MT)</div>
              <div class="value">${displayVal(viewingVendor.fssaiQty)}</div>
            </div>
            <div class="field">
              <div class="label">Has FFSC 22000 Certificate</div>
              <div class="value">${displayVal(viewingVendor.ffsc2200)}</div>
            </div>
            <div class="field">
              <div class="label">FFSC Expiry Date</div>
              <div class="value">${displayVal(viewingVendor.ffsc2200Expiry ? viewingVendor.ffsc2200Expiry.substring(0,10) : '')}</div>
            </div>
            <div class="field">
              <div class="label">FFSC Quantity Limit (MT)</div>
              <div class="value">${displayVal(viewingVendor.ffsc2200Qty)}</div>
            </div>
          </div>

          <!-- Section 6: Bank & Payment Details -->
          <div class="section-title">6. Bank & Payment Details</div>
          <div class="grid">
            <div class="field">
              <div class="label">Account Holder Name</div>
              <div class="value">${displayVal(viewingVendor.bankAccountHolder)}</div>
            </div>
            <div class="field">
              <div class="label">Account Number</div>
              <div class="value font-mono">${displayVal(viewingVendor.bankAccountNumber)}</div>
            </div>
            <div class="field">
              <div class="label">Bank Name</div>
              <div class="value">${displayVal(viewingVendor.bankName)}</div>
            </div>
            <div class="field">
              <div class="label">IFSC Code</div>
              <div class="value font-mono">${displayVal(viewingVendor.ifscCode)}</div>
            </div>
          </div>

          <script>
            window.print();
            setTimeout(function() { window.close(); }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Vendor toasts
  
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setVendorToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => setVendorToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Download template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Vendor Name": "Fresh Foods Co",
        "Company": "Fresh Foods Ltd",
        "Email": "contact@freshfoods.example.com",
        "Phone": "9876543210",
        "Primary Contact Name": "Rahul Sharma",
        "Primary Contact Phone": "9876543210",
        "Primary Contact Designation": "Sales Manager",
        "Address": "123 Market Road",
        "City": "Mumbai",
        "State": "Maharashtra",
        "Country": "India",
        "Zip Code": "400001",
        "GST Number": "27ABCDE1234F1Z5",
        "Bank Name": "HDFC Bank",
        "Bank Account Number": "123456789012",
        "Bank Account Holder": "Fresh Foods Ltd",
        "IFSC Code": "HDFC0001234",
        "Category": "Food Processor",
        "Sub-Category": "Raw Materials",
        "Status": "Active",
        "Notes": "Preferred supplier for raw spices"
      },
      {
        "Vendor Name": "Global Packaging",
        "Company": "Global Pack Inc",
        "Email": "info@globalpack.example.com",
        "Phone": "9988776655",
        "Primary Contact Name": "Anita Desai",
        "Primary Contact Phone": "9988776655",
        "Primary Contact Designation": "Director",
        "Address": "Phase 2 Industrial Area",
        "City": "Pune",
        "State": "Maharashtra",
        "Country": "India",
        "Zip Code": "411001",
        "GST Number": "27XYZDE9876G1Z2",
        "Bank Name": "SBI",
        "Bank Account Number": "987654321098",
        "Bank Account Holder": "Global Pack Inc",
        "IFSC Code": "SBIN0009876",
        "Category": "Contract Manufacturer",
        "Sub-Category": "Bottles",
        "Status": "Active",
        "Notes": "Supplies glass and plastic bottles"
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor_Import_Template.xlsx');
    XLSX.writeFile(wb, 'Vendor_Import_Template.xlsx');
  };

  // Batch wizard navigation
  const handleVendorBatchWizardBack = () => {
    setVendorBatchEditIdx(prev => Math.max(0, prev - 1));
  };

  const handleVendorBatchWizardSaveCurrent = () => {
    setVendorBatchEditIdx(prev => Math.min((vendorBatchEditItems || []).length - 1, prev + 1));
  };

  // Zip/PIN code auto-fetch - fills city, state, country from India Post API
  const handleZipCodeBlur = async (zip) => {
    const code = (zip || formData.zipCode || '').trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) return;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${code}`);
      const data = await res.json();
      if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice?.length > 0) {
        const po = data[0].PostOffice[0];
        const newCity = po.District || po.Name || '';
        const newState = po.State || '';
        setFormData(prev => ({
          ...prev,
          city: newCity,
          state: newState,
          country: 'India'
        }));
        showToast(`Location updated for PIN ${code}: ${newCity}, ${newState}`, 'success');
      }
    } catch (e) {
      console.warn('PIN lookup failed', e);
    }
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
              value={searchInputVal}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full px-2 py-0.5 h-7 pr-7 border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
            />
            {search && (
              <button
                onClick={() => { setSearchInputVal(''); setSearch(''); }}
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


            <Button
              size="sm"
              variant={isVendorSelectionMode ? "solid" : "outline"}
              onClick={() => {
                setIsVendorSelectionMode(!isVendorSelectionMode);
                if (isVendorSelectionMode) setSelectedVendorRowIds(new Set()); // clear when toggling off
              }}
              className={`h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold text-xs shadow-sm transition-colors ${isVendorSelectionMode ? 'bg-blue-600 text-white hover:bg-blue-700 border-transparent' : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{isVendorSelectionMode ? 'Cancel Selection' : 'Select Options'}</span>
            </Button>

            {isVendorSelectionMode && selectedVendorRowIds.size > 0 && (
              <button
                onClick={handleDeleteSelectedVendors}
                className="h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Selected ({selectedVendorRowIds.size})</span>
              </button>
            )}

            {(isVendorSelectionMode || status === 'Deleted') && selectedVendorRowIds.size > 0 && status === 'Deleted' && (
              <button
                onClick={handleRestoreSelectedVendors}
                className="h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-xs animate-pulse"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Restore Selected ({selectedVendorRowIds.size})</span>
              </button>
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
              <option value="">All status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Draft">Draft</option>
              <option value="Deleted">Deleted Sheets & Rows ({deletedVendorsHistory.length})</option>
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
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1 text-left">
                    <button onClick={() => { setShowVendorFunctionList(false); handleOpenAddModal(); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium">
                      <Plus className="h-3.5 w-3.5 text-blue-600" /><span>Manual Entry</span>
                    </button>
                    <button onClick={() => { setShowVendorFunctionList(false); setIsVendorAutoEntry(true); setIsVendorImportModalOpen(true); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /><span>Bulk Entry</span>
                    </button>
                    <button onClick={() => { setShowVendorFunctionList(false); setIsVendorAutoEntry(false); setIsVendorImportModalOpen(true); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium">
                      <RefreshCw className="h-3.5 w-3.5 text-amber-600" /><span>Bulk Update</span>
                    </button>
                    <button onClick={() => { setShowVendorFunctionList(false); handleExportVendorGrid(); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium border-t border-slate-100">
                      <Download className="h-3.5 w-3.5 text-purple-600" /><span>Export Grid to Excel</span>
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
              onClear: () => { setSearchInputVal(''); setSearch(''); }
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
                    <TableHead className="!px-2.5 !py-1 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200">Company</TableHead>
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
          ) : (status === 'Deleted' ? deletedVendorsHistory.length === 0 : vendors.length === 0) ? (
            <div className="p-20 text-center text-slate-400 font-medium">No vendors registered.</div>
          ) : (
            <Table className="border border-slate-200 w-full table-fixed">
              <TableHeader className="bg-slate-50 border-b border-slate-200 relative z-20">
                <TableRow>
                  {(isVendorSelectionMode || status === "Deleted") && (
                  <TableHead className="!px-3 !py-1 w-[40px] max-w-[40px] text-center border-r border-slate-200 relative z-20">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                      checked={filteredVendors.length > 0 && filteredVendors.every(v => selectedVendorRowIds.has(v._id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVendorRowIds(new Set(filteredVendors.map(v => v._id)));
                        } else {
                          setSelectedVendorRowIds(new Set());
                        }
                      }}
                    />
                  </TableHead>
                )}
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[90px] max-w-[90px] whitespace-nowrap">Code</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[140px] max-w-[140px] whitespace-nowrap relative">
                    <div className="flex items-center justify-between">
                      <span>Vendor Name</span>
                      <button
                        onClick={(e) => toggleFilterPopup('name', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['name'] && columnFilters['name'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Vendor Name"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'name' && (
                      <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
                        {renderFilterPopupContent('name')}
                      </div>
                    )}
                  </TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap">Company</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap">Notes/Desc</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap">GST Reg</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 whitespace-nowrap relative">
                    <div className="flex items-center justify-between">
                      <span>Category</span>
                      <button
                        onClick={(e) => toggleFilterPopup('category', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['category'] && columnFilters['category'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Category"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'category' && (
                      <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
                        {renderFilterPopupContent('category')}
                      </div>
                    )}
                  </TableHead>
                  <TableHead className="!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[110px] max-w-[110px] whitespace-nowrap relative">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <button
                        onClick={(e) => toggleFilterPopup('status', e)}
                        className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
                          (columnFilters['status'] && columnFilters['status'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Filter Status"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {activeFilterCol === 'status' && (
                      <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
                        {renderFilterPopupContent('status')}
                      </div>
                    )}
                  </TableHead>
                  <TableHead className="border-r border-slate-200">Email</TableHead>
                  <TableHead className="!px-2 !py-0.5 text-right text-slate-600 font-bold text-[11px] w-[120px] max-w-[120px] border-r border-slate-200">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVendors.map((v) => (
                  <TableRow key={v._id} className="hover:bg-slate-50/50 border-b border-slate-200">
                    {(isVendorSelectionMode || status === "Deleted") && (
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[40px] max-w-[40px] text-center" onClick={(e) => { e.stopPropagation(); handleVendorRowSelect(v._id); }}>
                      <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer" checked={selectedVendorRowIds.has(v._id)} onChange={() => handleVendorRowSelect(v._id)} />
                    </TableCell>
                    )}
                    <TableCell
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleViewDetails(v);
                      }}
                      className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[90px] max-w-[90px] font-mono text-[11px] font-bold text-blue-600 cursor-pointer hover:underline hover:text-blue-800"
                      title="Click to view full vendor profile & print PDF"
                    >
                      <span className="cursor-pointer hover:underline">{v.vendorId || '-'}</span>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-xs font-semibold text-slate-800 capitalize relative group/vtooltip max-w-[140px]">
                      <span className="truncate block cursor-pointer" title={v.name || ''}>
                        {v.name ? v.name.toLowerCase() : "-"}
                      </span>
                      {v.name && (
                        <div className="absolute left-2 bottom-full mb-1 hidden group-hover/vtooltip:block z-50 bg-slate-900 text-white text-[11px] font-semibold px-2.5 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none capitalize">
                          {v.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-[11px] text-slate-700 font-medium relative group/ctooltip max-w-[120px]">
                      <span className="truncate block cursor-pointer" title={v.company || ''}>
                        {v.company || "-"}
                      </span>
                      {v.company && (
                        <div className="absolute left-2 bottom-full mb-1 hidden group-hover/ctooltip:block z-50 bg-slate-900 text-white text-[11px] font-semibold px-2.5 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none">
                          {v.company}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-[11px] text-slate-500 max-w-[130px] relative group/ntooltip">
                      <span className="truncate block cursor-pointer" title={v.notes || ''}>
                        {v.notes || '-'}
                      </span>
                      {v.notes && v.notes.trim().length > 0 && (
                        <div className="absolute left-2 bottom-full mb-1 hidden group-hover/ntooltip:block z-50 bg-slate-900 text-white text-[11px] font-medium p-2.5 rounded-lg shadow-2xl max-w-[280px] whitespace-normal pointer-events-none">
                          <div className="font-bold text-[9px] text-blue-400 uppercase tracking-wider mb-1">Notes & Description</div>
                          {v.notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-[11px] text-slate-600 font-mono">
                      {v.hasNoGst ? (
                        <span className="text-[10px] text-slate-400 italic">No GST</span>
                      ) : (v.gstList && v.gstList.length > 0) ? (
                        <div className="flex items-center space-x-1" title={v.gstList.map(g => `${g.state}: ${g.gstin}`).join(' | ')}>
                          <span className="truncate max-w-[85px] font-bold text-blue-600">{v.gstList[0].gstin}</span>
                          {v.gstList.length > 1 && (
                            <span className="px-1 py-0.2 bg-blue-100 text-blue-800 text-[9px] font-bold rounded">+${v.gstList.length - 1}</span>
                          )}
                        </div>
                      ) : (
                        <span className="truncate max-w-[100px]" title={v.gstin || ''}>{v.gstin || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-[11px] text-slate-700">
                      {v.category || 'Other'}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[110px] max-w-[110px]">
                      <Badge className={v.status === 'Active' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]' : 'bg-slate-100 text-slate-700 border-slate-200 text-[10px]'}>
                        {v.status || 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 text-[11px] text-blue-600 font-medium relative group/etooltip max-w-[140px]">
                      <span className="truncate block cursor-pointer" title={v.email || ''}>
                        {v.email || "-"}
                      </span>
                      {v.email && (
                        <div className="absolute left-2 bottom-full mb-1 hidden group-hover/etooltip:block z-50 bg-slate-900 text-white text-[11px] font-semibold px-2.5 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none lowercase">
                          {v.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="!px-2 !py-0.5 text-right border-r border-slate-200 w-[120px] max-w-[120px]">
                      {v.isDeletedHistoryItem ? (
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditModal(v); }}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit Deleted Vendor details locally"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewDetails(v); }}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View Full Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditModal(v); }}
                            disabled={!!vendorImportSummary}
                            className={`p-1 rounded text-slate-500 ${!!vendorImportSummary ? 'cursor-not-allowed opacity-50' : 'hover:text-emerald-600 hover:bg-emerald-50 transition-colors'}`}
                            title={!!vendorImportSummary ? "Edit disabled in Bulk Entry mode" : "Edit Vendor"}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v._id); }}
                            className="p-1 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete Vendor"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CRUD Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit Vendor details' : 'Register new vendor'}
        className="!max-w-[85vw] !w-[85vw] !rounded-xl"
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
              <div className="flex flex-col space-y-1.5 col-span-2">
                <label className="text-[11px] font-bold text-slate-600 uppercase">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none h-9 w-full"
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
                  <div key={idx} className="grid grid-cols-12 gap-3 bg-slate-50 p-3 rounded-md border border-slate-200 items-end">
                    <div className="col-span-2 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Role</label>
                      <select
                        value={contact.role || 'Primary'}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], role: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5 cursor-pointer"
                      >
                        <option value="Primary">Primary</option>
                        <option value="Secondary">Secondary</option>
                        <option value="Quality">Quality</option>
                        <option value="Accounts">Accounts</option>
                        <option value="Logistics">Logistics</option>
                        <option value="Sales">Sales</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="col-span-2 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Department</label>
                      <select
                        value={contact.department || 'Sourcing'}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], department: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5 cursor-pointer"
                      >
                        <option value="Sourcing">Sourcing</option>
                        <option value="Quality">Quality</option>
                        <option value="Finance / Accounts">Finance / Accounts</option>
                        <option value="Logistics">Logistics</option>
                        <option value="Sales">Sales</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="col-span-3 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Name</label>
                      <input
                        type="text"
                        value={contact.name || ''}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5"
                      />
                    </div>

                    <div className="col-span-2 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Phone Number</label>
                      <input
                        type="text"
                        value={contact.phone || ''}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], phone: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5 font-mono"
                      />
                    </div>

                    <div className="col-span-2 flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Email Address</label>
                      <input
                        type="email"
                        value={contact.email || ''}
                        onChange={(e) => {
                          const updated = [...(formData.contacts || [])];
                          updated[idx] = { ...updated[idx], email: e.target.value };
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5 font-mono"
                      />
                    </div>

                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...(formData.contacts || [])];
                          updated.splice(idx, 1);
                          setFormData({ ...formData, contacts: updated });
                        }}
                        className="text-red-500 hover:text-red-700 text-xs font-bold pb-2"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ 
                      ...formData, 
                      contacts: [...(formData.contacts || []), { role: 'Primary', department: 'Sourcing', name: '', phone: '', email: '' }] 
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

              {/* Secondary Address Options */}
              <div className="border-t border-slate-200 pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="hasSecondaryAddress"
                      checked={formData.hasSecondaryAddress}
                      onChange={(e) => setFormData({ ...formData, hasSecondaryAddress: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="hasSecondaryAddress" className="text-xs font-bold text-slate-800 cursor-pointer">+ Add Secondary Plant / Branch Address</label>
                  </div>
                </div>

                {formData.hasSecondaryAddress && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                    <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 pb-1">
                      Secondary Plant / Branch Location
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Address Line 1" id="vsecaddress1" placeholder="Building / Street / Landmark" value={formData.secondaryAddress || ''} onChange={(e) => setFormData({ ...formData, secondaryAddress: e.target.value })} className="!text-xs !h-9" />
                      <Input label="Address Line 2" id="vsecaddress2" placeholder="Area / Suite / Locality" value={formData.secondaryAddress2 || ''} onChange={(e) => setFormData({ ...formData, secondaryAddress2: e.target.value })} className="!text-xs !h-9" />
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4">
                      <Input 
                        label="Zip Code (PIN)" 
                        id="vseczip" 
                        placeholder="6-digit PIN"
                        value={formData.secondaryZipCode || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...formData, secondaryZipCode: val });
                          if (val.length === 6) {
                            handleSecondaryZipCodeBlur(val);
                          }
                        }} 
                        onBlur={() => { if (formData.secondaryZipCode && formData.secondaryZipCode.length === 6) handleSecondaryZipCodeBlur(formData.secondaryZipCode); }}
                        className="!text-xs !h-9 font-mono" 
                      />
                      <Input label="City" id="vseccity" value={formData.secondaryCity || ''} onChange={(e) => setFormData({ ...formData, secondaryCity: e.target.value })} className="!text-xs !h-9" />
                      <Input label="State" id="vsecstate" value={formData.secondaryState || ''} onChange={(e) => setFormData({ ...formData, secondaryState: e.target.value })} className="!text-xs !h-9" />
                      <Input label="Country" id="vseccountry" value={formData.secondaryCountry || 'India'} onChange={(e) => setFormData({ ...formData, secondaryCountry: e.target.value })} className="!text-xs !h-9" />
                    </div>

                    {/* Secondary Address GST Option */}
                    <div className="border-t border-slate-200 pt-3">
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-2">GST Registration for Secondary Address</label>
                      <div className="flex items-center space-x-6 text-xs font-semibold text-slate-700">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="secGstOpt"
                            value="same"
                            checked={!formData.secondaryGstOption || formData.secondaryGstOption === 'same'}
                            onChange={() => setFormData({ ...formData, secondaryGstOption: 'same' })}
                            className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                          />
                          <span>Use Same GSTIN as Primary Address</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="secGstOpt"
                            value="separate"
                            checked={formData.secondaryGstOption === 'separate'}
                            onChange={() => setFormData({ ...formData, secondaryGstOption: 'separate' })}
                            className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                          />
                          <span>Add Separate GSTIN for this Address</span>
                        </label>
                      </div>

                      {formData.secondaryGstOption === 'separate' && (
                        <div className="grid grid-cols-2 gap-4 mt-3 bg-white p-3 rounded border border-slate-200">
                          <div className="flex flex-col space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
                            <select
                              value={formData.secondaryGstState || ''}
                              onChange={(e) => {
                                const selState = e.target.value;
                                const foundCode = Object.keys(gstStateMap).find(code => gstStateMap[code] === selState);
                                let currentGstin = formData.secondaryGstin || '';
                                if (foundCode) {
                                  if (currentGstin.length >= 2) {
                                    currentGstin = foundCode + currentGstin.substring(2);
                                  } else {
                                    currentGstin = foundCode;
                                  }
                                }
                                setFormData({ ...formData, secondaryGstState: selState, secondaryGstin: currentGstin });
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5"
                            >
                              <option value="">Select State</option>
                              {Object.values(gstStateMap).map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Secondary GSTIN Code</label>
                            <input
                              type="text"
                              placeholder="15-character GSTIN"
                              value={formData.secondaryGstin || ''}
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase().trim();
                                let detectedState = formData.secondaryGstState;
                                if (val.length >= 2) {
                                  const prefix = val.substring(0, 2);
                                  if (gstStateMap[prefix]) detectedState = gstStateMap[prefix];
                                }
                                setFormData({ ...formData, secondaryGstState: detectedState, secondaryGstin: val });
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none h-8.5 font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                    <Input label="License No." type="text" placeholder="e.g. LIC-FFSC-10029" value={formData.ffsc2200LicenseNo || ''} onChange={(e) => setFormData({ ...formData, ffsc2200LicenseNo: e.target.value, ffsc2200Qty: e.target.value })} className="!text-xs !h-8 font-mono" />
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
                    <Input label="License No." type="text" placeholder="e.g. 10024011000123" value={formData.fssaiLicenseNo || ''} onChange={(e) => setFormData({ ...formData, fssaiLicenseNo: e.target.value, fssaiQty: e.target.value })} className="!text-xs !h-8 font-mono" />
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
            <Button type="submit" onClick={handleFormSubmit} isLoading={submitLoading} className="bg-blue-600 hover:bg-blue-700 shadow-sm px-6">
              {editingId ? 'Save Changes' : 'Register Vendor'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* View Details Dialog Modal */}
      <Dialog
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title={viewingVendor ? `Vendor Profile — ${viewingVendor.vendorId || ''}` : 'Vendor Profile'}
        className="!max-w-[70vw] !w-[70vw] !rounded-xl"
      >
        {viewingVendor && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="font-mono font-extrabold text-blue-400 text-sm bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
                  {viewingVendor.vendorId || '-'}
                </span>
                <div>
                  <span className="font-extrabold text-sm block capitalize">{viewingVendor.name}</span>
                  <span className="text-xs text-slate-300 block">{viewingVendor.company} • {viewingVendor.category}</span>
                </div>
              </div>
              <Badge className={viewingVendor.status === 'Active' ? 'bg-emerald-500 text-white text-xs font-bold' : 'bg-slate-700 text-white text-xs font-bold'}>
                {viewingVendor.status || 'Active'}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Primary Email</span>
                <span className="text-xs font-bold text-slate-700">{viewingVendor.email || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Phone Number</span>
                <span className="text-xs font-bold text-slate-700">{viewingVendor.phone || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Primary Contact Person</span>
                <span className="text-xs font-bold text-slate-700">{viewingVendor.primaryContactName || '-'} ({viewingVendor.primaryContactDesignation || 'Contact'})</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Sourcing Category</span>
                <span className="text-xs font-bold text-slate-700">{viewingVendor.category || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Sub-Category</span>
                <span className="text-xs font-bold text-slate-700">{viewingVendor.subCategory || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">GSTIN / Tax Registration</span>
                <span className="text-xs font-mono font-bold text-blue-600">
                  {(viewingVendor.gstList && viewingVendor.gstList.length > 0) ? viewingVendor.gstList.map(g => `${g.state}: ${g.gstin}`).join(' | ') : (viewingVendor.gstin || 'No GST')}
                </span>
              </div>
            </div>

            {/* Certifications Block */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">FFSC 2200 Certification</span>
                <span className="text-xs font-bold text-slate-800">
                  {viewingVendor.ffsc2200 ? `✓ Certified (Lic No: ${viewingVendor.ffsc2200LicenseNo || viewingVendor.ffsc2200Qty || 'Active'})` : '✕ Not Certified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">FSSAI Certification</span>
                <span className="text-xs font-bold text-slate-800">
                  {viewingVendor.fssai ? `✓ Certified (Lic No: ${viewingVendor.fssaiLicenseNo || viewingVendor.fssaiQty || 'Active'})` : '✕ Not Certified'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Primary Plant / Office Address</span>
                <span className="text-xs text-slate-700 font-medium">{viewingVendor.address || 'N/A'} {viewingVendor.address2 ? `, ${viewingVendor.address2}` : ''} {viewingVendor.city ? `, ${viewingVendor.city}` : ''} {viewingVendor.state ? `, ${viewingVendor.state}` : ''} {viewingVendor.zipCode ? `- ${viewingVendor.zipCode}` : ''}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Secondary Plant Address</span>
                <span className="text-xs text-slate-700 font-medium">
                  {viewingVendor.hasSecondaryAddress ? `${viewingVendor.secondaryAddress || ''} ${viewingVendor.secondaryAddress2 ? `, ${viewingVendor.secondaryAddress2}` : ''} ${viewingVendor.secondaryCity ? `, ${viewingVendor.secondaryCity}` : ''} ${viewingVendor.secondaryState ? `, ${viewingVendor.secondaryState}` : ''} ${viewingVendor.secondaryZipCode ? `- ${viewingVendor.secondaryZipCode}` : ''}` : 'No secondary address'}
                </span>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-slate-100">
              <Button
                onClick={handlePrintPdf}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center space-x-1.5 px-4"
              >
                <Printer className="h-4 w-4" />
                <span>Print PDF Profile</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close Profile
              </Button>
            </div>
          </div>
        )}
      </Dialog>

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
    
      {/* Vendor Batch Edit Modal */}
      <Dialog
        isOpen={isVendorBatchEditModalOpen}
        onClose={() => setIsVendorBatchEditModalOpen(false)}
        title={`Batch Edit Vendor (${vendorBatchEditIdx + 1} of ${vendorBatchEditItems.length})`}
      >
        {vendorBatchEditItems.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="Vendor Name"
                value={vendorBatchEditItems[vendorBatchEditIdx]?.name || ''}
                onChange={(e) => {
                  const newItems = [...vendorBatchEditItems];
                  newItems[vendorBatchEditIdx].name = e.target.value;
                  setVendorBatchEditItems(newItems);
                }}
              />
              <Input 
                label="Company"
                value={vendorBatchEditItems[vendorBatchEditIdx]?.company || ''}
                onChange={(e) => {
                  const newItems = [...vendorBatchEditItems];
                  newItems[vendorBatchEditIdx].company = e.target.value;
                  setVendorBatchEditItems(newItems);
                }}
              />
              <Input 
                label="Category"
                value={vendorBatchEditItems[vendorBatchEditIdx]?.category || ''}
                onChange={(e) => {
                  const newItems = [...vendorBatchEditItems];
                  newItems[vendorBatchEditIdx].category = e.target.value;
                  setVendorBatchEditItems(newItems);
                }}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select 
                  className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  value={vendorBatchEditItems[vendorBatchEditIdx]?.status || ''}
                  onChange={(e) => {
                    const newItems = [...vendorBatchEditItems];
                    newItems[vendorBatchEditIdx].status = e.target.value;
                    setVendorBatchEditItems(newItems);
                  }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
            </div>
            <div className="pt-4 flex justify-between border-t border-slate-100">
              <Button variant="outline" type="button" onClick={handleVendorBatchWizardBack} disabled={vendorBatchEditIdx === 0}>Back</Button>
              <Button type="button" onClick={() => handleVendorBatchWizardSaveCurrent(vendorBatchEditItems[vendorBatchEditIdx])} isLoading={submitLoading}>
                {vendorBatchEditIdx < vendorBatchEditItems.length - 1 ? "Save & Next" : "Save & Finish"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Vendor Import Modal — Full Wizard */}
      <input
        type="file"
        ref={vendorFileInputRef}
        accept=".xlsx, .xls"
        onChange={handleVendorImportExcel}
        className="hidden"
      />
      <Dialog
        isOpen={isVendorImportModalOpen}
        onClose={() => setIsVendorImportModalOpen(false)}
        title={vendorImportSummary ? 'Bulk Entry Review Ingestion Queue' : (isVendorAutoEntry ? 'Bulk Entry — Create Vendors (Auto-assigning V-codes)' : 'Bulk Update Vendors (Apply spreadsheet details)')}
        className={vendorImportSummary ? "!max-w-[90vw] !w-[90vw] !rounded-xl" : (isVendorAutoEntry ? "!max-w-[65vw] !w-[65vw] !rounded-none" : "!max-w-[92vw] !w-[92vw] !rounded-none")}
      >
        <div className="space-y-4">
          {/* Upload Area */}
          <div className="border border-slate-200 rounded-lg p-6 text-center bg-slate-50 relative flex flex-col items-center justify-center space-y-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
              <Save className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-700 block">
                {isVendorAutoEntry ? 'Bulk Entry Ingestion — Upload Vendor Spreadsheet' : 'Upload Spreadsheet for Bulk Vendor Update'}
              </span>
              <span className="text-[10px] text-slate-400 block font-semibold mt-0.5">Supports Microsoft Excel files (.xlsx, .xls)</span>
            </div>
            
            <div>
              <input
                type="file"
                ref={vendorFileInputRef}
                accept=".xlsx, .xls"
                onChange={handleVendorImportExcel}
                className="hidden"
              />
              <Button size="sm" onClick={() => vendorFileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 flex items-center space-x-1.5 rounded shadow">
                <span>Upload File</span>
              </Button>
            </div>
          </div>

          {/* Download Template (Bulk Entry only) */}
          {isVendorAutoEntry && (
            <div className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
              <span className="text-slate-500 font-medium">Need the format template?</span>
              <button onClick={handleDownloadTemplate} className="text-blue-600 hover:underline font-bold text-xs focus:outline-none">Download Excel Template</button>
            </div>
          )}

          {/* Results after file uploaded */}
          {vendorImportSummary && (
          <div className="space-y-4 text-xs">
            {/* File success banner */}
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center justify-between text-emerald-800 font-semibold shadow-sm">
              <div className="flex items-center space-x-2">
                <div className="p-0.5 bg-emerald-100 rounded-full text-emerald-600">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <span className="block text-xs font-bold">Ingested and Validated Cleanly!</span>
                  <span className="block font-mono text-[10px] text-emerald-600 mt-0.5">{vendorCurrentFileName}</span>
                </div>
              </div>
              <div className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Queue: {editableVendorItems.filter((x, i) => !vendorConfirmedReplacements.has(i) && !vendorSkippedItems.has(i)).length} Pending / {editableVendorItems.length} Total
              </div>
            </div>

            {/* Split-Screen Review Queue Layout */}
            <div className="grid grid-cols-12 gap-4">
              
              {/* Left Column: Vendor Ingestion Queue List */}
              <div className="col-span-4 border border-slate-200 rounded-lg p-3 bg-slate-50 flex flex-col space-y-2 max-h-[55vh] overflow-y-auto">
                <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <span>Vendor Review Ingestion List</span>
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-bold">
                    {editableVendorItems.filter((item) => !vendorQueueSearchTerm || (item.name || '').toLowerCase().includes(vendorQueueSearchTerm.toLowerCase()) || (item.vendorId || '').toLowerCase().includes(vendorQueueSearchTerm.toLowerCase()) || (item.company || '').toLowerCase().includes(vendorQueueSearchTerm.toLowerCase())).length} of {editableVendorItems.length}
                  </span>
                </div>
                <div className="relative my-1.5">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by Code or Vendor Name..."
                    value={vendorQueueSearchTerm}
                    onChange={(e) => setVendorQueueSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5 flex-1 overflow-y-auto">
                  {editableVendorItems.map((item, idx) => {
                    const isSelected = activeVendorQueueIdx === idx;
                    const isAccepted = vendorConfirmedReplacements.has(idx) || item.userAction === 'accept';
                    const isSkipped = vendorSkippedItems.has(idx) || item.userAction === 'skip';
                    const matchesSearch = !vendorQueueSearchTerm || 
                      (item.name || '').toLowerCase().includes(vendorQueueSearchTerm.toLowerCase()) || 
                      (item.vendorId || '').toLowerCase().includes(vendorQueueSearchTerm.toLowerCase()) || 
                      (item.company || '').toLowerCase().includes(vendorQueueSearchTerm.toLowerCase());
                    if (!matchesSearch) return null;
                    
                    let statusBadge = <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] font-bold">Pending</Badge>;
                    if (isAccepted) statusBadge = <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] font-bold">✓ Accepted</Badge>;
                    if (isSkipped) statusBadge = <Badge className="bg-red-100 text-red-800 border-red-200 text-[9px] font-bold">✕ Skipped</Badge>;

                    return (
                      <div
                        key={idx}
                        onClick={() => setActiveVendorQueueIdx(idx)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between min-w-0 ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-700 shadow-md transform scale-[1.01]'
                            : isSkipped
                              ? 'bg-red-50/50 text-slate-400 border-red-100 opacity-60'
                              : isAccepted
                                ? 'bg-emerald-50/50 text-slate-700 border-emerald-100'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-bold truncate text-[11px] capitalize">{item.name || 'Untitled Vendor'}</div>
                          <div className={`text-[10px] truncate ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                            {item.company || 'No Company'} • {item.vendorId || 'Auto ID'}
                          </div>
                        </div>
                        <div className="shrink-0">{statusBadge}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Active Vendor Details Form & Actions */}
              <div className="col-span-8 border border-slate-200 rounded-lg p-4 bg-white flex flex-col justify-between max-h-[55vh] overflow-y-auto shadow-sm">
                {(() => {
                  const currentItem = editableVendorItems[activeVendorQueueIdx];
                  if (!currentItem) {
                    return (
                      <div className="py-20 text-center text-slate-400 font-bold">
                        No active vendor selected. Please click a vendor from the list.
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col h-full justify-between space-y-4">
                      
                      {/* Form Area */}
                      <div className="space-y-4 flex-1 max-h-[58vh] overflow-y-auto pr-2">
                        <div className="flex items-center justify-between border-b pb-2 mb-2">
                          <div>
                            <span className="text-[10px] text-blue-600 font-mono font-bold block">RECORD #{activeVendorQueueIdx + 1} OF {editableVendorItems.length}</span>
                            <span className="text-xs font-bold text-slate-800">Reviewing: {currentItem.name}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            {currentItem.isExistingMatch ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-bold text-[9px]">Existing Match in DB</Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-bold text-[9px]">New Vendor Record</Badge>
                            )}
                          </div>
                        </div>

                        {/* Section 1: Basic Information */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3 shadow-xs mb-3">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Basic Information</span>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Vendor ID</label>
                              <input
                                type="text"
                                value={currentItem.vendorId || ''}
                                disabled={true}
                                className="px-2 py-1.5 border border-slate-100 rounded text-xs font-mono text-slate-500 bg-slate-100 cursor-not-allowed font-bold"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Vendor Name</label>
                              <input
                                type="text"
                                placeholder="Tyson"
                                value={currentItem.name || ''}
                                onChange={(e) => handleQueueFieldChange('name', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Category</label>
                              <select
                                value={currentItem.category || 'Food Processor'}
                                onChange={(e) => handleQueueFieldChange('category', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 cursor-pointer h-8"
                              >
                                <option value="Food Processor">Food Processor</option>
                                <option value="Contract Manufacturer">Contract Manufacturer</option>
                                <option value="Retail Brand">Retail Brand</option>
                                <option value="Fresh Fruits Supplier">Fresh Fruits Supplier</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Sub-Category</label>
                              <input
                                type="text"
                                placeholder="e.g. Packaging, Raw Material"
                                value={currentItem.subCategory || ''}
                                onChange={(e) => handleQueueFieldChange('subCategory', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Status</label>
                              <select
                                value={currentItem.status || 'Active'}
                                onChange={(e) => handleQueueFieldChange('status', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 cursor-pointer h-8"
                              >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                                <option value="Draft">Draft</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Contacts Directory */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3 shadow-xs mb-3">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Contacts Directory</span>
                          
                          {(!currentItem.contacts || currentItem.contacts.length === 0) ? (
                            <div className="text-xs text-slate-400 italic">No contacts added yet.</div>
                          ) : (
                            <div className="space-y-2">
                              {currentItem.contacts.map((c, cIdx) => (
                                <div key={cIdx} className="grid grid-cols-12 gap-1.5 items-center bg-white p-2 border border-slate-200 rounded text-xs">
                                  <div className="col-span-3">
                                    <select
                                      value={c.role || 'Primary'}
                                      onChange={(e) => {
                                        const updated = [...currentItem.contacts];
                                        updated[cIdx] = { ...updated[cIdx], role: e.target.value };
                                        handleQueueFieldChange('contacts', updated);
                                      }}
                                      className="w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-white font-semibold"
                                    >
                                      <option value="Primary">Primary</option>
                                      <option value="Secondary">Secondary</option>
                                      <option value="Billing">Billing</option>
                                    </select>
                                  </div>
                                  <div className="col-span-3">
                                    <select
                                      value={c.department || 'Sourcing'}
                                      onChange={(e) => {
                                        const updated = [...currentItem.contacts];
                                        updated[cIdx] = { ...updated[cIdx], department: e.target.value };
                                        handleQueueFieldChange('contacts', updated);
                                      }}
                                      className="w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-white font-semibold"
                                    >
                                      <option value="Sourcing">Sourcing</option>
                                      <option value="Quality">Quality</option>
                                      <option value="Finance / Accounts">Finance / Accounts</option>
                                      <option value="Logistics">Logistics</option>
                                      <option value="Sales">Sales</option>
                                      <option value="Other">Other</option>
                                    </select>
                                  </div>
                                  <div className="col-span-3">
                                    <input
                                      type="text"
                                      placeholder="Name"
                                      value={c.name || ''}
                                      onChange={(e) => {
                                        const updated = [...currentItem.contacts];
                                        updated[cIdx] = { ...updated[cIdx], name: e.target.value };
                                        handleQueueFieldChange('contacts', updated);
                                      }}
                                      className="w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded font-semibold"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <input
                                      type="text"
                                      placeholder="Phone / Email"
                                      value={c.phone || c.email || ''}
                                      onChange={(e) => {
                                        const updated = [...currentItem.contacts];
                                        updated[cIdx] = { ...updated[cIdx], phone: e.target.value, email: e.target.value };
                                        handleQueueFieldChange('contacts', updated);
                                      }}
                                      className="w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded font-mono"
                                    />
                                  </div>
                                  <div className="col-span-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...currentItem.contacts];
                                        updated.splice(cIdx, 1);
                                        handleQueueFieldChange('contacts', updated);
                                      }}
                                      className="text-red-500 hover:text-red-700 font-bold text-[11px]"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...(currentItem.contacts || []), { role: 'Primary', department: 'Sourcing', name: '', phone: '', email: '' }];
                              handleQueueFieldChange('contacts', updated);
                            }}
                            className="text-[10px] text-blue-600 font-bold hover:underline flex items-center space-x-1"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add Contact</span>
                          </button>
                        </div>

                        {/* Address & Location */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3 shadow-xs mb-3">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Address & Location</span>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Address Line 1</label>
                              <input
                                type="text"
                                placeholder="Phase 2 Industrial Area"
                                value={currentItem.address || ''}
                                onChange={(e) => handleQueueFieldChange('address', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Address Line 2</label>
                              <input
                                type="text"
                                placeholder="Address Line 2"
                                value={currentItem.address2 || ''}
                                onChange={(e) => handleQueueFieldChange('address2', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-3">
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Zip Code (PIN)</label>
                              <input
                                type="text"
                                value={currentItem.zipCode || ''}
                                onChange={(e) => handleQueueFieldChange('zipCode', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 font-mono"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">City</label>
                              <input
                                type="text"
                                value={currentItem.city || ''}
                                onChange={(e) => handleQueueFieldChange('city', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
                              <input
                                type="text"
                                value={currentItem.state || ''}
                                onChange={(e) => handleQueueFieldChange('state', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Country</label>
                              <input
                                type="text"
                                value={currentItem.country || 'India'}
                                onChange={(e) => handleQueueFieldChange('country', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200/60">
                            <label className="flex items-center space-x-1.5 text-[10px] font-bold text-blue-600 cursor-pointer hover:underline">
                              <input
                                type="checkbox"
                                checked={currentItem.hasSecondaryAddress || false}
                                onChange={(e) => handleQueueFieldChange('hasSecondaryAddress', e.target.checked)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                              />
                              <span>+ Add Secondary Plant / Branch Address</span>
                            </label>
                          </div>

                          {currentItem.hasSecondaryAddress && (
                            <div className="space-y-3 pt-2 border-t border-slate-100 bg-white p-2.5 rounded border border-slate-200">
                              <span className="text-[9px] font-bold text-slate-500 uppercase block">Secondary Plant / Branch Details</span>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">Secondary Address Line 1</label>
                                  <input
                                    type="text"
                                    value={currentItem.secondaryAddress || ''}
                                    onChange={(e) => handleQueueFieldChange('secondaryAddress', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">Secondary Address Line 2</label>
                                  <input
                                    type="text"
                                    value={currentItem.secondaryAddress2 || ''}
                                    onChange={(e) => handleQueueFieldChange('secondaryAddress2', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-3">
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">Zip Code</label>
                                  <input
                                    type="text"
                                    value={currentItem.secondaryZipCode || ''}
                                    onChange={(e) => handleQueueFieldChange('secondaryZipCode', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                                  />
                                </div>
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">City</label>
                                  <input
                                    type="text"
                                    value={currentItem.secondaryCity || ''}
                                    onChange={(e) => handleQueueFieldChange('secondaryCity', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">State</label>
                                  <input
                                    type="text"
                                    value={currentItem.secondaryState || ''}
                                    onChange={(e) => handleQueueFieldChange('secondaryState', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">Country</label>
                                  <input
                                    type="text"
                                    value={currentItem.secondaryCountry || 'India'}
                                    onChange={(e) => handleQueueFieldChange('secondaryCountry', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* GST Details */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3 shadow-xs mb-3">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">GST Details</span>
                          
                          <label className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={currentItem.hasNoGst || false}
                              onChange={(e) => handleQueueFieldChange('hasNoGst', e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>No GSTIN (Composition/Unregistered)</span>
                          </label>

                          {!currentItem.hasNoGst && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/60">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
                                  <select
                                    value={currentItem.state || ''}
                                    onChange={(e) => handleQueueFieldChange('state', e.target.value)}
                                    className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold bg-white cursor-pointer h-8"
                                  >
                                    <option value="">Select State</option>
                                    {["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"].map(s => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">GSTIN Code</label>
                                  <input
                                    type="text"
                                    placeholder="15-char GSTIN"
                                    value={currentItem.gstin || ''}
                                    onChange={(e) => handleQueueFieldChange('gstin', e.target.value.toUpperCase().trim())}
                                    className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white font-mono"
                                  />
                                </div>
                              </div>

                              {/* Multi-state GST registrations */}
                              <div className="space-y-2 pt-2 border-t border-slate-100">
                                <span className="text-[9px] font-bold text-slate-500 uppercase block">Additional GST Registrations ({(currentItem.gstList || []).length})</span>
                                {(currentItem.gstList || []).map((gst, idx) => (
                                  <div key={idx} className="flex items-center space-x-2 bg-white p-2 border border-slate-200 rounded text-xs">
                                    <select
                                      value={gst.state || ''}
                                      onChange={(e) => {
                                        const updated = [...currentItem.gstList];
                                        updated[idx] = { ...updated[idx], state: e.target.value };
                                        handleQueueFieldChange('gstList', updated);
                                      }}
                                      className="w-1/3 px-1.5 py-1 text-xs border border-slate-200 rounded bg-white"
                                    >
                                      <option value="">Select State</option>
                                      {["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"].map(s => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      placeholder="15-char GSTIN"
                                      value={gst.gstin || ''}
                                      onChange={(e) => {
                                        const updated = [...currentItem.gstList];
                                        updated[idx] = { ...updated[idx], gstin: e.target.value.toUpperCase().trim() };
                                        handleQueueFieldChange('gstList', updated);
                                      }}
                                      className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs font-mono font-bold"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...currentItem.gstList];
                                        updated.splice(idx, 1);
                                        handleQueueFieldChange('gstList', updated);
                                      }}
                                      className="text-red-500 hover:text-red-700 font-bold px-1 text-[11px]"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(currentItem.gstList || []), { state: '', gstin: '' }];
                                    handleQueueFieldChange('gstList', updated);
                                  }}
                                  className="text-[10px] text-blue-600 font-bold hover:underline flex items-center space-x-1"
                                >
                                  <Plus className="h-3 w-3" />
                                  <span>Add Another GST Registration</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Certifications */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3 shadow-xs mb-3">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Certifications</span>
                          
                          <div className="flex items-center space-x-6">
                            <label className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={currentItem.ffsc2200 || false}
                                onChange={(e) => handleQueueFieldChange('ffsc2200', e.target.checked)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                              />
                              <span>FFSC2200 Certified</span>
                            </label>

                            <label className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={currentItem.fssai || false}
                                onChange={(e) => handleQueueFieldChange('fssai', e.target.checked)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                              />
                              <span>FSSAI Certified</span>
                            </label>
                          </div>

                          {currentItem.ffsc2200 && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/60 bg-white p-2.5 rounded border border-slate-200">
                              <span className="text-[9px] font-bold text-slate-500 uppercase block">FFSC 22000 Details</span>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">FFSC Expiry</label>
                                  <input
                                    type="date"
                                    value={currentItem.ffsc2200Expiry ? currentItem.ffsc2200Expiry.substring(0, 10) : ''}
                                    onChange={(e) => handleQueueFieldChange('ffsc2200Expiry', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">FFSC Scope / Qty</label>
                                  <input
                                    type="text"
                                    value={currentItem.ffsc2200Qty || ''}
                                    onChange={(e) => handleQueueFieldChange('ffsc2200Qty', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {currentItem.fssai && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/60 bg-white p-2.5 rounded border border-slate-200">
                              <span className="text-[9px] font-bold text-slate-500 uppercase block">FSSAI License Details</span>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">FSSAI Expiry</label>
                                  <input
                                    type="date"
                                    value={currentItem.fssaiExpiry ? currentItem.fssaiExpiry.substring(0, 10) : ''}
                                    onChange={(e) => handleQueueFieldChange('fssaiExpiry', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                                <div className="flex flex-col space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">FSSAI License / Qty</label>
                                  <input
                                    type="text"
                                    value={currentItem.fssaiQty || ''}
                                    onChange={(e) => handleQueueFieldChange('fssaiQty', e.target.value)}
                                    className="px-2 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Bank Details */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3 shadow-xs mb-3">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Bank Details</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Account Holder Name</label>
                              <input
                                type="text"
                                value={currentItem.bankAccountHolder || ''}
                                onChange={(e) => handleQueueFieldChange('bankAccountHolder', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Account Number</label>
                              <input
                                type="text"
                                value={currentItem.bankAccountNumber || ''}
                                onChange={(e) => handleQueueFieldChange('bankAccountNumber', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 font-mono"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Bank Name</label>
                              <input
                                type="text"
                                value={currentItem.bankName || ''}
                                onChange={(e) => handleQueueFieldChange('bankName', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">IFSC Code</label>
                              <input
                                type="text"
                                value={currentItem.ifscCode || ''}
                                onChange={(e) => handleQueueFieldChange('ifscCode', e.target.value.toUpperCase().trim())}
                                className="px-2 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      </div>{/* Action Controls Panel */}
                      <div className="border-t border-slate-100 pt-3 flex items-center justify-between mt-3 bg-slate-50 p-2.5 rounded-lg border">
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleAcceptQueueItem(activeVendorQueueIdx)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-1.5 rounded-md shadow-sm transition-all flex items-center space-x-1"
                          >
                            <span>✓ Accept</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkipQueueItem(activeVendorQueueIdx)}
                            className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-4 py-1.5 rounded-md shadow-sm transition-all flex items-center space-x-1"
                          >
                            <span>✕ Skip</span>
                          </button>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setConfirmActionType('accept_all')}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-3 py-1.5 rounded-md shadow-sm transition-all flex items-center space-x-1"
                          >
                            <span>Accept All</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmActionType('skip_all')}
                            className="bg-red-600 hover:bg-red-700 text-white font-extrabold px-3 py-1.5 rounded-md shadow-sm transition-all flex items-center space-x-1"
                          >
                            <span>Skip All</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
)}

          {/* Bottom Action Footer Bar */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-200 mt-4">
            {vendorImportSummary ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setVendorImportSummary(null)}>
                  Cancel / Re-upload
                </Button>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await handleVendorBatchImportSubmit();
                    }}
                    isLoading={submitLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 flex items-center space-x-1"
                  >
                    <span>✓ Save & Import Updates</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsVendorImportModalOpen(false)}>
                    Exit
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsVendorImportModalOpen(false)}>
                Close
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {/* Edit Preview Row Modal */}
      <Dialog
        isOpen={editingVendorPreviewIdx !== null}
        onClose={() => setEditingVendorPreviewIdx(null)}
        title="Edit Vendor Row Details in Import Wizard"
        className="!max-w-[50vw] !w-[50vw] !rounded-xl"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-md text-blue-800 font-semibold">
            Edit details for row #{editingVendorPreviewIdx !== null ? editingVendorPreviewIdx + 1 : ''} ({vendorPreviewFormData.vendorId || 'Auto'})
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Vendor Name *"
              id="pe_name"
              value={vendorPreviewFormData.name || ''}
              onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, name: e.target.value })}
              className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md"
            />
            <Input
              label="Company Name"
              id="pe_company"
              value={vendorPreviewFormData.company || ''}
              onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, company: e.target.value })}
              className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Primary Email *"
              id="pe_email"
              type="email"
              value={vendorPreviewFormData.email || ''}
              onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, email: e.target.value })}
              className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md"
            />
            <Input
              label="Phone Number"
              id="pe_phone"
              value={vendorPreviewFormData.phone || ''}
              onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, phone: e.target.value })}
              className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Category"
              id="pe_category"
              value={vendorPreviewFormData.category || 'Food Processor'}
              onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, category: e.target.value })}
              options={[
                { value: 'Food Processor', label: 'Food Processor' },
                { value: 'Contract Manufacturer', label: 'Contract Manufacturer' },
                { value: 'Retail Brand', label: 'Retail Brand' },
                { value: 'Fresh Fruits Supplier', label: 'Fresh Fruits Supplier' },
                { value: 'Other', label: 'Other' }
              ]}
              className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md"
            />
            <Input
              label="GSTIN Number"
              id="pe_gstin"
              value={vendorPreviewFormData.gstin || ''}
              onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, gstin: e.target.value.toUpperCase() })}
              className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md font-mono"
            />
          </div>

          <Input
            label="Address"
            id="pe_address"
            value={vendorPreviewFormData.address || ''}
            onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, address: e.target.value })}
            className="!text-xs !py-1.5 !px-2.5 !h-8.5 !rounded-md"
          />

          <TextArea
            label="Notes & Remarks"
            id="pe_notes"
            rows={2}
            value={vendorPreviewFormData.notes || ''}
            onChange={(e) => setVendorPreviewFormData({ ...vendorPreviewFormData, notes: e.target.value })}
            className="!text-xs !py-1.5 !px-2.5 !rounded-md"
          />

          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setEditingVendorPreviewIdx(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveVendorPreviewRow} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
              ✓ Save Row Details
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Deleted Vendors Sheets & Rows History Modal */}
      <Dialog
        isOpen={isDeletedVendorsModalOpen}
        onClose={() => setIsDeletedVendorsModalOpen(false)}
        title="Deleted Rows & Removed Vendor Sheets History"
        className="!max-w-[65vw] !w-[65vw] !rounded-xl"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-red-800 font-semibold flex items-center justify-between">
            <div>
              <span className="font-bold block text-sm">Removed Vendor Rows & Sheets Log</span>
              <span className="text-[11px] text-red-600 block">List of deleted vendor rows and removed sheets. Click Restore to return any record back to your active data grid.</span>
            </div>
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs font-bold">
              {deletedVendorsHistory.length} Removed Items
            </Badge>
          </div>

          {deletedVendorsHistory.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-1">
              <Trash2 className="h-8 w-8 mx-auto text-slate-300" />
              <span className="font-bold text-xs block text-slate-500">No deleted rows or sheets in history</span>
              <span className="text-[11px] text-slate-400 block">When you delete vendor rows or remove sheets, they will appear here for easy restoration.</span>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {deletedVendorsHistory.map((item, idx) => (
                <div key={idx} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-bold text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">{item.vendorId || 'ROW'}</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800 text-xs capitalize">{item.name}</span>
                        <Badge className={item.deletionType === 'Deleted Sheet' ? 'bg-red-100 text-red-700 border-red-200 text-[9px]' : 'bg-amber-100 text-amber-700 border-amber-200 text-[9px]'}>
                          {item.deletionType || 'Deleted Row'}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-slate-500 block">{item.company || 'Company'} • {item.email || '-'}</span>
                      <span className="text-[10px] text-slate-400 block">Deleted at: {new Date(item.deletedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleRestoreVendor(item)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Restore Record</span>
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 flex justify-end border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setIsDeletedVendorsModalOpen(false)}>
              Close History Log
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Floating Toast Notifications Container for Vendor Master */}
      
      {/* Confirmation Overlays for Bulk Queue */}
      {confirmActionType === 'accept_all' && (
        <Dialog
          isOpen={true}
          onClose={() => setConfirmActionType(null)}
          title="Confirm Accept All"
          className="!max-w-[400px] !w-[400px] !rounded-xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 font-semibold flex items-start space-x-2">
              <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
              <span>Are you sure you want to accept all remaining pending vendors? This will queue them for database update.</span>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setConfirmActionType(null)}>Cancel</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold" onClick={handleConfirmAcceptAll}>Proceed</Button>
            </div>
          </div>
        </Dialog>
      )}

      {confirmActionType === 'skip_all' && (
        <Dialog
          isOpen={true}
          onClose={() => setConfirmActionType(null)}
          title="Confirm Skip All / Cancel Ingestion"
          className="!max-w-[400px] !w-[400px] !rounded-xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 font-semibold flex items-start space-x-2">
              <Info className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>Are you sure you want to cancel the bulk entry? All remaining vendors in the queue will be skipped.</span>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setConfirmActionType(null)}>Cancel</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold" onClick={handleConfirmSkipAll}>Proceed</Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Blocking Popup for Bulk Upload Conflicts */}
      {vendorBlockingPopupMessage && (
        <Dialog
          isOpen={true}
          onClose={() => setVendorBlockingPopupMessage('')}
          title="Ingestion Blocked — Duplication Detected"
          className="!max-w-[420px] !w-[420px] !rounded-xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 font-semibold flex items-start space-x-2">
              <span className="text-sm shrink-0 mt-0.5">⚠️</span>
              <span>{vendorBlockingPopupMessage}</span>
            </div>
            <div className="flex justify-end pt-2 border-t">
              <Button size="sm" className="bg-slate-700 hover:bg-slate-800 text-white font-bold" onClick={() => setVendorBlockingPopupMessage('')}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}
<div className="fixed top-4 right-4 z-[9999] space-y-2.5 pointer-events-none">
        {vendorToasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between space-x-3 px-4 py-3 rounded-xl shadow-2xl border text-xs font-extrabold transition-all duration-300 transform translate-y-0 opacity-100 max-w-md ${
              t.type === 'success' 
                ? 'bg-emerald-600 border-emerald-700 text-white' 
                : t.type === 'error'
                ? 'bg-red-600 border-red-700 text-white'
                : 'bg-blue-600 border-blue-700 text-white'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="text-sm">{t.type === 'success' ? '✓' : t.type === 'error' ? '⚠️' : 'ℹ️'}</span>
              <span>{t.message}</span>
            </div>
            <button
              onClick={() => setVendorToasts(prev => prev.filter(item => item.id !== t.id))}
              className="text-white/80 hover:text-white font-bold ml-3 text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
</div>
  );
};

export default Masters;
