import React, { useState, useEffect } from 'react';
import warehouseService from '../services/warehouseService';
import inventoryService from '../services/inventoryService';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Building2, Boxes, RefreshCw, ChevronRight, MapPin } from 'lucide-react';

const Warehouse = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [activeTab, setActiveTab] = useState('inventory');
  const [stockBalances, setStockBalances] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch warehouses
  const fetchWarehouses = async () => {
    setLoading(true);
    try {
      const res = await warehouseService.getWarehouses();
      const list = res.data || res.warehouses || [];
      setWarehouses(list);
      if (list.length > 0) {
        setSelectedWarehouse(list[0]);
      }
    } catch (err) {
      console.error('Failed to fetch warehouses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  // Fetch warehouse inventory when selected warehouse changes
  useEffect(() => {
    if (!selectedWarehouse) return;
    const fetchWarehouseDetails = async () => {
      try {
        const invRes = await inventoryService.getInventoryBalance({ warehouseId: selectedWarehouse._id });
        setStockBalances(invRes.data || invRes.inventory || []);
      } catch (err) {
        console.error('Failed to fetch warehouse inventory:', err);
      }
    };
    fetchWarehouseDetails();
  }, [selectedWarehouse]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Warehouse & Network Locations</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Manage regional site warehouses, raw material zones, and WIP/FG storage locations
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchWarehouses}
          isLoading={loading}
          className="border-slate-300 text-slate-700 hover:text-slate-900"
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          <span>Refresh Locations</span>
        </Button>
      </div>

      {/* Warehouse Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {warehouses.map((wh) => {
          const isSelected = selectedWarehouse?._id === wh._id;
          return (
            <div
              key={wh._id}
              onClick={() => setSelectedWarehouse(wh)}
              className={`p-5 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-50/50 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-600">{wh.code || 'WH-01'}</span>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {wh.status || 'Active'}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900 mt-2">{wh.name}</h3>

              <div className="flex items-center space-x-1.5 text-xs text-slate-500 mt-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>{wh.location || 'Bengaluru Manufacturing Plant'}</span>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Type: <strong className="text-slate-800">{wh.type || 'Production WH'}</strong></span>
                <span className="text-blue-600 font-bold flex items-center space-x-1">
                  <span>Details</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Warehouse Details */}
      {selectedWarehouse && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">SELECTED LOCATION DETAILS</span>
                <CardTitle className="text-base font-bold text-slate-900 mt-0.5">
                  {selectedWarehouse.name} <span className="text-blue-600 font-mono">({selectedWarehouse.code || 'WH-01'})</span>
                </CardTitle>
              </div>

              {/* Detail Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setActiveTab('inventory')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'inventory' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Inventory Balances
                </button>
                <button
                  onClick={() => setActiveTab('reservations')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'reservations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active Reservations
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {activeTab === 'inventory' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-4">Material Code & Name</th>
                      <th className="p-4 font-mono">Available Stock</th>
                      <th className="p-4 font-mono">Reserved Stock</th>
                      <th className="p-4 font-mono">Total On Hand</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {stockBalances.map((item) => {
                      const onHand = item.quantityOnHand || item.onHand || 0;
                      const reserved = item.reservedBalance || item.reserved || 0;
                      const available = item.quantityAvailable || (onHand - reserved);
                      return (
                        <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <span className="font-mono text-blue-600 font-bold block text-[11px]">{item.materialId?.code || 'MAT-1001'}</span>
                            <span className="font-bold text-slate-900 text-xs block mt-0.5">{item.materialId?.name || 'Material'}</span>
                          </td>
                          <td className="p-4 font-mono font-bold text-emerald-600 text-sm">
                            {available} {item.materialId?.unit || 'KG'}
                          </td>
                          <td className="p-4 font-mono font-bold text-amber-600 text-sm">
                            {reserved} {item.materialId?.unit || 'KG'}
                          </td>
                          <td className="p-4 font-mono font-bold text-slate-900 text-sm">
                            {onHand} {item.materialId?.unit || 'KG'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'reservations' && (
              <div className="p-6 text-center text-slate-500 text-xs font-medium space-y-2">
                <Boxes className="h-8 w-8 text-amber-500 mx-auto" />
                <p>Soft reservations are automatically tied to Scheduled Production Plans & Orders.</p>
                <span className="text-[11px] text-slate-400 block">Reservations release on Unschedule or deduct upon Production Completion.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Warehouse;
