import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './features/auth/store';
import { Login } from './features/auth/Login';
import { Layout } from './app/Layout';
import { Pos } from './features/pos/Pos';
import { Dashboard } from './features/alerts/Dashboard';
import { Products } from './features/inventory/Products';
import { Sales } from './features/sales/Sales';
import { Settings } from './features/settings/Settings';

export function App() {
  const { token, hydrate } = useAuthStore();
  
  React.useEffect(() => { hydrate(); }, [hydrate]);

  const PrivateRoute = ({ children }: { children: React.ReactNode }) => 
    token ? <>{children}</> : <Navigate to="/login" />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/alertas" element={<Dashboard />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/ventas" element={<Sales />} />
        <Route path="/configuracion" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/pos" />} />
    </Routes>
  );
}

import React from 'react';