import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { Drawer } from '../../../components/ui/Drawer';
import { Button } from '../../../components/ui/Button';
import {
  Folder,
  Tag,
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  Unlink,
  Layers,
  Building2,
  ChevronRight,
  PackageCheck,
  Edit2,
  Trash2,
  ArrowRightLeft,
  Filter
} from 'lucide-react';

export const ClassificationDetailDrawer = ({
  isOpen,
  onClose,
  classification,
  activeType,
  classifications = [],
  onSelectClassification,
  onEdit,
  onAddChild,
  onDelete,
  onOpenLinkModal,
  onOpenReassignModal,
  onRefreshTree,
  showToast
}) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [unlinkingId, setUnlinkingId] = useState(null);

  const isVendor = activeType === 'vendor';

  // Compute Breadcrumb Trail
  const breadcrumbs = useMemo(() => {
    if (!classification) return [];
    const trail = [];
    const idMap = new Map(classifications.map(c => [String(c._id), c]));
    let curr = classification;
    while (curr) {
      trail.unshift(curr);
      const pId = typeof curr.parentId === 'object' ? curr.parentId?._id : curr.parentId;
      curr = pId ? idMap.get(String(pId)) : null;
    }
    return trail;
  }, [classification, classifications]);

  // Compute Child Subcategories
  const childSubcategories = useMemo(() => {
    if (!classification) return [];
    return classifications.filter(c => {
      const pId = typeof c.parentId === 'object' ? c.parentId?._id : c.parentId;
      return String(pId) === String(classification._id);
    });
  }, [classification, classifications]);

  // Fetch linked items
  const fetchItems = useCallback(async () => {
    if (!classification?._id) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/classifications/${classification._id}/items`, {
        params: {
          type: activeType,
          search: search.trim() || undefined,
          includeDescendants: includeDescendants ? 'true' : 'false',
          page,
          limit: 50
        }
      });
      setItems(res.data?.data || []);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      console.error('Failed to fetch linked items:', err);
      if (showToast) showToast('Failed to load classified items', 'error');
    } finally {
      setLoading(false);
    }
  }, [classification?._id, activeType, search, includeDescendants, page, showToast]);

  useEffect(() => {
    if (isOpen && classification?._id) {
      fetchItems();
    }
  }, [isOpen, classification?._id, fetchItems]);

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1);
  }, [search, includeDescendants, classification?._id]);

  // Unlink single item
  const handleUnlinkItem = async (itemId, itemName) => {
    if (!window.confirm(`Unlink "${itemName}" from this classification?`)) return;
    setUnlinkingId(itemId);
    try {
      await api.post(`/api/classifications/${classification._id}/unlink-items`, {
        type: activeType,
        itemIds: [itemId]
      });
      if (showToast) showToast(`Unlinked "${itemName}" successfully`);
      fetchItems();
      if (onRefreshTree) onRefreshTree();
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to unlink item', 'error');
    } finally {
      setUnlinkingId(null);
    }
  };

  // Jump to module
  const handleJumpToItem = (item) => {
    if (isVendor) {
      navigate(`/vendors?search=${encodeURIComponent(item.vendorId || item.name)}`);
    } else {
      navigate(`/materials?search=${encodeURIComponent(item.code || item.name)}`);
    }
  };

  if (!classification) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          {classification.parentId ? (
            <Tag className="h-4 w-4 text-blue-600" />
          ) : (
            <Folder className="h-4 w-4 text-blue-600 fill-blue-50" />
          )}
          <span>{classification.parentId ? 'Sub-Category Inspector' : 'Category Inspector'}</span>
        </div>
      }
      className="max-w-2xl sm:max-w-3xl"
    >
      <div className="space-y-4 text-xs font-sans text-slate-800">
        {/* BREADCRUMB HIERARCHY TRAIL */}
        <div className="flex items-center flex-wrap gap-1 bg-slate-100/70 p-2 rounded-lg border border-slate-200">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Hierarchy:
          </span>
          <button
            onClick={() => onSelectClassification(null)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            {isVendor ? 'Vendor Master' : 'Materials Master'}
          </button>
          {breadcrumbs.map((bc, idx) => (
            <React.Fragment key={bc._id}>
              <ChevronRight className="h-3 w-3 text-slate-400" />
              <button
                onClick={() => onSelectClassification(bc)}
                className={`text-[11px] font-bold transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? 'text-blue-700 underline font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {bc.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* CATEGORY HERO CARD & ACTIONS */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">{classification.name}</h3>
                {classification.code && (
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {classification.code}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {classification.status || 'Active'}
                </span>
              </div>
              {classification.description && (
                <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed">
                  {classification.description}
                </p>
              )}
            </div>

            {/* Quick Management Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onAddChild(classification._id)}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-md border border-blue-200 flex items-center gap-1 transition-colors"
                title="Add child sub-category"
              >
                <Plus className="h-3 w-3" />
                <span>+ Sub-category</span>
              </button>
              <button
                onClick={() => onEdit(classification)}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                title="Edit category"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(classification)}
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                title="Delete category"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* CHILD SUBCATEGORIES STRIP (IF ANY) */}
          {childSubcategories.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Sub-Categories ({childSubcategories.length})
                </span>
                <button
                  onClick={() => onAddChild(classification._id)}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 hover:underline"
                >
                  <Plus className="h-2.5 w-2.5" /> Add Sub-Category
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {childSubcategories.map(child => (
                  <button
                    key={child._id}
                    onClick={() => onSelectClassification(child)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 text-[11px] font-bold transition-all shadow-2xs"
                  >
                    <Tag className="h-3 w-3 text-slate-400" />
                    <span>{child.name}</span>
                    {child.itemCount > 0 && (
                      <span className="text-[9px] bg-white px-1.5 py-0.2 rounded-full font-mono text-slate-600 border border-slate-200">
                        {child.itemCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* LINKED ITEMS TOOLBAR */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-blue-600" />
            <span className="font-extrabold text-xs text-slate-900">
              Classified {isVendor ? 'Vendors' : 'Materials'} ({totalCount})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search within linked items */}
            <div className="relative flex-1 sm:w-44">
              <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${isVendor ? 'vendors' : 'materials'}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            {/* Include Subcategories Toggle (when children exist) */}
            {childSubcategories.length > 0 && (
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none bg-white px-2 py-1 rounded border border-slate-200">
                <input
                  type="checkbox"
                  checked={includeDescendants}
                  onChange={(e) => setIncludeDescendants(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 h-3 w-3 focus:ring-0"
                />
                <span>Include Sub-categories</span>
              </label>
            )}

            {/* Action Buttons */}
            <Button
              size="sm"
              onClick={onOpenLinkModal}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-7 text-xs shadow-2xs flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              <span>Link {isVendor ? 'Vendor' : 'Material'}</span>
            </Button>

            {totalCount > 0 && (
              <button
                onClick={onOpenReassignModal}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-md border border-slate-200 flex items-center gap-1 text-[11px] transition-colors"
                title="Move items to another category"
              >
                <ArrowRightLeft className="h-3 w-3 text-slate-500" />
                <span>Reassign All</span>
              </button>
            )}

            <button
              onClick={fetchItems}
              disabled={loading}
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded transition-colors"
              title="Refresh item list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* LINKED ITEMS DATA GRID ("WHEN USER CLICKS IN IT SHOWS IT ALL") */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
          {loading ? (
            <div className="py-12 text-center text-slate-400 font-bold animate-pulse text-xs">
              Loading classified {isVendor ? 'vendors' : 'materials'}...
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center space-y-2 px-4">
              <PackageCheck className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-600 text-xs">
                No {isVendor ? 'vendors' : 'materials'} currently linked to this classification.
              </p>
              <p className="text-[11px] text-slate-400">
                Click <strong>"Link {isVendor ? 'Vendor' : 'Material'}"</strong> above to assign items to this {classification.parentId ? 'sub-category' : 'category'}.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenLinkModal}
                className="mt-2 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5 mr-1 text-blue-600" />
                Link Existing Items
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 font-extrabold text-[10px] uppercase tracking-wider border-b border-slate-200 z-10">
                  <tr>
                    {isVendor ? (
                      <>
                        <th className="py-2 px-3">Vendor ID</th>
                        <th className="py-2 px-3">Vendor / Company</th>
                        <th className="py-2 px-3">Contact Person</th>
                        <th className="py-2 px-3">Email &amp; Phone</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 px-3">Material Code</th>
                        <th className="py-2 px-3">Material Name</th>
                        <th className="py-2 px-3">Category Assignment</th>
                        <th className="py-2 px-3 text-center">UOM</th>
                        <th className="py-2 px-3 text-right">Base Price</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map(item => (
                    <tr key={item._id} className="hover:bg-blue-50/40 transition-colors group">
                      {isVendor ? (
                        <>
                          <td className="py-2 px-3 font-mono font-bold text-blue-600">
                            <button
                              onClick={() => handleJumpToItem(item)}
                              className="flex items-center gap-1 hover:underline text-left"
                              title="View vendor master"
                            >
                              <span>{item.vendorId || 'N/A'}</span>
                              <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            <div>{item.name}</div>
                            {item.company && <div className="text-[10px] text-slate-400 font-normal">{item.company}</div>}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {item.contact || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-mono text-[10px]">
                            {item.email && <div>{item.email}</div>}
                            {item.phone && <div>{item.phone}</div>}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-1.5 py-0.2 rounded-md font-bold text-[9px] uppercase ${
                              item.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.status || 'Active'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              disabled={unlinkingId === item._id}
                              onClick={() => handleUnlinkItem(item._id, item.name)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Unlink from this category"
                            >
                              <Unlink className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 font-mono font-bold text-blue-600">
                            <button
                              onClick={() => handleJumpToItem(item)}
                              className="flex items-center gap-1 hover:underline text-left"
                              title="View material master"
                            >
                              <span>{item.code}</span>
                              <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {item.name}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {item.categoryId?.name ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                <Tag className="h-2.5 w-2.5 text-slate-400" />
                                <span>{item.categoryId.name}</span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-600">
                            {item.unit || item.uom || 'pcs'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                            ₹{(item.basePrice || item.price || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-1.5 py-0.2 rounded-md font-bold text-[9px] uppercase ${
                              item.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.status || 'Active'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              disabled={unlinkingId === item._id}
                              onClick={() => handleUnlinkItem(item._id, item.name)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Unlink from this category"
                            >
                              <Unlink className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default ClassificationDetailDrawer;
