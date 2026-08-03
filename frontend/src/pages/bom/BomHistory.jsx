import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import BomPageWrapper from '../../features/bom/BomPageWrapper';
import { ChevronLeft, History, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

export default function BomHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get(`/api/boms/${id}/history`);
        if (res.data.success) {
          setHistory(res.data.data);
        }
      } catch (err) {
        setError('Failed to fetch BOM history');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [id]);

  if (loading) {
    return (
      <BomPageWrapper className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
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
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Version History</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Review past versions and lineage of this recipe.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-semibold">
          {error}
        </div>
      )}

      <Card className="border-slate-200 shadow-sm max-w-4xl">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Recipe Timeline</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-bold text-xs">Version</TableHead>
                <TableHead className="font-bold text-xs">Date</TableHead>
                <TableHead className="font-bold text-xs">Batch</TableHead>
                <TableHead className="font-bold text-xs">Total Cost (₹)</TableHead>
                <TableHead className="font-bold text-xs">Status</TableHead>
                <TableHead className="font-bold text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-slate-400 font-semibold text-sm">
                    No history found.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((record) => (
                  <TableRow key={record._id} className={record._id === id ? "bg-indigo-50/30" : "hover:bg-slate-50"}>
                    <TableCell className="text-xs font-bold text-slate-800">
                      v{record.version}
                      {record._id === id && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">CURRENT</span>}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-600">
                      {new Date(record.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-700">
                      {record.batchSize} {record.batchUOM}
                    </TableCell>
                    <TableCell className="text-xs font-mono font-bold text-slate-900">
                      ₹{record.totalCost?.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={record.status === 'Active' ? 'success' : 'danger'}>{record.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {record._id !== id && (
                        <Button 
                          onClick={() => navigate(`/bom/${record._id}`)} 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          View <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </BomPageWrapper>
  );
}
