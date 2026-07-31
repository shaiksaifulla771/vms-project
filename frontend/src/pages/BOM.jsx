import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import { Badge } from '../components/ui/Badge';
import { Plus, Trash2, Edit2, Copy, Calculator, Search, Filter, Printer, Coins } from 'lucide-react';

const TruncatedTooltipText = ({ text }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const textRef = React.useRef(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (textRef.current) {
      setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div 
      className="relative flex-1 min-w-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span 
        ref={textRef} 
        className="font-bold block truncate text-slate-800"
      >
        {text}
      </span>
      {isHovered && isTruncated && (
        <div className="absolute left-0 bottom-full mb-1 z-50 bg-slate-900 text-white text-xs font-semibold px-2 py-1 rounded shadow-xl whitespace-normal break-words w-max max-w-[300px]">
          {text}
        </div>
      )}
    </div>
  );
};

const BOM = () => {
  const [boms, setBoms] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('Active');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedBoms, setSelectedBoms] = useState([]);

  // Search & Filter state
  const [productSearch, setProductSearch] = useState('');
  const [componentFilter, setComponentFilter] = useState('');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form Fields State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [outputQuantity, setOutputQuantity] = useState(1);
  const [outputUnit, setOutputUnit] = useState('kg');
  const [componentsList, setComponentsList] = useState([
    { materialId: '', quantity: 1, typeFilter: '' }
  ]);
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  // Scale Calculator Modal State
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcBom, setCalcBom] = useState(null);
  const [calcBatchSize, setCalcBatchSize] = useState('1000');

  const fetchMaterialsForDropdowns = async () => {
    try {
      const resMaterials = await api.get('/api/materials');
      if (resMaterials.data.success) {
        const mats = resMaterials.data.data;
        // Assemblies can be Finished Goods or Semi-Finished intermediates
        setFinishedProducts(mats.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished'));
        // Component ingredients can be Raw Material, Packaged Material, or Semi-Finished
        setRawMaterials(mats.filter(m => 
          m.type === 'Raw Material' || 
          m.type === 'Packaged Material' || 
          m.type === 'Semi-Finished'
        ));
      }
    } catch (err) {
      console.error('Failed to fetch latest materials for dropdowns:', err);
    }
  };

  const fetchBOMs = async (currentStatus = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const [resBoms, resMaterials] = await Promise.all([
        api.get(`/api/boms?status=${currentStatus}`),
        api.get('/api/materials')
      ]);

      if (resBoms.data.success) setBoms(resBoms.data.data);
      if (resMaterials.data.success) {
        const mats = resMaterials.data.data;
        setFinishedProducts(mats.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished'));
        setRawMaterials(mats.filter(m => 
          m.type === 'Raw Material' || 
          m.type === 'Packaged Material' || 
          m.type === 'Semi-Finished'
        ));
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch Bill of Materials registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBOMs(statusFilter);
    setSelectedBoms([]);
  }, [statusFilter]);

  useEffect(() => {
    fetchBOMs('Active');
  }, []);

  const handleOpenAddModal = () => {
    fetchMaterialsForDropdowns(); // Ensure fresh data on open
    setEditingId(null);
    setSelectedProductId('');
    setOutputQuantity(1);
    setOutputUnit('kg');
    setComponentsList([{ materialId: '', quantity: 1, typeFilter: '' }]);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (bomItem) => {
    fetchMaterialsForDropdowns(); // Ensure fresh data on open
    setEditingId(bomItem._id);
    setSelectedProductId(bomItem.productId?._id || bomItem.productId || '');
    setOutputQuantity(bomItem.outputQuantity || 1);
    setOutputUnit(bomItem.outputUnit || 'kg');
    
    const fmtComps = bomItem.components.map(comp => ({
      materialId: comp.materialId?._id || comp.materialId || '',
      quantity: comp.quantity,
      typeFilter: comp.materialId?.type || ''
    }));
    setComponentsList(fmtComps);
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Clone recipe components to a new target assembly
  const handleCloneRecipe = (bomItem) => {
    fetchMaterialsForDropdowns(); // Ensure fresh data on open
    setEditingId(null); // Force as new creation
    setSelectedProductId(''); // Let user choose a new target finished good
    setOutputQuantity(bomItem.outputQuantity || 1);
    setOutputUnit(bomItem.outputUnit || 'kg');
    const clonedComps = bomItem.components.map(comp => ({
      materialId: comp.materialId?._id || comp.materialId || '',
      quantity: comp.quantity,
      typeFilter: comp.materialId?.type || ''
    }));
    setComponentsList(clonedComps);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  // Add Component Form Row
  const handleAddComponentRow = (index) => {
    const newList = [...componentsList];
    newList.splice(index + 1, 0, { materialId: '', quantity: 0.01, typeFilter: '' });
    setComponentsList(newList);
  };

  // Remove Component Form Row
  const handleRemoveComponentRow = (index) => {
    if (componentsList.length === 1) return;
    setComponentsList(componentsList.filter((_, i) => i !== index));
  };

  // Update dynamic row value
  const handleRowChange = (index, field, value) => {
    const updated = [...componentsList];
    updated[index][field] = value;
    
    // Automatically set typeFilter if a material is selected directly
    if (field === 'materialId') {
      const mat = rawMaterials.find(rm => rm._id === value);
      if (mat) {
        updated[index].typeFilter = mat.type;
      }
    }
    
    setComponentsList(updated);
  };

  const validateForm = () => {
    const errors = {};
    if (!selectedProductId) errors.productId = 'Please select a finished or semi-finished product';
    if (!outputQuantity || Number(outputQuantity) <= 0) errors.outputQuantity = 'Output batch quantity must be greater than 0';
    if (!outputUnit) errors.outputUnit = 'Output unit is required';
    
    if (componentsList.length === 0) {
      errors.components = 'BOM must contain at least one component material';
    }

    const seenIds = new Set();
    componentsList.forEach((comp, idx) => {
      if (!comp.materialId) {
        errors.components = 'Please specify component material references for all rows';
      }
      if (Number(comp.quantity) <= 0 || isNaN(comp.quantity)) {
        errors.components = 'Component quantities must be valid positive numbers';
      }
      if (seenIds.has(comp.materialId)) {
        errors.components = 'Duplicate component materials are not allowed in the same BOM';
      }
      seenIds.add(comp.materialId);
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      const payload = {
        productId: selectedProductId,
        outputQuantity: Number(outputQuantity),
        outputUnit,
        components: componentsList.map(c => ({
          materialId: c.materialId,
          quantity: Number(c.quantity)
        }))
      };

      if (editingId) {
        await api.put(`/api/boms/${editingId}`, payload);
      } else {
        await api.post('/api/boms', payload);
      }
      fetchBOMs();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit BOM recipe configuration.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedBoms(filteredBoms.map(b => b._id));
    } else {
      setSelectedBoms([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedBoms(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Soft delete ${selectedBoms.length} BOM(s)?`)) return;
    try {
      await api.post('/api/boms/bulk-delete', { ids: selectedBoms });
      setSelectedBoms([]);
      fetchBOMs();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to bulk delete' );
    }
  };

  const handleBulkRestore = async () => {
    if (!window.confirm(`Restore ${selectedBoms.length} BOM(s)?`)) return;
    try {
      await api.post('/api/boms/bulk-restore', { ids: selectedBoms });
      setSelectedBoms([]);
      fetchBOMs();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to bulk restore' );
    }
  };

  const handleDeleteBOM = async (id) => {
    if (!window.confirm('Delete this Bill of Materials (BOM) recipe?')) return;
    try {
      await api.delete(`/api/boms/${id}`);
      fetchBOMs();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to delete BOM.';
      alert(`Dependency error: ${msg}`);
    }
  };

  // Open batch calculator modal
  const handleOpenCalculator = (bom) => {
    setCalcBom(bom);
    setCalcBatchSize('1000');
    setIsCalcOpen(true);
  };

  // Filtered BOMs based on product search and component filters
  const filteredBoms = boms.filter(bom => {
    const matchesProduct = 
      bom.productId?.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      bom.productId?.code.toLowerCase().includes(productSearch.toLowerCase());
    
    const matchesComponent = componentFilter === '' || bom.components.some(comp => {
      const matId = comp.materialId?._id || comp.materialId;
      return matId === componentFilter;
    });

    return matchesProduct && matchesComponent;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner and search inputs */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 flex-1 w-full">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search BOM by product name or code..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="relative w-full sm:w-64">
              <select
                value={componentFilter}
                onChange={(e) => setComponentFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none cursor-pointer"
              >
                <option value="">Filter by Ingredient (All)</option>
                {rawMaterials.map(rm => (
                  <option key={rm._id} value={rm._id}>Contains: {rm.name}</option>
                ))}
              </select>
            </div>
            
            {(productSearch || componentFilter) && (
              <Button 
                variant="ghost" 
                onClick={() => { setProductSearch(''); setComponentFilter(''); }} 
                className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 h-9 px-3 shrink-0"
              >
                Clear Filters
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full md:w-auto shrink-0">
            <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
              <button
                onClick={() => setStatusFilter('Active')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${statusFilter === 'Active' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('Deleted')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${statusFilter === 'Deleted' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Deleted
              </button>
            </div>
            {statusFilter === 'Active' && (
              <Button onClick={handleOpenAddModal} className="flex items-center space-x-1 w-full sm:w-auto justify-center">
                <Plus className="h-4 w-4" />
                <span>Define BOM</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Grid table */}
      <Card>
        {isSelectMode && (
          <div className="bg-blue-50 border-b border-blue-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-blue-800">{selectedBoms.length} BOM(s) selected</span>
            </div>
            <div className="flex items-center space-x-2">
              {statusFilter === 'Active' && selectedBoms.length === 1 && (
                <Button size="sm" onClick={() => handleOpenEditModal(boms.find(b => b._id === selectedBoms[0]))} className="bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 mr-2 shadow-sm">
                  <Edit2 className="h-4 w-4 mr-1" /> Edit Selected
                </Button>
              )}
              {statusFilter === 'Active' && (
                <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={selectedBoms.length === 0} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
                  <Trash2 className="h-4 w-4 mr-1" /> Soft Delete Selected
                </Button>
              )}
              {statusFilter === 'Deleted' && (
                <Button size="sm" onClick={handleBulkRestore} disabled={selectedBoms.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent">
                  Restore Selected
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="px-4 py-2 border-b border-slate-100 flex justify-end bg-slate-50">
          <label className="flex items-center space-x-2 text-sm font-semibold text-slate-700 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isSelectMode} 
              onChange={(e) => {
                setIsSelectMode(e.target.checked);
                if (!e.target.checked) setSelectedBoms([]);
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <span>Select Mode</span>
          </label>
        </div>
        <CardContent className="p-0">
          {error && <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50">{error}</div>}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="text-xs text-slate-400 font-semibold">Loading BOM lists...</p>
            </div>
          ) : filteredBoms.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium">No matching Bill of Materials (BOM) configurations found.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse table-auto text-sm">
                <thead>
                  <tr className="bg-[#2a2a2a] text-white">
                    {isSelectMode && (
                      <th className="px-2 py-1.5 border border-[#3a3a3a] w-8 text-center font-semibold">
                        <input 
                          type="checkbox" 
                          checked={filteredBoms.length > 0 && selectedBoms.length === filteredBoms.length}
                          onChange={handleSelectAll}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="px-3 py-1.5 border border-[#3a3a3a] font-semibold whitespace-nowrap w-[1%]">Product Name</th>
                    <th className="px-3 py-1.5 border border-[#3a3a3a] font-semibold whitespace-nowrap w-[1%]">Code</th>
                    <th className="px-3 py-1.5 border border-[#3a3a3a] font-semibold whitespace-nowrap w-[1%]">Type</th>
                    <th className="px-3 py-1.5 border border-[#3a3a3a] font-semibold whitespace-nowrap w-[1%] text-center">Yield</th>
                    <th className="px-3 py-1.5 border border-[#3a3a3a] font-semibold whitespace-nowrap w-[1%] text-center">Cost</th>
                    <th className="px-3 py-1.5 border border-[#3a3a3a] font-semibold whitespace-nowrap w-full text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white text-slate-800">
                {filteredBoms.map((bom) => (
                  <tr key={bom._id} className={`border-b border-slate-200 hover:bg-slate-50 ${selectedBoms.includes(bom._id) ? 'bg-blue-50/50' : ''}`}>
                    {isSelectMode && (
                      <td className="px-2 py-1.5 border-x border-slate-200 text-center align-middle">
                        <input 
                          type="checkbox"
                          checked={selectedBoms.includes(bom._id)}
                          onChange={() => handleSelectOne(bom._id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-3 py-1.5 border-x border-slate-200 align-middle whitespace-nowrap font-medium text-slate-900">
                      {bom.productId?.name || 'Unknown Product'}
                    </td>
                    <td className="px-3 py-1.5 border-x border-slate-200 align-middle font-mono text-[11px] text-blue-600 font-bold whitespace-nowrap">
                      {bom.productId?.code || '-'}
                    </td>
                    <td className="px-3 py-1.5 border-x border-slate-200 align-middle whitespace-nowrap">
                      <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                        {bom.productId?.type || 'Finished'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 border-x border-slate-200 align-middle text-center whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-800">
                        {bom.outputQuantity} {bom.outputUnit || 'kg'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 border-x border-slate-200 align-middle text-center whitespace-nowrap">
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-slate-800">
                          ₹{(bom.totalRecipeCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {bom.hasMissingPrices && (
                          <div className="text-[9px] text-amber-600 font-bold mt-0.5">
                            ⚠ Incomplete
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-1.5 border-x border-slate-200 align-middle text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => handleOpenCalculator(bom)}
                          title="Scale recipe batch sizes & estimate material costs"
                          className="p-1 rounded hover:bg-slate-200 text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 text-[11px] font-bold transition-all border border-transparent hover:border-slate-300"
                        >
                          <Calculator className="h-3 w-3" />
                          <span className="hidden sm:inline">Scale</span>
                        </button>

                        <button
                          onClick={() => handleCloneRecipe(bom)}
                          title="Clone this components list to a new assembly product"
                          className="p-1 rounded hover:bg-slate-200 text-blue-600 hover:text-blue-700 transition-all border border-transparent hover:border-slate-300"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        
                        {statusFilter === 'Active' && (
                          <>
                            <button
                              onClick={() => handleOpenEditModal(bom)}
                              title="Edit components"
                              className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 border border-transparent hover:border-slate-300"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            
                            <button
                              onClick={() => handleDeleteBOM(bom._id)}
                              title="Delete recipe"
                              className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-700 border border-transparent hover:border-red-200"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>

      {/* CRUD Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit BOM Recipe Configuration' : 'Define Bill of Materials (BOM)'}
        className="max-w-5xl w-full"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
            {/* Finished Good selector */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Assembly Product (Finished or Semi-Finished)</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={!!editingId}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none"
                required
              >
                <option value="" disabled>Select Finished / Semi-Finished Good</option>
                {finishedProducts.map(p => (
                  <option key={p._id} value={p._id}>{p.name} ({p.code}) [{p.type}]</option>
                ))}
              </select>
              {formErrors.productId && <span className="text-xs text-red-500 font-medium">{formErrors.productId}</span>}
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Batch Yield (Output Quantity)</label>
              <input
                type="number"
                min="0.000001"
                step="any"
                value={outputQuantity}
                onChange={(e) => setOutputQuantity(e.target.value)}
                placeholder="e.g. 100"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                required
              />
              {formErrors.outputQuantity && <span className="text-xs text-red-500 font-medium">{formErrors.outputQuantity}</span>}
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Output Unit</label>
              <input
                type="text"
                value={outputUnit}
                onChange={(e) => setOutputUnit(e.target.value)}
                placeholder="kg, liters, pcs..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                required
              />
              {formErrors.outputUnit && <span className="text-xs text-red-500 font-medium">{formErrors.outputUnit}</span>}
            </div>
          </div>

          {/* Components Grid rows */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="text-xs font-bold text-slate-600">Recipe Materials (Ingredients)</span>
            </div>

            {formErrors.components && (
              <div className="text-xs text-red-500 font-medium bg-red-50 py-1 px-2.5 rounded-md border border-red-100">
                {formErrors.components}
              </div>
            )}

            <div className="max-h-[250px] overflow-y-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold text-slate-600 w-1/4">Type Filter</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 w-1/2">Component</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 w-1/4">Input Qty</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 text-center w-10">Act</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {componentsList.map((comp, index) => {
                    const filteredMaterials = comp.typeFilter
                      ? rawMaterials.filter(m => m.type === comp.typeFilter)
                      : rawMaterials;

                    return (
                      <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-2 align-top">
                          <select
                            value={comp.typeFilter || ''}
                            onChange={(e) => handleRowChange(index, 'typeFilter', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none"
                          >
                            <option value="">All Types</option>
                            <option value="Raw Material">Raw Material</option>
                            <option value="Packaged Material">Packaged Material</option>
                            <option value="Semi-Finished">Semi-Finished</option>
                          </select>
                        </td>
                        <td className="p-2 align-top">
                          <select
                            value={comp.materialId}
                            onChange={(e) => handleRowChange(index, 'materialId', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none"
                            required
                          >
                            <option value="" disabled>Select Component</option>
                            {filteredMaterials.map(m => (
                              <option key={m._id} value={m._id}>{m.name} ({m.code}) [{m.type}]</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            step="any"
                            min="0.000001"
                            placeholder="Qty"
                            value={comp.quantity}
                            onChange={(e) => handleRowChange(index, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none"
                            required
                          />
                        </td>
                        <td className="p-2 align-top text-center pt-3 flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleAddComponentRow(index)}
                            className="p-1 rounded text-blue-500 hover:bg-blue-50 transition-colors"
                            title="Add Component Below"
                          >
                            <Plus className="h-4 w-4 mx-auto" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveComponentRow(index)}
                            disabled={componentsList.length === 1}
                            className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                            title="Remove Component"
                          >
                            <Trash2 className="h-4 w-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-50">
            <Button type="button" onClick={handleCloseModal} className="bg-transparent hover:bg-slate-50 text-slate-500 border border-slate-200">
              Cancel
            </Button>
            <Button type="submit" isLoading={submitLoading}>
              Save Recipe
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Batch Scaling & Cost Estimate Calculator Modal */}
      <Dialog
        isOpen={isCalcOpen}
        onClose={() => setIsCalcOpen(false)}
        title="Recipe Batch Scale Sheet & Cost Estimation"
      >
        {calcBom && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Scaled Product Details</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400">Product:</span> <strong className="text-slate-800">{calcBom.productId?.name}</strong></div>
                <div><span className="text-slate-400">Code:</span> <strong className="text-slate-800 font-mono">{calcBom.productId?.code}</strong></div>
                <div><span className="text-slate-400">Unit Type:</span> <strong className="text-slate-800">{calcBom.productId?.unit}</strong></div>
                <div><span className="text-slate-400">Product Type:</span> <strong className="text-slate-800">{calcBom.productId?.type}</strong></div>
              </div>
            </div>

            {/* Input target batch size */}
            <div className="flex items-end gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex-1">
                <Input
                  label="Target Batch Size (Output Units)"
                  id="calcBatchSize"
                  type="number"
                  min="1"
                  value={calcBatchSize}
                  onChange={(e) => setCalcBatchSize(e.target.value)}
                  required
                />
              </div>
              <Button onClick={() => window.print()} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center space-x-1 shrink-0 h-9 px-3.5">
                <Printer className="h-4 w-4" />
                <span>Print Sheet</span>
              </Button>
            </div>

            {/* Scaled components output table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material Name</TableHead>
                    <TableHead>Single Unit Qty</TableHead>
                    <TableHead className="text-right">Scaled Batch Weight / Qty</TableHead>
                    <TableHead className="text-right">Estimated Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calcBom.components.map((comp, idx) => {
                    const singleQty = comp.quantity;
                    const scaledQty = singleQty * Number(calcBatchSize || 0);
                    // Mock prices: ₹1.20 per kg/pcs, spices are more expensive e.g. ₹4.50
                    const isSpice = comp.materialId?.name.toLowerCase().includes('spice') || comp.materialId?.name.toLowerCase().includes('cumin') || comp.materialId?.name.toLowerCase().includes('pepper');
                    const isBox = comp.materialId?.name.toLowerCase().includes('box') || comp.materialId?.name.toLowerCase().includes('corrugated');
                    const mockUnitPrice = isSpice ? 15.00 : isBox ? 0.35 : 1.25;
                    const estCost = scaledQty * mockUnitPrice;

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-bold text-slate-700">{comp.materialId?.name}</TableCell>
                        <TableCell className="text-slate-500 font-mono text-xs">{singleQty} {comp.materialId?.unit}</TableCell>
                        <TableCell className="text-right font-black text-slate-800 text-xs">
                          {scaledQty.toFixed(4)} {comp.materialId?.unit}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600 font-mono text-xs">
                          ₹{estCost.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Cost Summary Info Box */}
            <div className={`border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 ${calcBom.hasMissingPrices ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
              <div className="flex items-center space-x-1.5 font-bold">
                <Coins className="h-4 w-4" />
                <span>Estimated Material Cost for batch</span>
              </div>
              <div className="flex items-center flex-wrap gap-2 text-right">
                {calcBom.hasMissingPrices && (
                  <span className="font-bold text-[10px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-700">
                    ⚠ Incomplete (Missing Prices)
                  </span>
                )}
                <strong className="text-sm font-black font-mono">
                  ₹{calcBom.components.reduce((acc, comp) => {
                    const singleQty = comp.quantity;
                    const scaledQty = singleQty * Number(calcBatchSize || 0);
                    const isSpice = comp.materialId?.name.toLowerCase().includes('spice') || comp.materialId?.name.toLowerCase().includes('cumin') || comp.materialId?.name.toLowerCase().includes('pepper');
                    const isBox = comp.materialId?.name.toLowerCase().includes('box') || comp.materialId?.name.toLowerCase().includes('corrugated');
                    const mockUnitPrice = isSpice ? 15.00 : isBox ? 0.35 : 1.25;
                    return acc + (scaledQty * mockUnitPrice);
                  }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button onClick={() => setIsCalcOpen(false)} className="bg-slate-900 text-white">
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default BOM;
