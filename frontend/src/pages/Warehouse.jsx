import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Building2 } from 'lucide-react';

export default function Warehouse() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/warehouses');
      if (res.data && res.data.success) {
        setWarehouses(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Warehouse Management</h2>
          <p className="text-sm text-slate-500">Manage sites and operational locations for inventory.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <CardTitle>Configured Sites / Warehouses</CardTitle>
          </div>
          <CardDescription>Primary contexts for MRP calculations and production tracking.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse Code</TableHead>
                <TableHead>Warehouse Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan="4" className="text-center py-8 text-slate-400">Loading...</TableCell>
                </TableRow>
              ) : warehouses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan="4" className="text-center py-8 text-slate-400">No warehouses configured.</TableCell>
                </TableRow>
              ) : (
                warehouses.map(wh => (
                  <TableRow key={wh._id}>
                    <TableCell className="font-mono text-xs font-bold text-slate-700">{wh.code}</TableCell>
                    <TableCell className="font-bold text-slate-900">{wh.name}</TableCell>
                    <TableCell className="text-slate-600">{wh.location || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={wh.isActive ? 'success' : 'danger'}>
                        {wh.isActive ? 'Active' : 'Inactive'}
                      </Badge>
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
