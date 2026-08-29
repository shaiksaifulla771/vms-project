import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
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
  Tag
} from 'lucide-react';

const ClassificationsPage = () => {
  const [activeType, setActiveType] = useState('material'); // 'material' | 'vendor'
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

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchClassifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/classifications', { params: { type: activeType } });
      const items = res.data?.data || [];
      setClassifications(items);
      
      // Auto expand root nodes
      const roots = items.filter(i => !i.parentId).map(i => i._id);
      setExpandedNodes(new Set(roots));
    } catch (err) {
      console.error(err);
      setError('Failed to load classifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassifications();
  }, [activeType]);

  const toggleExpand = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await api.delete(`/api/classifications/${id}`, { params: { type: activeType } });
      showToast(`Classification "${name}" deleted`);
      fetchClassifications();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to delete classification', 'error');
    }
  };

  // Build tree structure
  const rootNodes = classifications.filter(c => !c.parentId || (typeof c.parentId === 'object' && !c.parentId._id));
  const getChildren = (parentId) => classifications.filter(c => {
    const pId = typeof c.parentId === 'object' ? c.parentId?._id : c.parentId;
    return pId === parentId;
  });

  const renderTreeNode = (node, depth = 0) => {
    const children = getChildren(node._id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(node._id);

    return (
      <div key={node._id} className="space-y-1">
        <div
          className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
            depth === 0 ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-50/60 border-slate-100 hover:bg-slate-100/50'
          }`}
          style={{ marginLeft: `${depth * 20}px` }}
        >
          <div className="flex items-center space-x-2.5">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(node._id)}
                className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="w-6" />
            )}

            {depth === 0 ? (
              <Folder className="h-4 w-4 text-blue-600 fill-blue-50" />
            ) : (
              <Tag className="h-3.5 w-3.5 text-slate-500" />
            )}

            <div>
              <span className="text-xs font-bold text-slate-800">{node.name}</span>
              {node.code && (
                <span className="ml-2 font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  {node.code}
                </span>
              )}
              {node.description && (
                <span className="ml-3 text-[11px] text-slate-400 truncate max-w-md inline-block align-bottom">
                  {node.description}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1 opacity-80 hover:opacity-100">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAddModal(node._id)}
              className="h-6 px-2 text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-white"
              title="Add sub-category"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Child
            </Button>
            <button
              onClick={() => handleOpenEditModal(node)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleDelete(node._id, node.name)}
              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 font-sans text-slate-900 w-full max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-xl text-xs font-bold text-white transition-all ${
          toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-blue-600" />
            Category & Classification Master
          </h1>
          <p className="text-xs text-slate-500">
            Manage hierarchical trees for materials, components, and vendor specializations.
          </p>
        </div>

        <div className="flex items-center space-x-2">
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

          <Button
            size="sm"
            onClick={() => handleOpenAddModal(null)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 text-xs shadow-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Root Category
          </Button>
        </div>
      </div>

      {/* Tree Content Card */}
      <Card className="bg-white border-slate-200 shadow-xs">
        <CardHeader className="py-2.5 px-4 border-b border-slate-200 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <span>{activeType === 'material' ? 'Material Hierarchy Tree' : 'Vendor Classification Tree'}</span>
            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {classifications.length} categories
            </span>
          </CardTitle>

          <Button
            size="sm"
            variant="ghost"
            onClick={fetchClassifications}
            disabled={loading}
            className="h-7 text-xs text-slate-500 font-bold"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>

        <CardContent className="p-4">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs font-bold animate-pulse">
              Loading hierarchy tree...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-rose-500 text-xs font-bold bg-rose-50 rounded-lg">
              {error}
            </div>
          ) : classifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium">
              No classifications defined. Click <strong>Add Root Category</strong> to begin.
            </div>
          ) : (
            <div className="space-y-2">
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
        <form onSubmit={handleSave} className="space-y-4">
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
                className="w-full h-8 px-2 border border-slate-200 rounded-md text-xs text-slate-800 bg-white"
              >
                <option value="">(None - Root Level)</option>
                {classifications
                  .filter(c => !editingItem || c._id !== editingItem._id)
                  .map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name}
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
              rows={3}
              placeholder="Provide context or guidelines for this category..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:border-blue-500"
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
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
            >
              {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default ClassificationsPage;
