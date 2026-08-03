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
  const [components, setComponents] = useState(initialData?.components?.length ? initialData.components : []);
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

  useEffect(() => {
    // Fetch MPNs and Materials for dropdowns
    const fetchData = async () => {
      try {
        const [mpnRes, matRes] = await Promise.all([
          api.get('/api/mpns', { params: { status: 'All' } }),
          api.get('/api/materials')
        ]);
        setMpns(mpnRes.data?.data || []);
        setMaterials(matRes.data?.data || []);
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
      const mpnIdStr = comp.mpnId?._id || comp.mpnId;
      const mpn = mpns.find(m => m._id === mpnIdStr);
      
      const priceToUse = comp.resolvedPrice || (mpn ? mpn.price : 0);

      if (!mpn || !priceToUse) {
        return { ...comp, lineCost: 0, formula: null, mpn };
      }
      
      const qty = Number(comp.qty) || 0;
      const loss = Number(comp.lossPercent) || 0;
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

      return { ...comp, lineCost, formula, mpn, resolvedPrice: priceToUse };
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
  }, [components, mpns, batchSize, packagingCost, processingCost, overheadCost]);

  const addRow = () => {
    setComponents([...components, { mpnId: '', qty: 1, lossPercent: 0 }]);
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
    
    if (field === 'mpnId') {
      const exists = components.findIndex((c, i) => i !== index && (c.mpnId?._id || c.mpnId) === value);
      if (exists >= 0) {
        alert('This MPN is already in the recipe.');
        return;
      }

      // Simulate loading state for micro-interaction
      setLoadingPrice(index);
      
      // Artificial short delay to show "Loading Price... ✓ Price Loaded"
      await new Promise(r => setTimeout(r, 400));
      setLoadingPrice(null);
      
      // Since MPNs are pre-loaded, we can immediately assign
      newComps[index] = { ...newComps[index], [field]: value, resolvedPrice: null }; // clear resolvedPrice to force live fallback
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

    if (components.length === 0) newErrors.general = 'At least one component is required';

    let firstErrorIndex = -1;

    components.forEach((c, i) => {
      if (!c.mpnId) {
        newErrors[`row_${i}`] = 'MPN is required';
        if (firstErrorIndex === -1) firstErrorIndex = i;
      } else if (!c.qty || Number(c.qty) <= 0) {
        newErrors[`row_${i}`] = 'Quantity must be > 0';
        if (firstErrorIndex === -1) firstErrorIndex = i;
      } else if (Number(c.lossPercent) < 0 || Number(c.lossPercent) > 99) {
        newErrors[`row_${i}`] = 'Loss % must be 0-99';
        if (firstErrorIndex === -1) firstErrorIndex = i;
      } else {
        const mpn = mpns.find(m => m._id === (c.mpnId?._id || c.mpnId));
        if (mpn && (!mpn.price || mpn.price <= 0) && !c.resolvedPrice) {
          newErrors[`row_${i}`] = 'Price not available. Please update the MPN Master.';
          if (firstErrorIndex === -1) firstErrorIndex = i;
        }
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
        mpnId: c.mpnId?._id || c.mpnId,
        qty: Number(c.qty),
        lossPercent: Number(c.lossPercent)
      })),
      packagingCost: Number(packagingCost),
      processingCost: Number(processingCost),
      overheadCost: Number(overheadCost)
    };
    
    console.log('Outgoing BOM Payload:', payload);
    onSave(payload);
  };

  // Prepare options for SearchableSelect
  const mpnOptions = mpns.filter(m => m.status !== 'Deleted').map(m => ({
    value: m._id,
    label: `${m.mpnCode} - ${m.manufacturerName}`,
    subLabel: `Vendor: ${m.vendorId?.name || 'Unknown'} | Price: ₹${m.price || 0}`
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-4">
          {isNew ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-2">
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Assembly Product</label>
                <SearchableSelect 
                  options={materials.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished').map(m => ({
                    value: m._id, label: `${m.name} (${m.code})`
                  }))}
                  value={productId} 
                  onChange={v => setProductId(v)} 
                  className="w-full shadow-sm rounded-lg"
                  placeholder="Search Product..."
                />
                {errors.productId && <p className="text-red-500 text-[10px] mt-1.5 font-semibold">{errors.productId}</p>}
              </div>
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Batch Size</label>
                <Input type="number" min="0.001" step="any" value={batchSize} onChange={e => setBatchSize(e.target.value)} className="w-full h-10 shadow-sm rounded-lg" />
                {errors.batchSize && <p className="text-red-500 text-[10px] mt-1.5 font-semibold">{errors.batchSize}</p>}
              </div>
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">UOM</label>
                <Input value={batchUOM} onChange={e => setBatchUOM(e.target.value)} className="w-full h-10 shadow-sm rounded-lg" />
                {errors.batchUOM && <p className="text-red-500 text-[10px] mt-1.5 font-semibold">{errors.batchUOM}</p>}
              </div>
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Effective Date</label>
                <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="w-full h-10 shadow-sm rounded-lg" />
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{initialData?.productId?.name}</h1>
              <div className="flex gap-4 text-sm text-slate-500 font-medium mt-1">
                <Badge variant="outline" className="bg-white">Batch: {batchSize} {batchUOM}</Badge>
                <Badge variant="outline" className="bg-white">Effective: {effectiveDate}</Badge>
                {initialData?.version && <Badge variant="secondary">v{initialData.version}</Badge>}
              </div>
            </>
          )}
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => {
            if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
            onCancel();
          }} variant="outline" className="h-9">Cancel</Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white h-9 shadow-sm">Save BOM</Button>
        </div>
      </div>

      {errors.general && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold flex items-center shadow-sm">
          <AlertTriangle className="w-4 h-4 mr-2" /> {errors.general}
        </div>
      )}

      <Card className="border-slate-200 shadow-xl overflow-visible bg-white/95 backdrop-blur-sm rounded-xl">
        <CardHeader className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200 py-3 px-4 sticky top-0 z-20 rounded-t-xl">
          <div className="flex flex-row justify-between items-center w-full">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Recipe Components</h3>
            <Button onClick={addRow} size="sm" className="h-7 px-3 bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all rounded font-bold text-[11px]">
              <Plus className="w-3 h-3 mr-1" /> Add Ingredient
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-visible">
          <div className="w-full overflow-visible">
            <Table className="min-w-[1100px] w-full" wrapperClassName="overflow-visible pb-32">
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-200">
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider w-[220px] py-4">MPN</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider w-[180px] py-4">Material</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider w-[180px] py-4">Vendor</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider text-right w-[120px] py-4">Price</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider text-right w-[120px] py-4">Quantity</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider w-[80px] py-4">UOM</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider text-right w-[100px] py-4">Loss %</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider text-right w-[150px] py-4">Line Cost</TableHead>
                  <TableHead className="font-extrabold text-xs text-slate-500 uppercase tracking-wider text-center w-[60px] py-4">Act</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {totals.lines.map((comp, idx) => {
                const mpnIdStr = comp.mpnId?._id || comp.mpnId;
                const mpnObj = comp.mpn;
                const isDeactivated = mpnObj && mpnObj.status !== 'Active' && mpnObj.status !== 'Draft';
                const isLoading = loadingPrice === idx;
                
                return (
                  <TableRow key={idx} id={`row-${idx}`} className={`group ${errors[`row_${idx}`] ? 'bg-red-50/40' : 'hover:bg-slate-50/50'}`}>
                    <TableCell className="align-top py-2">
                      <SearchableSelect 
                        options={mpnOptions}
                        value={mpnIdStr || ''}
                        onChange={(v) => updateRow(idx, 'mpnId', v)}
                        placeholder="Search MPN..."
                        disabled={isDeactivated}
                        className="w-full"
                      />
                      {errors[`row_${idx}`] && <span className="text-[10px] text-red-500 font-semibold mt-1 block">{errors[`row_${idx}`]}</span>}
                      {isLoading && (
                        <span className="text-[10px] text-blue-600 font-medium flex items-center mt-1">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Loading Price...
                        </span>
                      )}
                    </TableCell>
                    
                    <TableCell className="align-top py-2">
                      <div className="text-xs font-medium text-slate-700 truncate max-w-[150px]" title={mpnObj?.materialId?.name}>
                        {mpnObj?.materialId?.name || '-'}
                      </div>
                    </TableCell>
                    
                    <TableCell className="align-top py-2">
                      <div className="text-xs font-medium text-slate-700 truncate max-w-[150px]" title={mpnObj?.vendorId?.name}>
                        {mpnObj?.vendorId?.name || '-'}
                      </div>
                    </TableCell>

                    <TableCell className="align-top py-2 text-right">
                      <div className="text-xs font-mono font-medium text-slate-600">
                        {comp.resolvedPrice ? `₹${comp.resolvedPrice.toFixed(2)}` : '-'}
                      </div>
                    </TableCell>

                    <TableCell className="align-top py-2 text-right">
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        value={comp.qty}
                        onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                        disabled={isDeactivated}
                        className="text-xs text-right font-mono h-7 px-2 border-slate-200"
                      />
                    </TableCell>

                    <TableCell className="align-top py-2">
                      <div className="text-[11px] font-medium text-slate-500 uppercase mt-1">
                        {mpnObj?.materialId?.unit || '-'}
                      </div>
                    </TableCell>

                    <TableCell className="align-top py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        max="99"
                        value={comp.lossPercent}
                        onChange={(e) => updateRow(idx, 'lossPercent', e.target.value)}
                        disabled={isDeactivated}
                        className="w-20 min-w-[80px] text-xs text-right font-mono h-7 px-2 border-slate-200 ml-auto"
                      />
                    </TableCell>

                    <TableCell className="align-top py-2 text-right">
                      <div className="flex items-center justify-end group/tooltip relative">
                        <span className="text-xs font-mono font-bold text-slate-900">
                          ₹{comp.lineCost?.toFixed(2)}
                        </span>
                        {comp.formula && (
                          <div className="ml-1 text-slate-400 hover:text-blue-600 cursor-help transition-colors">
                            <Info className="w-3.5 h-3.5" />
                            {/* CSS Tooltip */}
                            <div className="absolute hidden group-hover/tooltip:block z-[9999] right-0 top-6 w-48 bg-slate-900 text-slate-50 text-[11px] font-mono p-3 rounded shadow-2xl whitespace-pre-wrap text-left border border-slate-700/50 transition-opacity opacity-0 group-hover/tooltip:opacity-100 duration-200">
                              {`${comp.formula.qty} ${mpnObj?.materialId?.unit || ''} × ₹${comp.formula.price.toFixed(2)}\n= ₹${comp.formula.baseCost.toFixed(2)}\n\nLoss: ${comp.formula.loss}%\nFinal Cost: ₹${comp.formula.finalCost.toFixed(2)}`}
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="align-top py-2 text-center">
                      <button onClick={() => removeRow(idx)} className="p-1 text-slate-400 hover:text-red-600 transition-colors mt-0.5">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {components.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-slate-400 text-sm font-semibold border-b-0">
                    No components in recipe. Add items to calculate cost.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Compact Cost Breakdown Summary Card */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden rounded-lg mt-4">
        <CardHeader className="bg-slate-900 border-b border-slate-800 py-2.5 px-4">
          <h3 className="text-[11px] font-black text-white uppercase tracking-wider flex items-center">
            <AlertTriangle className="w-3 h-3 mr-1.5 text-indigo-400" /> Cost Breakdown Dashboard
          </h3>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
            <div className="p-3 lg:col-span-3 grid grid-cols-2 gap-3">
              <div className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded">
                <span className="text-slate-600 font-bold">Raw Material</span>
                <span className="font-mono font-black text-slate-800">₹{totals.breakdown.rawMaterialCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded transition-colors">
                <span className="text-slate-600 font-bold">Packaging</span>
                <Input 
                  type="number" min="0" step="any" 
                  value={packagingCost} 
                  onChange={e => { setPackagingCost(e.target.value); setIsDirty(true); }}
                  className="w-20 h-7 text-xs text-right font-mono font-bold shadow-sm rounded" 
                />
              </div>
              <div className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded transition-colors">
                <span className="text-slate-600 font-bold">Processing</span>
                <Input 
                  type="number" min="0" step="any" 
                  value={processingCost} 
                  onChange={e => { setProcessingCost(e.target.value); setIsDirty(true); }}
                  className="w-20 h-7 text-xs text-right font-mono font-bold shadow-sm rounded" 
                />
              </div>
              <div className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded transition-colors">
                <span className="text-slate-600 font-bold">Overhead</span>
                <Input 
                  type="number" min="0" step="any" 
                  value={overheadCost} 
                  onChange={e => { setOverheadCost(e.target.value); setIsDirty(true); }}
                  className="w-20 h-7 text-xs text-right font-mono font-bold shadow-sm rounded" 
                />
              </div>
            </div>
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 lg:col-span-2 flex flex-col justify-center space-y-3">
              <div className="flex justify-between items-end border-b border-indigo-200/50 pb-2">
                <span className="text-xs font-black text-indigo-900 uppercase">Total Cost</span>
                <span className="text-lg font-black text-indigo-700 font-mono">₹{totals.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-indigo-900/70 uppercase">Cost per Unit <span className="lowercase">({batchUOM})</span></span>
                <span className="text-base font-black text-blue-600 font-mono">₹{totals.costPerUnit.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
