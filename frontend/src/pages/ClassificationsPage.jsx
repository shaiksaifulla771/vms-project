import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
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
  PackageCheck
} from 'lucide-react';

const ClassificationsPage = ({ initialType }) => {
  const [activeType, setActiveType] = useState(initialType || 'material'); // 'material' | 'vendor'
  const [classifications, setClassifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [parentForNew, setParentForNew] = useState(null);
  const [formData, setFormData] = useState({ name: '', code: '', description: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchClassifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/classifications', { params: { type: activeType } });
      const items = res.data?.data || [];
      setClassifications(items);

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
    const q = search.toLowerCase();
    const isMatch = q && ((node.name || '').toLowerCase().includes(q) || (node.code || '').toLowerCase().includes(q));

    return (
      <div key={node._id} className="relative">
        <div
          className={`flex items-center justify-between p-2 rounded-lg border transition-all select-none ${
            isMatch
              ? 'bg-amber-50/80 border-amber-300 shadow-xs'
              : depth === 0
              ? 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
              : 'bg-slate-50/80 border-slate-100 hover:bg-slate-100/60'
          }`}
          style={{ marginLeft: `${depth * 22}px` }}
        >
          {/* Left: Expand Toggle + Icon + Name + Badges */}
          <div className="flex items-center space-x-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(node._id)}
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
              <span className="text-xs font-bold text-slate-900 truncate">{node.name}</span>

              {node.code && (
                <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                  {node.code}
                </span>
              )}

              {/* Live Assigned Materials / Vendors Metric Badge */}
              {node.itemCount !== undefined && node.itemCount > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shrink-0"
                  title={`${node.itemCount} active ${activeType === 'vendor' ? 'vendors' : 'materials'} classified under ${node.name}`}
                >
                  <PackageCheck className="h-2.5 w-2.5" />
                  <span>{node.itemCount} {activeType === 'vendor' ? 'vendors' : 'materials'}</span>
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
          <div className="flex items-center space-x-1 shrink-0 opacity-90 hover:opacity-100">
            <button
              onClick={() => handleOpenAddModal(node._id)}
              className="h-6 px-2 text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 transition-colors"
              title={`Add sub-category under ${node.name}`}
            >
              <Plus className="h-3 w-3" />
              <span>+ Child</span>
            </button>

            <button
              onClick={() => handleOpenEditModal(node)}
              className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-200/60 transition-colors"
              title={`Edit ${node.name}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setConfirmDeleteItem({
                id: node._id,
                name: node.name,
                childCount: getChildren(node._id).length,
                itemCount: node.itemCount || 0
              })}
              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
              title={`Delete ${node.name}`}
              aria-label={`Delete ${node.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
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
        title={editingItem ? 'Edit Classification' : parentForNew ? 'Add Sub-Category' : 'Create Root Category'}
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
                      {c.name} {c.code ? `(${c.code})` : ''}
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
    </div>
  );
};

export default ClassificationsPage;
