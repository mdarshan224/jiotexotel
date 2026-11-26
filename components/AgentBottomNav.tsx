'use client';
import {useAgentSession} from './AgentSession';
import Link from '@/components/AppLink';
import {usePathname} from 'next/navigation';
import {House, ChartNoAxesColumnIncreasing, PackageCheck, CircleHelp, Menu} from 'lucide-react';
export default function AgentBottomNav() {
 const pathname=usePathname(), {session}=useAgentSession();
 if(session.status!=='approved'||!pathname.startsWith('/agent')||pathname==='/agent/onboarding')return null;
 const links=[{href:'/agent',label:'Home',icon:House},{href:'/agent/wallet',label:'Earnings',icon:ChartNoAxesColumnIncreasing},{href:'/agent/pickups',label:'Pickups',icon:PackageCheck},{href:'/agent/help',label:'Help',icon:CircleHelp},{href:'/agent/more',label:'More',icon:Menu}];
 return <nav aria-label="Agent navigation" className="partner-bottom-nav"><div>{links.map(({href,label,icon:Icon})=>{const active=href==='/agent'?pathname===href:pathname.startsWith(href);return <Link key={href} href={href} aria-current={active?'page':undefined}><Icon size={23} strokeWidth={active?2.4:1.8}/><span>{label}</span></Link>;})}</div></nav>;
}
