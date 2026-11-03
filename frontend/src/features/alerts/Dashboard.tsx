import { useQuery } from '@tanstack/react-query';
import { api } from '../shared/api/client';
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  product?: { id: string; name: string; code: string; stock: number; minStock: number };
  batch?: { id: string; batchNumber: string; expiryDate: string };
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
}

interface Summary {
  byType: { type: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  unreadCount: number;
}

export function Dashboard() {
  const { data: alerts, isLoading } = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<{items: Alert[]}>('/alerts').then(r => r.data.items) });
  const { data: summary } = useQuery({ queryKey: ['alerts-summary'], queryFn: () => api.get<Summary>('/alerts/summary').then(r => r.data) });

  useEffect(() => {
    const socket = io(import.meta.env.VITE_WS_URL || 'ws://localhost:3001', { auth: { token: localStorage.getItem('auth-storage')?.split('"token":"')[1]?.split('"')[0] } });
    socket.on('alert:new', (alert: Alert) => { console.log('New alert:', alert); });
    socket.on('alert:resolved', () => { console.log('Alert resolved'); });
    return () => socket.disconnect();
  }, []);

  const severityColor = (s: string) => s === 'CRITICAL' ? 'bg-red-100 text-red-700 border-red-200' : s === 'WARNING' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-blue-100 text-blue-700 border-blue-200';
  const typeIcon = (t: string) => t === 'STOCK_CRITICO' ? '🔴' : t === 'BAJO_STOCK' ? '🟡' : t === 'VENCIDO' ? '💀' : t === 'PROXIMO_VENCER' ? '⏰' : '📦';

  if (isLoading) return <div className="flex items-center justify-center h-64">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertas de Stock</h1>
          <p className="text-gray-500">Monitoreo en tiempo real</p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">{summary?.bySeverity.find(s => s.severity === 'CRITICAL')?.count || 0} Críticas</span>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">{summary?.bySeverity.find(s => s.severity === 'WARNING')?.count || 0} Advertencias</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['CRITICAL', 'WARNING', 'INFO'].map(sev => (
          <div key={sev} className={`p-4 rounded-xl border ${severityColor(sev)}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{sev === 'CRITICAL' ? '🔴 Críticas' : sev === 'WARNING' ? '🟡 Advertencias' : '🔵 Info'}</span>
              <span className="text-2xl font-bold">{summary?.bySeverity.find(s => s.severity === sev)?.count || 0}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold">Alertas Activas</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {alerts?.filter(a => !a.isResolved).map(alert => (
            <div key={alert.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-4">
                <span className="text-2xl">{typeIcon(alert.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{alert.title}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${severityColor(alert.severity)}`}>{alert.severity}</span>
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{alert.type}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{alert.message}</p>
                  {alert.product && (
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                      <span>📦 {alert.product.name}</span>
                      <span>Stock: <span className="font-medium">{alert.product.stock}</span> / Mín: {alert.product.minStock}</span>
                    </div>
                  )}
                  {alert.batch && (
                    <div className="mt-1 text-sm text-gray-600">
                      Lote: {alert.batch.batchNumber} · Vence: {new Date(alert.batch.expiryDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-100">Resolver</button>
                </div>
              </div>
            </div>
          ))}
          {!alerts?.length && <div className="p-8 text-center text-gray-400">🎉 Sin alertas activas</div>}
        </div>
      </div>
    </div>
  );
}