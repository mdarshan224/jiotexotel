'use client';
import { androidUpiCheckoutOptions } from './androidUpiCheckout';
import { hasRazorpay, loadRazorpayScript } from './razorpayClient';
import { customerCheckoutOptions, type GatewayMethod } from './checkoutOptions';
export type PortalCheckoutOptions = {
  key: string; amount: number; currency?: string; order_id: string; name?: string; description?: string;
  initialMethod?: GatewayMethod;
  prefill?: { name?: string; contact?: string; email?: string };
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => Promise<void> | void;
  modal?: { ondismiss?: () => void };
  [key: string]: any;
};
export const preparePortalCheckout = loadRazorpayScript;
/** Razorpay owns payment entry. Always prefill the current authenticated customer. */
export function createPortalCheckout(options: PortalCheckoutOptions) {
  const events = new Map<string, (data: any) => void>();
  let checkout: any = null, opened = false;
  const report = (description: string) => events.get('payment.failed')?.({error:{description}});
  return {
    on(event: string, handler: (data: any) => void) { events.set(event,handler); checkout?.on(event,handler); },
    async open() {
      if (opened) return;
      opened = true;
      try {
        const [loaded, response] = await Promise.all([
          loadRazorpayScript(),
          fetch('/api/auth/me', {credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}),
        ]);
        if (!loaded || !hasRazorpay()) throw new Error('Unable to load secure payment. Please retry.');
        const result = await response.json();
        const user = result?.data?.user;
        if (!response.ok || !result?.success || !user || user.role !== 'CUSTOMER') throw new Error('Please sign in as a customer to continue payment.');
        const {initialMethod,config,callback_url,redirect,prefill,method,readonly,hidden,...standardOptions}=options;
        checkout = new (window as any).Razorpay({
          ...standardOptions,
          ...customerCheckoutOptions(user,'all',options.key.startsWith('rzp_test_')),
          ...androidUpiCheckoutOptions(typeof navigator === 'undefined' ? '' : navigator.userAgent, typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches),
          redirect:false,
          modal:{...options.modal,ondismiss:()=>{opened=false;options.modal?.ondismiss?.();}},
          handler:async (data:any)=>{
            try {await options.handler(data);}
            catch {report('Payment verification is pending. Check your order before trying again.');}
            finally {opened=false;}
          },
        });
        for(const [event,handler] of events) checkout.on(event,handler);
        checkout.open();
      } catch(error) {
        opened=false;
        report(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Could not load your account for payment. Please retry.');
      }
    },
  };
}
