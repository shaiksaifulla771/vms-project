import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { CalendarClock, Play, Undo2, LayoutList } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function Scheduling() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // id of plan being processed

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/production-plans');
      if (res.data && res.data.success) {
        setPlans(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleSchedule = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/api/production-plans/${id}/schedule`);
      fetchPlans(); // Refresh the queues
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to schedule plan.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnschedule = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/api/production-plans/${id}/unschedule`);
      fetchPlans(); // Refresh the queues
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to unschedule plan.');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingPlans = plans.filter(p => p.status === 'Pending');
  const scheduledPlans = plans.filter(p => p.status === 'Scheduled');
  const inProductionPlans = plans.filter(p => p.status === 'In Production');
  const completedPlans = plans.filter(p => p.status === 'Completed');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Production Scheduling</h2>
          <p className="text-sm text-slate-500">Manage, schedule, and unschedule manual production plans.</p>
        </div>
        <Button onClick={fetchPlans} variant="outline" className="text-slate-600">
           Refresh Data
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Pending</p>
              <h3 className="text-2xl font-bold text-amber-600">{pendingPlans.length}</h3>
            </div>
            <LayoutList className="h-8 w-8 text-amber-100" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Scheduled</p>
              <h3 className="text-2xl font-bold text-blue-600">{scheduledPlans.length}</h3>
            </div>
            <CalendarClock className="h-8 w-8 text-blue-100" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">In Production</p>
              <h3 className="text-2xl font-bold text-indigo-600">{inProductionPlans.length}</h3>
            </div>
            <Play className="h-8 w-8 text-indigo-100" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Completed</p>
              <h3 className="text-2xl font-bold text-emerald-600">{completedPlans.length}</h3>
            </div>
            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">✓</div>
          </CardContent>
        </Card>
      </div>

      {/* PENDING QUEUE */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pending Plans</CardTitle>
              <CardDescription>Awaiting capacity commitment and inventory reservation.</CardDescription>
            </div>
            <Badge variant="warning">{pendingPlans.length} Pending</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Target Qty</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Required Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && plans.length === 0 ? (
                <TableRow><TableCell colSpan="6" className="text-center py-6 text-slate-400">Loading...</TableCell></TableRow>
              ) : pendingPlans.length === 0 ? (
                <TableRow><TableCell colSpan="6" className="text-center py-6 text-slate-400">No pending plans.</TableCell></TableRow>
              ) : (
                pendingPlans.map(plan => (
                  <TableRow key={plan._id}>
                    <TableCell className="font-mono text-xs font-bold text-amber-700">{plan.planNumber}</TableCell>
                    <TableCell className="font-bold text-slate-800 truncate max-w-[200px]" title={plan.productId?.name}>
                      {plan.productId?.name}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-700">{plan.quantity}</TableCell>
                    <TableCell className="text-slate-600 text-sm">{plan.warehouseId?.name || '-'}</TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {new Date(plan.requiredDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        onClick={() => handleSchedule(plan._id)}
                        isLoading={actionLoading === plan._id}
                        disabled={actionLoading !== null}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <CalendarClock className="w-4 h-4 mr-1" /> Schedule
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SCHEDULED QUEUE */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Scheduled Plans</CardTitle>
              <CardDescription>Committed for execution. Linked to active Production Orders.</CardDescription>
            </div>
            <Badge variant="info">{scheduledPlans.length} Scheduled</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Target Qty</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Required Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && plans.length === 0 ? (
                <TableRow><TableCell colSpan="6" className="text-center py-6 text-slate-400">Loading...</TableCell></TableRow>
              ) : scheduledPlans.length === 0 ? (
                <TableRow><TableCell colSpan="6" className="text-center py-6 text-slate-400">No scheduled plans.</TableCell></TableRow>
              ) : (
                scheduledPlans.map(plan => (
                  <TableRow key={plan._id}>
                    <TableCell className="font-mono text-xs font-bold text-blue-700">{plan.planNumber}</TableCell>
                    <TableCell className="font-bold text-slate-800 truncate max-w-[200px]" title={plan.productId?.name}>
                      {plan.productId?.name}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-700">{plan.quantity}</TableCell>
                    <TableCell className="text-slate-600 text-sm">{plan.warehouseId?.name || '-'}</TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {new Date(plan.requiredDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleUnschedule(plan._id)}
                        isLoading={actionLoading === plan._id}
                        disabled={actionLoading !== null}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        <Undo2 className="w-4 h-4 mr-1" /> Unschedule
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
