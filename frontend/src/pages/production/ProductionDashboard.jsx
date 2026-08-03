import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, Factory, TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import api from '../../services/api';

export default function ProductionDashboard() {
  const [stats, setStats] = useState({
    total: 0,
    inProgress: 0,
    completed: 0,
    qualityIssues: 0,
    recentOrders: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // In a real app, there would be a specific dashboard endpoint.
      // Here we aggregate from the list endpoint.
      const res = await api.get('/api/productions');
      const orders = res.data.data;
      
      const inProgress = orders.filter(o => ['In Production', 'Material Allocated'].includes(o.status)).length;
      const completed = orders.filter(o => o.status === 'Completed').length;
      const qualityIssues = orders.filter(o => o.status === 'Rejected').length;

      setStats({
        total: orders.length,
        inProgress,
        completed,
        qualityIssues,
        recentOrders: orders.slice(0, 5)
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Production Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Shop floor overview and manufacturing KPIs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Factory className="w-6 h-6" /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Orders</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.total}</h3>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><TrendingUp className="w-6 h-6" /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">In Progress</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.inProgress}</h3>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 className="w-6 h-6" /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Completed</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.completed}</h3>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center space-x-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-lg"><AlertTriangle className="w-6 h-6" /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">QC Rejected</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.qualityIssues}</h3>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Recent Production Runs</h2>
        <div className="space-y-4">
          {stats.recentOrders.map(order => (
            <div key={order._id} className="flex justify-between items-center p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="flex items-center space-x-4">
                <div className="bg-slate-100 p-2 rounded-md"><Clock className="w-5 h-5 text-slate-600" /></div>
                <div>
                  <Link to={`/production/${order._id}`} className="font-semibold text-blue-600 hover:underline">
                    {order.prdNumber}
                  </Link>
                  <p className="text-sm text-slate-500">Product: {order.productId?.name} | Target: {order.targetQuantity}</p>
                </div>
              </div>
              <div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700`}>
                  {order.status}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-center">
          <Link to="/production" className="text-blue-600 hover:text-blue-800 text-sm font-medium">View All Orders &rarr;</Link>
        </div>
      </div>
    </div>
  );
}
