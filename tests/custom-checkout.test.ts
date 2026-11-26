import {androidUpiCheckoutOptions} from '@/lib/androidUpiCheckout';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { customerCheckoutOptions, normalizeCheckoutPhone } from '@/lib/checkoutOptions';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('Customer payment options', () => {
  it('uses a sandbox contact only for the static review login under test keys',()=>{expect(customerCheckoutOptions({phone:'9876543210'},'upi',true).prefill.contact).toBe('+919000090000');expect(customerCheckoutOptions({phone:'7022044004'},'upi',true).prefill.contact).toBe('+917022044004');});
  it.each(['7022044004','+91 70220 44004','07022044004'])('normalizes %s', phone => expect(normalizeCheckoutPhone(phone)).toBe('+917022044004'));
  it('stops the known test login from opening Razorpay with an unusable contact',()=>{expect(()=>customerCheckoutOptions({phone:'9876543210'})).toThrow(/test login number/);});
  it('rejects a missing or invalid account number',()=>{expect(()=>customerCheckoutOptions({phone:'123'})).toThrow(/mobile number/);});
  it.each(['upi','card','wallet','netbanking'] as const)('restricts checkout to %s',method=>{
    const options=customerCheckoutOptions({phone:'7022044004'},method);
    expect(options.prefill).toEqual({contact:'+917022044004',method});
    expect(options.readonly.contact).toBe(true); expect(options.hidden.contact).toBe(true);
    expect(options.config?.display.blocks.selected.instruments).toEqual([{method}]);
    expect(options.config?.display.preferences.show_default_blocks).toBe(false);
    expect(Object.entries(options.method!).filter(([,enabled])=>enabled).map(([key])=>key)).toEqual([method]);
  });
  it('keeps all methods available when no choice is provided and never fabricates an email',()=>{
    const options=customerCheckoutOptions({phone:'7022044004'});
    expect(options.config).toBeUndefined(); expect(options.prefill).not.toHaveProperty('email');
  });
});
describe('Razorpay standard checkout', () => {
  function fixture(handler = vi.fn()) {
    let received: any;
    const instance = { on: vi.fn(), open: vi.fn() };
    vi.stubGlobal('window', { Razorpay: function(options: any) { received = options; return instance; } });
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{user:{role:'CUSTOMER',phone:'7022044004',name:'Customer'}}})}));
    return { instance, options: { key:'rzp_test_example', amount:2200, order_id:'order_example', handler }, received:()=>received };
  }
  it('opens the selected method with the authenticated number, preserving the server order', async () => {
    const f=fixture(); const {createPortalCheckout}=await import('@/lib/portalCheckout');
    const checkout=createPortalCheckout({...f.options,prefill:{contact:'9999999999'},config:{display:{}},initialMethod:'upi',redirect:true,callback_url:'/old'});
    await checkout.open(); expect(f.instance.open).toHaveBeenCalledOnce();
    expect(f.received()).toMatchObject({key:'rzp_test_example',amount:2200,order_id:'order_example',redirect:false,prefill:{contact:'+917022044004'},hidden:{contact:true}});
    expect(f.received()).not.toHaveProperty('callback_url'); expect(f.received()).not.toHaveProperty('config'); expect(f.received().prefill).not.toHaveProperty('method');
  });
  it('keeps default UPI instruments available to the real checkout constructor on mobile layout',async()=>{
    const f=fixture();vi.stubGlobal('navigator',{userAgent:'JunkItOutApp/1.0'});(window as any).matchMedia=()=>({matches:true});
    const {createPortalCheckout}=await import('@/lib/portalCheckout');await createPortalCheckout({...f.options,config:{display:{blocks:{legacy:{instruments:[{method:'upi',flows:['collect']}]}}}}}).open();
    expect(f.instance.open).toHaveBeenCalledOnce();expect(f.received().config.display.hide).toEqual([{method:'upi',flows:['collect']}]);expect(f.received().config.display).not.toHaveProperty('blocks');expect(f.received().config.display).not.toHaveProperty('sequence');expect(f.received().config.display).not.toHaveProperty('preferences');expect(f.received()).not.toHaveProperty('method');expect(f.received().prefill.contact).toBe('+917022044004');
  });
  it('passes successful payment data to server verification', async () => {
    const f=fixture(); const {createPortalCheckout}=await import('@/lib/portalCheckout'); await createPortalCheckout(f.options).open();
    const response={razorpay_order_id:'order_example',razorpay_payment_id:'pay_example',razorpay_signature:'signature'};
    await f.received().handler(response); expect(f.options.handler).toHaveBeenCalledWith(response);
  });
  it('preserves dismissal and failed-payment callbacks and permits reopening after cancellation', async () => {
    const f=fixture(); const dismissed=vi.fn(), failed=vi.fn();
    const {createPortalCheckout}=await import('@/lib/portalCheckout'); const checkout=createPortalCheckout({...f.options,modal:{ondismiss:dismissed}});
    checkout.on('payment.failed',failed); await checkout.open(); f.received().modal.ondismiss();
    expect(dismissed).toHaveBeenCalledOnce(); expect(f.instance.on).toHaveBeenCalledWith('payment.failed',failed);
    await checkout.open(); expect(f.instance.open).toHaveBeenCalledTimes(2);
  });
  it('reports verification errors without an unhandled rejection or false success', async () => {
    const f=fixture(vi.fn().mockRejectedValue(new Error('offline'))); const failed=vi.fn();
    const {createPortalCheckout}=await import('@/lib/portalCheckout'); const checkout=createPortalCheckout(f.options); checkout.on('payment.failed',failed); await checkout.open();
    await f.received().handler({}); expect(failed).toHaveBeenCalledWith({error:{description:expect.stringMatching(/verification is pending/)}});
  });
  it.each(['expired','invalid-phone','offline'])('does not open an incomplete checkout on %s',async scenario=>{
    const f=fixture(), failed=vi.fn();
    if(scenario==='offline') vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable'));
    else vi.mocked(fetch).mockResolvedValue({ok:scenario!=='expired',json:async()=>({success:true,data:{user:scenario==='expired'?null:{role:'CUSTOMER',phone:''}}})} as Response);
    const {createPortalCheckout}=await import('@/lib/portalCheckout'); const checkout=createPortalCheckout(f.options); checkout.on('payment.failed',failed);
    await checkout.open(); expect(f.instance.open).not.toHaveBeenCalled(); expect(failed).toHaveBeenCalledOnce();
  });
  it('ignores duplicate open attempts while a checkout is active',async()=>{
    const f=fixture(); const {createPortalCheckout}=await import('@/lib/portalCheckout'); const checkout=createPortalCheckout(f.options);
    await Promise.all([checkout.open(),checkout.open()]); expect(f.instance.open).toHaveBeenCalledOnce();
  });
});

describe('Mobile UPI routing',()=>{
 const standardUpi=(o:any)=>{expect(o.config.display).toEqual({hide:[{method:'upi',flows:['collect']}]});expect(o).not.toHaveProperty('method');};
 it('keeps Razorpay default UPI selection in Android Chrome without intent-only blocks',()=>standardUpi(androidUpiCheckoutOptions('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile')));
 it('enables external intents in Android WebView',()=>expect(androidUpiCheckoutOptions('Android 14; wv Version/4.0')).toHaveProperty('webview_intent',true));
 it('preserves platform selection on iOS while hiding manual collect',()=>standardUpi(androidUpiCheckoutOptions('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')));
 it('does not force unsupported mobile intents when a custom app uses a desktop user agent',()=>standardUpi(androidUpiCheckoutOptions('JunkItOutApp/1.0',true)));
 it.each(['Mozilla/5.0 (Macintosh; Intel Mac OS X)',''])('preserves desktop checkout: %s',ua=>expect(androidUpiCheckoutOptions(ua)).toEqual({}));
});
