 'use client';
import { useEffect, useState } from 'react';

export default function AccountDeletionPanel({ dueAt, onChange }: { dueAt?: string | null; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!dueAt) return; const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, [dueAt]);
  const remaining = dueAt ? Math.max(0, new Date(dueAt).getTime() - now) : 0;
  async function update(action: 'request' | 'recover') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/customer/account-deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, confirmation }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || 'Please try again.');
      setConfirmation(''); setConfirming(false); setMessage(data.data.message);
      window.dispatchEvent(new Event('jio_auth_change'));
      onChange();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="account-deletion-section rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    {!dueAt && <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold text-slate-500"><span>Delete account</span><span aria-hidden="true">{expanded ? '−' : '›'}</span></button>}
    {(dueAt || expanded) && <>
    <h2 className="text-base font-bold text-slate-900">{dueAt ? 'Account scheduled for deletion' : 'Delete my account'}</h2>
    {dueAt ? <>
      <p className="text-sm text-slate-700">Your account is paused. Recover it before <strong>{new Date(dueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST</strong> to keep your data.</p>
      <p className="font-semibold text-rose-700">{remaining > 0 ? `${Math.floor(remaining / 3600000)}h ${Math.floor(remaining / 60000) % 60}m remaining` : 'Recovery window ended. Permanent deletion is in progress.'}</p>
      <button disabled={busy || remaining <= 0} onClick={() => update('recover')} className="w-full rounded-2xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Please wait…' : 'Recover my account'}</button>
    </> : <>
      <p className="text-sm text-slate-600">Request deletion of your profile, addresses, pickup history, photos, wallet and subscription records. Your account will be paused immediately.</p>
      <p className="text-sm text-slate-600">You have <strong>48 hours</strong> to change your mind. Log in with the same number and choose “Recover my account”. After that, deletion is permanent and your number cannot sign up again for <strong>30 days after deletion</strong>.</p>
      <p className="text-sm text-slate-500">Please resolve any active pickups, refunds or remaining wallet balance with support before proceeding. Deleting your account does not issue a refund.</p>
      {confirming ? <div className="space-y-3">
        <label htmlFor="delete-confirm" className="block font-semibold text-slate-800">Type DELETE to confirm</label>
        <input id="delete-confirm" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-xl border border-slate-300 p-3 text-base" />
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || confirmation !== 'DELETE'} onClick={() => update('request')} className="rounded-xl bg-rose-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Requesting…' : 'Request account deletion'}</button>
          <button disabled={busy} onClick={() => { setConfirming(false); setConfirmation(''); }} className="rounded-xl border px-5 py-3 font-semibold">Keep my account</button>
        </div>
      </div> : <button onClick={() => setConfirming(true)} className="rounded-xl border border-rose-300 px-5 py-3 font-bold text-rose-700">Delete my account</button>}
    </>}
    </>}
    {message && <p role="status" className="text-base font-medium text-slate-800">{message}</p>}
  </section>;
}
