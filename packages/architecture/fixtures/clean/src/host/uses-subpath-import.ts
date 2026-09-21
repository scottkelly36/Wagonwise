// A package reachable only through an "exports" subpath (like "zod/v4" or "vitest/config").
// If the cruiser can't resolve these, no-unresolvable fires on perfectly legitimate imports.
import { feature } from 'subpath-lib/feature';

export const value = feature;
