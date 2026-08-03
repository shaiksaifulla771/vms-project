import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Plus, Trash2, Edit2, Copy, Search, Eye, Scale } from 'lucide-react';
import BomPageWrapper from '../../features/bom/BomPageWrapper';

export default function BomList() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Active');
  const [search, setSearch] = useState('');

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

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/boms/${id}`);
      fetchBoms();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <BomPageWrapper>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Bill of Materials</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Manage assembly recipes, components, and costs.</p>
        </div>
        <Button onClick={() => navigate('/bom/new')} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-10">
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
              <Button onClick={() => navigate('/bom/clones')} variant="outline" className="h-8 text-xs font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                View All Clones
              </Button>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md shadow-sm border-b border-slate-200">
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider w-[30%]">Product</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Batch Size</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Unit Cost</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-800 text-xs uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <div className="inline-flex items-center space-x-2 text-slate-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-600"></div>
                        <span className="text-xs font-medium">Loading recipes...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : boms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40 text-center">
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
                    <TableRow key={bom._id} className="hover:bg-blue-50/30 transition-colors">
                      <TableCell className="text-xs font-bold text-slate-800">
                        {bom.productId?.name} <span className="text-slate-400 font-mono font-normal block">{bom.productId?.code}</span>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        {bom.batchSize} {bom.batchUOM}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-slate-900">
                        ₹{bom.liveTotalCost?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={bom.status === 'Active' ? 'success' : 'danger'}>{bom.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button onClick={() => navigate(`/bom/${bom._id}`)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="View Detail">
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          {bom.status === 'Active' && (
                            <>
                              <button onClick={() => navigate(`/bom/${bom._id}/scale`)} className="p-1.5 rounded text-slate-400 hover:text-green-600 hover:bg-green-50" title="Scale / Resise">
                                <Scale className="w-4 h-4" />
                              </button>
                              <button onClick={() => navigate(`/bom/${bom._id}/duplicate`)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Duplicate">
                                <Copy className="w-4 h-4" />
                              </button>
                              <button onClick={() => navigate(`/bom/${bom._id}/edit`)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit Recipe">
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          <button onClick={() => handleDelete(bom._id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
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
