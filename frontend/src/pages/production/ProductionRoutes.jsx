import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProductionDashboard from './ProductionDashboard';
import ProductionOrderList from './ProductionOrderList';
import ProductionOrderNew from './ProductionOrderNew';
import ProductionOrderWorkflow from './ProductionOrderWorkflow';

export default function ProductionRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="list" />} />
      <Route path="dashboard" element={<ProductionDashboard />} />
      <Route path="list" element={<ProductionOrderList />} />
      <Route path="new" element={<ProductionOrderNew />} />
      <Route path=":id" element={<ProductionOrderWorkflow />} />
    </Routes>
  );
}
