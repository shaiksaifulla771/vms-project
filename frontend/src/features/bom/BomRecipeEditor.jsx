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
            ? '⚠️ SELF-REFERENCE: Assembly Product cannot be an ingredient'
            : `Vendor: ${vendorName} | Mfr: ${mfrName} | Price: ₹${m.price || 0}`,
          disabled: isSelf
        });
      });

    // 2. Add raw/semi-finished materials directly
    materials
      .filter(mat => mat.status === 'Active' && mat.type !== 'Finished')
      .forEach(mat => {
        const matId = String(mat._id);
        const isSelf = Boolean(productId && String(matId) === String(productId));
        const hasExistingMpnOption = usedMatIds.has(matId);

        if (!hasExistingMpnOption) {
          options.push({
            value: mat._id,
            label: `${mat.name} (${mat.code}) — [Raw Material]`,
            subLabel: isSelf
              ? '⚠️ SELF-REFERENCE: Assembly Product cannot be an ingredient'
              : `Mfr: ${mat.manufacturer || mat.manufacturerName || 'Standard'} | Unit: ${mat.unit} | Price: ₹${mat.basePrice || 0}`,
            disabled: isSelf
          });
        }
      });

    return options;
  }, [mpns, materials, productId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-4 w-full">
          {!isNew && (
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Edit: {initialData?.productId?.name || 'Recipe'}
              </h1>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-1">
            <div className="flex flex-col xl:col-span-2">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">Assembly Product *</label>
              <SearchableSelect 
                options={materials.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.type === 'Finished Good' || m.makeOrBuy === 'MAKE').map(m => ({
                  value: m._id, label: `${m.name} (${m.code})`
                }))}
                value={productId} 
                onChange={v => {
                  setProductId(v);
                  const selectedMat = materials.find(m => String(m._id) === String(v));
                  if (selectedMat) {
                    // 1. Auto-fetch and set Batch UOM
                    if (selectedMat.unit) {
                      const unitLower = selectedMat.unit.toLowerCase();
                      if (['kg', 'gm', 'pouches', 'packs', 'pieces'].includes(unitLower)) {
                        setBatchUOM(unitLower);
                      } else if (unitLower === 'pcs') {
                        setBatchUOM('pieces');
                      } else {
                        setBatchUOM(selectedMat.unit);
                      }
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
                className="w-full shadow-sm rounded-lg text-sm"
                placeholder="Search Manufactured Product..."
              />
              {errors.productId && <p className="text-red-500 text-sm mt-1 font-semibold">{errors.productId}</p>}
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">Batch Code</label>
              <Input value={batchCode} onChange={e => setBatchCode(e.target.value)} className="w-full h-9 shadow-sm rounded-lg text-sm" placeholder="Optional..." />
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">Manufacturer</label>
              <Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} className="w-full h-9 shadow-sm rounded-lg text-sm font-semibold text-slate-800" placeholder="Auto-fetched or custom..." />
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">Batch Size</label>
              <div className="flex space-x-2">
                <Input type="number" min="0.001" step="any" value={batchSize} onChange={e => setBatchSize(e.target.value)} className="w-full h-9 shadow-sm rounded-lg text-sm flex-1 font-bold" />
                <select 
                  value={batchUOM} 
                  onChange={e => setBatchUOM(e.target.value)} 
                  className="w-24 h-9 px-2 bg-white border border-slate-300 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
                >
                  <option value="kg">kg</option>
                  <option value="gm">gm</option>
                  <option value="pouches">pouches</option>
                  <option value="packs">packs</option>
                  <option value="pieces">pieces</option>
                </select>
              </div>
              {(errors.batchSize || errors.batchUOM) && <p className="text-red-500 text-sm mt-1 font-semibold">{errors.batchSize || errors.batchUOM}</p>}
            </div>

            <div className="flex flex-col xl:col-span-1">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">Effective Date</label>
              <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="w-full h-9 shadow-sm rounded-lg text-sm" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-2 border-t border-slate-200 pt-4">
        <Button onClick={() => {
          if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
          onCancel();
        }} variant="outline" className="h-9">Cancel</Button>
        <Button onClick={handleSave} className="h-9 shadow-sm btn-premium">Save BOM</Button>
      </div>

      {/* Save Intercept Modal for Manufacturer Change */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-2">Manufacturer Updated</h2>
              <p className="text-sm text-slate-600 mb-4">
                Manufacturer name has changed from <span className="font-semibold text-slate-800">"{originalManufacturer}"</span> to <span className="font-semibold text-slate-800">"{manufacturer}"</span>.
                <br /><br />
                Do you want to change this only in the current BOM, or update the ERP system (Master Material & MPN) too?
              </p>
              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => handleConfirmSave(false)}
                  variant="outline"
                  className="w-full text-blue-700 border-blue-200 hover:bg-blue-50 font-semibold"
                >
                  Only BOM
                </Button>
                <Button 
                  onClick={() => handleConfirmSave(true)}
                  className="w-full font-semibold btn-premium"
                >
                  Update ERP System
                </Button>
                <Button 
                  onClick={() => { setShowSaveModal(false); setPendingSavePayload(null); }}
                  variant="ghost"
                  className="w-full mt-2 text-slate-500"
                >
                  Cancel Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {errors.general && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold flex items-center shadow-sm">
          <AlertTriangle className="w-4 h-4 mr-2" /> {errors.general}
        </div>
      )}

      <Card className="shadow-xl overflow-visible /95 backdrop-blur-sm rounded-xl glass-panel">
        <CardHeader className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200 py-3 px-4 sticky top-0 z-20 rounded-t-xl">
          <div className="flex flex-row justify-between items-center w-full">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Recipe Components / Ingredients</h3>
            <Button onClick={addRow} size="sm" className="h-9 px-3 shadow-sm transition-all rounded font-bold text-sm btn-premium">
              <Plus className="w-3 h-3 mr-1" /> Add Ingredient
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table className="min-w-[1100px] w-full" wrapperClassName="overflow-x-auto pb-32">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-tight border-b border-slate-300 select-none">
                <tr>
                  <th className="w-10 px-2 py-2 text-center font-mono border-r border-slate-200">#</th>
                  <th className="px-2.5 py-2 w-[280px] border-r border-slate-200">Ingredient / MPN Select</th>
                  <th className="px-2.5 py-2 min-w-[160px] border-r border-slate-200">Material Name</th>
                  <th className="px-2.5 py-2 min-w-[160px] border-r border-slate-200">Vendor / Mfr</th>
                  <th className="px-2.5 py-2 w-28 text-right border-r border-slate-200">Price (₹)</th>
                  <th className="px-2.5 py-2 w-28 text-right border-r border-slate-200">Quantity</th>
                  <th className="px-2.5 py-2 w-16 text-center border-r border-slate-200">UOM</th>
                  <th className="px-2.5 py-2 w-20 text-right border-r border-slate-200">Loss %</th>
                  <th className="px-2.5 py-2 w-32 text-right border-r border-slate-200">Line Cost (₹)</th>
                  <th className="px-2.5 py-2 w-12 text-center">Actions</th>
                </tr>
              </thead>
              <TableBody>
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
                  const displayUom = mpnObj?.priceUOM || mpnObj?.materialId?.unit || matObj?.unit || 'pcs';
                  
                  return (
                    <tr key={idx} id={`row-${idx}`} className={`hover:bg-slate-50/80 transition-colors border-b border-slate-200 ${errors[`row_${idx}`] ? 'bg-red-50/40' : ''}`}>
                      <td className="px-2 py-1.5 text-center font-mono text-slate-400 font-semibold text-sm border-r border-slate-200 bg-slate-50/50">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-1.5 relative border-r border-slate-200" style={{ zIndex: 50 - idx }}>
                        <SearchableSelect 
                          options={ingredientOptions}
                          value={activeKey}
                          onChange={(v) => updateRow(idx, 'selectionKey', v)}
                          placeholder="Search Raw Material or MPN..."
                          disabled={isDeactivated}
                          className="w-full"
                        />
                        {errors[`row_${idx}`] && <span className="text-sm text-red-500 font-semibold mt-1 block">{errors[`row_${idx}`]}</span>}
                        {isLoading && (
                          <span className="text-sm text-blue-600 font-medium flex items-center mt-1">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Loading Price...
                          </span>
                        )}
                      </td>
                      
                      <td className="px-2.5 py-1.5 border-r border-slate-200">
                        <div className="text-sm font-semibold text-slate-800 truncate max-w-[170px]" title={displayName}>
                          {displayName}
                        </div>
                        {matObj?.code && (
                          <div className="text-[10px] font-mono text-slate-400">{matObj.code}</div>
                        )}
                      </td>
                      
                      <td className="px-2.5 py-1.5 border-r border-slate-200">
                        <div className="text-xs text-slate-700 truncate max-w-[170px]" title={displayVendorMfr}>
                          {displayVendorMfr}
                        </div>
                      </td>

                      <td className="px-2.5 py-1.5 text-right font-mono text-sm text-slate-800 border-r border-slate-200 font-medium">
                        {comp.resolvedPrice !== undefined && comp.resolvedPrice !== null ? `₹${Number(comp.resolvedPrice).toFixed(2)}` : '—'}
                      </td>

                      <td className="px-2.5 py-1.5 text-right border-r border-slate-200">
                        <Input
                          type="number"
                          min="0.001"
                          step="any"
                          value={comp.qty}
                          onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                          disabled={isDeactivated}
                          className="text-sm text-right font-mono h-9 px-2 border-slate-200 font-bold text-slate-900"
                        />
                      </td>

                      <td className="px-2.5 py-1.5 text-center border-r border-slate-200">
                        <div className="text-xs font-bold text-slate-600 uppercase">
                          {displayUom}
                        </div>
                      </td>

                      <td className="px-2.5 py-1.5 text-right border-r border-slate-200">
                        <Input
                          type="number"
                          min="0"
                          max="99"
                          value={comp.lossPercent}
                          onChange={(e) => updateRow(idx, 'lossPercent', e.target.value)}
                          disabled={isDeactivated}
                          className="w-20 min-w-[80px] text-sm text-right font-mono h-9 px-2 border-slate-200 font-semibold text-amber-700 ml-auto"
                        />
                      </td>

                      <td className="px-2.5 py-1.5 text-right border-r border-slate-200">
                        <div className="flex items-center justify-end group/tooltip relative">
                          <span className="text-sm font-mono font-bold text-slate-900">
                            ₹{(comp.lineCost || 0).toFixed(2)}
                          </span>
                          {comp.formula && (
                            <div className="ml-1 text-slate-400 hover:text-blue-600 cursor-help transition-colors">
                              <Info className="w-3.5 h-3.5" />
                              <div className="absolute hidden group-hover/tooltip:block z-[9999] right-0 top-6 w-48 bg-slate-900 text-slate-50 text-xs font-mono p-3 rounded shadow-2xl whitespace-pre-wrap text-left border border-slate-700/50 transition-opacity opacity-0 group-hover/tooltip:opacity-100 duration-200">
                                {`${comp.formula.qty} ${displayUom} × ₹${(comp.formula.price || 0).toFixed(2)}\n= ₹${(comp.formula.baseCost || 0).toFixed(2)}\n\nLoss: ${comp.formula.loss}%\nFinal Cost: ₹${(comp.formula.finalCost || 0).toFixed(2)}`}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeRow(idx)} className="p-1 text-slate-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {components.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-slate-400 text-sm font-semibold border-b-0">
                      No ingredients in recipe. Click "+ Add Ingredient" to start composing.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Compact Cost Breakdown Summary Card */}
      <Card className="overflow-hidden rounded-lg mt-4 glass-panel">
        <CardHeader className="bg-slate-900 border-b border-slate-800 py-2.5 px-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center">
            <AlertTriangle className="w-3 h-3 mr-1.5 text-indigo-400" /> Cost Breakdown Dashboard
          </h3>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
            <div className="p-3 lg:col-span-3 grid grid-cols-2 gap-3">
              <div className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded">
                <span className="text-slate-600 font-bold">Raw Material</span>
                <span className="font-mono font-black text-slate-800">₹{totals.breakdown.rawMaterialCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 rounded transition-colors">
                <span className="text-slate-600 font-bold">Packaging</span>
                <Input 
                  type="number" min="0" step="any" 
                  value={packagingCost} 
                  onChange={e => { setPackagingCost(e.target.value); setIsDirty(true); }}
                  className="w-20 h-9 text-sm text-right font-mono font-bold shadow-sm rounded" 
                />
              </div>
              <div className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 rounded transition-colors">
                <span className="text-slate-600 font-bold">Processing</span>
                <Input 
                  type="number" min="0" step="any" 
                  value={processingCost} 
                  onChange={e => { setProcessingCost(e.target.value); setIsDirty(true); }}
                  className="w-20 h-9 text-sm text-right font-mono font-bold shadow-sm rounded" 
                />
              </div>
              <div className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 rounded transition-colors">
                <span className="text-slate-600 font-bold">Overhead</span>
                <Input 
                  type="number" min="0" step="any" 
                  value={overheadCost} 
                  onChange={e => { setOverheadCost(e.target.value); setIsDirty(true); }}
                  className="w-20 h-9 text-sm text-right font-mono font-bold shadow-sm rounded" 
                />
              </div>
            </div>
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 lg:col-span-2 flex flex-col justify-center space-y-3">
              <div className="flex justify-between items-end border-b border-indigo-200/50 pb-2">
                <span className="text-sm font-black text-indigo-900 uppercase">Total Cost</span>
                <span className="text-lg font-black text-indigo-700 font-mono">₹{totals.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm font-black text-indigo-900/70 uppercase">Cost per Unit <span className="lowercase">({batchUOM})</span></span>
                <span className="text-base font-black text-blue-600 font-mono">₹{totals.costPerUnit.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
