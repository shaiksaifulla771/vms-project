import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../services/api';
import * as XLSX from 'xlsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input, Select, TextArea } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { Drawer } from '../../components/ui/Drawer';
import { Search, Plus, Edit2, ToggleLeft, ToggleRight, Trash2, Save, ArrowLeft, ArrowRight, ShieldCheck, Printer, MoreVertical, Eye, Filter, Info, FileSpreadsheet, Download, RefreshCw } from 'lucide-react';
import BulkVendorUploadGrid from '../../components/BulkVendorUploadGrid';
import MPNMaster from './MPNMaster';
import ConfirmDeleteDialog from '../../components/ui/ConfirmDeleteDialog';

// -------------------------------------------------------------
let toastIdCounter = 0;

const getNextAutoCounter = (baseSequence = null) => {
 if (baseSequence !== null && baseSequence !== undefined) {
 // Strip leading 'M' prefix if server returned it as e.g. 'M1032'
 const raw = String(baseSequence).replace(/^[Mm]+/, '');
 const num = parseInt(raw, 10);
 if (!isNaN(num)) return num;
 }
 
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
 : type === 'Finished' || type === 'Finished Goods' ? 'Finished'
 : type === 'Packing' || type === 'Packing Material' || type === 'Packaged Material' ? 'Packaged Material'
 : type === 'Semi-Finished' ? 'Semi-Finished' : null;
 if (!normalizedType) {
 errors.push(`Invalid Category '${type || ''}'. Must be Raw Material, Finished, Packaged Material, or Semi-Finished.`);
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
 // Not found → auto-generate code from 2001+

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
 const newType = normalizedType || type;

 const fieldDefs = [
 { label: 'Name', oldVal: existingByCode.name || '', newVal: name },
 { label: 'UOM', oldVal: existingByCode.unit || '', newVal: unit },
 { label: 'Category', oldVal: existingByCode.type || '', newVal: newType },
 { label: 'Sub-Category', oldVal: existingByCode.subcategory || '', newVal: newSubcat },
 { label: 'Status', oldVal: existingByCode.status || '', newVal: newStatus },
 { label: 'Description', oldVal: existingByCode.description || '', newVal: description },
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

 useEffect(() => {
 localStorage.setItem('erp_deleted_materials_history', JSON.stringify(deletedMaterialsHistory));
 }, [deletedMaterialsHistory]);

 const resolveMaterialConflictAndRestore = async (item, activeMaterials) => {
 let finalCode = item.code || '';
 let isCodeReassigned = false;

 const activeMaterialsOnly = activeMaterials.filter(m => m.status !== 'Deleted');
 const codeConflict = activeMaterialsOnly.some(m => (m.code || '').toUpperCase().trim() === (finalCode || '').toUpperCase().trim());
 if (codeConflict || !finalCode) {
 let maxNum = 1000;
 activeMaterialsOnly.forEach(m => {
 const num = parseInt((m.code || '').replace(/\D/g, ''), 10);
 if (!isNaN(num) && num < 10000 && num > maxNum) maxNum = num;
 });
 finalCode = `M${maxNum + 1}`;
 isCodeReassigned = true;
 }

 const payload = { 
 ...item, 
 code: finalCode, 
 status: 'Active' 
 };
 delete payload.deletedAt;
 delete payload.deletionType;
 delete payload.isDeletedHistoryItem;

 if (item._id) {
 try {
 const putRes = await api.put(`/api/materials/${item._id}`, payload);
 if (putRes.data && putRes.data.success) {
 return { success: true, item: putRes.data.data, isCodeReassigned, newCode: finalCode };
 }
 } catch (err) {
 console.warn("PUT by _id failed, attempting fallback restore", err);
 }
 }

 if (item.code) {
 try {
 const searchRes = await api.get(`/api/materials?search=${encodeURIComponent(item.code)}`);
 if (searchRes.data && searchRes.data.success && Array.isArray(searchRes.data.data)) {
 const match = searchRes.data.data.find(m => (m.code || '').toUpperCase() === item.code.toUpperCase());
 if (match && match._id) {
 const putRes = await api.put(`/api/materials/${match._id}`, payload);
 if (putRes.data && putRes.data.success) {
 return { success: true, item: putRes.data.data, isCodeReassigned, newCode: finalCode };
 }
 }
 }
 } catch (e) {
 console.warn("Search fallback failed", e);
 }
 }

 delete payload._id;
 const postRes = await api.post('/api/materials', payload);
 return { success: true, item: postRes.data.data, isCodeReassigned, newCode: finalCode };
 };

 const handleRestoreMaterial = async (item) => {
 try {
 const result = await resolveMaterialConflictAndRestore(item, materials);
 setDeletedMaterialsHistory((prev) => {
 const updated = prev.filter(d => {
 if (d._id && item._id) return d._id !== item._id;
 if (d.code && item.code) return d.code !== item.code;
 return d.name !== item.name;
 });
 localStorage.setItem('erp_deleted_materials_history', JSON.stringify(updated));
 return updated;
 });
 if (result.isCodeReassigned) {
 showToast(`Material"${item.name}" restored with re-assigned code ${result.newCode} (resolved active conflict).`,"success");
 } else {
 showToast(`Material ${result.newCode || item.name || ''} restored successfully!`,"success");
 }
 fetchMaterials();
 } catch (err) {
 console.error(err);
 showToast("Failed to restore material record.","error");
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
 const [status, setStatus] = useState('');
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
 const [deleteConfirmState, setDeleteConfirmState] = useState({ isOpen: false, itemIds: [] });
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
 const activeDraftIdRef = useRef(null);

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

 useEffect(() => {
 activeDraftIdRef.current = currentDraftId;
 }, [currentDraftId]);
 const [showDraftsList, setShowDraftsList] = useState(false);
 const [viewingMaterial, setViewingMaterial] = useState(null);
 const [isViewModalOpen, setIsViewModalOpen] = useState(false);

 const confirmDeleteMaterials = async () => {
    const ids = deleteConfirmState.itemIds;
    if (ids.length === 0) return;
    
    try {
      if (ids.length === 1) {
        // Single delete
        const id = ids[0];
        const target = materials.find(m => m._id === id);
        if (!target) return;
        
        await api.delete(`/api/materials/${id}`);
        setDeletedMaterialsHistory(prev => [{ ...target, deletionType: 'Deleted Row', deletedAt: new Date().toISOString() }, ...prev]);
        setMaterials(materials.filter(m => m._id !== id));
        showToast(`Material ${target.code} moved to Deleted Sheets & Rows History.`);
      } else {
        // Bulk delete
        await api.post('/api/materials/bulk-delete', { materialIds: ids });
        const targets = materials.filter(m => ids.includes(m._id));
        setDeletedMaterialsHistory(prev => [
          ...targets.map(t => ({ ...t, deletionType: 'Deleted Row', deletedAt: new Date().toISOString() })),
          ...prev
        ]);
        setMaterials(materials.filter(m => !ids.includes(m._id)));
        showToast(`Deleted ${ids.length} materials successfully. Moved to History.`);
        setSelectedRowIds(new Set());
      }
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete materials.', 'error');
    }
  };

  const handleDeleteMaterial = (id) => {
    setDeleteConfirmState({ isOpen: true, itemIds: [id] });
  };

  const handleDeleteSelectedMaterials = () => {
    if (selectedRowIds.size === 0) return;
    setDeleteConfirmState({ isOpen: true, itemIds: Array.from(selectedRowIds) });
  };

 const subcategoryMap = {
 'Raw Material': [
 { value: 'Fresh', label: 'Fresh' },
 { value: 'Standardized', label: 'Standardized' },
 { value: 'Retail', label: 'Retail' }
 ],
 'Packaged Material': [
 { value: 'Primary', label: 'Primary' },
 { value: 'Secondary', label: 'Secondary' },
 { value: 'Tertiary', label: 'Tertiary' }
 ],
 'Semi-Finished': [
 { value: 'Puree', label: 'Puree' },
 { value: 'Porridge', label: 'Porridge' },
 { value: 'Yogurt Melts', label: 'Yogurt Melts' }
 ],
 'Finished': [
 { value: 'Puree', label: 'Puree' },
 { value: 'Porridge', label: 'Porridge' },
 { value: 'Yogurt Melts', label: 'Yogurt Melts' }
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
 const sorted = [...res.data.data].sort((a, b) => {
 const numA = parseInt((a.code || '').replace(/\D/g, '') || '0', 10);
 const numB = parseInt((b.code || '').replace(/\D/g, '') || '0', 10);
 return numB - numA;
 });
 setMaterials(sorted);
 }

 try {
 const deletedRes = await api.get('/api/materials?type=Deleted');
 if (deletedRes.data && deletedRes.data.success && Array.isArray(deletedRes.data.data)) {
 setDeletedMaterialsHistory(prev => {
 const combinedMap = new Map();
 prev.forEach(item => {
 const key = item._id || item.code || item.name;
 if (key) combinedMap.set(key.toString().toUpperCase(), item);
 });
 deletedRes.data.data.forEach(item => {
 const key = item._id || item.code || item.name;
 if (key) {
 const existing = combinedMap.get(key.toString().toUpperCase());
 combinedMap.set(key.toString().toUpperCase(), { ...existing, ...item, status: 'Deleted', isDeletedHistoryItem: true });
 }
 });
 return Array.from(combinedMap.values());
 });
 }
 } catch (e) {
 console.warn("Failed to fetch deleted materials from server", e);
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
 if (!currData.name.trim() && !currData.description.trim()) {
 return currData;
 }

 const now = new Date().toLocaleTimeString();
 let targetId = activeDraftIdRef.current;

 if (!targetId) {
 targetId = `draft_mat_${Date.now()}`;
 activeDraftIdRef.current = targetId;
 setCurrentDraftId(targetId);
 }

 setDrafts((prevDrafts) => {
 const existingIndex = prevDrafts.findIndex((d) => d.id === targetId);
 let updated = [...prevDrafts];
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
 }, [isModalOpen, editingId]);

 const handleSaveAsDraft = () => {
 if (!formData.name.trim() && !formData.description.trim()) {
 showToast("Please enter material details before saving draft.","error");
 return;
 }
 const now = new Date().toLocaleTimeString();
 const targetId = activeDraftIdRef.current || currentDraftId || `draft_mat_${Date.now()}`;
 const draftEntry = {
 id: targetId,
 timestamp: now,
 data: formData
 };
 setDrafts((prev) => {
 const filtered = prev.filter((d) => d.id !== targetId);
 const updated = [draftEntry, ...filtered].slice(0, 10);
 localStorage.setItem('erp_material_drafts', JSON.stringify(updated));
 return updated;
 });
 activeDraftIdRef.current = null;
 setCurrentDraftId(null);
 setIsModalOpen(false);
 showToast("Material configuration saved as draft.","success");
 };

 const handleLoadDraft = (draft) => {
 setEditingId(null);
 activeDraftIdRef.current = draft.id;
 setCurrentDraftId(draft.id);
 setFormData(draft.data);
 setFormErrors({});
 setIsModalOpen(true);
 setShowDraftsList(false);
 setDraftMessage(`Restored draft from ${draft.timestamp}`);
 };

 const handleDiscardDraft = (draftId, e) => {
 if (e && e.stopPropagation) e.stopPropagation();
 if (!window.confirm('Discard this draft?')) return;
 if (currentDraftId === draftId || activeDraftIdRef.current === draftId) {
 activeDraftIdRef.current = null;
 setCurrentDraftId(null);
 }
 setDrafts((prev) => {
 const filtered = prev.filter((d) => d.id !== draftId);
 localStorage.setItem('erp_material_drafts', JSON.stringify(filtered));
 return filtered;
 });
 showToast("Draft discarded.","info");
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

 const handleRowSelect = (id) => {
 setSelectedRowIds(prev => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 const handleResetAllFilters = () => {
 setSearch('');
 setTypeFilter('');
 setStatus('');
 setSourceFilter('');
 setColumnFilters({});
 setTempFilters({});
 setFilterSearchText({});
 };

 const renderFilterPopupContent = (col) => {
 let rawOptions = [];
 if (col === 'status') {
 rawOptions = ["Active","Inactive","Draft","Deleted"];
 } else if (col === 'type') {
 const predefined = ["Raw Material","Packaging","Finished","Services"];
 const dynamic = getUniqueValues('type');
 rawOptions = Array.from(new Set([...predefined, ...dynamic])).filter(Boolean).sort();
 } else {
 rawOptions = getUniqueValues(col);
 }

 const searchStr = (filterSearchText[col] || '').toLowerCase().trim();
 const filteredOptions = rawOptions.filter(val => {
 if (val.toLowerCase().includes(searchStr)) return true;
 if (col === 'name') {
 const matchingMaterials = materials.filter(m => (m.name || '').toLowerCase() === val.toLowerCase());
 const hasMatchingCategory = matchingMaterials.some(m => 
 (m.type || '').toLowerCase().includes(searchStr) || 
 (m.subcategory || '').toLowerCase().includes(searchStr)
 );
 if (hasMatchingCategory) return true;
 }
 return false;
 });

 const colTitle = col === 'name' ? 'Material Name' 
 : col === 'unit' ? 'UOM' 
 : col === 'type' ? 'Category' 
 : col === 'subcategory' ? 'Sub-Category' 
 : col.charAt(0).toUpperCase() + col.slice(1);

 return (
 <div className="space-y-2">
 <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b">
 Filter {colTitle}
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
 <span className={col === 'unit' ? 'uppercase' : 'truncate'}>{opt}</span>
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
 className="text-[10px] font-bold px-2.5 py-1 rounded transition-colors btn-premium"
 >
 Apply Filter
 </button>
 </div>
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
 body { font-family: -apple-system, BlinkMacSystemFont,"Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; margin: 0; }
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
 if (m.code && m.status !== 'Deleted') {
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
 if (baseSequence !== null && baseSequence !== undefined) {
 const raw = String(baseSequence).replace(/^[Mm]+/, '');
 const num = parseInt(raw, 10);
 if (!isNaN(num)) return num;
 }
 
 let maxCounter = 1000;
 materials.forEach(m => {
 if (m.code && m.status !== 'Deleted') {
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
 
 let nextCodeStr = getNextManualCode();
 try {
 const res = await api.get('/api/materials/sequence-peek');
 if (res.data && res.data.nextCode) {
 const rawCode = String(res.data.nextCode);
 nextCodeStr = rawCode.startsWith('M') ? rawCode : `M${rawCode}`;
 }
 } catch (e) {
 console.warn("Failed to fetch sequence peek", e);
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
 const dataToExport = filteredMaterials.map(m => ({"Material Name": m.name,"Material Code": m.code,"UOM": m.unit,"Category": m.type,"Sub Category": m.subcategory || '',"Status": m.status || 'Active',"Description": m.description || ''
 }));

 if (dataToExport.length === 0) {
 showToast("No data to export","error");
 return;
 }

 const ws = XLSX.utils.json_to_sheet(dataToExport);
 const wb = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb, ws,"Material Master");
 XLSX.writeFile(wb,"material_master_export.xlsx");
 showToast(`Exported ${dataToExport.length} materials successfully!`);
 };

 const handleAddToAllMaterials = async () => {
 if (!sourceFilter) return;
 if (!window.confirm(`Are you sure you want to add all materials from"${sourceFilter}" to All Materials? This will merge them into the master list and remove the sheet isolation.`)) return;
 
 setSubmitLoading(true);
 try {
 const sheetMaterials = materials.filter(m => m.importSource === sourceFilter);
 if (sheetMaterials.length === 0) {
 showToast("No materials found in this sheet.","error");
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
 showToast(`Successfully merged ${sheetMaterials.length} materials into All Materials.`,"success");
 setSourceFilter('');
 fetchMaterials();
 }
 } catch (err) {
 console.error(err);
 const errMsg = err.response?.data?.error || err.message ||"Failed to merge sheet data";
 showToast(errMsg,"error");
 } finally {
 setSubmitLoading(false);
 }
 };

 const handleDownloadTemplate = () => {
 const headers = [
 { name:"Raw Cumin Powder", code:"00001", unit:"kg", type:"Raw Material", subcategory:"Fresh", status:"Active", description:"Fresh premium raw cumin seeds grinded" },
 { name:"Premium Mango Puree", code:"02000", unit:"L", type:"Finished", subcategory:"Puree", status:"Active", description:"Processed mango puree ready for packaging" }
 ];
 const ws = XLSX.utils.json_to_sheet(headers);
 const wb = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb, ws,"Material Template");
 XLSX.writeFile(wb,"material_import_template.xlsx");
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
 : type === 'Finished' || type === 'Finished Goods' ? 'Finished'
 : type === 'Packing' || type === 'Packing Material' || type === 'Packaged Material' ? 'Packaged Material'
 : type === 'Semi-Finished' ? 'Semi-Finished' : null;
 if (!normalizedType) {
 errors.push(`Invalid Category '${type || ''}'. Must be Raw Material, Finished, Packaged Material, or Semi-Finished.`);
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
 // Not found → auto-generate code from 2001+

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
 const newType = normalizedType || type;

 const fieldDefs = [
 { label: 'Name', oldVal: existingByCode.name || '', newVal: name },
 { label: 'UOM', oldVal: existingByCode.unit || '', newVal: unit },
 { label: 'Category', oldVal: existingByCode.type || '', newVal: newType },
 { label: 'Sub-Category', oldVal: existingByCode.subcategory || '', newVal: newSubcat },
 { label: 'Status', oldVal: existingByCode.status || '', newVal: newStatus },
 { label: 'Description', oldVal: existingByCode.description || '', newVal: description },
 ];

 fieldChanges = fieldDefs.filter(f =>
 f.oldVal.toString().trim().toLowerCase() !== f.newVal.toString().trim().toLowerCase()
 );

 if (fieldChanges.length === 0) {
 warnings.push(`Code '${finalCode}': No changes detected — data is identical to the database record.`);
 } else {
 warnings.push(`Code '${finalCode}': ${fieldChanges.length} field(s) will be updated. Review and confirm.`);
 }
 } else {
 errors.push(`Material code '${finalCode}' does not exist in database. Bulk Update can only update existing materials. Please use Bulk Entry to create new materials.`);
 }

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
 errors.push(`Material '${name}' does not exist in database. Bulk Update can only update existing materials. Please use Bulk Entry to create new materials.`);
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
 showToast("Import file is empty","error");
 return;
 }

 const rawRowsMapped = rows.map(row => {
 return {
 name: (getRowValueIgnoreCase(row, ["materialname","name","material_name","material name"]) || '').toString().trim(),
 code: (getRowValueIgnoreCase(row, ["materialcode","code","material_code","material code"]) || '').toString().trim(),
 unit: (getRowValueIgnoreCase(row, ["unit","uom","unitofmeasurement","unit of measurement"]) || '').toString().trim(),
 type: (getRowValueIgnoreCase(row, ["type","category","materialtype","material type"]) || '').toString().trim(),
 subcategory: (getRowValueIgnoreCase(row, ["subcategory","sub-category","sub category","sub_category"]) || '').toString().trim(),
 description: (getRowValueIgnoreCase(row, ["description","desc","notes","materialdescription","material description"]) || '').toString().trim(),
 status: (getRowValueIgnoreCase(row, ["status","state"]) || 'Active').toString().trim()
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
 if (rowCode) {
 if (deletedCodes.has(rowCode)) {
 foundConflict = true;
 break;
 }
 if (isAutoEntry && activeCodes.has(rowCode)) {
 foundConflict = true;
 break;
 }
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

 if (!isAutoEntry && summary.existingMatchCount === 0) {
 setMaterialBlockingPopupMessage("Bulk Update cannot be used for new data. Please enter the data first using Bulk Entry or Manual Entry.");
 setIsImportModalOpen(false);
 setImportSummary(null);
 if (fileInputRef.current) fileInputRef.current.value = '';
 return;
 }

 setImportSummary(summary);
 setEditableAcceptedItems(processedItems);
 setEditingPreviewIdx(null);
 setImportSearch('');
 } catch (err) {
 console.error(err);
 showToast("Error reading Excel data files","error");
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
 if (!code) return false;
 if (deletedCodes.has(code)) return true;
 if (!item.isExistingMatch && activeCodes.has(code)) return true;
 return false;
 });
 if (duplicates.length > 0) {
 alert("This file data already is in database which is presented in deleted rows & sheets status.");
 showToast("Ingestion aborted: Duplicate data detected.","error");
 return;
 }

 if (validToImport.length === 0) {
 showToast("No items to import. All existing matches may have been skipped.","error");
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
 const inserted = res.data.insertedCount || 0;
 const updated = res.data.updatedCount || 0;
 const skipped = skippedItems.size;
 const autoKept = noChangeItems.length;
 const errors = (importSummary.rejectedCount || 0) + (importSummary.duplicateCount || 0) + (res.data.errorsCount || 0);

 let parts = [];
 if (inserted > 0) parts.push(`${inserted} new added`);
 if (updated > 0) parts.push(`${updated} updated`);
 if (autoKept > 0) parts.push(`${autoKept} unchanged kept`);
 if (skipped > 0) parts.push(`${skipped} skipped`);
 if (errors > 0) parts.push(`${errors} errors`);

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
 showToast("Material Name is required","error");
 return;
 }
 if (!editRowData.code.trim()) {
 showToast("Material Code is required","error");
 return;
 }

 let finalCode = editRowData.code.trim().toUpperCase();
 if (!finalCode.startsWith('M') && /^\d+$/.test(finalCode)) {
 finalCode = `M${finalCode}`;
 }

 const codeConflict = materials.some(m => m._id !== id && m.code.toUpperCase() === finalCode);
 if (codeConflict) {
 showToast(`Material Code '${finalCode}' is already in use`,"error");
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
 const errMsg = err.response?.data?.error ||"Failed to persist modifications.";
 showToast(errMsg,"error");
 }
 };

 const handleOpenEditModal = (mat) => {
 setIsEditingDeletedRecord(!!mat.isDeletedHistoryItem);
 setEditingId(mat._id);
 const normalizedType = mat.type === 'Raw' || mat.type === 'Raw Material' ? 'Raw Material' 
 : mat.type === 'Finished' || mat.type === 'Finished Goods' ? 'Finished'
 : mat.type === 'Packing' || mat.type === 'Packing Material' || mat.type === 'Packaged Material' ? 'Packaged Material' : 'Raw Material';
 
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

 const handleBatchEdit = () => {
 const itemsToEdit = materials.filter(m => selectedRowIds.has(m._id || m.code || m.name));
 if (itemsToEdit.length > 0) {
 setBatchEditItems(itemsToEdit.map(i => ({...i})));
 setBatchEditIdx(0);
 const firstItem = itemsToEdit[0];
 const normalizedType = firstItem.type === 'Raw' || firstItem.type === 'Raw Material' ? 'Raw Material' 
 : firstItem.type === 'Finished' || firstItem.type === 'Finished Goods' ? 'Finished'
 : firstItem.type === 'Packing' || firstItem.type === 'Packing Material' || firstItem.type === 'Packaged Material' ? 'Packaged Material' : 'Raw Material';
 const subcats = subcategoryMap[normalizedType] || [];
 const matched = subcats.find(s => s.value.toLowerCase() === (firstItem.subcategory || '').toLowerCase());
 const finalSubcat = matched ? matched.value : (subcats.length > 0 ? subcats[0].value : '');

 setFormData({
 name: firstItem.name,
 code: firstItem.code,
 unit: firstItem.unit,
 type: normalizedType,
 subcategory: finalSubcat,
 status: firstItem.status || 'Active',
 description: firstItem.description || ''
 });
 setFormErrors({});
 setIsBatchEditModalOpen(true);
 }
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
 if (!finalCode.startsWith('M') && /^\d+$/.test(finalCode)) {
 finalCode = `M${finalCode}`;
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
 : nextItem.type === 'Finished' || nextItem.type === 'Finished Goods' ? 'Finished'
 : nextItem.type === 'Packing' || nextItem.type === 'Packing Material' || nextItem.type === 'Packaged Material' ? 'Packaged Material' : 'Raw Material';
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
 showToast("Batch editing completed successfully!","success");
 setIsBatchEditModalOpen(false);
 fetchMaterials();
 }
 } catch (err) {
 console.error(err);
 const errMsg = err.response?.data?.error ||"Failed to save edits.";
 showToast(errMsg,"error");
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
 : prevItem.type === 'Finished' || prevItem.type === 'Finished Goods' ? 'Finished'
 : prevItem.type === 'Packing' || prevItem.type === 'Packing Material' || prevItem.type === 'Packaged Material' ? 'Packaged Material' : 'Raw Material';
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
 if (!finalCode.startsWith('M') && /^\d+$/.test(finalCode)) {
 finalCode = `M${finalCode}`;
 }

 const activeId = isBatchEditModalOpen 
 ? (batchEditItems[batchEditIdx]?._id) 
 : editingId;

 const existsInActive = materials.some(m => m._id !== activeId && (m.code || '').toUpperCase() === finalCode);
 const existsInDeleted = deletedMaterialsHistory.some(d => d._id !== activeId && (d.code || '').toUpperCase() === finalCode);
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
 if (!finalCode.startsWith('M') && /^\d+$/.test(finalCode)) {
 finalCode = `M${finalCode}`;
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
 showToast("Deleted material record updated locally.","success");
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
 const targetId = activeDraftIdRef.current || currentDraftId;
 if (targetId) {
 setDrafts((prev) => {
 const filtered = prev.filter((d) => d.id !== targetId);
 localStorage.setItem('erp_material_drafts', JSON.stringify(filtered));
 return filtered;
 });
 activeDraftIdRef.current = null;
 setCurrentDraftId(null);
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



 const handleRestoreSelectedMaterials = async () => {
 const ids = Array.from(selectedRowIds);
 if (ids.length === 0) return;
 if (!window.confirm(`Restore ${ids.length} selected material(s)?`)) return;
 let restored = 0, failed = 0;
 const restoredMaterialIds = [];
 let currentActiveMaterials = [...materials];

 for (const id of ids) {
 const item = deletedMaterialsHistory.find(m => (m._id || m.code || m.name) === id);
 if (item) {
 try {
 const result = await resolveMaterialConflictAndRestore(item, currentActiveMaterials);
 if (result.item) {
 currentActiveMaterials.push(result.item);
 }
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
 showToast(`Success Notification: ${restored} material(s) restored successfully!`,"success");
 setSelectedRowIds(new Set());
 fetchMaterials();
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
 const selectedStatuses = columnFilters['status'] || [];
 const isDeletedSelected = status === 'Deleted' || selectedStatuses.includes('Deleted');
 
 if (isDeletedSelected) {
 list = [...materials, ...deletedMaterialsHistory.map(d => ({ ...d, status: 'Deleted', isDeletedHistoryItem: true }))];
 }

 return list.filter(mat => {
 const matStatus = mat.status || 'Active';

 // 1. Top Status Dropdown Filter
 if (status === 'Deleted') {
 if (matStatus !== 'Deleted' && !mat.isDeletedHistoryItem) return false;
 } else if (status) {
 if (matStatus !== status) return false;
 } else {
 // Default"All status" should NOT show deleted items unless header filter selected 'Deleted'
 if ((matStatus === 'Deleted' || mat.isDeletedHistoryItem) && !selectedStatuses.includes('Deleted')) {
 return false;
 }
 }

 // 2. Search Query Filter
 if (search.trim()) {
 const q = search.toLowerCase().trim();
 const nameMatch = (mat.name || '').toLowerCase().includes(q);
 const codeMatch = (mat.code || '').toLowerCase().includes(q);
 const catMatch = (mat.type || '').toLowerCase().includes(q);
 if (!nameMatch && !codeMatch && !catMatch) return false;
 }

 // 3. Category Filter
 if (typeFilter && (mat.type || '') !== typeFilter) {
 return false;
 }

 // 4. Import Source File Filter
 if (sourceFilter) {
 if (sourceFilter === 'Manual Entry') {
 if (mat.importSource) return false;
 } else {
 if (mat.importSource !== sourceFilter) return false;
 }
 }

 // 5. Grid Column Filters
 for (const col in columnFilters) {
 const selectedVals = columnFilters[col];
 if (selectedVals && selectedVals.length > 0) {
 let attrVal = col === 'unit' ? (mat.unit || '') : col === 'type' ? (mat.type || '') : (mat[col] || '');
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
 }, [search, typeFilter, status, sourceFilter, columnFilters]);

 return (
 <div className="space-y-3 w-full">
 {/* Search & Filters */}
 <Card className="shadow-none border overflow-visible relative z-30 glass-panel">
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

 <Button
 size="sm"
 variant={isSelectionMode ?"solid" :"outline"}
 onClick={() => {
 setIsSelectionMode(!isSelectionMode);
 if (isSelectionMode) setSelectedRowIds(new Set());
 }}
 className={`h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold text-xs shadow-sm transition-colors ${isSelectionMode ? 'bg-blue-600 text-white hover:bg-blue-700 border-transparent' : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'}`}
 >
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
 <span>{isSelectionMode ? 'Cancel Selection' : 'Select Options'}</span>
 </Button>

 {isSelectionMode && selectedRowIds.size > 0 && status !== 'Deleted' && (
 <button
 onClick={handleBatchEdit}
 className="h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm text-xs transition-colors"
 >
 <Edit2 className="h-3.5 w-3.5" />
 <span>Edit Selected ({selectedRowIds.size})</span>
 </button>
 )}

 {isSelectionMode && selectedRowIds.size > 0 && status !== 'Deleted' && (
 <button
 onClick={handleDeleteSelectedMaterials}
 className="h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold bg-white text-slate-600 border border-slate-300 hover:border-red-600 hover:text-red-600 hover:bg-red-50 transition-colors shadow-sm text-xs"
 >
 <Trash2 className="h-3.5 w-3.5" />
 <span>Delete Selected ({selectedRowIds.size})</span>
 </button>
 )}

 {(isSelectionMode || status === 'Deleted') && selectedRowIds.size > 0 && status === 'Deleted' && (
 <button
 onClick={handleRestoreSelectedMaterials}
 className="h-7 flex items-center space-x-1.5 rounded-md px-3 font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-xs animate-pulse"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 <span>Restore Selected ({selectedRowIds.size})</span>
 </button>
 )}

 {(search || typeFilter || status || sourceFilter || Object.values(columnFilters).some(v => v && v.length > 0)) && (
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
 <option value="">All Categories</option>
 <option value="Raw Material">Raw Material</option>
 <option value="Packaged Material">Packaged Material</option>
 <option value="Finished">Finished</option>
 <option value="Semi-Finished">Semi-Finished</option>
 <option value="Services">Services</option>
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
 <option value="Deleted">Deleted Sheets & Rows ({deletedMaterialsHistory.length})</option>
 </select>

 <div className="relative z-[60]">
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
 <button onClick={() => {
 setShowFunctionList(false);
 if (materials.length === 0) {
 setMaterialBlockingPopupMessage("No material data exists in the database. Please enter material data first using Bulk Entry or Manual Entry.");
 return;
 }
 setImportSummary(null);
 setIsAutoEntry(false);
 setIsImportModalOpen(true);
 }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 font-medium">
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
 label: `Search:"${search}"`,
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
 if (status) {
 activeTags.push({
 id: 'statusFilter',
 label: `Status: ${status}`,
 onClear: () => setStatus('')
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
 <Card className="bg-slate-50/50 shadow-none border glass-panel">
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
 className="text-[10px] font-bold px-2 py-0.5 rounded transition-colors btn-premium"
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
 <Card className="shadow-none border overflow-visible glass-panel">
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
 <Table className="border border-slate-200 w-full table-fixed text-xs">
 <TableHeader className="bg-slate-50 border-b border-slate-200 relative z-20">
 <TableRow>
 {(isSelectionMode || status ==="Deleted") && (
 <TableHead className="!px-2.5 !py-1.5 w-[40px] max-w-[40px] text-center border-r border-slate-200 relative z-20">
 <input
 type="checkbox"
 className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
 checked={filteredMaterials.length > 0 && filteredMaterials.every(m => selectedRowIds.has(m._id || m.code || m.name))}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedRowIds(new Set(filteredMaterials.map(m => m._id || m.code || m.name)));
 } else {
 setSelectedRowIds(new Set());
 }
 }}
 />
 </TableHead>
 )}
 
 {/* 1. Material Name */}
 <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[160px] max-w-[160px] whitespace-nowrap relative group ${activeFilterCol === 'name' ? 'z-50' : 'z-10'}`}>
 <div className="flex items-center justify-between">
 <span>Material Name</span>
 <button
 onClick={(e) => toggleFilterPopup('name', e)}
 className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
 (columnFilters['name'] && columnFilters['name'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
 }`}
 title="Filter Material Name"
 >
 <Filter className="h-2.5 w-2.5" />
 </button>
 </div>
 {activeFilterCol === 'name' && (
 <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
 {renderFilterPopupContent('name')}
 </div>
 )}
 </TableHead>

 {/* 2. Code */}
 <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[80px] max-w-[80px] whitespace-nowrap relative group ${activeFilterCol === 'code' ? 'z-50' : 'z-10'}`}>
 <div className="flex items-center justify-between">
 <span>Code</span>
 <button
 onClick={(e) => toggleFilterPopup('code', e)}
 className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
 (columnFilters['code'] && columnFilters['code'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
 }`}
 title="Filter Code"
 >
 <Filter className="h-2.5 w-2.5" />
 </button>
 </div>
 {activeFilterCol === 'code' && (
 <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
 {renderFilterPopupContent('code')}
 </div>
 )}
 </TableHead>

 {/* 3. UOM */}
 <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[65px] max-w-[65px] whitespace-nowrap relative group ${activeFilterCol === 'unit' ? 'z-50' : 'z-10'}`}>
 <div className="flex items-center justify-between">
 <span>UOM</span>
 <button
 onClick={(e) => toggleFilterPopup('unit', e)}
 className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
 (columnFilters['unit'] && columnFilters['unit'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
 }`}
 title="Filter UOM"
 >
 <Filter className="h-2.5 w-2.5" />
 </button>
 </div>
 {activeFilterCol === 'unit' && (
 <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
 {renderFilterPopupContent('unit')}
 </div>
 )}
 </TableHead>

 {/* 4. Category */}
 <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[110px] max-w-[110px] whitespace-nowrap relative group ${activeFilterCol === 'type' ? 'z-50' : 'z-10'}`}>
 <div className="flex items-center justify-between">
 <span>Category</span>
 <button
 onClick={(e) => toggleFilterPopup('type', e)}
 className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
 (columnFilters['type'] && columnFilters['type'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
 }`}
 title="Filter Category"
 >
 <Filter className="h-2.5 w-2.5" />
 </button>
 </div>
 {activeFilterCol === 'type' && (
 <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
 {renderFilterPopupContent('type')}
 </div>
 )}
 </TableHead>

 {/* 5. Sub-Category */}
 <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[130px] max-w-[130px] whitespace-nowrap relative group ${activeFilterCol === 'subcategory' ? 'z-50' : 'z-10'}`}>
 <div className="flex items-center justify-between">
 <span>Sub-Category</span>
 <button
 onClick={(e) => toggleFilterPopup('subcategory', e)}
 className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
 (columnFilters['subcategory'] && columnFilters['subcategory'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
 }`}
 title="Filter Sub-Category"
 >
 <Filter className="h-2.5 w-2.5" />
 </button>
 </div>
 {activeFilterCol === 'subcategory' && (
 <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
 {renderFilterPopupContent('subcategory')}
 </div>
 )}
 </TableHead>

 {/* 6. Status */}
 <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-[75px] max-w-[75px] whitespace-nowrap relative group ${activeFilterCol === 'status' ? 'z-50' : 'z-10'}`}>
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

 {/* 7. Description */}
 <TableHead className={`!px-2 !py-0.5 text-left text-slate-600 font-bold text-[11px] border-r border-slate-200 w-auto relative group ${activeFilterCol === 'description' ? 'z-50' : 'z-10'}`}>
 <div className="flex items-center justify-between">
 <span>Description</span>
 <button
 onClick={(e) => toggleFilterPopup('description', e)}
 className={`p-0.5 rounded hover:bg-slate-200 transition-colors ml-1 ${
 (columnFilters['description'] && columnFilters['description'].length > 0) ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
 }`}
 title="Filter Description"
 >
 <Filter className="h-2.5 w-2.5" />
 </button>
 </div>
 {activeFilterCol === 'description' && (
 <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg z-50 p-2 text-left font-normal normal-case">
 {renderFilterPopupContent('description')}
 </div>
 )}
 </TableHead>

 {/* 8. Actions */}
 <TableHead className="!px-2 !py-0.5 text-center text-slate-600 font-bold text-[11px] w-[110px] max-w-[110px]">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredMaterials.map((mat) => (
 <TableRow
 key={mat._id}
 onClick={() => setSelectedMaterialId(selectedMaterialId === mat._id ? null : mat._id)}
 className={`hover:bg-slate-50/50 border-b border-slate-200 cursor-pointer transition-all ${
 selectedRowIds.has(mat._id || mat.code || mat.name)
 ? 'bg-blue-50/40 hover:bg-blue-50/50'
 : selectedMaterialId === mat._id ? 'bg-blue-50/40 hover:bg-blue-50/50 border-l-2 border-l-blue-600' : ''
 } ${
 (mat.status === 'Deleted' || status === 'Deleted') ? 'bg-red-50/70 hover:bg-red-100/80 border-l-[4px] border-l-red-600 text-red-900 font-semibold' : ''
 }`}
 >
 {(isSelectionMode || status ==="Deleted") && (
 <TableCell className="!px-2.5 !py-1.5 text-left border-r border-slate-200 w-[40px] max-w-[40px] text-center" onClick={(e) => { e.stopPropagation(); handleRowSelect(mat._id || mat.code || mat.name); }}>
 <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer" checked={selectedRowIds.has(mat._id || mat.code || mat.name)} onClick={(e) => e.stopPropagation()} onChange={() => handleRowSelect(mat._id || mat.code || mat.name)} />
 </TableCell>
 )}
 
 {/* 1. Material Name */}
 <TableCell className="!px-2 !py-0.5 text-left border-r border-slate-200 w-[160px] max-w-[160px] whitespace-nowrap">
 <div className="relative group min-w-0 flex-1">
 <span className="block truncate text-xs text-slate-700 font-semibold cursor-pointer capitalize" title={mat.name || ''}>
 {(mat.name || '').toLowerCase()}
 </span>
 {mat.name && (
 <div className="absolute hidden group-hover:block left-full ml-2 top-1/2 -translate-y-1/2 z-50 bg-slate-900 text-white text-xs py-0.5 px-2 rounded border border-slate-800 shadow-md whitespace-nowrap font-semibold pointer-events-none capitalize">
 {mat.name}
 </div>
 )}
 </div>
 </TableCell>

 {/* 2. Code */}
 <TableCell className="!px-2 !py-0.5 font-mono text-[11px] border-r border-slate-200 w-[80px] max-w-[80px] whitespace-nowrap">
 <div className="relative group max-w-[80px]">
 <button
 onClick={() => handleViewDetails(mat)}
 className="block truncate text-blue-600 font-bold hover:underline focus:outline-none text-left w-full text-[11px] cursor-pointer"
 title="View material details"
 >
 {mat.code}
 </button>
 <div className="absolute hidden group-hover:block left-full ml-2 top-1/2 -translate-y-1/2 z-50 bg-slate-900 text-white text-xs py-0.5 px-2 rounded border border-slate-800 shadow-md whitespace-nowrap font-semibold pointer-events-none font-sans capitalize-none">
 {mat.code}
 </div>
 </div>
 </TableCell>

 {/* 3. UOM */}
 <TableCell className="!px-2 !py-0.5 font-semibold text-xs text-slate-600 border-r border-slate-200 w-[65px] max-w-[65px] truncate whitespace-nowrap">{mat.unit}</TableCell>

 {/* 4. Category */}
 <TableCell className="!px-2 !py-0.5 border-r border-slate-200 w-[110px] max-w-[110px] truncate whitespace-nowrap">
 <span className="text-xs text-slate-700 capitalize block truncate" title={mat.type}>
 {mat.type}
 </span>
 </TableCell>

 {/* 5. Sub-Category */}
 <TableCell className="!px-2 !py-0.5 border-r border-slate-200 w-[130px] max-w-[130px] truncate whitespace-nowrap">
 {mat.subcategory ? (
 <span className="text-xs text-slate-700 capitalize block truncate cursor-pointer text-left" title={mat.subcategory}>
 {mat.subcategory}
 </span>
 ) : (
 <span className="text-slate-400 italic text-xs block text-left pl-2">-</span>
 )}
 </TableCell>

 {/* 6. Status */}
 <TableCell className="!px-2 !py-0.5 border-r border-slate-200 w-[75px] max-w-[75px] truncate whitespace-nowrap">
 {mat.status === 'Active' ? (
 <span className="text-green-600 font-semibold text-xs">Active</span>
 ) : mat.status === 'Inactive' ? (
 <span className="text-slate-500 font-semibold text-xs">Inactive</span>
 ) : mat.status === 'Draft' ? (
 <span className="text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px]">Draft</span>
 ) : (
 <span className="text-slate-500 font-medium text-xs">{mat.status || 'Active'}</span>
 )}
 </TableCell>

 {/* 7. Description */}
 <TableCell className="!px-2 !py-0.5 text-xs text-slate-500 border-r border-slate-200 w-auto whitespace-nowrap">
 <div className="relative group w-full">
 <span className="block truncate cursor-pointer text-xs text-slate-500" title={mat.description || ''}>
 {mat.description || '-'}
 </span>
 {mat.description && (
 <div className="absolute hidden group-hover:block bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs py-0.5 px-2 rounded border border-slate-800 shadow-md whitespace-nowrap font-semibold pointer-events-none">
 {mat.description}
 </div>
 )}
 </div>
 </TableCell>

 {/* 8. Actions */}
 <TableCell className="!px-2 !py-0.5 text-center border-r border-slate-200 w-[110px] max-w-[110px]">
 {(mat.isDeletedHistoryItem || mat.status === 'Deleted' || status === 'Deleted') ? (
 <div className="flex items-center justify-center space-x-2 text-slate-400">
 <button
 onClick={(e) => { e.stopPropagation(); handleViewDetails(mat); }}
 className="hover:text-blue-600 transition-colors"
 title="View Material Details"
 >
 <Eye className="h-3.5 w-3.5" />
 </button>
 <button
 onClick={(e) => { e.stopPropagation(); handleRestoreMaterial(mat); }}
 className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 p-1 rounded font-bold text-xs flex items-center space-x-1 transition-colors"
 title="Restore Material"
 >
 <RefreshCw className="h-3.5 w-3.5 text-emerald-600" />
 <span className="text-[10px]">Restore</span>
 </button>
 </div>
 ) : (
 <div className="flex items-center justify-center space-x-3 text-slate-400">
 <button
 onClick={(e) => { e.stopPropagation(); handleViewDetails(mat); }}
 className="hover:text-blue-600 transition-colors"
 title="View Material Details"
 >
 <Eye className="h-3.5 w-3.5" />
 </button>
 <button
 onClick={(e) => { e.stopPropagation(); handleOpenEditModal(mat); }}
 disabled={!!importSummary}
 className={`hover:text-blue-600 transition-colors ${!!importSummary ? 'cursor-not-allowed opacity-50' : ''}`}
 title={!!importSummary ?"Edit disabled in Bulk Entry mode" :"Edit Record"}
 >
 <Edit2 className="h-3.5 w-3.5" />
 </button>
 <button
 onClick={(e) => { e.stopPropagation(); handleDeleteMaterial(mat._id); }}
 className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
 title="Delete Material"
 >
 <Trash2 className="h-4 w-4" />
 </button>
 </div>
 )}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </>
 )}
 </CardContent>
 </Card>
 
 {/* CRUD Form Modal — Big Screen Format */}
 <Dialog
 isOpen={isModalOpen}
 onClose={handleCloseModal}
 title={editingId ? 'Edit Material Details' : 'Register New Material'}
 className="!max-w-[85vw] !w-[85vw] !rounded-xl p-6 shadow-2xl border border-slate-200"
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
 { value: 'Finished', label: 'Finished' },
 { value: 'Semi-Finished', label: 'Semi-Finished' },
 { value: 'Packaged Material', label: 'Packaged Material' }
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
 {!editingId && (
 <Button
 type="button"
 variant="outline"
 size="sm"
 onClick={handleSaveAsDraft}
 className="border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100 !px-4 !py-2 text-xs font-bold flex items-center space-x-1"
 >
 <Save className="h-3.5 w-3.5" />
 <span>Save as Draft</span>
 </Button>
 )}
 <Button type="submit" size="sm" isLoading={submitLoading} className="font-bold !px-6 !py-2 text-xs shadow-md btn-premium">
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

 {/* Batch Edit Wizard Modal — Big Screen Format */}
 <Dialog
 isOpen={isBatchEditModalOpen}
 onClose={() => setIsBatchEditModalOpen(false)}
 title={`Batch Edit - Item ${batchEditIdx + 1} of ${batchEditItems.length}`}
 className="!max-w-[85vw] !w-[85vw] !rounded-xl p-6 shadow-2xl border border-slate-200"
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
 { value: 'Finished', label: 'Finished' },
 { value: 'Semi-Finished', label: 'Semi-Finished' },
 { value: 'Packaged Material', label: 'Packaged Material' }
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
 className="font-bold btn-premium"
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
 className={isAutoEntry ?"!max-w-[65vw] !w-[65vw] !rounded-none" :"!max-w-[92vw] !w-[92vw] !rounded-none"}
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
 className="font-bold px-5 flex items-center space-x-1.5 rounded shadow btn-premium"
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
 <div className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-[10px] font-semibold my-1">
 <svg className="h-3.5 w-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
 <span>Read-Only Preview — New material records will be added directly to Master Material with assigned M-codes. Editing is not allowed during bulk entry.</span>
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
 isSkipped ? 'bg-slate-50 border-slate-200 text-slate-400' :
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
 { key: 'changed', label: `Changed (${changedItems.length})`, color: 'text-orange-600 border-orange-400', active: 'bg-orange-50 border-orange-400' },
 { key: 'nochange', label: `No Change (${noChangeItems.length})`, color: 'text-slate-500 border-slate-200', active: 'bg-slate-50 border-slate-400' },
 { key: 'new', label: `New (${newItems.length})`, color: 'text-emerald-600 border-emerald-300', active: 'bg-emerald-50 border-emerald-400' },
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

 if (bulkUpdateTab === 'changed') return item.isExistingMatch && item.fieldChanges && item.fieldChanges.length > 0;
 if (bulkUpdateTab === 'nochange') return item.isExistingMatch && (!item.fieldChanges || item.fieldChanges.length === 0);
 if (bulkUpdateTab === 'new') return !item.isExistingMatch;
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
 const isSkipped = skippedItems.has(idx);
 const hasChanges = item.fieldChanges && item.fieldChanges.length > 0;
 const isEditing = editingPreviewIdx === idx;
 return (
 <div key={idx} className={`rounded-lg border text-xs transition-all ${
 item.isExistingMatch
 ? isConfirmed ? 'border-emerald-200 bg-emerald-50'
 : isSkipped ? 'border-slate-200 bg-slate-50 opacity-50'
 : 'border-blue-200 bg-white shadow-sm'
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
 className="font-bold px-3 py-1 rounded text-[10px] transition-colors shadow-sm btn-premium"
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
 <option value="Finished">Finished</option>
 <option value="Semi-Finished">Semi-Finished</option>
 <option value="Packaged Material">Packaged Material</option>
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
 const systemExistingCodes = materials.map(m => (m.code || '').toUpperCase().trim());
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
 title={materialBlockingPopupMessage.includes("Bulk Update") ?"Bulk Update System Notice" :"Ingestion Blocked — Notice"}
 className="!max-w-[440px] !w-[440px] !rounded-xl"
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

 {/* Confirm Delete Dialog */}
 <ConfirmDeleteDialog
   isOpen={deleteConfirmState.isOpen}
   onClose={() => setDeleteConfirmState({ isOpen: false, itemIds: [] })}
   onConfirm={confirmDeleteMaterials}
   itemCount={deleteConfirmState.itemIds.length}
 />
 </div>
 );
};

// -------------------------------------------------------------
export default MaterialsTab;
