import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Edit2, Copy, Scale, ChevronLeft, History, Calculator, Info } from 'lucide-react';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import PriceDriftBanner from '../../features/bom/PriceDriftBanner';

export default function BomDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/bom';
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBom = async () => {
      try {
        const res = await api.get(`/api/boms/${id}`);
        if (res.data.success) {
          setBom(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch BOM details:', err);
        setError('Failed to fetch BOM details');
      } finally {
        setLoading(false);
      }
    };
    fetchBom();
  }, [id]);

  if (loading) {
    return (
      <BomPageWrapper className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </BomPageWrapper>
    );
  }

  if (!bom || error) {
    return (
      <BomPageWrapper className="flex flex-col items-center justify-center min-h-[400px]">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm font-semibold max-w-md text-center">
            {error}
          </div>
        )}
        <h2 className="text-xl font-bold text-slate-700 mb-4">{!bom ? 'BOM Not Found' : 'Error'}</h2>
        <Button onClick={() => navigate(returnTo)}>Return to List</Button>
      </BomPageWrapper>
    );
  }

  const costPerUnit = Number(bom.batchSize) > 0 ? (bom.liveTotalCost / bom.batchSize) : 0;
  const eDate = bom.effectiveDate ? new Date(bom.effectiveDate).toISOString().split('T')[0] : '';

  return (
    <BomPageWrapper>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(returnTo)} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </button>
        <div className="flex space-x-2">
          {bom.status !== 'Deleted' && (
            <>
              {bom.status === 'Active' && (
                <>
                  <Button onClick={() => navigate(`/bom/${id}/edit`, { state: { returnTo: location.pathname } })} variant="outline" className="h-9">
                    <Edit2 className="w-4 h-4 mr-2" /> Edit Recipe
                  </Button>
                  <Button onClick={() => navigate(`/bom/${id}/scale`, { state: { returnTo: location.pathname } })} variant="outline" className="h-9">
                    <Scale className="w-4 h-4 mr-2" /> Scale
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">{bom.productId?.name}</h1>
        <div className="flex gap-4 text-sm text-slate-500 font-medium">
          <Badge variant="outline" className="bg-white">Batch: {bom.batchSize} {bom.batchUOM}</Badge>
          <Badge variant="outline" className="bg-white">Batch Code: {bom.batchCode || '—'}</Badge>
          <Badge variant="outline" className="bg-white">Effective: {eDate}</Badge>
          <span className={`font-bold uppercase tracking-wider ${(bom.status === 'Obsolete' || bom.status === 'Deleted') ? 'text-red-600' : 'text-emerald-600'}`}>
            {bom.status === 'Obsolete' ? 'Deleted' : bom.status}
          </span>
        </div>
      </div>

      {bom.duplicatedFrom && (
        <div className="mb-6 bg-indigo-50/50 border border-indigo-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-indigo-900 tracking-tight">Lineage: Duplicated Recipe</h4>
              <p className="text-xs font-medium text-indigo-700/80 mt-0.5">
                This BOM was cloned from <strong className="text-indigo-900">{bom.duplicatedFrom.productId?.name || 'Unknown'}</strong>. Cloned by <strong className="text-indigo-900">{bom.createdBy || 'System'}</strong> on {new Date(bom.createdAt).toLocaleDateString()}.
              </p>
            </div>
          </div>
          <Button onClick={() => navigate(`/bom/${bom.duplicatedFrom._id}`)} variant="outline" className="h-8 text-xs font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-100">
            View Original
          </Button>
        </div>
      )}

      <PriceDriftBanner 
        components={bom.components} 
        oldTotal={bom.totalCost} 
        newTotal={bom.liveTotalCost} 
      />

      <Card className="border-slate-200 shadow-sm overflow-hidden mb-6">
        <CardHeader className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200 py-4 px-6 sticky top-0 z-10 rounded-t-xl">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Recipe Components</h3>
        </CardHeader>
        <CardContent className="p-0 overflow-visible">
          <div className="w-full overflow-x-auto pb-4">
            <Table className="min-w-[1100px] w-full">
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
                </TableRow>
              </TableHeader>
            <TableBody>
              {bom.components?.map((c, i) => {
                const mpnObj = c.mpnId;
                const qty = Number(c.qty) || 0;
                const loss = Number(c.lossPercent) || 0;
                const price = c.resolvedPrice || 0;
                const baseCost = qty * price;
                const finalCost = c.liveLineCost || 0;

                return (
                  <TableRow key={i} className="hover:bg-slate-50/50">
                    <TableCell className="align-top py-3 text-xs font-bold text-blue-700">
                      {mpnObj?.mpnCode}
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <div className="text-xs font-medium text-slate-700 truncate max-w-[150px]" title={mpnObj?.materialId?.name}>
                        {mpnObj?.materialId?.name || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <div className="text-xs font-medium text-slate-700 truncate max-w-[150px]" title={mpnObj?.vendorId?.name}>
                        {mpnObj?.vendorId?.name || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-3 text-right">
                      <div className="text-xs font-mono font-medium text-slate-600">
                        ₹{price.toFixed(2)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-3 text-right text-xs font-mono font-semibold">
                      {qty}
                    </TableCell>
                    <TableCell className="align-top py-3 text-[11px] font-medium text-slate-500 uppercase">
                      {mpnObj?.materialId?.unit || '-'}
                    </TableCell>
                    <TableCell className="align-top py-3 text-right text-xs font-mono font-semibold text-amber-600">
                      {loss}%
                    </TableCell>
                    <TableCell className="align-top py-3 text-right">
                      <div className="flex items-center justify-end group/tooltip relative">
                        <span className="text-xs font-mono font-bold text-slate-900">
                          ₹{finalCost.toFixed(2)}
                        </span>
                        <div className="ml-1 text-slate-400 hover:text-blue-600 cursor-help transition-colors">
                          <Info className="w-3.5 h-3.5" />
                          <div className="absolute hidden group-hover/tooltip:block z-[9999] right-0 top-6 w-48 bg-slate-900 text-slate-50 text-[11px] font-mono p-3 rounded shadow-2xl whitespace-pre-wrap text-left border border-slate-700/50 transition-opacity opacity-0 group-hover/tooltip:opacity-100 duration-200">
                            {`${qty} ${mpnObj?.materialId?.unit || ''} × ₹${price.toFixed(2)}\n= ₹${baseCost.toFixed(2)}\n\nLoss: ${loss}%\nFinal Cost: ₹${finalCost.toFixed(2)}`}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!bom.components || bom.components.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-slate-400 text-sm font-semibold border-b-0">
                    No components in recipe.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden col-span-2 rounded-lg mt-4">
          <CardHeader className="bg-slate-900 border-b border-slate-800 py-2.5 px-4">
            <h3 className="text-[11px] font-black text-white uppercase tracking-wider flex items-center">
              Cost Breakdown Dashboard
            </h3>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
              <div className="p-3 lg:col-span-3 grid grid-cols-2 gap-3">
                <div className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded">
                  <span className="text-slate-600 font-bold">Raw Material</span>
                  <span className="font-mono font-black text-slate-800">₹{(bom.breakdown?.rawMaterialCost ?? bom.liveTotalCost ?? 0).toFixed(2)}</span>
                </div>
                {(bom.breakdown?.packagingCost > 0) && (
                  <div className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded transition-colors">
                    <span className="text-slate-600 font-bold">Packaging</span>
                    <span className="font-mono font-black text-slate-800">₹{bom.breakdown.packagingCost.toFixed(2)}</span>
                  </div>
                )}
                {(bom.breakdown?.processingCost > 0) && (
                  <div className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded transition-colors">
                    <span className="text-slate-600 font-bold">Processing</span>
                    <span className="font-mono font-black text-slate-800">₹{bom.breakdown.processingCost.toFixed(2)}</span>
                  </div>
                )}
                {(bom.breakdown?.overheadCost > 0) && (
                  <div className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded transition-colors">
                    <span className="text-slate-600 font-bold">Overhead</span>
                    <span className="font-mono font-black text-slate-800">₹{bom.breakdown.overheadCost.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 lg:col-span-2 flex flex-col justify-center space-y-3">
                <div className="flex justify-between items-end border-b border-indigo-200/50 pb-2">
                  <span className="text-xs font-black text-indigo-900 uppercase">Total Cost</span>
                  <span className="text-lg font-black text-indigo-700 font-mono">₹{(bom.liveTotalCost || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black text-indigo-900/70 uppercase">Cost per Unit <span className="lowercase">({bom.batchUOM})</span></span>
                  <span className="text-base font-black text-blue-600 font-mono">₹{costPerUnit.toFixed(4)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm h-full">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Insights & History</h3>
          </CardHeader>
          <CardContent className="p-3">
            <div className="flex flex-col space-y-2">
              <Button onClick={() => navigate(`/bom/${id}/cost-breakdown`)} variant="ghost" className="justify-start text-xs font-semibold h-9 text-slate-600 hover:text-blue-700 hover:bg-blue-50">
                <Calculator className="w-4 h-4 mr-2" /> Cost Breakdown Analysis
              </Button>
              <Button onClick={() => navigate(`/bom/${id}/history`)} variant="ghost" className="justify-start text-xs font-semibold h-9 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50">
                <History className="w-4 h-4 mr-2" /> Version History
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </BomPageWrapper>
  );
}
