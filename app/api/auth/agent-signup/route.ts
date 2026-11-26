import {NextRequest} from 'next/server';
import {handleAgentAuthentication} from '@/lib/auth/agentAccess';
export async function POST(req:NextRequest){return handleAgentAuthentication(req,true);}
