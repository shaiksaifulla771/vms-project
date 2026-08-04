import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Plus, Trash2, Edit2, Copy, Search, Eye, Scale, Check, X, Loader2, RotateCcw, MoreVertical } from 'lucide-react';
import BomPageWrapper from '../../features/bom/BomPageWrapper';

export default function BomList() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Active');
  const [search, setSearch] = useState('');
  
  // Inline edit state for Batch Code
  const [editBatchCodeId, setEditBatchCodeId] = useState(null);
  const [editBatchCodeValue, setEditBatchCodeValue] = useState('');
  const [savingBatchCodeId, setSavingBatchCodeId] = useState(null);

  const [openDropdownId, setOpenDropdownId] = useState(null);

  const fetchBoms = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/boms', {
        params: { status: statusFilter, search, mainOnly: true }
      });
      if (res.data.success) {
        setBoms(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch BOMs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoms();
  }, [statusFilter, search]);

  const handleDelete = async (bom) => {
    if (!window.confirm(`Are you sure you want to delete BOM for ${bom.productId?.name}?`)) return;
    try {
      await api.delete(`/api/boms/${bom._id}`);
      fetchBoms();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleRestore = async (bom) => {
    if (!window.confirm(`Are you sure you want to restore BOM for ${bom.productId?.name}?`)) return;
    try {
      await api.put(`/api/boms/${bom._id}/restore`);
      fetchBoms();
    } catch (err) {
      console.error('Restore failed:', err);
    }
  };

  const handleSaveBatchCode = async (bom) => {
    if (editBatchCodeValue === bom.batchCode) {
      setEditBatchCodeId(null);
      return;
    }
    
    setSavingBatchCodeId(bom._id);
    try {
      const res = await api.put(`/api/boms/${bom._id}`, {
        batchCode: editBatchCodeValue.trim()
      });
      if (res.data.success) {
        setBoms(boms.map(b => b._id === bom._id ? { ...b, batchCode: res.data.data.batchCode } : b));
      }
    } catch (err) {
      console.error('Failed to update batch code:', err);
    } finally {
      setSavingBatchCodeId(null);
      setEditBatchCodeId(null);
    }
  };

  return (
    <BomPageWrapper>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Bill of Materials</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Manage assembly recipes, components, and costs.</p>
        </div>
        <Button onClick={() => navigate('/bom/new', { state: { returnTo: location.pathname + location.search } })} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-10">
          <Plus className="w-4 h-4 mr-2" /> Create BOM
        </Button>
      </div>

      <Card className="border-slate-200 shadow-xl rounded-xl overflow-hidden bg-white/95 backdrop-blur-sm">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-3">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="relative w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-xs h-8"
                />
              </div>
            </div>
            <div className="w-[150px]">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-xs h-8"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Deleted">Deleted</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto pb-64 min-h-[500px]">
            <Table className="min-w-[1000px]">
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md shadow-sm border-b border-slate-200">
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider w-[25%]">Product</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Code</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Batch Code</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Manufacturer</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Batch Size</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Unit Cost</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-800 text-xs uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <div className="inline-flex items-center space-x-2 text-slate-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-600"></div>
                        <span className="text-xs font-medium">Loading recipes...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : boms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                          <Search className="w-6 h-6 text-slate-400" />
                        </div>
                        <span className="text-sm font-bold text-slate-500">No BOMs found matching your criteria.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  boms.map((bom) => (
                    <TableRow 
                      key={bom._id} 
                      className="hover:bg-blue-50/30 transition-colors"
                    >
                      <TableCell className="text-xs font-bold text-slate-800">
                        {bom.productId?.name}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {bom.productId?.code}
                      </TableCell>
                      <TableCell className="text-xs">
                        {editBatchCodeId === bom._id ? (
                          <div className="flex items-center space-x-1">
                            <Input
                              autoFocus
                              data-testid="batch-code-input"
                              value={editBatchCodeValue}
                              onChange={(e) => setEditBatchCodeValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleSaveBatchCode(bom);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditBatchCodeId(null);
                                }
                              }}
                              className="w-24 h-7 text-xs px-2"
                              disabled={savingBatchCodeId === bom._id}
                            />
                            {savingBatchCodeId === bom._id ? (
                              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                            ) : (
                              <>
                                <button 
                                  type="button" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSaveBatchCode(bom);
                                  }} 
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  type="button" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditBatchCodeId(null);
                                  }} 
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div 
                            className="cursor-pointer group flex items-center min-h-[20px]" 
                            data-testid={`batch-code-${bom._id}`}
                            onClick={() => {
                              setEditBatchCodeId(bom._id);
                              setEditBatchCodeValue(bom.batchCode || '');
                            }}
                          >
                            <span className={`border-b border-dashed ${bom.batchCode ? 'border-transparent group-hover:border-slate-400 text-slate-700' : 'border-slate-300 text-slate-400'}`}>
                              {bom.batchCode || '—'}
                            </span>
                            <Edit2 className="w-3 h-3 ml-1.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {bom.manufacturer || bom.mpnManufacturer || bom.productId?.manufacturer || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        {bom.batchSize} {bom.batchUOM}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-slate-900">
                        ₹{bom.liveTotalCost?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const displayStatus = bom.status === 'Obsolete' ? 'Deleted' : bom.status;
                          return (
                            <span className={`text-[12px] font-bold ${
                              displayStatus === 'Active' ? 'text-emerald-600' : 
                              displayStatus === 'Draft' ? 'text-amber-600' :
                              'text-red-600'
                            }`}>
                              {displayStatus}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`flex items-center justify-end space-x-1`}>
                          {bom.status !== 'Deleted' && bom.status !== 'Obsolete' ? (
                            <>
                              <button onClick={() => navigate(`/bom/${bom._id}`, { state: { returnTo: location.pathname + location.search } })} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="View Detail">
                                <Eye className="w-4 h-4" />
                              </button>
                              
                              <button onClick={() => navigate(`/bom/${bom._id}/edit`, { state: { returnTo: location.pathname + location.search } })} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit Recipe">
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <button onClick={() => handleDelete(bom)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <div className="relative inline-block text-left">
                              <button onClick={() => setOpenDropdownId(openDropdownId === bom._id ? null : bom._id)} className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="More Actions">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {openDropdownId === bom._id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)} />
                                  <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
                                    <div className="py-1" role="menu" aria-orientation="vertical">
                                      <button onClick={() => { handleRestore(bom); setOpenDropdownId(null); }} className="text-left w-full block px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">Restore BOM</button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </BomPageWrapper>
  );
}
