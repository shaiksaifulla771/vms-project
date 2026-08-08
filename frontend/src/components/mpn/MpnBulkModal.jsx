import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  X,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';

const DRAFT_STORAGE_KEY = 'mpn_draft_rows';
const MAX_ROWS_CAP = 500;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS_OPTIONS = ['Active', 'Draft', 'Inactive'];

// Helper to generate unique temp IDs
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;

// Initial empty row structure matching manual creation form fields
const createEmptyRow = () => ({
  temp_id: generateTempId(),
  manufacturerPartNumber: '',
  mpnName: '',
  manufacturerName: '',
  isDirectFromManufacturer: false,
  materialId: '',
  vendorId: '',
  price: '',
  moq: 1,
  gstin: '',
  partDescription: '',
  status: 'Active',
  draft_timestamp: Date.now(),
  apiError: null,
});

export default function MpnBulkModal({ isOpen, onClose, vendors = [], materials = [], onSuccess }) {
  const [currentStage, setCurrentStage] = useState(1); // 1: Bulk Entry & Review, 2: Final Review & Submit
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingTempId, setEditingTempId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [baseSeqNum, setBaseSeqNum] = useState(1000);

  // 1. Fetch sequence peek & initialize drafts from localStorage on modal open
  useEffect(() => {
    if (!isOpen) return;

    // Fetch next code sequence number for live preview
    api
      .get('/api/mpns/sequence-peek')
      .then((res) => {
        if (res.data && res.data.nextCode) {
          const match = res.data.nextCode.match(/\d+/);
          if (match) {
            setBaseSeqNum(parseInt(match[0], 10));
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to peek next MPN sequence code', err);
      });

    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const now = Date.now();
          const validDrafts = parsed.filter((r) => r.draft_timestamp && now - r.draft_timestamp < SEVEN_DAYS_MS);

          if (validDrafts.length > 0) {
            setRows(validDrafts);
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(validDrafts));
          } else {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
            setRows([createEmptyRow()]);
          }
        } else {
          setRows([createEmptyRow()]);
        }
      } else {
        setRows([createEmptyRow()]);
      }
    } catch (e) {
      console.warn('Failed to parse mpn_draft_rows from localStorage', e);
      setRows([createEmptyRow()]);
    }

    setCurrentStage(1);
    setGeneralError('');
    setEditingTempId(null);
  }, [isOpen]);

  // 2. Auto-save drafts to localStorage
  const saveToLocalStorage = useCallback((updatedRows) => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedRows));
    } catch (e) {
      console.warn('Failed to write mpn_draft_rows to localStorage', e);
    }
  }, []);

  const updateRowsState = (updater) => {
    setRows((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveToLocalStorage(next);
      return next;
    });
  };

  // Vendor Lookup Map for fast auto-fetching
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v._id, v])), [vendors]);

  // Handle cell field changes with vendor/material auto-fill logic matching manual creation
  const handleCellChange = (tempId, field, value) => {
    updateRowsState((prev) =>
      prev.map((r) => {
        if (r.temp_id !== tempId) return r;

        const updated = { ...r, [field]: value, apiError: null, draft_timestamp: Date.now() };

        // Vendor change auto-fetch: auto-link GSTIN and auto-fill manufacturer name if Same as Vendor is checked
        if (field === 'vendorId') {
          const selectedVen = vendorMap.get(value);
          if (selectedVen) {
            if (selectedVen.gstin && selectedVen.gstin.trim()) {
              updated.gstin = ''; // Vendor has GSTIN; clear manual fallback so it auto-links
            }
            if (r.isDirectFromManufacturer) {
              updated.manufacturerName = selectedVen.name || selectedVen.company || '';
            }
          }
        }

        return updated;
      })
    );
  };

  // Toggle "Same as Vendor" for a row
  const handleSameAsVendorToggle = (tempId, checked) => {
    updateRowsState((prev) =>
      prev.map((r) => {
        if (r.temp_id !== tempId) return r;

        let newMfr = r.manufacturerName;
        if (checked) {
          const foundVen = vendorMap.get(r.vendorId);
          newMfr = foundVen ? foundVen.name || foundVen.company || '' : '';
        }

        return {
          ...r,
          isDirectFromManufacturer: checked,
          manufacturerName: newMfr,
          apiError: null,
          draft_timestamp: Date.now(),
        };
      })
    );
  };

  // Row operations
  const handleAddRow = () => {
    if (rows.length >= MAX_ROWS_CAP) {
      setGeneralError(`Maximum limit of ${MAX_ROWS_CAP} rows reached per batch.`);
      return;
    }
    setGeneralError('');
    updateRowsState((prev) => [...prev, createEmptyRow()]);
  };

  const handleRemoveRow = (tempId) => {
    updateRowsState((prev) => {
      const next = prev.filter((r) => r.temp_id !== tempId);
      return next.length > 0 ? next : [createEmptyRow()];
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all draft rows?')) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setRows([createEmptyRow()]);
      setSelectedIds(new Set());
      setGeneralError('');
    }
  };

  // Transition Stage 1 -> Stage 2
  const handleProceedToReview = () => {
    const nonBlankRows = rows.filter(
      (r) =>
        r.manufacturerPartNumber.trim() ||
        r.mpnName.trim() ||
        r.manufacturerName.trim() ||
        r.materialId ||
        r.vendorId ||
        r.price
    );

    if (nonBlankRows.length === 0) {
      setGeneralError('Please fill in at least one MPN row before proceeding to review.');
      return;
    }

    if (nonBlankRows.length > MAX_ROWS_CAP) {
      setGeneralError(`Maximum limit of ${MAX_ROWS_CAP} rows exceeded.`);
      return;
    }

    setGeneralError('');
    updateRowsState(nonBlankRows);
    setSelectedIds(new Set(nonBlankRows.map((r) => r.temp_id)));
    setCurrentStage(2);
  };

  // Selection handlers in Stage 2
  const handleToggleSelectRow = (tempId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.temp_id)));
    }
  };

  // Stage 2 Final Submission
  const handleSubmitSelected = async () => {
    const selectedRows = rows.filter((r) => selectedIds.has(r.temp_id));
    if (selectedRows.length === 0) {
      setGeneralError('Please select at least one MPN row to submit.');
      return;
    }

    setSubmitting(true);
    setGeneralError('');

    try {
      const payload = selectedRows.map((r) => ({
        temp_id: r.temp_id,
        manufacturerPartNumber: r.manufacturerPartNumber.trim() || r.mpnName.trim() || 'MPN-PART',
        mpnName: r.mpnName.trim() || r.manufacturerPartNumber.trim(),
        manufacturerName: r.manufacturerName.trim() || 'GENERIC',
        isDirectFromManufacturer: Boolean(r.isDirectFromManufacturer),
        materialId: r.materialId,
        vendorId: r.vendorId,
        price: Number(r.price) || 0,
        moq: Number(r.moq) || 1,
        gstin: r.gstin ? r.gstin.trim().toUpperCase() : '',
        partDescription: r.partDescription ? r.partDescription.trim() : '',
        status: r.status || 'Active',
      }));

      const res = await api.post('/api/mpns/bulk', { rows: payload });

      if (res.data && res.data.success) {
        const resultsMap = new Map((res.data.results || []).map((resItem) => [resItem.temp_id, resItem]));

        const remainingRows = [];
        let successCount = 0;

        rows.forEach((row) => {
          if (!selectedIds.has(row.temp_id)) {
            remainingRows.push(row);
          } else {
            const apiResult = resultsMap.get(row.temp_id);
            if (apiResult && apiResult.status === 'success') {
              successCount++;
            } else {
              remainingRows.push({
                ...row,
                apiError: apiResult?.error || 'Failed to create MPN record',
              });
            }
          }
        });

        updateRowsState(remainingRows.length > 0 ? remainingRows : [createEmptyRow()]);

        if (successCount > 0 && onSuccess) {
          onSuccess(successCount);
        }

        if (remainingRows.length === 0) {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          onClose();
        } else {
          const hasErrors = remainingRows.some((r) => r.apiError);
          if (hasErrors) {
            setGeneralError(`${successCount} MPN(s) created successfully. Please fix highlighted error rows and retry.`);
          } else {
            setGeneralError(`${successCount} MPN(s) created. Remaining unselected drafts saved.`);
          }
        }
      } else {
        setGeneralError(res.data?.error || 'Bulk submission failed');
      }
    } catch (err) {
      console.error('Bulk MPN creation error:', err);
      setGeneralError(err.response?.data?.error || err.message || 'Server connection error during bulk submit');
    } finally {
      setSubmitting(false);
    }
  };

  const activeVendorOptions = useMemo(
    () => vendors.map((v) => ({ value: v._id, label: `${v.name} ${v.company ? `— ${v.company}` : ''}` })),
    [vendors]
  );

  const activeMaterialOptions = useMemo(
    () => materials.map((m) => ({ value: m._id, label: `${m.name} (${m.code || 'No Code'})` })),
    [materials]
  );

  if (!isOpen) return null;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="" className="max-w-[98vw] w-[98vw] h-[94vh] max-h-[95vh] rounded-2xl shadow-2xl">
      <div className="flex flex-col h-[94vh] -m-6 bg-slate-50/50">
        {/* Top Title Bar - Standard Slate Design System */}
        <div className="px-6 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm">
          <h2 className="text-base font-bold text-slate-900">
            Bulk Register MPN Records
          </h2>

          <div className="flex items-center gap-2">
            {currentStage === 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStage(1)}
                disabled={submitting}
                className="gap-1 text-xs h-8"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Bulk Entry
              </Button>
            )}
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* General Error Banner */}
        {generalError && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs font-medium text-amber-900 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="flex-1">{generalError}</span>
          </div>
        )}

        {/* Content Body Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStage === 1 ? (
            /* STAGE 1: BULK ENTRY & REVIEW GRID */
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="uppercase bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-1.5 py-3 w-[3%] text-center">#</th>
                      <th className="px-1.5 py-3 w-[8%]">MPN ID (Auto)</th>
                      <th className="px-1.5 py-3 w-[14%]">Mfr Part No *</th>
                      <th className="px-1.5 py-3 w-[15%]">Manufacturer Name *</th>
                      <th className="px-1.5 py-3 w-[16%]">Linked Material *</th>
                      <th className="px-1.5 py-3 w-[16%]">Linked Vendor *</th>
                      <th className="px-1.5 py-3 w-[8%] text-right">Price (₹) *</th>
                      <th className="px-1.5 py-3 w-[5%] text-center">MOQ *</th>
                      <th className="px-1.5 py-3 w-[8%]">MPN Name</th>
                      <th className="px-1.5 py-3 w-[10%]">Status</th>
                      <th className="px-1.5 py-3 w-[4%] text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.map((row, index) => {
                      const autoAssignedCode = `MPN${baseSeqNum + index}`;
                      const selectedVen = vendorMap.get(row.vendorId);
                      const isVendorGstinPresent = Boolean(selectedVen?.gstin && selectedVen.gstin.trim());

                      return (
                        <tr
                          key={row.temp_id}
                          className={`hover:bg-slate-50/80 transition-colors ${row.apiError ? 'bg-red-50/60 border-l-4 border-l-red-500' : ''
                            }`}
                        >
                          {/* Row Number */}
                          <td className="px-1 py-1 text-center font-mono text-slate-400 font-semibold text-[11px]">
                            {index + 1}
                          </td>

                          {/* Auto-Assigned Code Preview */}
                          <td className="px-1 py-1">
                            <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded block text-center truncate">
                              {autoAssignedCode}
                            </span>
                          </td>

                          {/* Manufacturer Part Number */}
                          <td className="px-1 py-1">
                            <Input
                              size="xs"
                              placeholder="e.g. TI-RES-10K"
                              value={row.manufacturerPartNumber}
                              onChange={(e) => handleCellChange(row.temp_id, 'manufacturerPartNumber', e.target.value)}
                              className="font-mono"
                            />
                          </td>

                          {/* Manufacturer Name & Same as Vendor Checkbox */}
                          <td className="px-1 py-1">
                            <div className="space-y-0.5">
                              <Input
                                size="xs"
                                placeholder={row.isDirectFromManufacturer ? 'Auto-filled from Vendor' : 'Type manufacturer name...'}
                                value={row.manufacturerName}
                                disabled={row.isDirectFromManufacturer}
                                onChange={(e) => handleCellChange(row.temp_id, 'manufacturerName', e.target.value)}
                                className={row.isDirectFromManufacturer ? 'bg-slate-100 font-bold text-slate-700' : ''}
                              />
                              <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] font-semibold text-blue-700 leading-none">
                                <input
                                  type="checkbox"
                                  checked={row.isDirectFromManufacturer}
                                  onChange={(e) => handleSameAsVendorToggle(row.temp_id, e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                                />
                                <span>Same as Vendor</span>
                              </label>
                            </div>
                          </td>

                          {/* Linked Material */}
                          <td className="px-1 py-1">
                            <Select
                              size="xs"
                              value={row.materialId}
                              onChange={(e) => handleCellChange(row.temp_id, 'materialId', e.target.value)}
                              options={[{ value: '', label: '-- Select Material --' }, ...activeMaterialOptions]}
                            />
                          </td>

                          {/* Linked Vendor */}
                          <td className="px-1 py-1">
                            <Select
                              size="xs"
                              value={row.vendorId}
                              onChange={(e) => handleCellChange(row.temp_id, 'vendorId', e.target.value)}
                              options={[{ value: '', label: '-- Select Vendor --' }, ...activeVendorOptions]}
                            />
                          </td>

                          {/* Price */}
                          <td className="px-1 py-1">
                            <Input
                              size="xs"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={row.price}
                              onChange={(e) => handleCellChange(row.temp_id, 'price', e.target.value)}
                              className="font-semibold text-right"
                            />
                          </td>

                          {/* MOQ */}
                          <td className="px-1 py-1">
                            <Input
                              size="xs"
                              type="number"
                              min="1"
                              step="1"
                              value={row.moq}
                              onChange={(e) => handleCellChange(row.temp_id, 'moq', e.target.value)}
                              className="text-center"
                            />
                          </td>

                          {/* MPN Name */}
                          <td className="px-1 py-1">
                            <Input
                              size="xs"
                              placeholder="Optional name..."
                              value={row.mpnName}
                              onChange={(e) => handleCellChange(row.temp_id, 'mpnName', e.target.value)}
                            />
                          </td>

                          {/* Status */}
                          <td className="px-1 py-1">
                            <Select
                              size="xs"
                              value={row.status}
                              onChange={(e) => handleCellChange(row.temp_id, 'status', e.target.value)}
                              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                              className={`font-bold ${row.status === 'Active'
                                  ? 'text-emerald-700 bg-emerald-50/80 border-emerald-200'
                                  : row.status === 'Draft'
                                    ? 'text-amber-700 bg-amber-50/80 border-amber-200'
                                    : 'text-slate-700 bg-slate-100 border-slate-200'
                                }`}
                            />
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.temp_id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Toolbar Footer */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRow}
                  disabled={rows.length >= MAX_ROWS_CAP}
                  className="gap-1.5 text-xs h-8"
                >
                  <Plus className="w-4 h-4" /> Add Draft Row
                </Button>

                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                  <span>Draft Count: <strong className="text-slate-800">{rows.length}</strong> / {MAX_ROWS_CAP}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    className="text-red-600 hover:bg-red-50 text-xs h-8"
                  >
                    Clear All Drafts
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* STAGE 2: FINAL REVIEW & SUBMIT MODE */
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600 pb-1 font-medium">
                <span>
                  Select MPNs to commit to database (<strong>{selectedIds.size}</strong> of {rows.length} selected)
                </span>
                <span className="text-slate-400">Unselected rows will be saved in your browser local storage.</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="uppercase bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-1.5 py-3 w-[3%] text-center">
                        <input
                          type="checkbox"
                          checked={rows.length > 0 && selectedIds.size === rows.length}
                          onChange={handleToggleSelectAll}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-1.5 py-3 w-[9%]">Auto MPN ID</th>
                      <th className="px-1.5 py-3 w-[18%]">Part Number / Name</th>
                      <th className="px-1.5 py-3 w-[17%]">Manufacturer Name</th>
                      <th className="px-1.5 py-3 w-[19%]">Linked Material</th>
                      <th className="px-1.5 py-3 w-[19%]">Linked Vendor</th>
                      <th className="px-1.5 py-3 w-[8%] text-right">Price (₹)</th>
                      <th className="px-1.5 py-3 w-[4%] text-center">MOQ</th>
                      <th className="px-1.5 py-3 w-[3%] text-center">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.map((row, index) => {
                      const autoAssignedCode = `MPN${baseSeqNum + index}`;
                      const isSelected = selectedIds.has(row.temp_id);
                      const isEditing = editingTempId === row.temp_id;
                      const matObj = materials.find((m) => m._id === row.materialId);
                      const venObj = vendors.find((v) => v._id === row.vendorId);

                      return (
                        <tr
                          key={row.temp_id}
                          className={`transition-colors ${row.apiError
                              ? 'bg-red-50/80 border-l-4 border-l-red-500'
                              : isSelected
                                ? 'bg-blue-50/40'
                                : 'hover:bg-slate-50'
                            }`}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(row.temp_id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>

                          <td className="px-3 py-2.5 font-mono font-bold text-blue-700 truncate max-w-[140px]" title={autoAssignedCode}>
                            {autoAssignedCode}
                          </td>

                          {isEditing ? (
                            <>
                              <td className="px-2 py-1">
                                <Input
                                  size="sm"
                                  placeholder="Mfr Part No"
                                  value={row.manufacturerPartNumber}
                                  onChange={(e) => handleCellChange(row.temp_id, 'manufacturerPartNumber', e.target.value)}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  size="sm"
                                  placeholder="Manufacturer Name"
                                  value={row.manufacturerName}
                                  onChange={(e) => handleCellChange(row.temp_id, 'manufacturerName', e.target.value)}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Select
                                  size="sm"
                                  value={row.materialId}
                                  onChange={(e) => handleCellChange(row.temp_id, 'materialId', e.target.value)}
                                  options={[{ value: '', label: '-- Material --' }, ...activeMaterialOptions]}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Select
                                  size="sm"
                                  value={row.vendorId}
                                  onChange={(e) => handleCellChange(row.temp_id, 'vendorId', e.target.value)}
                                  options={[{ value: '', label: '-- Vendor --' }, ...activeVendorOptions]}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  size="sm"
                                  type="number"
                                  value={row.price}
                                  onChange={(e) => handleCellChange(row.temp_id, 'price', e.target.value)}
                                />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <Input
                                  size="sm"
                                  type="number"
                                  value={row.moq}
                                  onChange={(e) => handleCellChange(row.temp_id, 'moq', e.target.value)}
                                  className="text-center"
                                />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => setEditingTempId(null)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Save Inline Edit"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2.5 font-semibold text-slate-900 truncate max-w-[200px]" title={row.manufacturerPartNumber || row.mpnName || ''}>
                                <div className="truncate">{row.manufacturerPartNumber || row.mpnName || '—'}</div>
                                {row.mpnName && row.mpnName !== row.manufacturerPartNumber && (
                                  <div className="text-[11px] text-slate-500 font-normal truncate">{row.mpnName}</div>
                                )}
                                {row.apiError && (
                                  <div className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-normal">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {row.apiError}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-slate-700">
                                {row.manufacturerName || 'GENERIC'}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {matObj ? `${matObj.name} (${matObj.code || '—'})` : <span className="text-red-500 font-medium">Unlinked</span>}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {venObj ? venObj.name : <span className="text-red-500 font-medium">Unlinked</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                                ₹{row.price || '0.00'}
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono">
                                {row.moq || 1}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setEditingTempId(row.temp_id)}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                                  title="Edit row inline"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Footer - Standard Slate Styling */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between shadow-sm">
          <div className="text-xs text-slate-500 font-medium">
            {currentStage === 1 ? (
              <span>Stage 1: Fill MPN data. Auto-saved to browser local storage.</span>
            ) : (
              <span>Stage 2: <strong>{selectedIds.size}</strong> MPN(s) ready to create.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting} className="text-xs h-9">
              Cancel
            </Button>

            {currentStage === 1 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleProceedToReview}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
              >
                Proceed to Final Review <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitSelected}
                disabled={submitting || selectedIds.size === 0}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Creating MPNs...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Final Submit ({selectedIds.size})
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
