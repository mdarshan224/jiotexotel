'use client';
import { useState } from 'react';
import { invalidateCachedClientJson } from '@/lib/clientRequestCache';
export default function CustomerAccountSettings({ user, onSaved }: { user: { name?: string | null; email?: string | null; phone: string }; onSaved: () => void }) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <details className="mobile-account-settings customer-surface p-4 md:hidden">
    <summary className="min-h-11 cursor-pointer text-sm font-bold text-slate-800">Account details</summary>
    <form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
      try {
        const response = await fetch('/api/customer/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email }) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error?.message || 'Could not save your details.');
        invalidateCachedClientJson('authenticated-user');
        window.dispatchEvent(new Event('jio_auth_change'));
        setMessage('Your details have been saved.');
        onSaved();
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.'); }
      finally { setBusy(false); }
    }}>
      <label className="block text-xs font-semibold text-slate-600">Name<input name="name" required maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label>
      <label className="block text-xs font-semibold text-slate-600">Email (optional)<input type="email" name="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label>
      <p className="text-xs text-slate-500">Verified mobile: {user.phone}</p>
      <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save details'}</button>
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
    </form>
  </details>;
}
