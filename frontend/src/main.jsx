import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AppProvider, useApp } from './lib/app-context';
import Layout from './components/Layout';
import StockPage from './pages/inventory/StockPage';
import TransfersPage from './pages/inventory/TransfersPage';
import PlansPage from './pages/planning/PlansPage';
import NewPlanPage from './pages/planning/NewPlanPage';
import PlanDetailPage from './pages/planning/PlanDetailPage';
import BatchesPage from './pages/manufacturing/BatchesPage';
import BatchEntryPage from './pages/manufacturing/BatchEntryPage';
import BatchDetailPage from './pages/manufacturing/BatchDetailPage';
import MaterialsPage from './pages/masters/MaterialsPage';
import MpnsPage from './pages/masters/MpnsPage';
import VendorsPage from './pages/masters/VendorsPage';
import VendorFormPage from './pages/masters/VendorFormPage';
import VendorViewPage from './pages/masters/VendorViewPage';
import MpnBulkCreatePage from './pages/masters/MpnBulkCreatePage';
import CategoriesPage from './pages/CategoriesPage';
import UomsPage from './pages/UomsPage';
import ProductsPage from './pages/masters/ProductsPage';
import BomsPage from './pages/masters/BomsPage';
import BomEditPage from './pages/masters/BomEditPage';
import BomDetailPage from './pages/masters/BomDetailPage';
import LocationsPage from './pages/masters/LocationsPage';
import StockBalancePage from './pages/reports/StockBalancePage';
import StockCountsPage from './pages/inventory/StockCountsPage';
import StockCountPage from './pages/inventory/StockCountPage';
import TransactionsPage from './pages/reports/TransactionsPage';
import TraceabilityPage from './pages/reports/TraceabilityPage';
import SettingsPage from './pages/SettingsPage';

function Gate({ children }) {
  const { user, error, reload } = useApp();
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
        <div className="font-semibold">Cannot reach the ERP server</div>
        <div className="text-ink-muted max-w-md">{error}</div>
        <button type="button" className="btn-primary" onClick={reload}>Retry</button>
      </div>
    );
  }
  if (!user) return <div className="p-6 text-ink-muted">Loading...</div>;
  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Gate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/inventory/stock" replace />} />
              <Route path="inventory/stock" element={<StockPage />} />
              <Route path="inventory/transfers" element={<TransfersPage />} />
              <Route path="planning/plans" element={<PlansPage />} />
              <Route path="planning/new" element={<NewPlanPage />} />
              <Route path="planning/plans/:id" element={<PlanDetailPage />} />
              <Route path="manufacturing/batches" element={<BatchesPage />} />
              <Route path="manufacturing/new" element={<BatchEntryPage />} />
              <Route path="manufacturing/batches/:id" element={<BatchDetailPage />} />
              <Route path="masters/materials" element={<MaterialsPage />} />
              <Route path="masters/products" element={<ProductsPage />} />
              <Route path="masters/mpns" element={<MpnsPage />} />
              <Route path="masters/mpns/bulk-create" element={<MpnBulkCreatePage />} />
              <Route path="masters/vendors" element={<VendorsPage />} />
              <Route path="masters/vendors/new" element={<VendorFormPage />} />
              <Route path="masters/vendors/:id" element={<VendorViewPage />} />
              <Route path="masters/vendors/:id/edit" element={<VendorFormPage />} />
              <Route path="masters/boms" element={<BomsPage />} />
              <Route path="masters/boms/new" element={<BomEditPage />} />
              <Route path="masters/boms/:id" element={<BomDetailPage />} />
              <Route path="masters/boms/:id/edit" element={<BomEditPage />} />
              <Route path="settings/locations" element={<LocationsPage />} />
              <Route path="masters/locations" element={<Navigate to="/settings/locations" replace />} />
              <Route path="reports/stock-balance" element={<StockBalancePage />} />
              <Route path="inventory/stock-counts" element={<StockCountsPage />} />
              <Route path="inventory/stock-counts/:id" element={<StockCountPage />} />
              <Route path="reports/physical-sheet" element={<Navigate to="/inventory/stock-counts" replace />} />
              <Route path="reports/transactions" element={<TransactionsPage />} />
              <Route path="reports/traceability" element={<TraceabilityPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/categories" element={<CategoriesPage />} />
              <Route path="settings/uoms" element={<UomsPage />} />
              <Route path="*" element={<div className="p-6 text-ink-muted">Page not found</div>} />
            </Route>
          </Routes>
        </Gate>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
