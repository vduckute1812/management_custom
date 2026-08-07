export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * When Redis is configured, refuse the request if the shared store is
   * down instead of falling back to process-local memory.
   */
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
  failClosed?: boolean;
}
