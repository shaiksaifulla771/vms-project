import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Analytics } from "./pages/Analytics";
import { Login } from "./pages/Login";
import { MpnMapping } from "./pages/MpnMapping";
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
          <Route path="/analytics" element={<Analytics />} />
        </Route>
        <Route path="*" element={<Navigate to="/vendors" replace />} />
      </Routes>
    </AuthProvider>
  );
}
