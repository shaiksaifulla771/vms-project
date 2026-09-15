import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import api from '../../services/api';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import { ChevronLeft, Copy } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

export default function BomDuplicate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || `/bom/${id}`;
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);

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

  const handleDuplicate = async () => {
    setSubmitLoading(true);
    try {
      const res = await api.post(`/api/boms/${id}/duplicate`);
      if (res.data.success) {
        navigate(`/bom/${res.data.data._id}/edit`, { state: { returnTo: returnTo }, replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate BOM');
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
        <Button onClick={() => navigate(returnTo)}>Return to List</Button>
      </BomPageWrapper>
    );
  }

  return (
    <BomPageWrapper>
      <div className="mb-4">
        <button onClick={() => navigate(returnTo)} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </button>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Duplicate Recipe</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Create an exact, independent copy of this BOM.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold">
          {error}
        </div>
      )}

      <Card className="border-slate-200 shadow-sm max-w-2xl mx-auto mt-10">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6 text-center">
          <div className="mx-auto w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
            <Copy className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 tracking-tight">Clone {bom.productId?.name}?</h3>
          <p className="text-sm text-slate-500 mt-2">
            This will create a new Version 1 recipe using the exact same components, loss percentages, and batch size. The new recipe will be independent and will not affect the original.
          </p>
        </CardHeader>
        <CardContent className="p-6 bg-white flex justify-center space-x-4">
          <Button onClick={() => navigate(returnTo)} variant="outline" className="w-32">Cancel</Button>
          <Button onClick={handleDuplicate} disabled={submitLoading} className="w-40 bg-indigo-600 hover:bg-indigo-700 text-white">
            {submitLoading ? 'Cloning...' : 'Confirm Duplicate'}
          </Button>
        </CardContent>
      </Card>
    </BomPageWrapper>
  );
}
