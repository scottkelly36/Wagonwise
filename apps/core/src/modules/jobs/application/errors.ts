import type { TaggedError } from '../../../shared/result.js';

/** The caller may see this company's jobs but not create one (`authorization.ts`). */
export type Forbidden = TaggedError<'Forbidden'>;
