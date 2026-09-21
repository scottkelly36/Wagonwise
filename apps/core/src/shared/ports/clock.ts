/**
 * The only way domain and application code learns the time. Never call `new Date()` or
 * `Date.now()` there: expiry rules ("temporary hazards lapse after 7 days") are untestable
 * without a clock you control.
 */
export interface Clock {
  now(): Date;
}
