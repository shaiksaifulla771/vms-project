import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import { Badge } from '../components/ui/Badge';
import { Plus, Trash2, Edit2, Copy, Calculator, Search, Filter, Printer, Coins } from 'lucide-react';

const BOM = () => {
  const [boms, setBoms] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search & Filter state
  const [productSearch, setProductSearch] = useState('');
  const [componentFilter, setComponentFilter] = useState('');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form Fields State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [componentsList, setComponentsList] = useState([
    { materialId: '', quantity: 1 }
  ]);
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  // Scale Calculator Modal State
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcBom, setCalcBom] = useState(null);
  const [calcBatchSize, setCalcBatchSize] = useState('1000');

  const fetchBOMs = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resBoms, resMaterials] = await Promise.all([
        api.get('/api/boms'),
        api.get('/api/materials')
      ]);

      if (resBoms.data.success) setBoms(resBoms.data.data);
      if (resMaterials.data.success) {
        const mats = resMaterials.data.data;
        // Assemblies can be Finished Goods or Semi-Finished intermediates
        setFinishedProducts(mats.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished'));
        // Component ingredients can be Raw Materials or Semi-Finished intermediates
        setRawMaterials(mats.filter(m => m.type === 'Raw' || m.type === 'Semi-Finished'));
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch Bill of Materials registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBOMs();
  }, []);

  const handleOpenAddModal = () => {
    setEditingId(null);
    setSelectedProductId('');
    setComponentsList([{ materialId: '', quantity: 1 }]);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (bomItem) => {
    setEditingId(bomItem._id);
    setSelectedProductId(bomItem.productId?._id || bomItem.productId || '');
    
    const fmtComps = bomItem.components.map(comp => ({
      materialId: comp.materialId?._id || comp.materialId || '',
      quantity: comp.quantity
    }));
    setComponentsList(fmtComps);
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Clone recipe components to a new target assembly
  const handleCloneRecipe = (bomItem) => {
    setEditingId(null); // Force as new creation
    setSelectedProductId(''); // Let user choose a new target finished good
    const clonedComps = bomItem.components.map(comp => ({
      materialId: comp.materialId?._id || comp.materialId || '',
      quantity: comp.quantity
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
  const handleAddComponentRow = () => {
    setComponentsList([...componentsList, { materialId: '', quantity: 0.01 }]);
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
    setComponentsList(updated);
  };

  const validateForm = () => {
    const errors = {};
    if (!selectedProductId) errors.productId = 'Please select a finished or semi-finished product';
    
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

  const handleDeleteBOM = async (id) => {
    if (!window.confirm('Delete this Bill of Materials (BOM) recipe? This checks active Production Orders.')) return;
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
          </div>

          <Button onClick={handleOpenAddModal} className="flex items-center space-x-1 w-full md:w-auto shrink-0 justify-center">
            <Plus className="h-4 w-4" />
            <span>Define BOM</span>
          </Button>
        </CardContent>
      </Card>

      {/* Main Grid table */}
      <Card>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assembly Product</TableHead>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipe Ingredients (Components)</TableHead>
                  <TableHead className="text-right">Actions / Functions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBoms.map((bom) => (
                  <TableRow key={bom._id}>
                    <TableCell className="font-bold text-slate-800">
                      {bom.productId?.name || 'Unknown Product'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-blue-600 font-bold">
                      {bom.productId?.code || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={bom.productId?.type === 'Semi-Finished' ? 'warning' : 'info'}>
                        {bom.productId?.type || 'Finished'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5 py-1">
                        {bom.components.map((comp, idx) => (
                          <div key={idx} className="bg-slate-100/80 border border-slate-200/50 rounded-lg px-2 py-0.5 text-[11px] text-slate-600 flex items-center">
                            <span className="font-bold text-slate-700">{comp.materialId?.name || 'Material'}</span>
                            <span className="text-blue-600 font-bold ml-1.5">
                              {comp.quantity} {comp.materialId?.unit || ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Function: Scaling batch sheet calculator */}
                        <button
                          onClick={() => handleOpenCalculator(bom)}
                          title="Scale recipe batch sizes & estimate material costs"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 text-xs font-bold transition-all border border-transparent hover:border-slate-200"
                        >
                          <Calculator className="h-4 w-4" />
                          <span className="hidden sm:inline">Scale</span>
                        </button>

                        {/* Function: Duplicate/Clone BOM Recipe */}
                        <button
                          onClick={() => handleCloneRecipe(bom)}
                          title="Clone this components list to a new assembly product"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-blue-600 hover:text-blue-700 transition-all"
                        >
                          <Copy className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEditModal(bom)}
                          title="Edit components"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        
                        <button
                          onClick={() => handleDeleteBOM(bom._id)}
                          title="Delete recipe"
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CRUD Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit BOM Recipe Configuration' : 'Define Bill of Materials (BOM)'}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

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

          {/* Components Grid rows */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="text-xs font-bold text-slate-600">Recipe Materials (Ingredients)</span>
              <button
                type="button"
                onClick={handleAddComponentRow}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Component</span>
              </button>
            </div>

            {formErrors.components && (
              <div className="text-xs text-red-500 font-medium bg-red-50 py-1 px-2.5 rounded-md border border-red-100">
                {formErrors.components}
              </div>
            )}

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {componentsList.map((comp, index) => (
                <div key={index} className="flex items-center space-x-3 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                  {/* Raw Material selector */}
                  <div className="flex-1">
                    <select
                      value={comp.materialId}
                      onChange={(e) => handleRowChange(index, 'materialId', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none"
                      required
                    >
                      <option value="" disabled>Select Raw / Semi-Finished</option>
                      {rawMaterials.map(m => (
                        <option key={m._id} value={m._id}>{m.name} ({m.code}) [{m.type}]</option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity input */}
                  <div className="w-32">
                    <input
                      type="number"
                      step="any"
                      min="0.000001"
                      placeholder="Qty"
                      value={comp.quantity}
                      onChange={(e) => handleRowChange(index, 'quantity', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none"
                      required
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveComponentRow(index)}
                    disabled={componentsList.length === 1}
                    className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
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
                    // Mock prices: $1.20 per kg/pcs, spices are more expensive e.g. $4.50
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
                          ${estCost.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Cost Summary Info Box */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-800">
              <div className="flex items-center space-x-1.5 font-bold">
                <Coins className="h-4 w-4" />
                <span>Estimated Material Cost for batch</span>
              </div>
              <strong className="text-sm font-black font-mono">
                ${calcBom.components.reduce((acc, comp) => {
                  const singleQty = comp.quantity;
                  const scaledQty = singleQty * Number(calcBatchSize || 0);
                  const isSpice = comp.materialId?.name.toLowerCase().includes('spice') || comp.materialId?.name.toLowerCase().includes('cumin') || comp.materialId?.name.toLowerCase().includes('pepper');
                  const isBox = comp.materialId?.name.toLowerCase().includes('box') || comp.materialId?.name.toLowerCase().includes('corrugated');
                  const mockUnitPrice = isSpice ? 15.00 : isBox ? 0.35 : 1.25;
                  return acc + (scaledQty * mockUnitPrice);
                }, 0).toFixed(2)}
              </strong>
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
