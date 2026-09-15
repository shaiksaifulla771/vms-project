import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Plus, Trash2, AlertTriangle, Info, Loader2 } from 'lucide-react';
import PriceDriftBanner from './PriceDriftBanner';
import SearchableSelect from '../../components/ui/SearchableSelect';

export default function BomRecipeEditor({ 
 initialData, 
 isNew = false,
 onSave, 
 onCancel 
}) {
 const [components, setComponents] = useState(
 initialData?.components?.length 
 ? initialData.components.map(c => ({
     ...c,
     id: c._id || crypto.randomUUID(),
     mpnId: c.mpnId?._id || c.mpnId || '',
     materialId: c.materialId?._id || c.materialId || (c.mpnId?.materialId?._id || c.mpnId?.materialId) || '',
     qty: Number(c.quantity !== undefined ? c.quantity : (c.qty !== undefined ? c.qty : 1)),
     lossPercent: Number(c.lossPercentage !== undefined ? c.lossPercentage : (c.lossPercent !== undefined ? c.lossPercent : 0))
   })) 
 : []
 );
 const [mpns, setMpns] = useState([]);
 const [materials, setMaterials] = useState([]);
 const [errors, setErrors] = useState({});
 const [isDirty, setIsDirty] = useState(false);
 const [loadingPrice, setLoadingPrice] = useState(null); // Track which row is "loading"

 // BOM Header state
 const [productId, setProductId] = useState(initialData?.productId?._id || initialData?.productId || '');
 const [batchSize, setBatchSize] = useState(initialData?.batchSize || 1);
 const [batchUOM, setBatchUOM] = useState(initialData?.batchUOM || 'kg');
 const [effectiveDate, setEffectiveDate] = useState(
 initialData?.effectiveDate ? new Date(initialData.effectiveDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
 );
 const [packagingCost, setPackagingCost] = useState(initialData?.packagingCost || 0);
 const [processingCost, setProcessingCost] = useState(initialData?.processingCost || 0);
 const [overheadCost, setOverheadCost] = useState(initialData?.overheadCost || 0);

 const [batchCode, setBatchCode] = useState(initialData?.batchCode || '');
 const [manufacturer, setManufacturer] = useState(initialData?.manufacturer || '');
 const [originalManufacturer, setOriginalManufacturer] = useState(initialData?.manufacturer || '');
 const [status, setStatus] = useState(initialData?.status || 'Active');
 
 // State for the Save Intercept Modal
 const [showSaveModal, setShowSaveModal] = useState(false);
 const [pendingSavePayload, setPendingSavePayload] = useState(null);

 // Helper to resolve manufacturer from product
 const resolveManufacturer = (pid, matsList = materials, mpnsList = mpns) => {
   if (!pid) return '';
   const pidStr = String(pid?._id || pid);
   const mat = matsList.find(m => String(m._id) === pidStr);
   const mpn = mpnsList.find(m => String(m.materialId?._id || m.materialId) === pidStr);
   return mat?.manufacturer || mat?.manufacturerName || mat?.brand || mpn?.manufacturerName || mpn?.manufacturer || '';
 };

 // Auto-fetch manufacturer on product change & initialization
 useEffect(() => {
    if (!productId || materials.length === 0) return;

    // If initialData already had a manufacturer and this is the original product, preserve it
    const isEditingOriginalProduct = !isNew && String(productId) === String(initialData?.productId?._id || initialData?.productId);
    if (isEditingOriginalProduct && manufacturer) {
      return;
    }

    const foundManufacturer = resolveManufacturer(productId, materials, mpns);
    if (foundManufacturer && (!manufacturer || isNew)) {
      setManufacturer(foundManufacturer);
      setOriginalManufacturer(foundManufacturer);
    }
  }, [productId, mpns, materials, isNew, initialData]);

 useEffect(() => {
 // Fetch MPNs and Materials for dropdowns
 const fetchData = async () => {
 try {
 const [mpnRes, matRes] = await Promise.all([
 api.get('/api/mpns', { params: { status: 'All' } }),
 api.get('/api/materials')
 ]);
 const fetchedMpns = mpnRes.data?.data || [];
 const fetchedMats = matRes.data?.data || [];
 setMpns(fetchedMpns);
 setMaterials(fetchedMats);

 // Auto-fetch manufacturer on initial load if productId is set
 if (productId && !manufacturer) {
   const mfr = resolveManufacturer(productId, fetchedMats, fetchedMpns);
   if (mfr) {
     setManufacturer(mfr);
     setOriginalManufacturer(mfr);
   }
 }
 } catch (err) {
 console.error('Failed to fetch data:', err);
 }
 };
 fetchData();
 }, []);

 // Unsaved changes guard
 useEffect(() => {
 const handleBeforeUnload = (e) => {
 if (isDirty) {
 e.preventDefault();
 e.returnValue = '';
 }
 };
 window.addEventListener('beforeunload', handleBeforeUnload);
 return () => window.removeEventListener('beforeunload', handleBeforeUnload);
 }, [isDirty]);

 // Live total calculation with detailed formula
 const totals = useMemo(() => {
 let totalCost = 0;
 let rawMaterialCost = 0;
 let pkgCost = Number(packagingCost) || 0;
 let prcCost = Number(processingCost) || 0;
 let ovhCost = Number(overheadCost) || 0;

 const lines = components.map(comp => {
 const mpnIdStr = String(comp.mpnId?._id || comp.mpnId || '');
 const matIdStr = String(comp.materialId?._id || comp.materialId || '');

 const mpn = mpnIdStr ? mpns.find(m => String(m._id) === mpnIdStr) : null;
 const mat = (mpn && (mpn.materialId?._id || mpn.materialId))
   ? (mpn.materialId._id ? mpn.materialId : materials.find(m => String(m._id) === String(mpn.materialId)))
   : (matIdStr ? materials.find(m => String(m._id) === matIdStr) : null);
 
 const priceToUse = comp.resolvedPrice !== undefined && comp.resolvedPrice !== null
   ? comp.resolvedPrice
   : (mpn ? (mpn.price || 0) : (mat ? (mat.basePrice || 0) : 0));

 const qty = Number(comp.qty !== undefined ? comp.qty : (comp.quantity || 1));
 const loss = Number(comp.lossPercent !== undefined ? comp.lossPercent : (comp.lossPercentage || 0));
 const lossFactor = 1 - (loss / 100);
 const lineCost = lossFactor > 0 ? (qty * priceToUse) / lossFactor : 0;
 totalCost += lineCost;

 // All components are treated as Raw Material Cost
 rawMaterialCost += lineCost;

 const formula = {
 qty,
 price: priceToUse,
 baseCost: qty * priceToUse,
 loss,
 finalCost: lineCost
 };

 return {
   ...comp,
   mpnId: mpnIdStr,
   materialId: mat?._id || matIdStr,
   mpn,
   material: mat,
   resolvedPrice: priceToUse,
   lineCost,
   formula
 };
 });

 totalCost = rawMaterialCost + pkgCost + prcCost + ovhCost;

 return { 
 lines, 
 totalCost, 
 costPerUnit: Number(batchSize) > 0 ? totalCost / Number(batchSize) : 0,
 breakdown: {
 rawMaterialCost,
 packagingCost: pkgCost,
 processingCost: prcCost,
 overheadCost: ovhCost
 }
 };
 }, [components, mpns, materials, batchSize, packagingCost, processingCost, overheadCost]);

 const addRow = () => {
 setComponents([...components, { mpnId: '', materialId: '', qty: 1, lossPercent: 0 }]);
 setIsDirty(true);
 };

 const removeRow = (index) => {
 const newComps = [...components];
 newComps.splice(index, 1);
 setComponents(newComps);
 setIsDirty(true);
 };

  const updateRow = async (index, field, value) => {
    const newComps = [...components];
    
    if (field === 'mpnId' || field === 'selectionKey') {
      // Check if value matches an MPN or direct Material
      const selectedMpn = mpns.find(m => String(m._id) === String(value));
      const selectedMat = materials.find(m => String(m._id) === String(value));

      const targetMatId = selectedMpn?.materialId?._id || selectedMpn?.materialId || selectedMat?._id;

      // Duplicate ingredient check
      const exists = components.findIndex((c, i) => {
        if (i === index) return false;
        const cMpn = c.mpnId?._id || c.mpnId;
        const cMat = c.materialId?._id || c.materialId;
        return (selectedMpn && cMpn && String(cMpn) === String(selectedMpn._id)) ||
               (targetMatId && cMat && String(cMat) === String(targetMatId));
      });

      if (exists >= 0) {
        alert('This material/MPN is already added to the recipe.');
        return;
      }

      // Circular dependency self-reference check
      if (productId && targetMatId && String(targetMatId) === String(productId)) {
        alert(`Cannot select "${selectedMat?.name || selectedMpn?.materialId?.name || 'this product'}": An assembly product cannot be an ingredient of itself.`);
        return;
      }

      // Simulate loading state for micro-interaction
      setLoadingPrice(index);
      await new Promise(r => setTimeout(r, 250));
      setLoadingPrice(null);
      
      if (selectedMpn) {
        newComps[index] = {
          ...newComps[index],
          mpnId: selectedMpn._id,
          materialId: selectedMpn.materialId?._id || selectedMpn.materialId,
          resolvedPrice: selectedMpn.price || 0
        };
      } else if (selectedMat) {
        newComps[index] = {
          ...newComps[index],
          mpnId: '',
          materialId: selectedMat._id,
          resolvedPrice: selectedMat.basePrice || 0
        };
      } else {
        newComps[index] = {
          ...newComps[index],
          mpnId: '',
          materialId: '',
          resolvedPrice: 0
        };
      }
    } else {
      newComps[index] = { ...newComps[index], [field]: value };
    }
    
    setComponents(newComps);
    setIsDirty(true);
    setErrors(prev => ({ ...prev, [`row_${index}`]: null }));
  };

  const handleSave = () => {
    // Validate
    const newErrors = {};
    if (!productId) newErrors.productId = 'Product is required';
    if (!batchSize || Number(batchSize) <= 0) newErrors.batchSize = 'Batch size must be > 0';
    if (!batchUOM) newErrors.batchUOM = 'UOM is required';
    
    if (batchUOM.toLowerCase().includes('pack') && !Number.isInteger(Number(batchSize))) {
      newErrors.batchSize = 'Packs cannot contain decimals';
    }

    if (components.length === 0) newErrors.general = 'At least one ingredient component is required';

    let firstErrorIndex = -1;

    components.forEach((c, i) => {
      const mpnIdStr = String(c.mpnId?._id || c.mpnId || '');
      const matIdStr = String(c.materialId?._id || c.materialId || '');
      const mpn = mpnIdStr ? mpns.find(m => String(m._id) === mpnIdStr) : null;
      const compMatId = mpn?.materialId?._id || mpn?.materialId || matIdStr;

      if (productId && compMatId && String(compMatId) === String(productId)) {
        newErrors[`row_${i}`] = `Circular Dependency: "${mpn?.materialId?.name || 'Component'}" cannot be an ingredient of itself.`;
        if (firstErrorIndex === -1) firstErrorIndex = i;
      } else if (!mpnIdStr && !matIdStr) {
        newErrors[`row_${i}`] = 'Material / MPN ingredient is required';
        if (firstErrorIndex === -1) firstErrorIndex = i;
      } else if (!c.qty || Number(c.qty) <= 0) {
        newErrors[`row_${i}`] = 'Quantity must be > 0';
        if (firstErrorIndex === -1) firstErrorIndex = i;
      } else if (Number(c.lossPercent) < 0 || Number(c.lossPercent) > 99) {
        newErrors[`row_${i}`] = 'Loss % must be 0-99';
        if (firstErrorIndex === -1) firstErrorIndex = i;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (firstErrorIndex !== -1) {
        document.getElementById(`row-${firstErrorIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setErrors({});
    setIsDirty(false);
    const payload = {
      productId,
      batchSize: Number(batchSize),
      batchUOM,
      status: status || 'Active',
      effectiveDate,
      components: components.map(c => ({
        mpnId: c.mpnId?._id || c.mpnId || undefined,
        materialId: c.materialId?._id || c.materialId || undefined,
        qty: Number(c.qty !== undefined ? c.qty : (c.quantity || 1)),
        lossPercent: Number(c.lossPercent !== undefined ? c.lossPercent : (c.lossPercentage || 0))
      })),
      packagingCost: Number(packagingCost),
      processingCost: Number(processingCost),
      overheadCost: Number(overheadCost),
      batchCode: batchCode?.trim() || '',
      manufacturer: manufacturer?.trim() || '',
      updateMasterManufacturer: false
    };
    
    // Check if manufacturer was modified and is not empty initially
    if (manufacturer?.trim() !== originalManufacturer?.trim() && originalManufacturer?.trim() !== '') {
      setPendingSavePayload(payload);
      setShowSaveModal(true);
      return;
    }

    console.log('Outgoing BOM Payload:', payload);
    onSave(payload);
  };

  const handleConfirmSave = (updateMaster) => {
    const finalPayload = { ...pendingSavePayload, updateMasterManufacturer: updateMaster };
    setShowSaveModal(false);
    setPendingSavePayload(null);
    console.log('Outgoing BOM Payload:', finalPayload);
    onSave(finalPayload);
  };

  // Prepare combined options for SearchableSelect: MPNs + Raw Materials with self-dependency guard
  // Prepare combined options for SearchableSelect: ALL material types + MPNs
  const ingredientOptions = useMemo(() => {
    const options = [];
    const usedMatIds = new Set();

    // 1. Add all active MPNs
    mpns
      .filter(m => m.status !== 'Deleted')
      .forEach(m => {
        const matId = String(m.materialId?._id || m.materialId || '');
        if (matId) usedMatIds.add(matId);

        const isSelf = Boolean(productId && matId && String(matId) === String(productId));
        const matName = m.materialId?.name || m.mpnName || 'Unnamed Material';
        const matCode = m.materialId?.code ? ` (${m.materialId.code})` : '';
        const vendorName = m.vendorId?.name || 'Standard Vendor';
        const mfrName = m.manufacturerName || m.manufacturer || m.materialId?.manufacturer || 'Standard';

        options.push({
          value: m._id,
          label: `${matName}${matCode} — [${m.mpnCode || 'MPN'}]`,
          subLabel: isSelf
            ? '⚠️ SELF-REFERENCE: Finished Product cannot be an ingredient of itself'
            : `Vendor: ${vendorName} | Mfr: ${mfrName} | Price: ₹${m.price || 0}`,
          disabled: isSelf
        });
      });

    // 2. Add all raw, packaging, semi-finished, and finished materials directly
    materials
      .filter(mat => mat.status === 'Active')
      .forEach(mat => {
        const matId = String(mat._id);
        const isSelf = Boolean(productId && String(matId) === String(productId));
        const hasExistingMpnOption = usedMatIds.has(matId);

        if (!hasExistingMpnOption) {
          const typeLabel = mat.type === 'Packaged Material' || mat.type === 'Packing Material' ? 'Packaging'
            : mat.type === 'Raw Material' || mat.type === 'Raw' ? 'Raw Material'
            : mat.type === 'Semi-Finished' ? 'Semi-Finished'
            : mat.type === 'Finished' ? 'Finished Good'
            : mat.type || 'Material';

          options.push({
            value: mat._id,
            label: `${mat.name} (${mat.code}) — [${typeLabel}]`,
            subLabel: isSelf
              ? '⚠️ SELF-REFERENCE: Finished Product cannot be an ingredient of itself'
              : `Mfr: ${mat.manufacturer || mat.manufacturerName || 'Standard'} | Unit: ${mat.unit} | Price: ₹${mat.basePrice || 0}`,
            disabled: isSelf
          });
        }
      });

    return options;
  }, [mpns, materials, productId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2 w-full">
          {!isNew && (
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Edit: {initialData?.productId?.name || 'Recipe'}
              </h2>
            </div>
          )}
          
          {/* Dense Fit-To-Screen Top Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <div className="flex flex-col xl:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">Finished Product *</label>
              <SearchableSelect 
                options={materials.filter(m => (m.type === 'Finished' || m.type === 'Finished Goods' || m.type === 'Finished Good') && m.status !== 'Deleted').map(m => ({
                  value: m._id, label: `${m.name} (${m.code})`
                }))}
                value={productId} 
                onChange={v => {
                  setProductId(v);
                  setErrors(prev => {
                    const next = { ...prev };
                    delete next.productId;
                    delete next.general;
                    return next;
                  });
                  const selectedMat = materials.find(m => String(m._id) === String(v));
                  if (selectedMat) {
                    // 1. Auto-fetch and set Batch UOM from master data
                    if (selectedMat.unit) {
                      setBatchUOM(selectedMat.unit);
                    }

                    // 2. Auto-fetch and set Manufacturer immediately
                    const autoMfr = resolveManufacturer(v, materials, mpns);
                    if (autoMfr) {
                      setManufacturer(autoMfr);
                      setOriginalManufacturer(autoMfr);
                    }
                  }

                  // Check circular dependency on existing rows
                  components.forEach((c, idx) => {
                    const mpnIdStr = String(c.mpnId?._id || c.mpnId || '');
                    const matIdStr = String(c.materialId?._id || c.materialId || '');
                    const mpn = mpnIdStr ? mpns.find(m => String(m._id) === mpnIdStr) : null;
                    const compMatId = mpn?.materialId?._id || mpn?.materialId || matIdStr;
                    if (compMatId && String(compMatId) === String(v)) {
                      setErrors(prev => ({
                        ...prev,
                        [`row_${idx}`]: `Circular Dependency: "${mpn?.materialId?.name || 'Component'}" cannot be an ingredient of itself.`
                      }));
                    }
                  });
                }} 
                className="w-full text-xs"
                placeholder="Select Finished Product..."
              />
              {errors.productId && <p className="text-red-500 text-[11px] mt-0.5 font-semibold">{errors.productId}</p>}
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">Batch Code</label>
              <Input value={batchCode} onChange={e => setBatchCode(e.target.value)} className="w-full h-8 text-xs font-mono font-semibold" placeholder="Optional..." />
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">Manufacturer</label>
              <Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} className="w-full h-8 text-xs font-semibold text-slate-900" placeholder="Auto or custom..." />
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">Batch Size & UOM</label>
              <div className="flex space-x-1">
                <Input type="number" min="0.001" step="any" value={batchSize} onChange={e => setBatchSize(e.target.value)} className="w-full h-8 text-xs font-bold text-slate-900 flex-1" />
                <select 
                  value={batchUOM} 
                  onChange={e => setBatchUOM(e.target.value)} 
                  className="w-24 h-8 px-1.5 bg-white border border-slate-300 rounded-md text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                >
                  {batchUOM && !['pieces', 'pcs', 'kg', 'gm', 'g', 'L', 'ml', 'pouches', 'packs', 'boxes', 'units'].includes(batchUOM.toLowerCase()) && (
                    <option value={batchUOM} className="text-slate-900 bg-white font-bold">{batchUOM}</option>
                  )}
                  <option value="pieces" className="text-slate-900 bg-white font-semibold">pieces</option>
                  <option value="pcs" className="text-slate-900 bg-white font-semibold">pcs</option>
                  <option value="kg" className="text-slate-900 bg-white font-semibold">kg</option>
                  <option value="gm" className="text-slate-900 bg-white font-semibold">gm</option>
                  <option value="g" className="text-slate-900 bg-white font-semibold">g</option>
                  <option value="L" className="text-slate-900 bg-white font-semibold">L</option>
                  <option value="ml" className="text-slate-900 bg-white font-semibold">ml</option>
                  <option value="pouches" className="text-slate-900 bg-white font-semibold">pouches</option>
                  <option value="packs" className="text-slate-900 bg-white font-semibold">packs</option>
                  <option value="boxes" className="text-slate-900 bg-white font-semibold">boxes</option>
                  <option value="units" className="text-slate-900 bg-white font-semibold">units</option>
                </select>
              </div>
              {(errors.batchSize || errors.batchUOM) && <p className="text-red-500 text-[11px] mt-0.5 font-semibold">{errors.batchSize || errors.batchUOM}</p>}
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">Effective Date</label>
              <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="w-full h-8 text-xs font-semibold" />
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Top Action Save / Cancel Bar */}
      <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="text-xs text-slate-600 font-semibold">
          {components.length} ingredient(s) configured
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={onCancel} className="text-xs h-8 px-3 font-semibold">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="text-xs h-8 px-4 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs">
            Save BOM
          </Button>
        </div>
      </div>

      {/* Warnings & Errors */}
      {errors.general && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg flex items-center shadow-2xs">
          <AlertTriangle className="w-4 h-4 mr-2 shrink-0 text-red-500" />
          <span className="font-semibold">{errors.general}</span>
        </div>
      )}

      {/* Universal Ingredients & Packaging Components Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Recipe Ingredients & Packaging Components
          </h3>
          <Button 
            size="sm" 
            onClick={addRow} 
            className="text-xs h-7 px-2.5 font-bold flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Ingredient</span>
          </Button>
        </div>

        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs text-left border-collapse table-fixed">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
              <tr>
                <th className="w-8 px-2 py-1.5 text-center font-mono border-r border-slate-200">#</th>
                <th className="w-[30%] px-2.5 py-1.5 border-r border-slate-200">Ingredient / MPN Select</th>
                <th className="w-[18%] px-2.5 py-1.5 border-r border-slate-200">Material Name</th>
                <th className="w-[18%] px-2.5 py-1.5 border-r border-slate-200">Vendor / Mfr</th>
                <th className="w-20 px-2 py-1.5 text-right border-r border-slate-200">Price (₹)</th>
                <th className="w-20 px-2 py-1.5 text-right border-r border-slate-200">Quantity</th>
                <th className="w-16 px-2 py-1.5 text-center border-r border-slate-200">UOM</th>
                <th className="w-16 px-2 py-1.5 text-right border-r border-slate-200">Loss %</th>
                <th className="w-24 px-2 py-1.5 text-right border-r border-slate-200">Line Cost (₹)</th>
                <th className="w-12 px-1 py-1.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {totals.lines.map((comp, idx) => {
                const mpnObj = comp.mpn;
                const matObj = comp.material;
                const activeKey = comp.mpnId || comp.materialId || '';
                const isDeactivated = mpnObj && mpnObj.status !== 'Active' && mpnObj.status !== 'Draft';
                const isLoading = loadingPrice === idx;
                
                const displayName = mpnObj?.materialId?.name || matObj?.name || comp.materialId?.name || '—';
                const displayVendorMfr = mpnObj?.vendorId?.name 
                  ? `${mpnObj.vendorId.name}${mpnObj.manufacturerName ? ` (${mpnObj.manufacturerName})` : ''}`
                  : (matObj?.manufacturer || matObj?.manufacturerName || 'Standard Material');
                const displayUom = mpnObj?.priceUOM || mpnObj?.materialId?.unit || matObj?.unit || comp.materialId?.unit || 'pcs';
                
                return (
                  <tr key={idx} id={`row-${idx}`} className={`hover:bg-slate-50/70 transition-colors ${errors[`row_${idx}`] ? 'bg-red-50/30' : ''}`}>
                    <td className="px-2 py-1 text-center font-mono text-slate-400 font-semibold text-xs border-r border-slate-200 bg-slate-50/30">
                      {idx + 1}
                    </td>
                    <td className="px-2 py-1 relative border-r border-slate-200" style={{ zIndex: 50 - idx }}>
                      <SearchableSelect 
                        options={ingredientOptions}
                        value={activeKey}
                        onChange={(v) => updateRow(idx, 'selectionKey', v)}
                        placeholder="Search Ingredient / MPN..."
                        disabled={isDeactivated}
                        className="w-full text-xs"
                      />
                      {errors[`row_${idx}`] && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors[`row_${idx}`]}</span>}
                      {isLoading && (
                        <span className="text-[10px] text-blue-600 font-medium flex items-center mt-0.5">
                          <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" /> Loading Price...
                        </span>
                      )}
                    </td>
                    
                    <td className="px-2 py-1 border-r border-slate-200">
                      <div className="text-xs font-bold text-slate-800 truncate max-w-[150px]" title={displayName}>
                        {displayName}
                      </div>
                      {matObj?.code && (
                        <div className="text-[9px] font-mono text-slate-400">{matObj.code}</div>
                      )}
                    </td>
                    
                    <td className="px-2 py-1 border-r border-slate-200">
                      <div className="text-[11px] text-slate-600 truncate max-w-[140px]" title={displayVendorMfr}>
                        {displayVendorMfr}
                      </div>
                    </td>

                    <td className="px-2 py-1 text-right font-mono text-xs text-slate-800 border-r border-slate-200 font-semibold">
                      {comp.resolvedPrice !== undefined && comp.resolvedPrice !== null ? `₹${Number(comp.resolvedPrice).toFixed(2)}` : '—'}
                    </td>

                    <td className="px-2 py-1 text-right border-r border-slate-200">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        value={comp.qty}
                        onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                        disabled={isDeactivated}
                        className="w-20 text-xs text-right font-mono h-7 px-1.5 border border-slate-300 rounded font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </td>

                    <td className="px-2 py-1 text-center border-r border-slate-200 bg-slate-50/40">
                      <span className="text-xs font-bold font-mono text-slate-900 uppercase">
                        {displayUom}
                      </span>
                    </td>

                    <td className="px-2 py-1 text-right border-r border-slate-200">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={comp.lossPercent}
                        onChange={(e) => updateRow(idx, 'lossPercent', e.target.value)}
                        disabled={isDeactivated}
                        className="w-14 text-xs text-right font-mono h-7 px-1 border border-slate-300 rounded font-semibold text-amber-700 focus:outline-none focus:border-amber-600"
                      />
                    </td>

                    <td className="px-2 py-1 text-right border-r border-slate-200">
                      <div className="flex items-center justify-end group/tooltip relative">
                        <span className="text-xs font-mono font-bold text-slate-900">
                          ₹{(comp.lineCost || 0).toFixed(2)}
                        </span>
                        {comp.formula && (
                          <div className="ml-1 text-slate-400 hover:text-blue-600 cursor-help transition-colors">
                            <Info className="w-3 h-3" />
                            <div className="absolute hidden group-hover/tooltip:block z-[9999] right-0 top-5 w-44 bg-slate-900 text-slate-50 text-[10px] font-mono p-2 rounded shadow-xl whitespace-pre-wrap text-left border border-slate-700">
                              {`${comp.formula.qty} ${displayUom} × ₹${(comp.formula.price || 0).toFixed(2)}\n= ₹${(comp.formula.baseCost || 0).toFixed(2)}\n\nLoss: ${comp.formula.loss}%\nFinal Cost: ₹${(comp.formula.finalCost || 0).toFixed(2)}`}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeRow(idx)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {components.length === 0 && (
                <tr>
                  <td colSpan={10} className="h-24 text-center text-slate-400 text-xs font-medium">
                    No ingredients in recipe. Click "+ Add Ingredient" to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compact Cost Breakdown Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Raw Materials</span>
            <span className="text-sm font-black text-slate-800 font-mono">₹{totals.breakdown.rawMaterialCost.toFixed(2)}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Packaging (₹)</span>
            <input 
              type="number" min="0" step="any" 
              value={packagingCost} 
              onChange={e => { setPackagingCost(e.target.value); setIsDirty(true); }}
              className="w-full h-6 text-xs text-right font-mono font-bold border border-slate-200 rounded px-1" 
            />
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Processing (₹)</span>
            <input 
              type="number" min="0" step="any" 
              value={processingCost} 
              onChange={e => { setProcessingCost(e.target.value); setIsDirty(true); }}
              className="w-full h-6 text-xs text-right font-mono font-bold border border-slate-200 rounded px-1" 
            />
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Overhead (₹)</span>
            <input 
              type="number" min="0" step="any" 
              value={overheadCost} 
              onChange={e => { setOverheadCost(e.target.value); setIsDirty(true); }}
              className="w-full h-6 text-xs text-right font-mono font-bold border border-slate-200 rounded px-1" 
            />
          </div>
          <div className="p-2 bg-indigo-50/60 rounded-lg border border-indigo-100">
            <span className="text-[10px] font-bold text-indigo-500 uppercase block">Total Recipe Cost</span>
            <span className="text-sm font-black text-indigo-900 font-mono">₹{totals.totalCost.toFixed(2)}</span>
          </div>
          <div className="p-2 bg-blue-50/60 rounded-lg border border-blue-100">
            <span className="text-[10px] font-bold text-blue-500 uppercase block">Cost / Unit ({batchUOM})</span>
            <span className="text-sm font-black text-blue-700 font-mono">₹{totals.costPerUnit.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
