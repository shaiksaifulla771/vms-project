import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle, Plus, Filter, Search, MoreVertical, LayoutGrid, Clock, CheckCircle2, XCircle } from 'lucide-react';
import api from '../../services/api';

const getStatusBadge = (status) => {
  const styles = {
    'Draft': 'bg-slate-100 text-slate-700',
    'Pending Approval': 'bg-yellow-100 text-yellow-800',
    'Approved': 'bg-blue-100 text-blue-800',
    'Material Allocated': 'bg-indigo-100 text-indigo-800',
    'In Production': 'bg-purple-100 text-purple-800 animate-pulse',
    'Quality Check': 'bg-orange-100 text-orange-800',
    'Completed': 'bg-emerald-100 text-emerald-800',
    'Closed': 'bg-slate-800 text-slate-100',
    'Rejected': 'bg-red-100 text-red-800'
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles['Draft']}`}>{status}</span>;
};

export default function ProductionOrderList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await api.get('/api/productions');
      setOrders(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(o => 
    o.prdNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.productId?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Production Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Manage manufacturing lifecycle, routing, and shop floor execution.</p>
        </div>
        <div className="flex space-x-3">
          <Link to="/production/dashboard" className="btn-secondary">
            <LayoutGrid className="w-4 h-4 mr-2" />
            Dashboard
          </Link>
          <Link to="/production/new" className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Production Order
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div className="relative w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by PRD Number or Product..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <button className="btn-secondary px-3 py-2 text-sm">
            <Filter className="w-4 h-4 mr-2" />
            More Filters
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">PRD Number</th>
                <th className="px-6 py-3">Product (FG)</th>
                <th className="px-6 py-3 text-right">Target Qty</th>
                <th className="px-6 py-3 text-right">Actual Qty</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="7" className="px-6 py-8 text-center text-slate-500">Loading production orders...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan="7" className="px-6 py-8 text-center text-slate-500">No production orders found.</td></tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order._id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      <Link to={`/production/${order._id}`} className="hover:text-blue-600 hover:underline">
                        {order.prdNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="text-slate-900 font-medium">{order.productId?.name}</span>
                        <span className="text-slate-500 text-xs">{order.productId?.code}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right font-medium">{order.targetQuantity}</td>
                    <td className="px-6 py-3 text-right">{order.actualQuantity || '-'}</td>
                    <td className="px-6 py-3">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-3 text-slate-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right">
                      <Link to={`/production/${order._id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View Workflow &rarr;
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
