import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Analytics } from "./pages/Analytics";
import { BatchDetail } from "./pages/BatchDetail";
import { Batches } from "./pages/Batches";
import { Inventory } from "./pages/Inventory";
import { Locations } from "./pages/Locations";
import { Login } from "./pages/Login";
import { MpnMapping } from "./pages/MpnMapping";
import { PlanDetail } from "./pages/PlanDetail";
import { Planning } from "./pages/Planning";
import { Pricing } from "./pages/Pricing";
import { PurchaseOrderDetail } from "./pages/PurchaseOrderDetail";
import { PurchaseOrders } from "./pages/PurchaseOrders";
import { PurchaseRequestDetail } from "./pages/PurchaseRequestDetail";
import { PurchaseRequests } from "./pages/PurchaseRequests";
import { VendorDetail } from "./pages/VendorDetail";
import { Vendors } from "./pages/Vendors";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/vendors" replace />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/:id" element={<VendorDetail />} />
          <Route path="/mpn" element={<MpnMapping />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/purchase-requests" element={<PurchaseRequests />} />
          <Route path="/purchase-requests/:id" element={<PurchaseRequestDetail />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/planning/:id" element={<PlanDetail />} />
          <Route path="/batches" element={<Batches />} />
          <Route path="/batches/:id" element={<BatchDetail />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
        <Route path="*" element={<Navigate to="/vendors" replace />} />
      </Routes>
    </AuthProvider>
  );
}
