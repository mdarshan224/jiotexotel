import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ resolve: { alias: { '@': resolve('.'), 'server-only': resolve('node_modules/server-only/empty.js') } }, test: { environment: 'node', setupFiles: ['tests/sites-setup.ts'], include: ['tests/cart-persistence.test.ts', 'tests/wallet-topup-retry.test.ts', 'tests/custom-checkout.test.ts', 'tests/customer-profile-settings.test.ts', 'tests/mobile-checkout-resilience.test.ts', 'tests/pricing.test.ts', 'tests/payment-retry-and-feedback.test.ts'] } });
