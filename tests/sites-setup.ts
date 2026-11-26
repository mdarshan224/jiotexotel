import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
process.env.JWT_SECRET ||= 'test-only-jwt-secret-at-least-32-characters';
