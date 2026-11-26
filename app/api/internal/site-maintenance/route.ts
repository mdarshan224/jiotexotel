import { NextResponse } from 'next/server';
import { processAccountDeletions } from '@/lib/accountDeletion';
import { processExpiredWalletBonuses } from '@/lib/walletBonusLifecycle';
/**
 * Service writer for this OWNER-PRIVATE testing Site. Sites dispatch authenticates
 * visitors and service requests before they reach this Worker. Disable this
 * endpoint (SITES_PRIVATE_JOBS_ENABLED=false) before making the Site public.
 */
export async function POST() {
  if (process.env.SITES_PRIVATE_JOBS_ENABLED !== 'true') return NextResponse.json({success:false},{status:403});
  try {
    const deletion = await processAccountDeletions();
    const bonuses = await processExpiredWalletBonuses();
    return NextResponse.json({success:deletion.failed===0,data:{deletion,bonuses}},{status:deletion.failed?503:200,headers:{'Cache-Control':'no-store'}});
  } catch {return NextResponse.json({success:false,message:'Maintenance failed; retry required.'},{status:503});}
}
