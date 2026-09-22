/**
 * The Five Peaks projection engine.
 *
 * Pure TypeScript: functions in, results out. No database access, no clock, no
 * randomness, no I/O of any kind. Everything it needs arrives as arguments.
 * That is what makes it testable, and this model is worth nothing if it is not
 * trustworthy.
 *
 * No rate, bracket or fee is defined in here. Every one of them arrives from the
 * assumptions register, where a director can correct it.
 */

export * from './money.js';
export * from './dates.js';
export * from './amortisation.js';
export * from './brackets.js';
export * from './revenue.js';
export * from './costs.js';
export * from './vat.js';
export * from './tax.js';
export * from './growth.js';
export * from './projection.js';
export * from './etf.js';
export * from './solvers.js';
export * from './sensitivity.js';
export * from './verdict.js';
export * from './restate.js';
export type * from './types.js';
