import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import BomRecipeEditor from '../../features/bom/BomRecipeEditor';

export default function BomNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);

  const draftPayload = location.state?.draftPayload;

  const returnTo = location.state?.returnTo || '/bom';

  const handleSave = async (data) => {
    try {
      const res = await api.post('/api/boms', data);
      if (res.data.success) {
        navigate(`/bom/${res.data.data._id}`, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create BOM');
    }
  };

  return (
    <BomPageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Create New Recipe</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">Define the assembly product and ingredients.</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold">
          {error}
        </div>
      )}

      <BomRecipeEditor 
        initialData={draftPayload}
        isNew={true} 
        onSave={handleSave} 
        onCancel={() => navigate(returnTo)} 
      />
    </BomPageWrapper>
  );
}
