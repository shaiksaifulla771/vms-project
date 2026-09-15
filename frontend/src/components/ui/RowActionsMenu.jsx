import React from 'react';
import { Eye, Sliders, ArrowRightLeft, UserCheck, UserX, Trash2, Edit } from 'lucide-react';

export default function RowActionsMenu({
  onView,
  onEdit,
  onAdjust,
  onTransfer,
  onToggleStatus,
  onDelete,
  isActive = true,
  disabledReason = null,
  viewLabel = 'View details',
  editLabel = 'Edit',
  adjustLabel = 'Adjust stock',
  transferLabel = 'Transfer stock',
  toggleLabel = 'Toggle status',
  deleteLabel = 'Delete'
}) {
  return (
    <div className="flex items-center justify-end gap-1 select-none" role="group" aria-label="Row actions">
      {onView && (
        <button
          type="button"
          onClick={onView}
          aria-label={viewLabel}
          title={viewLabel}
          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={!!disabledReason}
          aria-label={disabledReason || editLabel}
          title={disabledReason || editLabel}
          className={`p-1 rounded transition-colors ${
            disabledReason
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <Edit className="h-3.5 w-3.5" />
        </button>
      )}

      {onAdjust && (
        <button
          type="button"
          onClick={onAdjust}
          aria-label={adjustLabel}
          title={adjustLabel}
          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-[10px] flex items-center gap-1 transition-colors"
        >
          <Sliders className="h-3 w-3" />
          <span>Adjust</span>
        </button>
      )}

      {onTransfer && (
        <button
          type="button"
          onClick={onTransfer}
          aria-label={transferLabel}
          title={transferLabel}
          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded text-[10px] flex items-center gap-1 transition-colors shadow-2xs"
        >
          <ArrowRightLeft className="h-3 w-3" />
          <span>Transfer</span>
        </button>
      )}

      {onToggleStatus && (
        <button
          type="button"
          onClick={onToggleStatus}
          disabled={!!disabledReason}
          aria-label={disabledReason || (isActive ? 'Deactivate account' : 'Activate account')}
          title={disabledReason || (isActive ? 'Deactivate account' : 'Activate account')}
          className={`p-1 rounded transition-colors ${
            disabledReason
              ? 'text-slate-300 cursor-not-allowed'
              : isActive
                ? 'text-rose-500 hover:bg-rose-50'
                : 'text-emerald-600 hover:bg-emerald-50'
          }`}
        >
          {isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={!!disabledReason}
          aria-label={disabledReason || deleteLabel}
          title={disabledReason || deleteLabel}
          className={`p-1 rounded transition-colors ${
            disabledReason
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-rose-500 hover:bg-rose-50'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
