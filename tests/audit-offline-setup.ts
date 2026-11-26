import {beforeEach,vi} from 'vitest';
// These suites exercise local/mock state only; an unexpected outbound fetch fails closed.
beforeEach(()=>vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Outbound network disabled in audit tests'))));
