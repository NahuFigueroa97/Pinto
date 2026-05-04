'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BusinessTransaction } from '@/types/database';

type Period = 'day' | 'week' | 'month';

function periodStart(p: Period): string {
  const now = new Date();
  if (p === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (p === 'week') { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(); }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function FinanzasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>('week');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expForm, setExpForm] = useState({ amount: '', description: '', category: 'insumos' });

  const { data: business } = useQuery({
    queryKey: ['business_me_fin', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('businesses').select('id, name').eq('owner_user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: transactions } = useQuery({
    queryKey: ['biz_transactions', business?.id, period],
    queryFn: async () => {
      if (!business) return [];
      const { data } = await supabase.from('business_transactions').select('*')
        .eq('business_id', business.id).gte('transaction_date', periodStart(period))
        .order('transaction_date', { ascending: false });
      return (data ?? []) as BusinessTransaction[];
    },
    enabled: !!business,
    retry: false,
  });

  const addExpense = useMutation({
    mutationFn: async () => {
      if (!business || !expForm.amount) return;
      await supabase.from('business_transactions').insert({
        business_id: business.id, type: 'expense',
        amount: parseFloat(expForm.amount),
        description: expForm.description || '📦 Gasto general',
        category: expForm.category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biz_transactions'] });
      setShowAddExpense(false);
      setExpForm({ amount: '', description: '', category: 'insumos' });
    },
  });

  if (!business) return <div className="flex justify-center pt-20"><div className="spinner" /></div>;

  const income = transactions?.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const expense = transactions?.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const balance = income - expense;

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-accent-400 outline-none";

  return (
    <div className="max-w-lg mx-auto pb-20">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-display font-bold">💰 Finanzas</h1>
        <p className="text-sm text-gray-400">Controlá tu flujo de plata</p>
      </header>

      <div className="px-4">
        {/* Period Selector */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
          {(['day', 'week', 'month'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 py-2 text-xs font-black rounded-lg transition
                ${period === p ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-400'}`}>
              {p === 'day' ? '📅 Hoy' : p === 'week' ? '📆 Semana' : '🗓️ Mes'}
            </button>
          ))}
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-gradient-to-br from-green-50 to-emerald-100/50 rounded-2xl p-3 border border-green-100">
            <p className="text-[0.55rem] text-green-600 font-black uppercase mb-0.5">📈 Ingresos</p>
            <p className="text-base font-black text-green-700">${income.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-rose-100/50 rounded-2xl p-3 border border-red-100">
            <p className="text-[0.55rem] text-red-500 font-black uppercase mb-0.5">📉 Gastos</p>
            <p className="text-base font-black text-red-600">${expense.toLocaleString('es-AR')}</p>
          </div>
          <div className={`rounded-2xl p-3 border ${balance >= 0 ? 'bg-gradient-to-br from-blue-50 to-indigo-100/50 border-blue-100' : 'bg-gradient-to-br from-orange-50 to-amber-100/50 border-orange-100'}`}>
            <p className="text-[0.55rem] font-black uppercase mb-0.5" style={{ color: balance >= 0 ? '#2563eb' : '#ea580c' }}>
              {balance >= 0 ? '🚀' : '⚠️'} Balance
            </p>
            <p className="text-base font-black" style={{ color: balance >= 0 ? '#1d4ed8' : '#c2410c' }}>
              ${Math.abs(balance).toLocaleString('es-AR')}
            </p>
          </div>
        </div>

        {/* Add Expense */}
        <button onClick={() => setShowAddExpense(!showAddExpense)}
          className="w-full flex items-center justify-center gap-2 py-2.5 mb-3 bg-white border-2 border-dashed border-gray-200 text-gray-500 font-bold rounded-xl text-sm hover:border-red-300 hover:text-red-400 transition">
          📝 Registrar gasto
        </button>

        {showAddExpense && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4 mb-4 space-y-3">
            <input type="number" placeholder="💲 Monto" value={expForm.amount}
              onChange={e => setExpForm({ ...expForm, amount: e.target.value })} className={inputClass} />
            <input type="text" placeholder="📋 ¿En qué gastaste?" value={expForm.description}
              onChange={e => setExpForm({ ...expForm, description: e.target.value })} className={inputClass} />
            <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })} className={inputClass}>
              <option value="insumos">📦 Insumos</option>
              <option value="alquiler">🏠 Alquiler</option>
              <option value="sueldos">👥 Sueldos</option>
              <option value="servicios">💡 Servicios</option>
              <option value="marketing">📣 Marketing</option>
              <option value="general">🔧 General</option>
            </select>
            <button onClick={() => addExpense.mutate()} disabled={!expForm.amount || addExpense.isPending}
              className="w-full py-3 bg-red-500 text-white font-bold rounded-xl disabled:opacity-40 shadow-md transition active:scale-[0.98]">
              {addExpense.isPending ? '⏳ Guardando...' : '💸 Registrar gasto'}
            </button>
          </div>
        )}

        {/* Transactions */}
        <div className="space-y-2">
          <p className="text-[0.6rem] font-black text-gray-300 uppercase tracking-widest">
            {period === 'day' ? 'Movimientos de hoy' : period === 'week' ? 'Movimientos de la semana' : 'Movimientos del mes'}
          </p>
          {!transactions?.length ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-2">🤷</p>
              <p className="text-sm text-gray-300">Sin movimientos</p>
              <p className="text-xs text-gray-300 mt-1">Los ingresos se registran automáticamente al aprobar reservas ✅</p>
            </div>
          ) : (
            transactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-50">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${tx.type === 'income' ? 'bg-green-50' : 'bg-red-50'}`}>
                  {tx.type === 'income' ? '💰' : '💸'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{tx.description}</p>
                  <p className="text-[0.55rem] text-gray-400 font-medium">{tx.category} · {new Date(tx.transaction_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <p className={`text-sm font-black ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {tx.type === 'income' ? '+' : '-'}${Number(tx.amount).toLocaleString('es-AR')}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
