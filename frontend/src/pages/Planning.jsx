import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Cpu, CheckCircle2, AlertOctagon, ArrowRight, Play, Trash2, RotateCcw } from 'lucide-react';

const Planning = () => {
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // MRP Inputs
  const [selectedProductId, setSelectedProductId] = useState('');
  const [targetQuantity, setTargetQuantity] = useState('10');
  
  // MRP Results
  const [mrpResult, setMrpResult] = useState(null);
  const [mrpError, setMrpError] = useState(null);
  
  // Production Creation State
  const [scheduling, setScheduling] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  // FIFO Drafts Queue State (max 10 entries)
  const [draftsList, setDraftsList] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);

  const fetchFinishedProducts = async () => {
    try {
      const res = await api.get('/api/materials?type=Finished');
      if (res.data && res.data.success) {
        setFinishedProducts(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFinishedProducts();

    // Check for saved drafts queue on mount
    const savedQueue = localStorage.getItem('erp_mrp_planning_drafts_queue');
    if (savedQueue) {
      try {
        setDraftsList(JSON.parse(savedQueue));
      } catch (e) {
        console.error('Failed to parse drafts queue', e);
      }
    }
  }, []);

  const handleRunMRP = async (e) => {
    if (e) e.preventDefault();
    if (!selectedProductId || !targetQuantity) return;

    setLoading(true);
    setMrpError(null);
    setMrpResult(null);
    setScheduleSuccess(false);
    
    try {
      const res = await api.get('/api/productions/planning/mrp', {
        params: {
          productId: selectedProductId,
          quantity: targetQuantity
        }
      });
      if (res.data && res.data.success) {
        const result = res.data.data;
        setMrpResult(result);
        
        // Find product name details
        const matchedProduct = finishedProducts.find(p => p._id === selectedProductId);
        const prodName = matchedProduct ? `${matchedProduct.name} (${matchedProduct.code})` : 'Product Assembly';
        
        const newDraft = {
          id: Date.now().toString(),
          productId: selectedProductId,
          productName: prodName,
          quantity: targetQuantity,
          result: result,
          timestamp: new Date().toLocaleString()
        };

        // Evict oldest if queue exceeds 10 using FIFO rules
        let updatedQueue = [...draftsList];
        const dupIdx = updatedQueue.findIndex(d => d.productId === selectedProductId && d.quantity === targetQuantity);
        
        if (dupIdx > -1) {
          updatedQueue.splice(dupIdx, 1); // remove duplicate to re-append at the end (freshest)
        }

        if (updatedQueue.length >= 10) {
          updatedQueue.shift(); // Evicts first-in oldest entry (FIFO)
        }

        updatedQueue.push(newDraft);
        setDraftsList(updatedQueue);
        localStorage.setItem('erp_mrp_planning_drafts_queue', JSON.stringify(updatedQueue));
        setActiveDraftId(newDraft.id);
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'MRP check failed. Configure a BOM recipe for this finished product first.';
      setMrpError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Immediate Production Order creator if stock matches
  const handleScheduleProduction = async () => {
    if (!mrpResult || !mrpResult.canProduce) return;

    setScheduling(true);
    try {
      const resBoms = await api.get('/api/boms');
      const matchedBOM = resBoms.data.data.find(b => b.productId?._id === selectedProductId || b.productId === selectedProductId);
      
      if (!matchedBOM) {
        alert('Active BOM recipe configuration not found for scheduling.');
        return;
      }

      await api.post('/api/productions', {
        bomId: matchedBOM._id,
        quantity: Number(targetQuantity)
      });
      
      setScheduleSuccess(true);
      setMrpResult(null); // Clear active results display
      
      // Remove this scheduled calculation from the FIFO drafts queue
      if (activeDraftId) {
        const filtered = draftsList.filter(d => d.id !== activeDraftId);
        setDraftsList(filtered);
        localStorage.setItem('erp_mrp_planning_drafts_queue', JSON.stringify(filtered));
        setActiveDraftId(null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to schedule production order.');
    } finally {
      setScheduling(false);
    }
  };

  // Continue draft from table selection
  const handleContinueDraft = (draft) => {
    setSelectedProductId(draft.productId);
    setTargetQuantity(draft.quantity);
    setMrpResult(draft.result);
    setActiveDraftId(draft.id);
    setScheduleSuccess(false);
  };

  // Delete draft from table selection
  const handleDeleteDraft = (id) => {
    const filtered = draftsList.filter(d => d.id !== id);
    setDraftsList(filtered);
    localStorage.setItem('erp_mrp_planning_drafts_queue', JSON.stringify(filtered));
    if (activeDraftId === id) {
      setActiveDraftId(null);
      setMrpResult(null);
    }
  };

  const handleProductSelection = (id) => {
    setSelectedProductId(id);
    setMrpResult(null);
    setScheduleSuccess(false);
  };

  const handleQuantityInput = (qty) => {
    setTargetQuantity(qty);
    setMrpResult(null);
    setScheduleSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Target Planner Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Cpu className="h-5 w-5 text-blue-600" />
            <CardTitle>Material Requirements Planning (MRP)</CardTitle>
          </div>
          <CardDescription>Calculate component shortages and verify stock feasibility for production targets</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRunMRP} className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 w-full">
              <Select
                label="Target Finished Good (Product)"
                id="productId"
                options={finishedProducts.map(p => ({ value: p._id, label: `${p.name} (${p.code})` }))}
                value={selectedProductId}
                onChange={(e) => handleProductSelection(e.target.value)}
                placeholder="Select product lot to plan"
                required
              />
            </div>

            <div className="w-full sm:w-48">
              <Input
                label="Target Output Quantity (pcs)"
                id="qty"
                type="number"
                min="1"
                placeholder="e.g. 10"
                value={targetQuantity}
                onChange={(e) => handleQuantityInput(e.target.value)}
                required
              />
            </div>

            <Button type="submit" isLoading={loading} className="w-full sm:w-auto px-6 py-2.5">
              Run MRP Check
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error alert */}
      {mrpError && (
        <Card className="bg-red-50 border-red-100 text-red-700">
          <CardContent className="p-4 flex items-center space-x-2 text-sm font-semibold">
            <AlertOctagon className="h-5 w-5 shrink-0" />
            <span>{mrpError}</span>
          </CardContent>
        </Card>
      )}

      {/* Scheduling confirmation banner */}
      {scheduleSuccess && (
        <Card className="bg-green-50 border-green-150 text-green-700">
          <CardContent className="p-4 flex items-center justify-between text-sm font-bold">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-5 w-5" />
              <span>Production order scheduled successfully! Components reserved. Go to 'Manufacturing' to run the batch.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Planning Drafts Table (FIFO queue) */}
      {draftsList.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Saved Planning Drafts Ledger</CardTitle>
                <CardDescription>Review pending calculations (Up to 10 stored locally in First-In, First-Out priority)</CardDescription>
              </div>
              <Badge variant="info">FIFO Queue Size: {draftsList.length}/10</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assembly Product</TableHead>
                  <TableHead>Planned Qty</TableHead>
                  <TableHead>Feasibility Status</TableHead>
                  <TableHead>Timestamp Checked</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...draftsList].reverse().map((draft) => (
                  <TableRow key={draft.id} className={activeDraftId === draft.id ? 'bg-blue-50/40 hover:bg-blue-50/50' : ''}>
                    <TableCell className="font-bold text-slate-800">
                      {draft.productName}
                      {activeDraftId === draft.id && (
                        <span className="ml-2 text-[9px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full uppercase">
                          Active
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-700">{draft.quantity} pcs</TableCell>
                    <TableCell>
                      <Badge variant={draft.result.canProduce ? 'success' : 'danger'}>
                        {draft.result.canProduce ? 'Feasible' : 'Shortage'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">{draft.timestamp}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleContinueDraft(draft)}
                          title="Restore calculations"
                          className="p-1 rounded-md text-blue-600 hover:bg-blue-50 transition-all flex items-center space-x-1 text-xs font-bold"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Continue</span>
                        </button>
                        <button
                          onClick={() => handleDeleteDraft(draft.id)}
                          title="Remove draft"
                          className="p-1 rounded-md text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* MRP Evaluation Display */}
      {mrpResult && (
        <div className="space-y-6">
          {/* Summary Status Box */}
          <Card className={mrpResult.canProduce ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}>
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                {mrpResult.canProduce ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertOctagon className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-extrabold text-sm">
                    {mrpResult.canProduce ? 'PRODUCTION FEASIBLE' : 'MATERIAL SHORTAGE DETECTED'}
                  </h4>
                  <p className="text-xs mt-0.5 leading-relaxed">
                    {mrpResult.canProduce
                      ? 'The warehouse has sufficient stock balances for all raw materials in the Bill of Materials.'
                      : 'One or more raw component balances fall short of the required assembly quantities.'}
                  </p>
                </div>
              </div>

              {mrpResult.canProduce ? (
                <Button
                  onClick={handleScheduleProduction}
                  isLoading={scheduling}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center space-x-1 shrink-0 shadow-sm"
                >
                  <Play className="h-4 w-4" />
                  <span>Execute Production Run</span>
                </Button>
              ) : (
                <div className="flex items-center space-x-1 text-xs font-bold text-red-600">
                  <span>Create a Purchase Order to restock components</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Component Deficit table */}
          <Card>
            <CardHeader>
              <CardTitle>Required Material Allocation Checklist</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component Name</TableHead>
                    <TableHead>Material Code</TableHead>
                    <TableHead>Required Volume</TableHead>
                    <TableHead>Available Balance</TableHead>
                    <TableHead>Deficit / Shortfall</TableHead>
                    <TableHead>Stock Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mrpResult.details.map((item) => (
                    <TableRow key={item.materialId}>
                      <TableCell className="font-bold text-slate-800">{item.name}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500 font-bold">{item.code}</TableCell>
                      <TableCell className="font-semibold text-slate-700">{item.required} {item.unit}</TableCell>
                      <TableCell className="font-semibold text-slate-700">{item.available} {item.unit}</TableCell>
                      <TableCell className="font-bold text-slate-800">
                        {item.shortfall > 0 ? (
                          <span className="text-red-600">-{item.shortfall} {item.unit}</span>
                        ) : (
                          <span className="text-slate-400">0 {item.unit}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'Deficit' ? 'danger' : 'success'}>
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Planning;
