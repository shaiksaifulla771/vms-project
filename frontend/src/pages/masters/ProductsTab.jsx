import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import usePageMeta from '../../hooks/usePageMeta';
import {
  Package,
  Plus,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Play,
  Layers,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Tag,
  Boxes,
  Edit2
} from 'lucide-react';
import BatchExecutionModal from '../../components/production/BatchExecutionModal';

export default function ProductsTab() {
  usePageMeta('Finished Goods Catalog', 'Dedicated Products master separated from raw materials, linked to BOM recipes and batch execution.');
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [boms, setBoms] = useState([]);
  const [inventoryBalances, setInventoryBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [toastMsg, setToastMsg] = useState(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchModalProduct, setBatchModalProduct] = useState(null);

  // New Product Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    subcategory: '',
    unit: 'pcs',
    description: '',
    status: 'Active'
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [matRes, bomRes, invRes] = await Promise.all([
        api.get('/api/materials').catch(() => ({ data: { data: [] } })),
        api.get('/api/bom').catch(() => ({ data: { data: [] } })),
        api.get('/api/inventory').catch(() => ({ data: { data: [] } }))
      ]);

      const allMaterials = matRes.data?.data || matRes.data?.materials || [];
      // Filter strictly for Finished Goods ("Yes, let us separate")
      const finishedProducts = allMaterials.filter(
        m => m.type === 'Finished' || m.type === 'Finished Goods'
      );
      setProducts(finishedProducts);

      const allBoms = bomRes.data?.data || bomRes.data?.boms || [];
      setBoms(allBoms);

      // Build material -> onHand balance lookup map
      const invMap = {};
      const invItems = invRes.data?.data || [];
      invItems.forEach(item => {
        const matId = item.materialId?._id || item.materialId;
        if (matId) {
          invMap[matId] = (invMap[matId] || 0) + (item.onHand || item.balance || 0);
        }
      });
      setInventoryBalances(invMap);
    } catch (err) {
      console.error('Failed to load products data:', err);
      setToastMsg({ type: 'error', text: 'Failed to load finished goods catalog' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Link BOM to each product
  const enrichedProducts = useMemo(() => {
    return products.map(prod => {
      // Look for active BOM that outputs this product
      const linkedBom = boms.find(b => 
        (b.productId?._id || b.productId) === prod._id && b.status === 'Active'
      ) || boms.find(b => (b.productId?._id || b.productId) === prod._id);

      const stockOnHand = inventoryBalances[prod._id] || 0;

      return {
        ...prod,
        linkedBom,
        stockOnHand
      };
    });
  }, [products, boms, inventoryBalances]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return enrichedProducts.filter(p => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        (p.name || '').toLowerCase().includes(q) || 
        (p.code || '').toLowerCase().includes(q) ||
        (p.subcategory || '').toLowerCase().includes(q);
      
      const matchesCat = categoryFilter === 'ALL' || p.subcategory === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [enrichedProducts, searchQuery, categoryFilter]);

  // Subcategories list
  const subcategories = useMemo(() => {
    const set = new Set();
    products.forEach(p => { if (p.subcategory) set.add(p.subcategory); });
    return Array.from(set);
  }, [products]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalCount = products.length;
    const withBom = enrichedProducts.filter(p => !!p.linkedBom).length;
    const totalStock = enrichedProducts.reduce((acc, p) => acc + p.stockOnHand, 0);
    return { totalCount, withBom, totalStock };
  }, [products, enrichedProducts]);

  // Handle Save Product (Create or Edit)
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        type: 'Finished',
        subcategory: formData.subcategory.trim(),
        unit: formData.unit.trim(),
        description: formData.description.trim(),
        status: formData.status
      };

      if (editingProduct) {
        await api.put(`/api/materials/${editingProduct._id}`, payload);
        setToastMsg({ type: 'success', text: `✓ Finished Good ${payload.code} updated.` });
      } else {
        await api.post('/api/materials', payload);
        setToastMsg({ type: 'success', text: `✓ Finished Good ${payload.code} created.` });
      }

      setIsAddModalOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', code: '', subcategory: '', unit: 'pcs', description: '', status: 'Active' });
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Operation failed';
      setToastMsg({ type: 'error', text: msg });
    }
  };

  // Launch Batch Execution Modal for a product
  const handleLaunchExecution = (product) => {
    setBatchModalProduct(product);
    setIsBatchModalOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* TOAST ALERT */}
      {toastMsg && (
        <div className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between shadow-xs transition-all ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
            <span className="font-semibold">{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="font-bold ml-4 hover:opacity-75">✕</button>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-black text-slate-900 tracking-tight">Finished Goods Products</h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase tracking-wider">
                Catalog &bull; Sec 1 Architecture
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Autonomous finished goods catalog separated from raw materials, linked directly to BOM recipes and batch execution.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            title="Refresh Catalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => navigate('/bom/new')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 flex items-center space-x-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>Create BOM Recipe</span>
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              setFormData({ name: '', code: `FG-${Date.now().toString().slice(-4)}`, subcategory: '', unit: 'pcs', description: '', status: 'Active' });
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Finished Product</span>
          </button>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Products</span>
            <div className="text-xl font-black text-slate-900">{metrics.totalCount} <span className="text-xs font-semibold text-slate-500">FG SKUs</span></div>
          </div>
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">BOM Recipe Linked</span>
            <div className="text-xl font-black text-slate-900">{metrics.withBom} / {metrics.totalCount} <span className="text-xs font-semibold text-emerald-600">({Math.round((metrics.withBom / (metrics.totalCount || 1)) * 100)}%)</span></div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Physical Stock On Hand</span>
            <div className="text-xl font-black text-slate-900">{metrics.totalStock.toLocaleString()} <span className="text-xs font-semibold text-slate-500">Units</span></div>
          </div>
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH STRIP */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product code, name..."
              className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {subcategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="text-[11px] text-slate-500 font-semibold">
          Showing <span className="text-slate-900 font-black">{filteredProducts.length}</span> finished products
        </div>
      </div>

      {/* PRODUCTS HIGH-DENSITY GRID */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-2.5">Product Code</th>
                <th className="p-2.5">Finished Product Name</th>
                <th className="p-2.5">Sub-Category</th>
                <th className="p-2.5">UOM</th>
                <th className="p-2.5">Linked BOM Recipe</th>
                <th className="p-2.5 text-right">Standard Batch Size</th>
                <th className="p-2.5 text-right">Stock On Hand</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredProducts.map((prod) => {
                const bom = prod.linkedBom;
                return (
                  <tr key={prod._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2.5 font-mono font-bold text-blue-600">
                      {prod.code}
                    </td>
                    <td className="p-2.5 font-bold text-slate-900">
                      {prod.name}
                    </td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                        {prod.subcategory || 'Finished Goods'}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-500 font-semibold">{prod.unit || 'pcs'}</td>
                    <td className="p-2.5">
                      {bom ? (
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-slate-900">{bom.code || bom.bomNumber}</span>
                          <span className="text-[10px] text-emerald-600 font-bold px-1.5 py-0.2 bg-emerald-50 rounded border border-emerald-200">
                            Active
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => navigate('/bom/new')}
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Attach BOM</span>
                        </button>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                      {bom ? `${(bom.batchSize || 1000).toLocaleString()} ${bom.batchUOM || prod.unit || 'kg'}` : '-'}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-slate-900">
                      {prod.stockOnHand.toLocaleString()}
                    </td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        prod.status === 'Active' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {prod.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleLaunchExecution(prod)}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg flex items-center space-x-1 shadow-2xs transition-colors"
                          title="Execute Floor Batch (Sheet 1)"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Execute Batch</span>
                        </button>

                        <button
                          onClick={() => navigate(`/planning`)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors"
                          title="View in Planning / MRP"
                        >
                          <span>Plan</span>
                        </button>

                        <button
                          onClick={() => {
                            setEditingProduct(prod);
                            setFormData({
                              name: prod.name,
                              code: prod.code,
                              subcategory: prod.subcategory || '',
                              unit: prod.unit || 'pcs',
                              description: prod.description || '',
                              status: prod.status || 'Active'
                            });
                            setIsAddModalOpen(true);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          title="Edit Product"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-semibold">
                    No finished goods products found matching your search. Click "+ New Finished Product" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                {editingProduct ? 'Edit Finished Good Product' : 'Add New Finished Good Product'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Product Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. FG-ORANGE-1L"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Pure Orange Juice 1000ml Tetra"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Sub-Category</label>
                  <input
                    type="text"
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    placeholder="e.g. Beverages, Ready to Eat"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Unit of Measure (UOM)</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  >
                    <option value="pcs">pcs</option>
                    <option value="pack">pack</option>
                    <option value="box">box</option>
                    <option value="kg">kg</option>
                    <option value="ltr">ltr</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Packaging specifications, storage conditions..."
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {editingProduct ? 'Update Product' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BATCH EXECUTION MODAL (Sheet 1) */}
      <BatchExecutionModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        initialPlan={null}
        initialBatch={{
          batchNo: `BAT-${batchModalProduct?.code || 'FG'}-${Date.now().toString().slice(-4)}`,
          qty: 1000
        }}
        onExecutionComplete={() => {
          fetchData();
        }}
      />
    </div>
  );
}

