'use client';
import Link from '@/components/AppLink';
import {ChevronLeft, CircleHelp} from 'lucide-react';
export function PartnerPage({title, subtitle, children}: {title: string; subtitle?: string; children: React.ReactNode}) {
 return <main className="partner-page"><header className="partner-page-header"><Link href="/agent" aria-label="Back to home" className="partner-icon-button"><ChevronLeft size={22}/></Link><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><Link href="/agent/help" aria-label="Partner help" className="partner-icon-button"><CircleHelp size={22}/></Link></header><div className="partner-page-content">{children}</div></main>;
}
export function PartnerEmpty({title, children}: {title: string; children: React.ReactNode}) {return <div className="partner-empty"><h2>{title}</h2><p>{children}</p></div>;}
export function partnerMoney(value: number) {return value.toLocaleString('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2});}
