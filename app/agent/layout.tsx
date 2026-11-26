import './partner.css';
import AgentKycGate from '@/components/AgentKycGate';
import AgentBottomNav from '@/components/AgentBottomNav';
import {AgentSessionProvider} from '@/components/AgentSession';
export default function AgentLayout({children}:{children:React.ReactNode}){return <AgentSessionProvider><div className="partner-shell"><AgentKycGate>{children}<AgentBottomNav/></AgentKycGate></div></AgentSessionProvider>;}
