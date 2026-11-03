import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../shared/api/client';
import { useAuthStore } from '../auth/store';

interface Product { id: string; code: string; barcode: string | null; name: string; salePrice: number; stock: number; batchTracked: boolean; taxRate: number; }
interface CartItem { product: Product; quantity: number; batchId?: string; discount: number; }
interface Batch { id: string; batchNumber: string; remainingQty: number; expiryDate: string; }

export function Pos() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const scannerRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scannerValue, setScannerValue] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO'|'TARJETA_DEBITO'|'TARJETA_CREDITO'|'MIXTO'|'YAPE_PLIN'>('EFECTIVO');
  const [cashReceived, setCashReceived] = useState('');
  const [customerDni, setCustomerDni] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<{ productId: string; batches: Batch[] } | null>(null);

  const focusScanner = () => scannerRef.current?.focus();

  useEffect(() => { focusScanner(); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Enter') focusScanner();
      else if (e.key >= '0' && e.key <= '9') { e.preventDefault(); setScannerValue(v => v + e.key); focusScanner(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleScannerInput = async (e: React.FormEvent<HTMLInputElement>) => {
    e.preventDefault();
    const barcode = scannerValue.trim();
    if (!barcode) return;
    setScannerValue('');

    try {
      const { data: product } = await api.get<Product>(`/products/by-barcode/${barcode}`);
      if (product.batchTracked) {
        const { data: batches } = await api.get<Batch[]>(`/products/${product.id}/available-batches`);
        if (batches.length) setSelectedBatch({ productId: product.id, batches });
        else alert('Sin stock en lotes');
      } else {
        addToCart(product);
      }
    } catch {
      alert('Producto no encontrado');
    }
    focusScanner();
  };

  const addToCart = (product: Product, batchId?: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.batchId === batchId);
      if (existing) return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, batchId, discount: 0 }];
    });
  };

  const updateQty = (index: number, delta: number) => {
    setCart(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
  };

  const removeItem = (index: number) => setCart(prev => prev.filter((_, i) => i !== index));

  const subtotal = cart.reduce((s, i) => s + i.product.salePrice * i.quantity * (1 - i.discount / 100), 0);
  const tax = cart.reduce((s, i) => s + (i.product.salePrice * i.quantity * (1 - i.discount / 100)) * (i.product.taxRate / 100), 0);
  const total = subtotal + tax;
  const change = paymentMethod === 'EFECTIVO' || paymentMethod === 'MIXTO' ? Math.max(0, parseFloat(cashReceived) - total) : 0;

  const createSale = useMutation({
    mutationFn: async () => {
      const items = cart.map(i => ({
        productId: i.product.id,
        batchId: i.batchId,
        quantity: i.quantity,
        unitPrice: i.product.salePrice,
        discount: i.discount,
        taxRate: i.product.taxRate
      }));
      const { data } = await api.post('/sales', { items, paymentMethod, paymentDetails: { efectivo: parseFloat(cashReceived) || 0 }, customerDni: customerDni || undefined });
      return data;
    },
    onSuccess: () => {
      setCart([]); setShowPayment(false); setCashReceived(''); setCustomerDni(''); setPaymentMethod('EFECTIVO');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      alert('Venta completada');
      focusScanner();
    },
    onError: (e: any) => alert(e.response?.data?.message || 'Error al procesar venta')
  });

  const handlePay = () => {
    if (cart.length === 0) return;
    if ((paymentMethod === 'EFECTIVO' || paymentMethod === 'MIXTO') && parseFloat(cashReceived) < total) return alert('Monto insuficiente');
    createSale.mutate();
  };

  if (selectedBatch) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl p-6 w-full max-w-md">
          <h2 className="text-lg font-semibold mb-4">Seleccionar lote (FEFO)</h2>
          <ul className="space-y-2 max-h-60 overflow-auto">
            {selectedBatch.batches.map(b => (
              <li key={b.id} onClick={() => { addToCart(cart.find(i => i.product.id === selectedBatch.productId)?.product!, b.id); setSelectedBatch(null); }} className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer flex justify-between">
                <div>
                  <p className="font-medium">Lote: {b.batchNumber}</p>
                  <p className="text-sm text-gray-500">Stock: {b.remainingQty} | Vence: {new Date(b.expiryDate).toLocaleDateString()}</p>
                </div>
              </li>
            ))}
          </ul>
          <button onClick={() => setSelectedBatch(null)} className="mt-4 w-full py-2 border rounded-lg">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 min-w-0">
        <div className="mb-4">
          <label className="sr-only">Escáner</label>
          <form onSubmit={handleScannerInput} className="relative">
            <input
              ref={scannerRef}
              value={scannerValue}
              onChange={e => setScannerValue(e.target.value)}
              className="w-full px-4 py-3 text-2xl border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Escanee código de barras o escriba código..."
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <span className="text-6xl mb-4">🛒</span>
            <p className="text-lg">Escanee productos para iniciar venta</p>
            <p className="text-sm">Enter para enfocar escáner</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-auto max-h-[calc(100vh-280px)]">
            {cart.map((item, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.product.name}</p>
                  <p className="text-sm text-gray-500">{item.product.code} · S/ {item.product.salePrice.toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => updateQty(i, -1)} className="w-8 h-8 rounded border flex items-center justify-center hover:bg-gray-100">−</button>
                    <span className="w-12 text-center font-medium">{item.quantity}</span>
                    <button onClick={() => updateQty(i, 1)} className="w-8 h-8 rounded border flex items-center justify-center hover:bg-gray-100">+</button>
                    <span className="ml-2 text-sm text-gray-500">Desc: {item.discount}%</span>
                    <button onClick={() => removeItem(i)} className="ml-auto text-red-500 hover:text-red-700">🗑️</button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">S/ {(item.product.salePrice * item.quantity * (1 - item.discount / 100)).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="w-80 md:w-96 flex flex-col bg-white border border-gray-200 rounded-xl p-4 sticky top-4 h-fit">
        <h3 className="font-semibold text-lg mb-4 flex items-center justify-between">
          Resumen
          <span className="text-sm text-gray-500">{cart.length} items</span>
        </h3>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between"><span>Subtotal</span><span>S/ {subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>IGV</span><span>S/ {tax.toFixed(2)}</span></div>
          <div className="flex justify-between text-lg font-semibold border-t pt-2"><span>TOTAL</span><span>S/ {total.toFixed(2)}</span></div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">DNI Cliente (opcional)</label>
          <input value={customerDni} onChange={e => setCustomerDni(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" placeholder="12345678" maxLength={8} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Método de pago</label>
          <div className="grid grid-cols-2 gap-2">
            {(['EFECTIVO','TARJETA_DEBITO','TARJETA_CREDITO','YAPE_PLIN'] as const).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)} className={`py-2 rounded-lg font-medium text-sm transition-colors ${paymentMethod === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {m.replace('_', ' ')}
              </button>
            ))}
            <button onClick={() => setPaymentMethod('MIXTO')} className={`col-span-2 py-2 rounded-lg font-medium text-sm transition-colors ${paymentMethod === 'MIXTO' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              Mixto
            </button>
          </div>
        </div>

        {(paymentMethod === 'EFECTIVO' || paymentMethod === 'MIXTO') && (
          <div className="mb-4 space-y-2">
            <div>
              <label className="block text-sm font-medium mb-1">Efectivo recibido</label>
              <input value={cashReceived} onChange={e => setCashReceived(e.target.value)} type="number" step="0.1" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-lg" />
            </div>
            <div className="flex justify-between text-lg font-semibold text-green-600">
              <span>Vuelto</span>
              <span>S/ {change.toFixed(2)}</span>
            </div>
          </div>
        )}

        <button onClick={handlePay} disabled={cart.length === 0 || createSale.isPending || (paymentMethod === 'EFECTIVO' && parseFloat(cashReceived) < total)} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {createSale.isPending ? 'Procesando...' : `Cobrar S/ ${total.toFixed(2)}`}
        </button>

        <p className="text-xs text-center text-gray-400 mt-3">Usuario: {user?.fullName} ({user?.role})</p>
      </aside>
    </div>
  );
}