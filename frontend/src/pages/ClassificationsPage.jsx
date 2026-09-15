import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  Layers,
  Building2,
  Search,
  RefreshCw,
  Folder,
  Tag,
  ChevronsUpDown,
  ChevronsDownUp,
  PackageCheck,
  Eye,
  ArrowRightLeft,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { ClassificationDetailDrawer } from './classifications/components/ClassificationDetailDrawer';
import { LinkItemsModal } from './classifications/components/LinkItemsModal';
import { ReassignItemsModal } from './classifications/components/ReassignItemsModal';

const ClassificationsPage = ({ initialType }) => {
  const [activeType, setActiveType] = useState(initialType || 'material'); // 'material' | 'vendor'
  const [classifications, setClassifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Interactive Selection & Drawer State
  const [selectedClassification, setSelectedClassification] = useState(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [parentForNew, setParentForNew] = useState(null);
  const [formData, setFormData] = useState({ name: '', code: '', description: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSyncMasterData = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/api/classifications/sync-master-data', { type: activeType });
      showToast(res.data?.message || 'Master data synced successfully');
      fetchClassifications();
    } catch (err) {
      console.error('Failed to sync master data:', err);
      showToast(err.response?.data?.error || 'Failed to sync master data', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleExportToExcel = () => {
    try {
      if (!classifications || !classifications.length) {
        showToast('No classifications available to export', 'error');
        return;
      }

      const rows = classifications.map((item, idx) => {
        const pId = typeof item.parentId === 'object' ? item.parentId?._id : item.parentId;
        const parentNode = pId ? classifications.find(c => String(c._id) === String(pId)) : null;
        const depth = item.depth !== undefined ? item.depth : 0;
        const depthLabel = getDepthLabel(depth);

        return {
          'S.No': idx + 1,
          'Classification ID': String(item._id),
          'Code': item.code || '',
          'Name': item.name || '',
          'Level': depthLabel,
          'Depth': depth,
          'Parent Category': parentNode ? parentNode.name : 'ROOT',
          'Parent Code': parentNode ? (parentNode.code || '') : 'ROOT',
          'Hierarchy Path': getCategoryPath(item._id),
          'Direct Items Linked': item.itemCount || 0,
          'Total Items in Branch': item.totalItemCount !== undefined ? item.totalItemCount : (item.itemCount || 0),
          'Status': item.status || 'Active',
          'Description': item.description || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 26 },
        { wch: 15 },
        { wch: 28 },
        { wch: 16 },
        { wch: 8 },
        { wch: 24 },
        { wch: 15 },
        { wch: 42 },
        { wch: 18 },
        { wch: 20 },
        { wch: 10 },
        { wch: 45 }
      ];

      const wb = XLSX.utils.book_new();
      const sheetName = activeType === 'vendor' ? 'Vendor Classifications' : 'Material Classifications';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const fileName = `${activeType === 'vendor' ? 'Vendor' : 'Material'}_Classifications_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast(`Exported ${classifications.length} categories to ${fileName}`);
    } catch (err) {
      console.error('Failed to export classifications to Excel:', err);
      showToast('Failed to export Excel file', 'error');
    }
  };

  const fetchClassifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/classifications', { params: { type: activeType } });
      const items = res.data?.data || [];
      setClassifications(items);

      // Keep selectedClassification synchronized if open
      setSelectedClassification(prev => {
        if (!prev) return null;
        return items.find(i => String(i._id) === String(prev._id)) || prev;
      });

      // Auto expand root nodes on initial load
      const roots = items.filter(i => !i.parentId || (typeof i.parentId === 'object' && !i.parentId._id)).map(i => i._id);
      setExpandedNodes(new Set(roots));
    } catch (err) {
      console.error(err);
      setError('Failed to load classifications from server.');
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  const handleSelectNode = (node) => {
    setSelectedClassification(node);
    setIsDetailDrawerOpen(true);
  };

  useEffect(() => {
    if (initialType && initialType !== activeType) {
      setActiveType(initialType);
    }
  }, [initialType, activeType]);

  useEffect(() => {
    fetchClassifications();
  }, [fetchClassifications]);

  // Build Parent -> Children Map in O(N)
  const childrenMap = useMemo(() => {
    const map = new Map();
    classifications.forEach(c => {
      const pId = typeof c.parentId === 'object' ? c.parentId?._id : c.parentId;
      const key = pId ? String(pId) : 'ROOT';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    return map;
  }, [classifications]);

  const getChildren = useCallback((parentId) => {
    const key = parentId ? String(parentId) : 'ROOT';
    return childrenMap.get(key) || [];
  }, [childrenMap]);

  // Full Breadcrumb path lookup for parent dropdowns (e.g. "Raw Material › Fresh › Organic")
  const getCategoryPath = useCallback((catId) => {
    if (!catId) return '';
    const trail = [];
    let currentId = String(catId);
    const visited = new Set();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = classifications.find(c => String(c._id) === currentId);
      if (!node) break;
      trail.unshift(node.name);
      const pId = typeof node.parentId === 'object' ? node.parentId?._id : node.parentId;
      currentId = pId ? String(pId) : null;
    }
    return trail.join(' › ');
  }, [classifications]);

  const getDepthLabel = (depth = 0) => {
    if (depth === 0) return 'Category';
    if (depth === 1) return 'Sub-category';
    if (depth === 2) return 'Sub-sub-category';
    return `Level ${depth + 1}`;
  };

  const getDepthBadgeColor = (depth = 0) => {
    if (depth === 0) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (depth === 1) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (depth === 2) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  };

  // Expand / Collapse Handlers
  const toggleExpand = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    const allIds = classifications.map(c => c._id);
    setExpandedNodes(new Set(allIds));
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Search filter with ancestor auto-expansion
  useEffect(() => {
    if (!search.trim()) return;
    const q = search.toLowerCase();
    const matchingIds = new Set();
    const nodesToExpand = new Set(expandedNodes);

    // Build parent map
    const parentLookup = new Map();
    classifications.forEach(c => {
      const pId = typeof c.parentId === 'object' ? c.parentId?._id : c.parentId;
      if (pId) parentLookup.set(String(c._id), String(pId));
    });

    classifications.forEach(c => {
      const matches = (c.name || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q);
      if (matches) {
        matchingIds.add(c._id);
        // Expand all ancestors
        let curr = parentLookup.get(String(c._id));
        while (curr) {
          nodesToExpand.add(curr);
          curr = parentLookup.get(curr);
        }
      }
    });

    setExpandedNodes(nodesToExpand);
  }, [search, classifications]);

  // Modal Handlers
  const handleOpenAddModal = (parentId = null) => {
    setEditingItem(null);
    setParentForNew(parentId);
    setFormData({
      name: '',
      code: '',
      description: '',
      parentId: parentId || ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setParentForNew(null);
    setFormData({
      name: item.name || '',
      code: item.code || '',
      description: item.description || '',
      parentId: item.parentId?._id || item.parentId || ''
    });
    setIsModalOpen(true);
  };

  // Find all descendant IDs of an item to prevent circular assignment
  const getDescendantIds = useCallback((itemId) => {
    const descendants = new Set();
    const stack = [String(itemId)];
    while (stack.length > 0) {
      const curr = stack.pop();
      const kids = childrenMap.get(curr) || [];
      kids.forEach(k => {
        descendants.add(String(k._id));
        stack.push(String(k._id));
      });
    }
    return descendants;
  }, [childrenMap]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Please enter a classification name', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: activeType,
        name: formData.name.trim(),
        code: formData.code.trim() || undefined,
        description: formData.description.trim(),
        parentId: formData.parentId || null
      };

      if (editingItem) {
        await api.put(`/api/classifications/${editingItem._id}`, payload);
        showToast('Classification updated successfully');
      } else {
        await api.post('/api/classifications', payload);
        showToast('Classification created successfully');
      }
      setIsModalOpen(false);
      fetchClassifications();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to save classification', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteItem) return;
    const { id, name } = confirmDeleteItem;
    try {
      await api.delete(`/api/classifications/${id}`, { params: { type: activeType } });
      showToast(`"${name}" deleted successfully`);
      setConfirmDeleteItem(null);
      fetchClassifications();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to delete classification', 'error');
    }
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (node, depth = 0) => {
    const children = getChildren(node._id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(node._id);
    const isSelected = selectedClassification?._id === node._id;
    const q = search.toLowerCase();
    const isMatch = q && ((node.name || '').toLowerCase().includes(q) || (node.code || '').toLowerCase().includes(q));

    return (
      <div key={node._id} className="relative">
        <div
          onClick={() => handleSelectNode(node)}
          className={`flex items-center justify-between p-2 rounded-lg border transition-all select-none cursor-pointer group ${
            isSelected
              ? 'bg-blue-50/95 border-blue-500 ring-2 ring-blue-200 shadow-xs'
              : isMatch
              ? 'bg-amber-50/80 border-amber-300 shadow-xs'
              : depth === 0
              ? 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50/80 shadow-2xs'
              : 'bg-slate-50/80 border-slate-100 hover:bg-blue-50/50 hover:border-slate-200'
          }`}
          style={{ marginLeft: `${Math.min(depth * 20, 100)}px` }}
        >
          {/* Left: Expand Toggle + Icon + Name + Badges */}
          <div className="flex items-center space-x-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node._id);
                }}
                className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
                title={isExpanded ? 'Collapse branch' : 'Expand branch'}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-700" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-700" />}
              </button>
            ) : (
              <span className="w-5" />
            )}

            {depth === 0 ? (
              <Folder className="h-4 w-4 text-blue-600 fill-blue-50 shrink-0" />
            ) : (
              <Tag className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            )}

            <div className="flex items-center flex-wrap gap-1.5 min-w-0">
              <span className={`text-xs truncate ${isSelected ? 'font-black text-blue-950' : 'font-bold text-slate-900'}`}>
                {node.name}
              </span>

              {/* Hierarchy Level Badge (Category / Sub-category / Sub-sub...) */}
              <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border shrink-0 ${getDepthBadgeColor(node.depth ?? depth)}`}>
                {getDepthLabel(node.depth ?? depth)}
              </span>

              {node.code && (
                <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                  {node.code}
                </span>
              )}

              {/* Live Assigned Materials / Vendors Metric Badge (Direct + Branch Rollup) */}
              {(node.itemCount > 0 || (node.totalItemCount !== undefined && node.totalItemCount > 0)) && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                  title={`${node.itemCount || 0} direct, ${node.totalItemCount || node.itemCount || 0} total in this hierarchy branch`}
                >
                  <PackageCheck className="h-2.5 w-2.5" />
                  <span>
                    {node.itemCount || 0} {activeType === 'vendor' ? 'vendors' : 'materials'}
                    {node.totalItemCount !== undefined && node.totalItemCount > (node.itemCount || 0) && (
                      <span className="opacity-80 font-medium ml-1">({node.totalItemCount} in branch)</span>
                    )}
                  </span>
                </span>
              )}

              {node.description && (
                <span className="text-[11px] text-slate-400 truncate max-w-xs hidden md:inline">
                  &bull; {node.description}
                </span>
              )}
            </div>
          </div>

          {/* Right: Actions Menu */}
          <div className="flex items-center space-x-1 shrink-0 opacity-90 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenAddModal(node._id);
              }}
              className="h-6 px-2 text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 transition-colors"
              title={`Add sub-category under ${node.name}`}
            >
              <Plus className="h-3 w-3" />
              <span>+ Child</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenEditModal(node);
              }}
              className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-200/60 transition-colors"
              title={`Edit ${node.name}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteItem({
                  id: node._id,
                  name: node.name,
                  childCount: getChildren(node._id).length,
                  itemCount: node.itemCount || 0
                });
              }}
              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
              title={`Delete ${node.name}`}
              aria-label={`Delete ${node.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelectNode(node);
              }}
              className={`h-6 px-2 text-[10px] font-bold rounded flex items-center gap-1 transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200'
              }`}
              title={`Inspect classified ${activeType === 'vendor' ? 'vendors' : 'materials'}`}
            >
              <Eye className="h-3 w-3" />
              <span>{isSelected ? 'Viewing' : 'Inspect'}</span>
            </button>
          </div>
        </div>

        {/* Recursive Child Branches */}
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1 pl-2 border-l border-slate-200 ml-3">
            {children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootNodes = getChildren(null);
  const editingDescendants = editingItem ? getDescendantIds(editingItem._id) : new Set();

  return (
    <div className="space-y-2 font-sans text-slate-900 w-full max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-xl text-xs font-bold text-white transition-all ${
          toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* 1-ROW COMPACT CONTROLS & HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-slate-700" />
          <h1 className="text-sm font-extrabold text-slate-900">Classifications</h1>
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200">
            {classifications.length} categories
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Quick Search */}
          <div className="relative w-full sm:w-48">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search category or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 font-medium text-xs text-slate-900"
            />
          </div>

          {/* Switch Material / Vendor classifications */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setActiveType('material')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                activeType === 'material' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Materials
            </button>
            <button
              onClick={() => setActiveType('vendor')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                activeType === 'vendor' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" /> Vendors
            </button>
          </div>

          {/* Expand All / Collapse All */}
          <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
            <button
              onClick={handleExpandAll}
              className="px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1"
              title="Expand All Branches"
            >
              <ChevronsUpDown className="h-3 w-3" /> Expand
            </button>
            <div className="w-px h-3 bg-slate-200" />
            <button
              onClick={handleCollapseAll}
              className="px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1"
              title="Collapse All Branches"
            >
              <ChevronsDownUp className="h-3 w-3" /> Collapse
            </button>
          </div>

          {/* Add Root Category */}
          <Button
            size="sm"
            onClick={() => handleOpenAddModal(null)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-7 text-xs shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Root Category
          </Button>

          {/* Sync from Master Data */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncMasterData}
            disabled={syncing || loading}
            className="h-7 px-2.5 text-xs font-bold border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 shadow-2xs flex items-center gap-1.5"
            title={`Sync & harvest classifications from ${activeType === 'vendor' ? 'Vendors' : 'Materials'} master records`}
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin text-blue-600' : 'text-blue-500'}`} />
            <span>{syncing ? 'Syncing...' : `Sync from ${activeType === 'vendor' ? 'Vendors' : 'Materials'}`}</span>
          </Button>

          {/* Export to MS Excel */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportToExcel}
            disabled={loading || !classifications.length}
            className="h-7 px-2.5 text-xs font-bold border-emerald-200 text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100 shadow-2xs flex items-center gap-1.5"
            title={`Export ${activeType === 'vendor' ? 'Vendor' : 'Material'} classifications to MS Excel`}
          >
            <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
            <span>Export Excel</span>
          </Button>

          <button
            onClick={fetchClassifications}
            disabled={loading}
            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
            title="Refresh"
            aria-label="Refresh classification tree"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tree Content Card */}
      <Card className="bg-white border-slate-200 shadow-2xs rounded-lg overflow-hidden">
        <CardHeader className="py-2 px-3 border-b border-slate-200 flex flex-row items-center justify-between bg-slate-50/70">
          <CardTitle className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <span>{activeType === 'material' ? 'Material Hierarchy Tree' : 'Vendor Classification Tree'}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs font-bold animate-pulse">
              Loading classification tree...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-rose-600 text-xs font-bold bg-rose-50 rounded-lg">
              {error}
            </div>
          ) : classifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium">
              No classifications created yet. Click <strong>Add Root Category</strong> to create your first category.
            </div>
          ) : (
            <div className="space-y-1.5">
              {rootNodes.map(root => renderTreeNode(root, 0))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingItem
            ? `Edit ${getDepthLabel(editingItem.depth || 0)}: "${editingItem.name}"`
            : parentForNew
            ? `Add ${getDepthLabel((classifications.find(c => String(c._id) === String(parentForNew))?.depth ?? 0) + 1)} under "${classifications.find(c => String(c._id) === String(parentForNew))?.name || 'Parent'}"`
            : 'Create Root Category'
        }
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Category Name *
            </label>
            <Input
              type="text"
              placeholder="e.g. Raw Material, Packaging, Electronics..."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Category Code (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g. RAW-MAT, PKG"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="text-xs font-mono uppercase"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Parent Category
              </label>
              <select
                value={formData.parentId}
                onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                className="w-full h-8 px-2 border border-slate-200 rounded-md text-xs text-slate-800 bg-white font-medium"
              >
                <option value="">(None - Root Level)</option>
                {classifications
                  .filter(c => {
                    if (!editingItem) return true;
                    // Exclude self and all descendants to prevent circular hierarchy
                    const isSelf = String(c._id) === String(editingItem._id);
                    const isDesc = editingDescendants.has(String(c._id));
                    return !isSelf && !isDesc;
                  })
                  .map(c => (
                    <option key={c._id} value={c._id}>
                      {getCategoryPath(c._id)} {c.code ? `[${c.code}]` : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Provide guidelines or specifications for this category..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
            >
              {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!confirmDeleteItem}
        onClose={() => setConfirmDeleteItem(null)}
        onConfirm={handleDelete}
        title="Delete Classification"
        message={
          confirmDeleteItem?.childCount > 0
            ? `Cannot delete "${confirmDeleteItem?.name}": it contains ${confirmDeleteItem.childCount} child sub-category(ies). Please delete or move child categories first.`
            : confirmDeleteItem?.itemCount > 0
            ? `Cannot delete "${confirmDeleteItem?.name}": ${confirmDeleteItem.itemCount} ${activeType === 'vendor' ? 'vendor(s)' : 'material(s)'} are assigned to this category.`
            : `Are you sure you want to delete "${confirmDeleteItem?.name}"? This action cannot be undone.`
        }
        confirmText="Delete"
        isDestructive={true}
      />

      {/* Interactive Linked Item Drill-Down Drawer */}
      <ClassificationDetailDrawer
        isOpen={isDetailDrawerOpen && !!selectedClassification}
        onClose={() => setIsDetailDrawerOpen(false)}
        classification={selectedClassification}
        activeType={activeType}
        classifications={classifications}
        onSelectClassification={(cat) => {
          if (!cat) setIsDetailDrawerOpen(false);
          else setSelectedClassification(cat);
        }}
        onEdit={(cat) => {
          handleOpenEditModal(cat);
        }}
        onAddChild={(parentId) => {
          handleOpenAddModal(parentId);
        }}
        onDelete={(cat) => {
          setConfirmDeleteItem({
            id: cat._id,
            name: cat.name,
            childCount: getChildren(cat._id).length,
            itemCount: cat.itemCount || 0
          });
        }}
        onOpenLinkModal={() => setIsLinkModalOpen(true)}
        onOpenReassignModal={() => setIsReassignModalOpen(true)}
        onRefreshTree={fetchClassifications}
        showToast={showToast}
      />

      {/* Link Items Modal */}
      <LinkItemsModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        classification={selectedClassification}
        activeType={activeType}
        onSuccess={() => {
          fetchClassifications();
        }}
        showToast={showToast}
      />

      {/* Reassign Items Modal */}
      <ReassignItemsModal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        sourceClassification={selectedClassification}
        classifications={classifications}
        activeType={activeType}
        onSuccess={() => {
          fetchClassifications();
        }}
        showToast={showToast}
      />
    </div>
  );
};

export default ClassificationsPage;
