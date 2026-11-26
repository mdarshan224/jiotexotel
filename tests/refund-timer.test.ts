import {describe,it,expect,vi} from 'vitest';
import timer,{runRefundTimer} from '../ops/refund-timer.mjs';
describe('minute refund timer',()=>{
 it('only allows scheduler invocation and sends the isolated secret to one fixed job',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:{expired:0,processed:0,pending:0}})));expect((await timer.fetch()).status).toBe(404);await runRefundTimer({REFUND_JOB_TOKEN:'test-only-token'},fetcher);expect(fetcher).toHaveBeenCalledOnce();const [url,request]=fetcher.mock.calls[0];expect(url).toBe('https://junkitout.in/api/internal/jobs/unassigned-refunds');expect(request.method).toBe('POST');expect(request.redirect).toBe('manual');expect(request.headers.Authorization).toBe('Bearer test-only-token');});
 it('reports unsuccessful jobs and never retries a financial POST within the same invocation',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:false,data:{reviewRequired:1}}),{status:503}));await expect(runRefundTimer({REFUND_JOB_TOKEN:'test'},fetcher)).rejects.toThrow('review');expect(fetcher).toHaveBeenCalledOnce();});
 it('does not invoke the job when the secret is absent',async()=>{const fetcher=vi.fn();await expect(runRefundTimer({},fetcher)).rejects.toThrow('credential');expect(fetcher).not.toHaveBeenCalled();});
});
