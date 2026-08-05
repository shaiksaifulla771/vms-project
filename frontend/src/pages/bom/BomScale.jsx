import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import { ChevronLeft, Scale } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';

export default function BomScale() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [targetBatchSize, setTargetBatchSize] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    const fetchBom = async () => {
      try {
        const res = await api.get(`/api/boms/${id}`);
        if (res.data.success) {
          setBom(res.data.data);
          setTargetBatchSize(res.data.data.batchSize);
        }
      } catch (err) {
        setError('Failed to fetch BOM details');
      } finally {
        setLoading(false);
      }
    };
    fetchBom();
  }, [id]);

  const handleScale = async () => {
    const newBatchSize = Number(targetBatchSize);
    if (!newBatchSize || newBatchSize <= 0) {
      setError('Target batch size must be greater than 0');
      return;
    }

    setSubmitLoading(true);
    try {
      const scaleFactor = newBatchSize / bom.batchSize;
      
      const scaledComponents = bom.components.map(comp => ({
        mpnId: comp.mpnId?._id || comp.mpnId,
        qty: Number((comp.qty * scaleFactor).toFixed(4)),
        lossPercent: comp.lossPercent
      }));

      const payload = {
        productId: bom.productId._id || bom.productId,
        batchSize: newBatchSize,
        batchUOM: bom.batchUOM,
        components: scaledComponents,
        version: bom.version
      };

      const res = await api.put(`/api/boms/${id}`, payload);
      if (res.data.success) {
        navigate(`/bom/${id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to scale BOM');
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <BomPageWrapper className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </BomPageWrapper>
    );
  }

  if (!bom) {
    return (
      <BomPageWrapper className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-xl font-bold text-slate-700 mb-4">BOM Not Found</h2>
        <Button onClick={() => navigate('/bom', { state: { direction: -1 } })}>Return to List</Button>
      </BomPageWrapper>
    );
  }

  const scaleFactor = Number(targetBatchSize) > 0 ? Number(targetBatchSize) / bom.batchSize : 1;

  return (
    <BomPageWrapper>
      <div className="mb-4">
        <Link to={`/bom/${id}`} state={{ direction: -1 }} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to BOM
        </Link>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Scale Recipe</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Proportionally scale all component quantities.</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => navigate(`/bom/${id}`, { state: { direction: -1 } })} variant="outline" className="h-9">Cancel</Button>
          <Button onClick={handleScale} disabled={submitLoading} className="bg-green-600 hover:bg-green-700 text-white h-9">
            {submitLoading ? 'Saving...' : 'Save Scaled Recipe'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-slate-200 shadow-sm col-span-1">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Scale Parameters</h3>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center space-x-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Batch Size</label>
                <div className="text-lg font-mono font-bold text-slate-900">{bom.batchSize}</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">UOM</label>
                <div className="text-lg font-mono font-semibold text-slate-600 uppercase">{bom.batchUOM || '—'}</div>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Batch Size</label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0.001"
                  step="any"
                  value={targetBatchSize}
                  onChange={(e) => setTargetBatchSize(e.target.value)}
                  className="font-mono"
                />
                <span className="text-sm font-semibold text-slate-500">{bom.batchUOM}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Scale Factor</label>
              <div className="text-xl font-black text-blue-600">{scaleFactor.toFixed(4)}x</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm col-span-2">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Scaled Components Preview</h3>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <TableHead className="font-bold text-xs">Component MPN</TableHead>
                    <TableHead className="font-bold text-xs text-right">Original Qty</TableHead>
                    <TableHead className="font-bold text-xs text-right">New Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.components?.map((c, i) => (
                    <TableRow key={i} className="hover:bg-slate-50">
                      <TableCell className="text-xs font-bold text-slate-700">
                        {c.mpnId?.mpnCode}
                        <span className="block text-[10px] text-slate-400 font-normal">{c.mpnId?.materialId?.name}</span>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-medium text-slate-500">
                        {c.qty}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold text-green-700 bg-green-50/30">
                        {(c.qty * scaleFactor).toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </BomPageWrapper>
  );
}
