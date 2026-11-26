export type GatewayMethod = 'upi' | 'card' | 'wallet' | 'netbanking' | 'all';
const methods = ['upi', 'card', 'wallet', 'netbanking'] as const;
export function normalizeCheckoutPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}
export function customerCheckoutOptions(user: {phone?: unknown; name?: string; email?: string}, selected: GatewayMethod = 'all', testMode = false) {
  let contact = normalizeCheckoutPhone(user.phone);
  if (!contact) throw new Error('Your account mobile number could not be loaded. Please sign in again.');
  // A sandbox-only contact keeps the static review login usable; never rewrite live contacts.
  if (testMode && contact === '+919876543210') contact = '+919000090000';
  if (contact === '+919876543210') throw new Error('The test login number is not accepted by Razorpay. Please sign in with your real mobile number to make a payment.');
  const method = methods.includes(selected as any) ? selected as typeof methods[number] : null;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return {
    prefill: { contact, ...(user.name ? {name:user.name} : {}), ...(email ? {email} : {}), ...(method ? {method} : {}) },
    readonly: {contact:true},
    hidden: {contact:true},
    ...(method ? {
      method: Object.fromEntries(methods.map(value=>[value,value===method])),
      config: {display:{blocks:{selected:{name:({upi:'UPI',card:'Credit / debit card',wallet:'Wallets',netbanking:'Netbanking'})[method],instruments:[{method}]}},sequence:['block.selected'],preferences:{show_default_blocks:false}}},
    } : {}),
  };
}
