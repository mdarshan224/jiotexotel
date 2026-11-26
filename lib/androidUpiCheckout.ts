/** Keep Razorpay's platform-aware default methods. An intent-only custom block
 * can remove UPI entirely when that platform has no eligible intent instrument.
 * Hide only manual Collect; Razorpay chooses supported Intent/QR instruments.
 * Android WebViews still need native support for external UPI app links.
 */
export function androidUpiCheckoutOptions(userAgent: string, mobileLayout = false) {
  const mobile = mobileLayout || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  if (!mobile) return {};
  return {
    ...(/Android/i.test(userAgent) && /;\s*wv\b|Version\/4\.0/i.test(userAgent) ? {webview_intent:true} : {}),
    config: {display: {
      hide:[{method:'upi',flows:['collect']}],
    }},
  };
}
