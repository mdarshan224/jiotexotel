import 'server-only';

// Explicit customer QA account. Never used by admin/agent verification.
// Set CUSTOMER_STATIC_TEST_LOGIN_ENABLED=false to retire this test credential.
export function isStaticCustomerTestPhone(phone: string): boolean {
  return process.env.CUSTOMER_STATIC_TEST_LOGIN_ENABLED !== 'false' &&
    phone.replace(/\D/g, '').slice(-10) === '9876543210';
}
export function isStaticCustomerTestCode(code: string): boolean {
  return code === '563130';
}
