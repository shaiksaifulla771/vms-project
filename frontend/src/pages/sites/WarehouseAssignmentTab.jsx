import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Boxes, Building2, Warehouse, Plus, CheckCircle2, AlertTriangle, RefreshCw, Layers } from 'lucide-react';

const WarehouseAssignmentTab = () => {
  const [assignments, setAssignments] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const [formData, setFormData] = useState({
    materialId: '',
    warehouseId: '',
    minStock: 100,
    maxStock: 5000,
    reorderPoint: 200,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [assignRes, matRes, whRes, siteRes] = await Promise.all([
        api.get('/api/warehouse-materials'),
        api.get('/api/materials'),
        api.get('/api/warehouses'),
        api.get('/api/sites')
      ]);

      setAssignments(assignRes.data?.data || []);
      setMaterials(matRes.data?.data || matRes.data?.materials || []);
      setWarehouses(whRes.data?.warehouses || whRes.data?.data || []);
      setSites(siteRes.data?.sites || siteRes.data?.data || []);
    } catch (err) {
      console.error('Failed to load warehouse assignment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!formData.materialId || !formData.warehouseId) {
      alert('Please select both a Material and a Warehouse.');
      return;
    }

    try {
      const res = await api.post('/api/warehouse-materials/assign', formData);
      if (res.data?.success) {
        setToastMsg({ type: 'success', text: '✓ Material assigned to warehouse without record duplication.' });
        setIsModalOpen(false);
        setFormData({ materialId: '', warehouseId: '', minStock: 100, maxStock: 5000, reorderPoint: 200 });
        fetchData();
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Assignment failed' });
    }
  };

  const handleUnassign = async (id) => {
    if (!window.confirm('Unassign this material from warehouse?')) return;
    try {
      await api.delete(`/api/warehouse-materials/${id}`);
      setToastMsg({ type: 'info', text: 'Material unassigned from warehouse.' });
      fetchData();
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Failed to unassign material.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMsg && (
        <div className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between shadow-sm ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : toastMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800'
          : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
             : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 text-sm font-bold">×</button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            Material & Warehouse Relationship Assignments
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Assign central Material Masters to specific Site/Warehouse nodes without record duplication.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} isLoading={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <Plus className="h-4 w-4 mr-1.5" /> Assign Material to Warehouse
          </Button>
        </div>
      </div>

      {/* Assignments Table */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-4">Material Code & Name</th>
                  <th className="p-4">Assigned Site</th>
                  <th className="p-4">Assigned Warehouse</th>
                  <th className="p-4">Min / Max Stock</th>
                  <th className="p-4">Reorder Point</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                      No material-warehouse assignments created yet. Click <strong>Assign Material to Warehouse</strong>.
                    </td>
                  </tr>
                ) : (
                  assignments.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <span className="font-mono font-bold text-blue-600 block">{item.materialId?.code}</span>
                        <span className="font-bold text-slate-900">{item.materialId?.name}</span>
                      </td>
                      <td className="p-4 font-bold text-slate-800">{item.siteId?.name || '—'}</td>
                      <td className="p-4 font-bold text-slate-900">{item.warehouseId?.name} ({item.warehouseId?.code})</td>
                      <td className="p-4 font-mono text-slate-600">{item.minStock} / {item.maxStock} {item.materialId?.unit}</td>
                      <td className="p-4 font-mono font-bold text-amber-600">{item.reorderPoint} {item.materialId?.unit}</td>
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {item.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnassign(item._id)}
                          className="border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs"
                        >
                          Unassign
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Dialog for Assignment */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Boxes className="h-5 w-5 text-blue-600" />
                Assign Master Material to Warehouse
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-base font-bold">×</button>
            </div>

            <form onSubmit={handleAssign} className="space-y-4 text-xs font-medium text-slate-700">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Select Material Master *</label>
                <select
                  value={formData.materialId}
                  onChange={(e) => setFormData({ ...formData, materialId: e.target.value })}
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select Material --</option>
                  {materials.map(m => (
                    <option key={m._id} value={m._id}>{m.code} - {m.name} ({m.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Select Target Warehouse *</label>
                <select
                  value={formData.warehouseId}
                  onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select Warehouse --</option>
                  {warehouses.map(w => (
                    <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Min Stock</label>
                  <input
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Max Stock</label>
                  <input
                    type="number"
                    value={formData.maxStock}
                    onChange={(e) => setFormData({ ...formData, maxStock: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Reorder Point</label>
                  <input
                    type="number"
                    value={formData.reorderPoint}
                    onChange={(e) => setFormData({ ...formData, reorderPoint: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-mono text-amber-700 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button size="sm" type="submit" className="bg-blue-600 text-white font-bold px-5">Assign to Warehouse</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseAssignmentTab;
