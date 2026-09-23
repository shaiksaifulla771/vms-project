export function fmtQty(v, digits = 3) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits });
}

export function fmtPct(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function fmtDate(v) {
  if (!v) return '';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!d) return s;
  return `${d}-${m}-${y}`;
}

export function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  return d.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const today = () => new Date().toISOString().slice(0, 10);

export const CLASS_LABEL = {
  RAW_MATERIAL: 'Raw Material',
  PACKAGING: 'Packaging',
  CONSUMABLE: 'Consumable',
  SEMI_FINISHED: 'Semi-Finished',
  FINISHED_GOOD: 'Finished Good',
};

export const TXN_LABEL = {
  OPENING: 'Opening',
  INWARD: 'Inward',
  OUTWARD: 'Outward',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_IN: 'Transfer In',
  ADJUSTMENT: 'Adjustment',
  MFG_CONSUMPTION: 'Mfg Consumption',
  MFG_OUTPUT: 'Mfg Output',
  MFG_CORRECTION: 'Mfg Correction',
};

/** Download rows as CSV (columns: [{key|value, label}]) */
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => esc(c.csv ? c.csv(r) : (c.value ? c.value(r) : r[c.key]))).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
