'use client';
import PartnerEarningsChart from '@/components/agent/PartnerEarningsChart';
import {agentFetch as fetch} from '@/lib/agentFetch';

import {useAgentSession} from '@/components/AgentSession';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from '@/components/AppLink';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Clock,
  Receipt,
  ShieldCheck,
  AlertCircle,
  Truck,
  ChevronLeft,
} from 'lucide-react';

interface WalletData {
  id: string;
  agentId: string;
  balance: number;
  updatedAt: string;
}

interface WalletTransaction {
  id: string;
  walletId: string;
  type: string;
  direction?: 'CREDIT'|'DEBIT'|null;
  amount: number;
  balanceAfter: number;
  status: string;
  referenceId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  reason: string | null;
  createdAt: string;
}

export default function AgentWalletPage() {
  const {refresh:refreshSession}=useAgentSession();
  const requestRef = useRef(false);
  const [query,setQuery] = useState('');
  const [chartRefresh,setChartRefresh] = useState(0);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWalletData = useCallback(async (isManualRefresh = false) => {
    if (requestRef.current) return;
    requestRef.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),15000);
    if (isManualRefresh) setIsRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/agent/wallet', {
        headers: { Accept: 'application/json' },cache:'no-store',signal:controller.signal,
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (res.status === 401) {
          void refreshSession();
          setWallet(null); setTransactions([]);
          setError('Agent session expired. Please sign in again.');
        } else {
          setError(json.message || 'Failed to load wallet data.');
        }
        return;
      }

      setWallet(json.data.wallet);
      setTransactions(json.data.transactions || []);
      if(isManualRefresh)setChartRefresh(n=>n+1);
    } catch {
      setError('Network connection error. Please retry.');
    } finally {
      clearTimeout(timeout); requestRef.current=false;
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTransactionBadge = (type: string, direction?: 'CREDIT'|'DEBIT'|null) => {
    const displayType = type==='MANUAL_ADJUSTMENT' && direction ? direction : type;
    switch (displayType) {
      case 'CREDIT':
      case 'MANUAL_CREDIT':
      case 'PICKUP_EARNINGS':
        return {
          icon: ArrowUpRight,
          label: type === 'PICKUP_EARNINGS' ? 'Pickup Earnings' : 'Credit',
          color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          amountColor: 'text-emerald-700',
          prefix: '+',
        };
      case 'REFUND':
        return {
          icon: ArrowUpRight,
          label: 'Refund',
          color: 'text-sky-700 bg-sky-50 border-sky-200',
          amountColor: 'text-sky-700',
          prefix: '+',
        };
      case 'DEBIT':
      case 'MANUAL_DEBIT':
        return {
          icon: ArrowDownLeft,
          label: 'Debit',
          color: 'text-rose-700 bg-rose-50 border-rose-200',
          amountColor: 'text-rose-700',
          prefix: '-',
        };
      default:
        return {
          icon: Receipt,
          label: type.replace(/_/g, ' '),
          color: 'text-amber-700 bg-amber-50 border-amber-200',
          amountColor: 'text-amber-700',
          prefix: '',
        };
    }
  };

  const visibleTransactions=transactions.filter(tx=>`${tx.orderNumber||''} ${tx.reason||''} ${tx.type}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="bg-[#f5f6f8] text-slate-900 min-h-screen font-sans pb-28 pt-4 px-3 sm:px-4 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/agent"
            className="p-2 bg-white hover:bg-slate-700 rounded-2xl text-slate-600 transition-colors"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <span className="text-xs font-black tracking-widest text-emerald-700 uppercase">
              Field Agent
            </span>
            <h1 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-700" />
              Earnings & Wallet
            </h1>
          </div>
        </div>

        <button
          onClick={() => fetchWalletData(true)}
          disabled={isRefreshing || loading}
          className="p-2.5 bg-white hover:bg-slate-700 rounded-2xl text-slate-600 transition-colors disabled:opacity-50"
          title="Refresh Wallet"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-700' : ''}`} />
        </button>
      </header>

      {/* Error Notice */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-700 shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>{error} <Link href="/agent" className="underline">Return to agent portal</Link></span>
          </div>
          <button
            onClick={() => fetchWalletData(true)}
            className="text-rose-700 font-bold underline text-xs shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      <PartnerEarningsChart refreshKey={chartRefresh}/>
      {/* Wallet Balance Card */}
      <section className="bg-gradient-to-br from-white via-white to-white border border-emerald-500/20 rounded-3xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
              <Wallet className="w-5 h-5 text-emerald-700" />
            </div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Available Balance
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secured
          </span>
        </div>

        <div className="space-y-1">
          <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {loading ? (
              <div className="h-9 w-36 bg-white rounded animate-pulse" />
            ) : (
              formatCurrency(wallet?.balance ?? 0)
            )}
          </div>
          <p className="text-xs text-slate-600">
            {wallet?.updatedAt
              ? `Last updated: ${new Date(wallet.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : 'Pickup earnings & wallet adjustments'}
          </p>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-200 grid grid-cols-2 gap-3 text-center">
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200">
            <span className="text-xs text-slate-600 block font-medium">Pickup earnings share</span>
            <span className="text-xs font-bold text-emerald-700">65% of eligible value</span>
          </div>
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200">
            <span className="text-xs text-slate-600 block font-medium">Ledger Records</span>
            <span className="text-xs font-bold text-slate-600">{transactions.length}</span>
          </div>
        </div>
      </section>

      {/* Transactions Section */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-700" />
            Transaction History
          </h2>
          <span className="text-xs font-bold text-slate-600">
            {transactions.length} transactions
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-700" />
            <p className="text-xs text-slate-600">Loading ledger records...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="p-3 bg-white rounded-full w-12 h-12 mx-auto flex items-center justify-center">
              <Receipt className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-xs font-bold text-slate-600">No transactions yet</p>
            <p className="text-xs text-slate-500">
              Your wallet balance adjustments and earnings will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3 divide-y divide-slate-200">
            <label className="block text-sm text-slate-600">Search recent transactions<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pickup number or reason" className="mt-2 w-full p-3 rounded-xl bg-white border border-slate-200" /></label>
            {visibleTransactions.length===0&&<p role="status" className="py-6 text-center text-sm text-slate-500">No transactions match your search.</p>}
            {visibleTransactions.map((tx) => {
              const badge = getTransactionBadge(tx.type, tx.direction);
              const BadgeIcon = badge.icon;

              return (
                <div key={tx.id} className="pt-3 first:pt-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl border ${badge.color}`}>
                        <BadgeIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900">
                            {badge.label}
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white text-slate-600">
                            {tx.status}
                          </span>
                        </div>
                        <span className="text-xs text-slate-600 block mt-0.5">
                          {new Date(tx.createdAt).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-sm font-black ${badge.amountColor}`}>
                        {badge.prefix}
                        {formatCurrency(tx.amount)}
                      </div>
                      <span className="text-xs text-slate-600 block">
                        Bal: {formatCurrency(tx.balanceAfter)}
                      </span>
                    </div>
                  </div>

                  {/* Transaction Metadata: reason, order #, ref ID */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-2.5 text-xs space-y-1">
                    {tx.reason && (
                      <div className="text-slate-600 flex items-start gap-1">
                        <span className="text-slate-500 shrink-0 font-medium">Reason:</span>
                        <span className="font-medium text-slate-600">{tx.reason}</span>
                      </div>
                    )}
                    {tx.orderNumber && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Truck className="w-3 h-3 text-emerald-700 shrink-0" />
                        <span>Order #{tx.orderNumber}</span>
                      </div>
                    )}
                    {tx.referenceId && (
                      <div className="text-xs font-mono text-slate-500 truncate">
                        Ref: {tx.referenceId}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
