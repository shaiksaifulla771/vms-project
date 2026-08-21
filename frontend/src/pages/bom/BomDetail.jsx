import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Edit2, Copy, Scale, ChevronLeft, History, Layers, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import PriceDriftBanner from '../../features/bom/PriceDriftBanner';
import BomRevisionHistory from '../../components/bom/BomRevisionHistory';

export default function BomDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/bom';
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showExplosion, setShowExplosion] = useState(false);
  const [explosionData, setExplosionData] = useState(null);
  const [explosionLoading, setExplosionLoading] = useState(false);

  const fetchExplosion = async () => {
    setShowExplosion(true);
    if (explosionData) return;
    setExplosionLoading(true);
    try {
      const res = await api.get(`/api/boms/${id}/explosion`);
      if (res.data.success) {
        setExplosionData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load BOM explosion:', err);
    } finally {
      setExplosionLoading(false);
    }
  };

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
                  <Button onClick={fetchExplosion} variant="outline" className="h-9 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800">
                    <Layers className="w-4 h-4 mr-2" /> Multi-Level Tree
                  </Button>
                  <Button onClick={() => navigate(`/bom/${id}/edit`, { state: { returnTo: location.pathname } })} variant="outline" className="h-9">
                    <Edit2 className="w-4 h-4 mr-2" /> Edit Recipe
                  </Button>
                  <Button onClick={() => navigate(`/bom/${id}/scale`, { state: { returnTo: location.pathname } })} variant="outline" className="h-9">
                    <Scale className="w-4 h-4 mr-2" /> Scale
                  </Button>
                  <Button onClick={() => setShowHistory(true)} variant="outline" className="h-9 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800">
                    <History className="w-4 h-4 mr-2" /> Revision History
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">{bom.productId?.name}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-slate-500 font-medium">
          <Badge variant="outline" className="bg-white font-mono font-semibold">Batch Size: {bom.batchSize}</Badge>
          <Badge variant="outline" className="bg-white font-mono font-semibold uppercase">UOM: {bom.batchUOM || '—'}</Badge>
          <Badge variant="outline" className="bg-white">Batch Code: {bom.batchCode || '—'}</Badge>
          <Badge variant="outline" className="bg-blue-50/60 border-blue-200 text-blue-800 font-medium">
            Manufacturer: {bom.manufacturer || bom.productId?.manufacturer || 'Standard'}
          </Badge>
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

      {/* Recipe Components Data Sheet - Excel Format */}
      <Card className="border border-slate-300 shadow-sm rounded-xl overflow-hidden mb-6">
        <CardHeader className="bg-slate-100/90 border-b border-slate-300 py-3 px-6 sticky top-0 z-10 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Recipe Components Data Sheet</h3>
          <span className="text-xs font-semibold text-slate-500 font-mono">
            {bom.components?.length || 0} Line Items
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-visible">
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse min-w-[850px]">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-tight border-b border-slate-300 select-none">
                <tr>
                  <th className="w-10 px-2 py-2 text-center font-mono border-r border-slate-200">#</th>
                  <th className="px-2.5 py-2 w-32 border-r border-slate-200">MPN / Code</th>
                  <th className="px-2.5 py-2 min-w-[180px] border-r border-slate-200">Material Name</th>
                  <th className="px-2.5 py-2 min-w-[180px] border-r border-slate-200">Vendor / Mfr</th>
                  <th className="px-2.5 py-2 w-28 text-right border-r border-slate-200">Unit Price (₹)</th>
                  <th className="px-2.5 py-2 w-24 text-right border-r border-slate-200">Quantity</th>
                  <th className="px-2.5 py-2 w-16 text-center border-r border-slate-200">UOM</th>
                  <th className="px-2.5 py-2 w-20 text-right border-r border-slate-200">Loss %</th>
                  <th className="px-2.5 py-2 w-32 text-right">Line Cost (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {bom.components?.map((c, i) => {
                  const mpnObj = c.mpnId;
                  const matObj = c.materialId;
                  const qty = Number(c.quantity !== undefined ? c.quantity : (c.qty || 0));
                  const loss = Number(c.lossPercentage !== undefined ? c.lossPercentage : (c.lossPercent || 0));
                  const price = c.resolvedPrice || mpnObj?.price || matObj?.basePrice || 0;
                  const finalCost = c.liveLineCost || (loss > 0 && loss < 100 ? (qty * price) / (1 - loss / 100) : qty * price);

                  const displayName = mpnObj?.materialId?.name || matObj?.name || '—';
                  const displayVendor = mpnObj?.vendorId?.name || matObj?.defaultVendorId?.name || matObj?.manufacturer || 'Standard';
                  const displayUom = mpnObj?.priceUOM || mpnObj?.materialId?.unit || matObj?.unit || 'pcs';

                  return (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors border-b border-slate-200">
                      <td className="px-2 py-1.5 text-center font-mono text-slate-400 font-semibold text-[11px] border-r border-slate-200 bg-slate-50/50">
                        {i + 1}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-xs font-bold text-blue-700 border-r border-slate-200">
                        {mpnObj?.mpnCode || (matObj?.code ? `MAT-${matObj.code}` : 'DIRECT-MAT')}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 border-r border-slate-200 truncate max-w-[200px]" title={displayName}>
                        {displayName}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs text-slate-700 border-r border-slate-200 truncate max-w-[200px]" title={displayVendor}>
                        {displayVendor}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-slate-800 border-r border-slate-200">
                        ₹{price.toFixed(2)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                        {qty}
                      </td>
                      <td className="px-2.5 py-1.5 text-center text-[11px] font-semibold text-slate-500 uppercase border-r border-slate-200">
                        {displayUom}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-semibold text-amber-700 border-r border-slate-200">
                        {loss}%
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-bold text-slate-900">
                        ₹{finalCost.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                {(!bom.components || bom.components.length === 0) && (
                  <tr>
                    <td colSpan={9} className="h-24 text-center text-slate-400 text-xs font-semibold">
                      No components registered in this recipe data sheet.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-xs text-slate-700 border-r border-slate-200 uppercase">
                    Total Recipe Batch Summary
                  </td>
                  <td colSpan={4} className="px-3 py-2 text-xs text-right text-slate-600 border-r border-slate-200">
                    Total Batch Cost:
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm text-emerald-700 font-extrabold">
                    ₹{(bom.liveTotalCost || 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden rounded-lg w-full">
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
      </div>

      <BomRevisionHistory 
        isOpen={showHistory} 
        onClose={() => setShowHistory(false)} 
        currentBomId={bom._id} 
      />

      {/* Multi-Level Exploded BOM Modal */}
      <Dialog
        isOpen={showExplosion}
        onClose={() => setShowExplosion(false)}
        title="Multi-Level Flattened BOM Explosion"
        className="!max-w-[850px] !w-[850px]"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="font-bold text-slate-800">Finished Product: </span>
              <span className="font-semibold text-blue-700">{bom.productId?.name}</span>
            </div>
            <div className="flex items-center space-x-3 font-mono font-bold">
              <span>Batch: {bom.batchSize} {bom.batchUOM}</span>
              <span className="text-emerald-700">Total: ₹{(explosionData?.totalCost || bom.liveTotalCost || 0).toFixed(2)}</span>
            </div>
          </div>

          {explosionLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : explosionData && explosionData.nodes && explosionData.nodes.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-bold text-slate-700 uppercase border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Level</th>
                    <th className="px-3 py-2">Material / Part</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-center">UOM</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Line Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {explosionData.nodes.map((node, idx) => (
                    <tr key={idx} className={node.level > 1 ? 'bg-indigo-50/30' : 'bg-white'}>
                      <td className="px-3 py-2 font-mono font-bold text-slate-500">
                        {node.level === 1 ? '• L1' : `↳ L${node.level}`}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-800" style={{ paddingLeft: `${(node.level - 1) * 12}px` }}>
                          {node.materialName || '—'}
                          <span className="ml-2 font-mono text-[10px] text-slate-400">({node.materialCode})</span>
                          {node.isSubassembly && (
                            <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 font-bold rounded">
                              Subassembly
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600 font-medium">{node.materialType}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">{node.quantity}</td>
                      <td className="px-3 py-2 text-center text-slate-500 uppercase">{node.unit}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">₹{(node.unitCost || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">₹{(node.lineCost || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-slate-500">
              No exploded nodes found for this bill of materials.
            </div>
          )}

          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setShowExplosion(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </BomPageWrapper>
  );
}
