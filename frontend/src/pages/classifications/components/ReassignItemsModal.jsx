import React, { useState } from 'react';
import api from '../../../services/api';
import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { ArrowRightLeft, AlertTriangle } from 'lucide-react';

export const ReassignItemsModal = ({
  isOpen,
  onClose,
  sourceClassification,
  classifications = [],
  activeType,
  onSuccess,
  showToast
}) => {
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isVendor = activeType === 'vendor';

  const validTargets = classifications.filter(c => {
    if (!sourceClassification) return false;
    return String(c._id) !== String(sourceClassification._id);
  });

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!targetCategoryId) {
      if (showToast) showToast('Please select a target classification', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/api/classifications/${sourceClassification._id}/reassign-items`, {
        type: activeType,
        targetCategoryId
      });
      if (showToast) showToast(res.data?.message || 'Items reassigned successfully');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to reassign items', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!sourceClassification) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-blue-600" />
          <span>Reassign {isVendor ? 'Vendors' : 'Materials'}</span>
        </div>
      }
    >
      <form onSubmit={handleReassignSubmit} className="space-y-4 text-xs text-slate-800">
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-900 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>Batch Reassignment Warning</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            All {isVendor ? 'vendors' : 'materials'} currently classified under{' '}
            <strong className="font-extrabold text-slate-900">"{sourceClassification.name}"</strong>{' '}
            will be reassigned to the selected destination category below.
          </p>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Destination Classification *
          </label>
          <select
            value={targetCategoryId}
            onChange={(e) => setTargetCategoryId(e.target.value)}
            required
            className="w-full h-9 px-2.5 border border-slate-300 rounded-md text-xs text-slate-800 bg-white font-medium focus:outline-none focus:border-blue-500"
          >
            <option value="">-- Select Destination Category / Sub-Category --</option>
            {validTargets.map(c => (
              <option key={c._id} value={c._id}>
                {c.parentId ? '↳ ' : '📁 '}
                {c.name} {c.code ? `(${c.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || !targetCategoryId}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
          >
            {submitting ? 'Reassigning...' : 'Confirm Reassignment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default ReassignItemsModal;
