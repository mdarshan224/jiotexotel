import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({resolve:{alias:{'@':resolve('.'),'cloudflare:workers':resolve('tests/cloudflare-binding.mock.ts'),'server-only':resolve('node_modules/server-only/empty.js')}},test:{environment:'node',setupFiles:['tests/sites-setup.ts'],include:['tests/account-deletion.test.ts','tests/account-deletion-routes.test.ts','tests/customer-otp-test-mode.test.ts']}});
