import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If specific roles are required and user doesn't have one of them
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-slate-800">
        <h1 className="text-4xl font-bold mb-4">403 - Forbidden</h1>
        <p className="text-lg mb-6">You do not have permission to view this page.</p>
        <button 
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
