import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../shared/api/client';
import { format } from 'date-fns';

interface Sale { id: string; saleNumber: string; total: number; paymentMethod: string; status: string; createdAt: string; cashier?: { fullName: string }; items: { quantity: number; product: { name: string }; unitPrice: number }[]; }

export function Sales() {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const { data, isLoading } = useQuery({ queryKey: ['sales', date], queryFn: () => api.get<{items: Sale[]}>('/sales/report/daily', { params: { date } }).then(r => r.data) });

  if (isLoading) return <div className="flex items-center justify-center h-64">Cargando...</div>;

  const summary = data?.summary || { totalSales: 0, totalAmount: 0, byPayment: {} };
  const sales = data?.sales || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ventas del Día</h1>
          <p className="text-gray-500">Reporte y cierre de caja</p>
        </div>
        <div className="flex items-center gap-4">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">Ventas</p>
          <p className="text-3xl font-bold">{summary.totalSales}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">Total</p>
          <p className="text-3xl font-bold text-green-600">S/ {summary.totalAmount.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">Efectivo</p>
          <p className="text-3xl font-bold">S/ {(summary.byPayment.EFECTIVO || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">Digital</p>
          <p className="text-3xl font-bold">S/ {(summary.byPayment.YAPE_PLIN || 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 font-semibold">Detalle de Ventas</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-sm font-medium text-gray-500">N°</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Hora</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Cajero</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Método</th><th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Total</th><th className="px-4 py-3">Items</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {sales.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{s.saleNumber}</td>
                  <td className="px-4 py-3 text-sm">{format(new Date(s.createdAt), 'HH:mm:ss')}</td>
                  <td className="px-4 py-3 text-sm">{s.cashier?.fullName}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">{s.paymentMethod}</span></td>
                  <td className="px-4 py-3 text-right font-medium">S/ {Number(s.total).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.items.slice(0, 3).map((item, i) => <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 rounded">{item.quantity}x {item.product.name}</span>)}
                      {s.items.length > 3 && <span className="px-2 py-0.5 text-xs text-gray-500">+{s.items.length - 3} más</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!sales.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin ventas en esta fecha</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}