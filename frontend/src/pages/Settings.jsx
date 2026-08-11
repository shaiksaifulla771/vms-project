import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import api from '../services/api';
import { Settings, Shield, UserCheck, Database, Info, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const SettingsPage = () => {
  const { user } = useAuth();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestError, setRequestError] = useState('');

  const loadPendingUsers = async () => {
    if (user?.role !== 'Admin') return;
    setLoadingRequests(true);
    setRequestError('');
    try {
      const res = await api.get('/users?status=Pending');
      setPendingUsers(res.data.data || []);
    } catch (err) {
      setRequestError(err.response?.data?.error || err.response?.data?.message || 'Failed to load access requests');
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    loadPendingUsers();
  }, [user?.role]);

  const handleAccessDecision = async (id, decision) => {
    setRequestMessage('');
    setRequestError('');
    try {
      const endpoint = decision === 'approve' ? `/users/${id}/approve` : `/users/${id}/reject`;
      const res = await api.put(endpoint);
      setRequestMessage(res.data.message || `User ${decision}d`);
      await loadPendingUsers();
    } catch (err) {
      setRequestError(err.response?.data?.error || err.response?.data?.message || `Failed to ${decision} user`);
    }
  };

  const permissions = [
    { module: 'Material Registry', description: 'Create and edit material master definitions', admin: true, manager: true },
    { module: 'Material Deletion', description: 'Remove material definitions from masters database', admin: true, manager: false },
    { module: 'Vendor Registry', description: 'Add and toggle vendor profiles', admin: true, manager: true },
    { module: 'Vendor Deletion', description: 'Remove vendor profiles from masters database', admin: true, manager: false },
    { module: 'BOM Recipes', description: 'Define and modify finished product assembly recipes', admin: true, manager: true },
    { module: 'MRP Planning Check', description: 'Compute shortages checks for target runs', admin: true, manager: true },
    { module: 'Inventory Manual Adjustments', description: 'Manually increment or write-off stock card levels', admin: true, manager: false },
    { module: 'Purchase Order Approval', description: 'Approve or reject pending procurement requests', admin: true, manager: true },
    { module: 'GRN Stock-In Receipt', description: 'Execute PO receipts and automatically stock-in items', admin: true, manager: true },
    { module: 'Production Start & Run', description: 'Consume raw components and run factory orders', admin: true, manager: true },
    { module: 'Quality Inspections (QC)', description: 'Inspect completed runs (Passed lots gate stock-in)', admin: true, manager: true },
    { module: 'System Configurations', description: 'Access backend properties and global settings', admin: true, manager: false }
  ];

  return (
    <div className="space-y-6">
      {/* Upper Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Profile info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center space-x-2 text-blue-600">
              <Info className="h-5 w-5" />
              <CardTitle>System Information</CardTitle>
            </div>
            <CardDescription>ERP system version and network properties</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs font-semibold text-slate-600">
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <span>ERP Version</span>
              <span className="text-slate-800 font-bold">v2.1.0-release</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <span>Local Database</span>
              <Badge variant="success" className="flex items-center space-x-1">
                <Database className="h-3 w-3 mr-0.5" />
                <span>MongoDB Connected</span>
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <span>API Gateway Host</span>
              <span className="font-mono text-[10px] text-slate-500">http://127.0.0.1:5000</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Active User Session</span>
              <span className="text-slate-800 font-bold">{user?.username} ({user?.role})</span>
            </div>
          </CardContent>
        </Card>

        {/* User profile card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center space-x-2 text-blue-600">
              <Shield className="h-5 w-5" />
              <CardTitle>User Authorization Profile</CardTitle>
            </div>
            <CardDescription>Permissions and clearance level assigned to your account</CardDescription>
          </CardHeader>
          <CardContent className="flex items-start space-x-4">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-black text-2xl shadow-sm">
              {user?.username.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-2">
              <h4 className="text-base font-bold text-slate-800">{user?.username}</h4>
              <p className="text-xs text-slate-400 font-medium">Logged in via email: <span className="font-mono text-slate-500">{user?.email}</span></p>
              
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant={user?.role === 'Admin' ? 'danger' : 'success'} className="flex items-center space-x-1 font-bold">
                  <UserCheck className="h-3.5 w-3.5 mr-0.5" />
                  <span>Clearance Role: {user?.role}</span>
                </Badge>
                {user?.role === 'Admin' ? (
                  <Badge variant="info">Full Read & Write Access</Badge>
                ) : (
                  <Badge variant="warning">Operations Clearance Only</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Permissions matrix */}
      {user?.role === 'Admin' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2 text-blue-600">
                  <UserCheck className="h-5 w-5" />
                  <CardTitle>Access Requests</CardTitle>
                </div>
                <CardDescription>Review verified users waiting for Admin approval</CardDescription>
              </div>
              <button onClick={loadPendingUsers} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <RefreshCw className={`h-4 w-4 ${loadingRequests ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {requestMessage && <div className="mx-4 mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{requestMessage}</div>}
            {requestError && <div className="mx-4 mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{requestError}</div>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Requested Role</TableHead>
                  <TableHead>Requested At</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm font-semibold text-slate-400">No pending access requests.</TableCell>
                  </TableRow>
                ) : pendingUsers.map((pendingUser) => (
                  <TableRow key={pendingUser._id}>
                    <TableCell className="font-bold text-slate-800">{pendingUser.username}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{pendingUser.email}</TableCell>
                    <TableCell><Badge variant="warning">{pendingUser.requestedRole || 'Viewer'}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(pendingUser.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleAccessDecision(pendingUser._id, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button onClick={() => handleAccessDecision(pendingUser._id, 'reject')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700">
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2 text-blue-600">
            <Settings className="h-5 w-5" />
            <CardTitle>Roles & Access Privileges Matrix</CardTitle>
          </div>
          <CardDescription>Detailed role authorizations across system modules</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System Function</TableHead>
                <TableHead>Functional Description</TableHead>
                <TableHead className="text-center">Admin Role</TableHead>
                <TableHead className="text-center">Manager Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.map((p, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-bold text-slate-800">{p.module}</TableCell>
                  <TableCell className="text-xs text-slate-500">{p.description}</TableCell>
                  <TableCell className="text-center">
                    {p.admin ? (
                      <Badge variant="success">Authorized</Badge>
                    ) : (
                      <Badge variant="danger">Blocked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {p.manager ? (
                      <Badge variant="success">Authorized</Badge>
                    ) : (
                      <Badge variant="danger">Blocked</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
