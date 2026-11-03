import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../shared/api/client';
import { useAuthStore } from '../auth/store';

interface User { id: string; email: string; fullName: string; role: string; isActive: boolean; createdAt: string; }
interface Setting { key: string; value: any; category: string; description?: string; }

export function Settings() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'perfil' | 'usuarios' | 'sistema'>('perfil');
  const [newPassword, setNewPassword] = useState({ current: '', new: '', confirm: '' });
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get<{items: User[]}>('/users').then(r => r.data.items), enabled: user?.role === 'ADMIN' });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Setting[]>('/settings').then(r => r.data), enabled: user?.role === 'ADMIN' });

  const changePassword = useMutation({ mutationFn: (data: { currentPassword: string; newPassword: string }) => api.patch('/users/me/password', data), onSuccess: () => { setNewPassword({ current: '', new: '', confirm: '' }); alert('Contraseña actualizada'); }});

  const saveUser = useMutation({ mutationFn: ({id, data}: {id: string, data: Partial<User>}) => api.patch(`/users/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setShowUserForm(false); setEditingUser(null); }});

  const tabs = [
    { id: 'perfil', label: 'Mi Perfil', icon: '👤' },
    ...(user?.role === 'ADMIN' ? [{ id: 'usuarios', label: 'Usuarios', icon: '👥' }, { id: 'sistema', label: 'Sistema', icon: '⚙️' }] : [])
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-gray-500">Preferencias y administración</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'perfil' && (
            <div className="max-w-2xl space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">{user?.fullName?.[0]?.toUpperCase()}</div>
                <div>
                  <h3 className="text-lg font-semibold">{user?.fullName}</h3>
                  <p className="text-gray-500">{user?.email}</p>
                  <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full capitalize">{user?.role?.toLowerCase()}</span>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium mb-4">Cambiar contraseña</h4>
                <form onSubmit={e => { e.preventDefault(); if(newPassword.new !== newPassword.confirm) return alert('No coinciden'); changePassword.mutate({ currentPassword: newPassword.current, newPassword: newPassword.new }); }} className="space-y-4 max-w-md">
                  <div><label className="block text-sm mb-1">Actual</label><input type="password" value={newPassword.current} onChange={e => setNewPassword(p => ({...p, current: e.target.value}))} className="w-full px-3 py-2 border rounded-lg" required /></div>
                  <div><label className="block text-sm mb-1">Nueva</label><input type="password" value={newPassword.new} onChange={e => setNewPassword(p => ({...p, new: e.target.value}))} className="w-full px-3 py-2 border rounded-lg" required minLength={6} /></div>
                  <div><label className="block text-sm mb-1">Confirmar</label><input type="password" value={newPassword.confirm} onChange={e => setNewPassword(p => ({...p, confirm: e.target.value}))} className="w-full px-3 py-2 border rounded-lg" required /></div>
                  <button type="submit" disabled={changePassword.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{changePassword.isPending ? 'Guardando...' : 'Actualizar'}</button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'usuarios' && user?.role === 'ADMIN' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Gestión de Usuarios</h3>
                <button onClick={() => { setEditingUser(null); setShowUserForm(true); }} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg">+ Usuario</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-sm">Nombre</th><th className="px-4 py-3 text-left text-sm">Email</th><th className="px-4 py-3 text-left text-sm">Rol</th><th className="px-4 py-3 text-left text-sm">Estado</th><th className="px-4 py-3 text-left text-sm">Creado</th><th className="px-4 py-3">Acciones</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {users?.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{u.fullName}</td>
                        <td className="px-4 py-3">{u.email}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full capitalize">{u.role.toLowerCase()}</span></td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.isActive ? 'Activo' : 'Inactivo'}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><button onClick={() => { setEditingUser(u); setShowUserForm(true); }} className="text-blue-600 hover:underline text-sm">Editar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showUserForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl p-6 w-full max-w-md">
                    <h3 className="text-lg font-semibold mb-4">{editingUser ? 'Editar' : 'Nuevo'} Usuario</h3>
                    <form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form).entries()); saveUser.mutate({ id: editingUser?.id || '', data: { ...data, isActive: data.isActive === 'on' }}); }} className="space-y-4">
                      <input name="fullName" placeholder="Nombre completo" className="w-full px-3 py-2 border rounded-lg" required defaultValue={editingUser?.fullName} />
                      <input name="email" type="email" placeholder="Email" className="w-full px-3 py-2 border rounded-lg" required defaultValue={editingUser?.email} disabled={!!editingUser} />
                      {!editingUser && <input name="password" type="password" placeholder="Contraseña (mín 6)" className="w-full px-3 py-2 border rounded-lg" required minLength={6} />}
                      <select name="role" className="w-full px-3 py-2 border rounded-lg" defaultValue={editingUser?.role || 'VENDEDOR'}><option value="VENDEDOR">Vendedor</option><option value="CAJERO">Cajero</option><option value="FARMACÉUTICO">Farmacéutico</option><option value="ADMIN">Admin</option></select>
                      <label className="flex items-center gap-2"><input name="isActive" type="checkbox" defaultChecked={editingUser?.isActive !== false} /> Activo</label>
                      <div className="flex gap-2 pt-2">
                        <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">Guardar</button>
                        <button type="button" onClick={() => { setShowUserForm(false); setEditingUser(null); }} className="flex-1 px-4 py-2 border rounded-lg">Cancelar</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sistema' && user?.role === 'ADMIN' && (
            <div>
              <h3 className="font-semibold mb-4">Configuración del Sistema</h3>
              <div className="space-y-4">
                {settings?.map(s => (
                  <div key={s.key} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{s.key}</p>
                        <p className="text-sm text-gray-500">{s.description}</p>
                      </div>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{s.category}</span>
                    </div>
                    <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto">{JSON.stringify(s.value, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}