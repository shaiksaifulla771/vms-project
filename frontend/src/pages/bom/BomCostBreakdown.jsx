import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import { ChevronLeft, Calculator, PieChart } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';

export default function BomCostBreakdown() {
  const { id } = useParams();
  const navigate = useNavigate();
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
        setError('Failed to fetch BOM details');
      } finally {
        setLoading(false);
      }
    };
    fetchBom();
  }, [id]);

  const { breakdown, totalCost } = useMemo(() => {
    if (!bom || !bom.components) return { breakdown: [], totalCost: 0 };
    
    let total = bom.liveTotalCost || 0;
    const typeMap = {};

    if (bom.components && Array.isArray(bom.components)) {
      bom.components.forEach(comp => {
        const type = comp.mpnId?.materialId?.type || 'Other';
        const cost = comp.liveLineCost || 0;
        if (!typeMap[type]) typeMap[type] = 0;
        typeMap[type] += cost;
      });
    }

    const breakdownArr = Object.keys(typeMap).map(type => ({
      type,
      cost: typeMap[type],
      percent: total > 0 ? (typeMap[type] / total) * 100 : 0
    })).sort((a, b) => b.cost - a.cost);

    return { breakdown: breakdownArr, totalCost: total };
  }, [bom]);

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

  return (
    <BomPageWrapper>
      <div className="mb-4">
        <Link to={`/bom/${id}`} state={{ direction: -1 }} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to BOM
        </Link>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cost Breakdown Analysis</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Cost distribution by material type for {bom.productId?.name}.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
            <div className="flex items-center space-x-2">
              <PieChart className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Cost by Material Type</h3>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {breakdown.map((item) => (
                <div key={item.type}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-slate-700">{item.type}</span>
                    <div className="text-right">
                      <span className="text-sm font-mono font-bold text-slate-900 block">₹{item.cost.toFixed(2)}</span>
                      <span className="text-xs font-semibold text-slate-500">{item.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${item.percent}%` }}
                    ></div>
                  </div>
                </div>
              ))}
              
              {breakdown.length === 0 && (
                <div className="text-center text-slate-400 font-semibold py-8 text-sm">
                  No cost data available.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-indigo-50/50 h-fit">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-slate-700">Total Recipe Cost</span>
              <Calculator className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-3xl font-black text-indigo-700 mb-1">
              ₹{totalCost.toFixed(2)}
            </div>
            <div className="text-xs font-semibold text-indigo-600/70">
              For batch of {bom.batchSize} {bom.batchUOM}
            </div>
          </CardContent>
        </Card>
      </div>
    </BomPageWrapper>
  );
}
