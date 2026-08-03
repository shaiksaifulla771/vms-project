import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import BomRecipeEditor from '../../features/bom/BomRecipeEditor';
import { ChevronLeft } from 'lucide-react';

export default function BomEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBom = async () => {
      try {
        const res = await api.get(`/api/boms/${id}`);
        if (res.data.success) {
          setInitialData(res.data.data);
        }
      } catch (err) {
        setError('Failed to fetch BOM details');
      } finally {
        setLoading(false);
      }
    };
    fetchBom();
  }, [id]);

  const handleSave = async (data) => {
    try {
      // Include version for concurrency protection
      const payload = { ...data, version: initialData.version };
      const res = await api.put(`/api/boms/${id}`, payload);
      if (res.data.success) {
        // Must navigate to the NEW _id because updateBOM creates a new version document
        navigate(`/bom/${res.data.data._id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update BOM');
    }
  };

  if (loading) {
    return (
      <BomPageWrapper className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </BomPageWrapper>
    );
  }

  if (!initialData) {
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

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold">
          {error}
        </div>
      )}

      <BomRecipeEditor 
        initialData={initialData} 
        isNew={false} 
        onSave={handleSave} 
        onCancel={() => navigate(`/bom/${id}`, { state: { direction: -1 } })} 
      />
    </BomPageWrapper>
  );
}
