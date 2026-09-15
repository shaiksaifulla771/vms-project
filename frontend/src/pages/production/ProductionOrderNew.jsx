import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, FileText, Package, Database, Info } from 'lucide-react';
import api from '../../services/api';

export default function ProductionOrderNew() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  
  const [formData, setFormData] = useState({
    bomId: '',
    targetQuantity: '',
    sourceWarehouseId: '',
    destinationWarehouseId: '',
    batchNumber: ''
  });
  
  const [selectedBom, setSelectedBom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPrerequisites();
  }, []);

  const fetchPrerequisites = async () => {
    try {
      const [bomRes, whRes] = await Promise.all([
        api.get('/api/boms?status=Active'),
        api.get('/api/warehouses?isActive=true')
      ]);
      setBoms(bomRes.data.data);
      setWarehouses(whRes.data.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load prerequisites.');
    }
  };

  const handleBomChange = (e) => {
    const id = e.target.value;
    setFormData({ ...formData, bomId: id });
    const bom = boms.find(b => b._id === id);
    setSelectedBom(bom);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/productions', formData);
      navigate(`/production/${res.data.data._id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create Production Order');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/production" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">New Production Order</h1>
            <p className="text-sm text-slate-500">Create a Draft PRD order for execution</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center">
          <Info className="w-5 h-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 font-medium text-slate-700 flex items-center">
            <FileText className="w-4 h-4 mr-2" /> Basic Info
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product BOM <span className="text-red-500">*</span></label>
              <select 
                required 
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.bomId}
                onChange={handleBomChange}
              >
                <option value="">Select BOM...</option>
                {boms.map(bom => (
                  <option key={bom._id} value={bom._id}>
                    {bom.productId?.name} (v{bom.version})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Quantity <span className="text-red-500">*</span></label>
              <input 
                type="number" 
                min="1"
                required 
                placeholder="e.g. 100"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.targetQuantity}
                onChange={(e) => setFormData({ ...formData, targetQuantity: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Batch Number (Optional)</label>
              <input 
                type="text" 
                placeholder="Leave blank to auto-generate"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.batchNumber}
                onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 font-medium text-slate-700 flex items-center">
            <Database className="w-4 h-4 mr-2" /> Logistics & Warehousing
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Source Warehouse (RM Pull) <span className="text-red-500">*</span></label>
              <select 
                required 
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.sourceWarehouseId}
                onChange={(e) => setFormData({ ...formData, sourceWarehouseId: e.target.value })}
              >
                <option value="">Select Warehouse...</option>
                {warehouses.map(wh => (
                  <option key={wh._id} value={wh._id}>{wh.code} - {wh.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Destination Warehouse (FG Push) <span className="text-red-500">*</span></label>
              <select 
                required 
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.destinationWarehouseId}
                onChange={(e) => setFormData({ ...formData, destinationWarehouseId: e.target.value })}
              >
                <option value="">Select Warehouse...</option>
                {warehouses.map(wh => (
                  <option key={wh._id} value={wh._id}>{wh.code} - {wh.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {selectedBom && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
            <div className="flex items-center mb-4">
              <Package className="w-5 h-5 text-slate-500 mr-2" />
              <h3 className="font-semibold text-slate-800">BOM Explosion Preview</h3>
            </div>
            <div className="bg-white rounded border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 font-medium text-slate-600">Component MPN</th>
                    <th className="px-4 py-2 font-medium text-slate-600">Base Qty</th>
                    <th className="px-4 py-2 font-medium text-slate-600">Est. Requirement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBom.components.map(comp => (
                    <tr key={comp._id}>
                      <td className="px-4 py-2">{comp.mpnId?.mpnCode}</td>
                      <td className="px-4 py-2">{comp.qty}</td>
                      <td className="px-4 py-2 font-medium text-blue-700">
                        {formData.targetQuantity ? (comp.qty / selectedBom.batchSize * formData.targetQuantity).toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <Link to="/production" className="btn-secondary px-6">Cancel</Link>
          <button type="submit" disabled={loading} className="btn-primary px-6">
            {loading ? 'Creating...' : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Draft
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
