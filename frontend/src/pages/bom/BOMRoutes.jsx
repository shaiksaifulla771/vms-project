import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

import BomList from './BomList';
import BomNew from './BomNew';
import BomDetail from './BomDetail';
import BomEdit from './BomEdit';
import BomScale from './BomScale';
import BomDuplicate from './BomDuplicate';
import BomCostBreakdown from './BomCostBreakdown';
import BomHistory from './BomHistory';
import BomClones from './BomClones';

export default function BOMRoutes() {
  const location = useLocation();

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<BomList />} />
          <Route path="/clones" element={<BomClones />} />
          <Route path="/new" element={<BomNew />} />
          <Route path="/:id" element={<BomDetail />} />
          <Route path="/:id/edit" element={<BomEdit />} />
          <Route path="/:id/scale" element={<BomScale />} />
          <Route path="/:id/duplicate" element={<BomDuplicate />} />
          <Route path="/:id/clones" element={<BomClones />} />
          <Route path="/:id/cost-breakdown" element={<BomCostBreakdown />} />
          <Route path="/:id/history" element={<BomHistory />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}
