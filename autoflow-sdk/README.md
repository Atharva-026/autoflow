# autoflow-sdk

Drop autonomous incident response into any Node.js app in 3 lines.

## Install

```bash
# If published to npm:
npm install autoflow-sdk

# Or copy the sdk folder into your project:
cp -r autoflow-sdk/ your-project/
```

## Quick Start

```js
// ES Module
import AutoFlow from 'autoflow-sdk';

// CommonJS
const AutoFlow = require('autoflow-sdk');

const af = new AutoFlow({
  endpoint:    'http://localhost:3000/api/event',
  project:     'my-app',
  environment: 'production'
});

// Capture all uncaught errors globally
af.captureUncaughtExceptions();

// Report a specific error
try {
  await riskyOperation();
} catch (error) {
  await af.reportError(error, { source: 'payment-service', userId: req.user.id });
  throw error;
}
```

## Configuration

| Option          | Type    | Default                              | Description                              |
|----------------|---------|--------------------------------------|------------------------------------------|
| `endpoint`     | string  | `http://localhost:3000/api/event`    | AutoFlow backend URL                     |
| `project`      | string  | `AUTOFLOW_PROJECT` env var           | Your service/project name                |
| `environment`  | string  | `NODE_ENV` env var                   | `production`, `staging`, `development`   |
| `enabled`      | boolean | `true`                               | Set `false` to disable in tests          |
| `debug`        | boolean | `false`                              | Log SDK activity to console              |
| `batchInterval`| number  | `0`                                  | Batch events (ms). `0` = send immediately|
| `timeout`      | number  | `5000`                               | HTTP timeout (ms)                        |
| `maxRetries`   | number  | `2`                                  | Retries on failure (exponential backoff) |

## Methods

### `reportError(error, context?)`
Report an error. Severity is auto-detected from error type and message.

```js
await af.reportError(new Error('DB timeout'), {
  source:   'database-pool',
  severity: 'high',        // override auto-detection
  userId:   '123',
  retries:  3
});
```

### `reportEvent(type, message, severity?, metadata?)`
Report any custom event — not just errors.

```js
await af.reportEvent('warning', 'API rate limit at 90%', 'medium', {
  currentRate: 900, limit: 1000
});

await af.reportEvent('info', 'Payment processed', 'low', {
  orderId: 'ORD-123', amount: 99.99
});
```

### `health()`
Check if AutoFlow backend is reachable.

```js
const { ok, latencyMs } = await af.health();
console.log(ok ? `AutoFlow up (${latencyMs}ms)` : 'AutoFlow unreachable');
```

### `middleware()`
Drop-in Express error handler — catches all errors your routes throw.

```js
const express = require('express');
const app = express();

// your routes here...

// Add as LAST middleware
app.use(af.middleware());
```

### `captureUncaughtExceptions()`
Install global handlers for crashes and unhandled promise rejections.

```js
af.captureUncaughtExceptions(); // call once at startup
```

### `captureConsoleErrors()`
Automatically report anything passed to `console.error`.

```js
af.captureConsoleErrors(); // call once at startup
```

### `flush()`
Force-send any batched events immediately.

```js
await af.flush();
```

## Batching (optional)

Send events in batches instead of one HTTP call per error — useful for high-traffic services.

```js
const af = new AutoFlow({
  project:       'high-traffic-api',
  batchInterval: 5000  // batch and send every 5 seconds
});

// Events queue up and send every 5s automatically
// Use af.flush() to send immediately
```

## TypeScript

Full TypeScript support is included.

```typescript
import AutoFlow, { AutoFlowConfig, EventContext } from 'autoflow-sdk';

const config: AutoFlowConfig = {
  project:     'my-typescript-app',
  environment: 'production',
  debug:       true
};

const af = new AutoFlow(config);
```

## Environment Variables

```bash
AUTOFLOW_PROJECT=my-app       # default project name
NODE_ENV=production           # default environment
```

## What AutoFlow Does With Your Events

1. **Receives** your error
2. **AI classifies** severity (critical / high / medium / low)
3. **Policy engine** applies your rules
4. **Decides action**: ignore, monitor, auto-fix, or escalate
5. **Executes**: runs fix scripts, calls webhooks, sends notifications
6. **Stores** everything in SQLite for history and analytics