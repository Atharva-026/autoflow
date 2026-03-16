/**
 * AutoFlow SDK — TypeScript Definitions
 */

export interface AutoFlowConfig {
  /** AutoFlow backend URL. Default: http://localhost:3000/api/event */
  endpoint?:      string;
  /** Your project/service name. Default: AUTOFLOW_PROJECT env var */
  project?:       string;
  /** Environment name. Default: NODE_ENV env var */
  environment?:   'production' | 'staging' | 'development' | string;
  /** Set false to disable all reporting (useful in tests). Default: true */
  enabled?:       boolean;
  /** Log SDK activity to console. Default: false */
  debug?:         boolean;
  /** Batch events and send every N milliseconds. 0 = send immediately. Default: 0 */
  batchInterval?: number;
  /** HTTP request timeout in milliseconds. Default: 5000 */
  timeout?:       number;
  /** Number of retries on failure. Default: 2 */
  maxRetries?:    number;
}

export interface EventContext {
  /** Override the source label. Default: project name */
  source?:    string;
  /** Override auto-detected severity */
  severity?:  'low' | 'medium' | 'high' | 'critical';
  /** User ID for context */
  userId?:    string;
  /** API endpoint that triggered the error */
  endpoint?:  string;
  /** HTTP method */
  method?:    string;
  /** Any additional metadata */
  [key: string]: unknown;
}

export interface HealthResult {
  ok:         boolean;
  latencyMs:  number;
  status?:    string;
  message?:   string;
  error?:     string;
}

export interface SendResult {
  success?:  boolean;
  eventId?:  string;
  queued?:   boolean;
  message?:  string;
}

export declare class AutoFlowClient {
  constructor(config?: AutoFlowConfig);

  /**
   * Report an error to AutoFlow. Severity is auto-detected from error type.
   */
  reportError(error: Error, context?: EventContext): Promise<SendResult | null>;

  /**
   * Report a custom event (warning, info, alert, etc).
   */
  reportEvent(
    type: string,
    message: string,
    severity?: 'low' | 'medium' | 'high' | 'critical',
    metadata?: Record<string, unknown>
  ): Promise<SendResult | null>;

  /**
   * Check if the AutoFlow backend is reachable.
   */
  health(): Promise<HealthResult>;

  /**
   * Express/Connect/Fastify error middleware.
   * app.use(autoflow.middleware())
   */
  middleware(): (err: Error, req: unknown, res: unknown, next: (err?: Error) => void) => void;

  /**
   * Alias for middleware() — backwards compatible.
   */
  expressMiddleware(): (err: Error, req: unknown, res: unknown, next: (err?: Error) => void) => void;

  /**
   * Install global handlers for uncaughtException and unhandledRejection.
   * Call once at app startup.
   */
  captureUncaughtExceptions(): this;

  /**
   * Wrap console.error to automatically report errors.
   * Call once at app startup.
   */
  captureConsoleErrors(): this;

  /**
   * Flush any batched events immediately.
   */
  flush(): Promise<void>;

  /**
   * Disable all event reporting (e.g. in test environments).
   */
  disable(): this;

  /**
   * Re-enable after disable().
   */
  enable(): this;
}

export default AutoFlowClient;