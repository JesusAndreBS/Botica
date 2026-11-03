import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../shared/api/client';

interface Product { id: string; code: string; barcode: string | null; name: string; salePrice: number; stock: number; minStock: number; status: string; category?: { name: string }; supplier?: { name: string }; }

export function Products() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['products', search], queryFn: () => api.get<{items: Product[]}>('/products', { params: { search } }).then(r => r.data.items) });

  const createMutation = useMutation({ mutationFn: (data: Partial<Product>) => api.post('/products', data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); }});
  const updateMutation = useMutation({ mutationFn: ({id, data}: {id: string, data: Partial<Product>}) => api.patch(`/products/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setEditing(null); }});
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/products/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }) });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = { ...data, salePrice: Number(data.salePrice), purchasePrice: Number(data.purchasePrice), minStock: Number(data.minStock), taxRate: Number(data.taxRate), batchTracked: data.batchTracked === 'on', requiresRecipe: data.requiresRecipe === 'on' };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
    form.reset();
  };

  const columns = [
    { key: 'code', label: 'Código' },
    { key: 'name', label: 'Producto' },
    { key: 'category?.name', label: 'Categoría' },
    { key: 'salePrice', label: 'P. Venta', render: (v: number) => `S/ ${v.toFixed(2)}` },
    { key: 'stock', label: 'Stock', render: (v: number, row: Product) => <span className={v <= row.minStock ? 'text-red-600 font-bold' : ''}>{v}</span> },
    { key: 'minStock', label: 'Mín' },
    { key: 'status', label: 'Estado' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-gray-500">Gestión de catálogo e inventario</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Nuevo</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, código o barra..." className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {showForm && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="code" placeholder="Código interno" className="px-3 py-2 border rounded-lg" required />
              <input name="barcode" placeholder="Código de barras" className="px-3 py-2 border rounded-lg" />
              <input name="name" placeholder="Nombre" className="md:col-span-2 px-3 py-2 border rounded-lg" required />
              <input name="salePrice" type="number" step="0.01" placeholder="Precio venta" className="px-3 py-2 border rounded-lg" required />
              <input name="purchasePrice" type="number" step="0.01" placeholder="Precio compra" className="px-3 py-2 border rounded-lg" required />
              <input name="minStock" type="number" placeholder="Stock mínimo" className="px-3 py-2 border rounded-lg" defaultValue="10" />
              <input name="taxRate" type="number" step="0.01" placeholder="IGV %" className="px-3 py-2 border rounded-lg" defaultValue="18" />
              <label className="flex items-center gap-2"><input name="batchTracked" type="checkbox" defaultChecked /> Controla lotes/fecha vencimiento</label>
              <label className="flex items-center gap-2"><input name="requiresRecipe" type="checkbox" /> Requiere receta</label>
              <div className="md:col-span-2 flex gap-2">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Guardar</button>
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 border rounded-lg">Cancelar</button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>{columns.map(c => <th key={c.key} className="px-4 py-3 text-left text-sm font-medium text-gray-500">{c.label}</th>)}<th className="px-4 py-3">Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{p.code}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.category?.name || '-'}</td>
                  <td className="px-4 py-3">S/ {p.salePrice.toFixed(2)}</td>
                  <td className="px-4 py-3"><span className={p.stock <= p.minStock ? 'text-red-600 font-bold' : ''}>{p.stock}</span></td>
                  <td className="px-4 py-3">{p.minStock}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full ${p.status === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{p.status}</span></td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setEditing(p); setShowForm(true); }} className="text-blue-600 hover:underline text-sm mr-2">Editar</button>
                    <button onClick={() => { if(confirm('Desactivar?')) deleteMutation.mutate(p.id); }} className="text-red-600 hover:underline text-sm">Desactivar</button>
                  </td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-400">Sin productos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}