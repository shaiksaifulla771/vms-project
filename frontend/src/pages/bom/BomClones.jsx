import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ChevronLeft, Eye } from 'lucide-react';
import BomPageWrapper from '../../features/bom/BomPageWrapper';

export default function BomClones() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clones, setClones] = useState([]);
  const [parentBom, setParentBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedClones, setSelectedClones] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedClones(clones.map(c => c._id));
    } else {
      setSelectedClones([]);
    }
  };

  const handleSelectOne = (cloneId) => {
    if (selectedClones.includes(cloneId)) {
      setSelectedClones(selectedClones.filter(id => id !== cloneId));
    } else {
      setSelectedClones([...selectedClones, cloneId]);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedClones.length} selected clone(s)?`)) return;
    setIsDeleting(true);
    try {
      await Promise.all(selectedClones.map(cloneId => api.delete(`/api/boms/${cloneId}`)));
      setClones(clones.filter(c => !selectedClones.includes(c._id)));
      setSelectedClones([]);
    } catch (err) {
      console.error('Failed to bulk delete clones:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const fetchClones = async () => {
      try {
        if (id) {
          const [parentRes, clonesRes] = await Promise.all([
            api.get(`/api/boms/${id}`),
            api.get(`/api/boms`, { params: { duplicatedFrom: id } })
          ]);

          if (parentRes.data.success) {
            setParentBom(parentRes.data.data);
          }
          if (clonesRes.data.success) {
            setClones(clonesRes.data.data);
          }
        } else {
          const clonesRes = await api.get(`/api/boms`, { params: { clonesOnly: true } });
          if (clonesRes.data.success) {
            setClones(clonesRes.data.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch clones data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClones();
  }, [id]);

  return (
    <BomPageWrapper>
      <div className="mb-4">
        <Link to={id ? `/bom/${id}` : "/bom"} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> {id ? "Back to Parent BOM" : "Back to BOM list"}
        </Link>
      </div>

      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{id ? 'Saved Duplicates' : 'All Cloned Variants'}</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {id 
              ? `Viewing ${clones.length} clone${clones.length !== 1 ? 's' : ''} spawned from ${parentBom?.productId?.name || 'Recipe'}`
              : `Viewing all ${clones.length} cloned recipes across the system`
            }
          </p>
        </div>
        {selectedClones.length > 0 && (
          <Button onClick={handleBulkDelete} disabled={isDeleting} variant="destructive" className="bg-red-600 hover:bg-red-700 h-9 font-bold">
            {isDeleting ? 'Deleting...' : `Delete Selected (${selectedClones.length})`}
          </Button>
        )}
      </div>

      <Card className="border-slate-200 shadow-xl rounded-xl overflow-hidden bg-white/95 backdrop-blur-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md shadow-sm border-b border-slate-200">
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="w-12 px-4 py-3">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" 
                        onChange={handleSelectAll} 
                        checked={selectedClones.length === clones.length && clones.length > 0} 
                      />
                    </TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider w-[30%]">Product Variant</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Lineage Audit</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Batch Size</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Unit Cost</TableHead>
                    <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-800 text-xs uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                        <span className="text-sm font-semibold text-slate-400">Loading clones...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : clones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center bg-slate-50/50">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <span className="text-sm font-bold text-slate-500">No clones exist for this recipe yet.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  clones.map((clone) => (
                    <TableRow key={clone._id} className={`hover:bg-indigo-50/30 transition-colors ${selectedClones.includes(clone._id) ? 'bg-indigo-50/50' : ''}`}>
                      <TableCell className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          checked={selectedClones.includes(clone._id)}
                          onChange={() => handleSelectOne(clone._id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-bold text-slate-800">
                        {clone.productId?.name} <span className="text-slate-400 font-mono font-normal block">{clone.productId?.code}</span>
                      </TableCell>
                      <TableCell className="text-[10px] font-semibold text-slate-500 uppercase">
                        Cloned by {clone.createdBy} <br />
                        <span className="text-slate-400">{new Date(clone.createdAt).toLocaleDateString()}</span>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        {clone.batchSize} {clone.batchUOM}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-slate-900">
                        ₹{clone.liveTotalCost?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={clone.status === 'Active' ? 'success' : 'danger'}>{clone.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button onClick={() => navigate(`/bom/${clone._id}`)} className="p-1.5 rounded text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50" title="View Detail">
                            <Eye className="w-4 h-4" />
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
