import * as entities from './entities';

// Named export for old pattern: import { base44 } from '@/api/base44Client'
export const base44 = { entities };

// Direct named exports for new pattern
export * from './entities';
