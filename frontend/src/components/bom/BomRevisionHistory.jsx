import React, { useState, useEffect } from 'react';
import { Drawer } from '../ui/Drawer';
import { History, ArrowRight, Calendar, User, GitCommit } from 'lucide-react';
import api from '../../services/api';

export default function BomRevisionHistory({ isOpen, onClose, currentBomId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && currentBomId) {
      fetchHistory();
    }
  }, [isOpen, currentBomId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/boms/${currentBomId}/history`);
      if (res.data.success) {
        setHistory(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch BOM history:', err);
      setError('Could not load revision history.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center space-x-2">
          <History className="h-5 w-5 text-blue-600" />
          <span>Revision History</span>
        </div>
      }
      size="md"
    >
      <div className="p-6 h-full flex flex-col bg-slate-50/50">
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 p-4 bg-red-50 rounded-lg border border-red-200 text-sm">{error}</div>
        ) : history.length === 0 ? (
          <div className="text-slate-500 text-center py-8">No revision history found.</div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 relative">
            <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-slate-200/60 z-0"></div>
            {history.map((rev, index) => {
              const isCurrent = index === 0;
              return (
                <div key={rev._id} className="relative z-10 flex items-start space-x-4">
                  <div className={`mt-1.5 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-4 border-slate-50 shadow-sm ${isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    <GitCommit className="h-4 w-4" />
                  </div>
                  <div className={`flex-1 p-4 rounded-xl border ${isCurrent ? 'bg-white border-blue-200 shadow-md ring-1 ring-blue-50' : 'bg-white/80 border-slate-200 shadow-sm hover:bg-white transition-colors cursor-pointer'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className={`text-lg font-black ${isCurrent ? 'text-blue-700' : 'text-slate-700'}`}>
                          Revision {rev.version}
                          {isCurrent && <span className="ml-3 text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-widest">Active</span>}
                        </h4>
                        <p className="text-xs text-slate-400 font-bold mt-0.5">{rev.bomNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-700 font-black">₹{(rev.liveTotalCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 text-right">{rev.components?.length || 0} items</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600 font-medium">
                      <div className="flex items-center space-x-1.5 bg-slate-50 p-1.5 rounded-md border border-slate-100">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>{formatDate(rev.createdAt)}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 bg-slate-50 p-1.5 rounded-md border border-slate-100">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate">{rev.updatedBy || 'System'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}
