# 🔌 AutoFlow Integration Guide

**Plug AutoFlow into ANY Node.js project in 3 minutes!**

AutoFlow will automatically:
- ✅ Detect errors in your application
- ✅ Classify severity using AI
- ✅ Decide best action (ignore, monitor, auto-fix, escalate)
- ✅ Apply your project's policies
- ✅ Request approval for critical actions
- ✅ Provide real-time insights

---

## 🚀 Quick Start (3 Steps)

### Step 1: Copy the SDK

Copy `autoflow-sdk/index.js` to your project:

```bash
# In your project directory
mkdir autoflow-sdk
# Copy the autoflow-sdk/index.js file here
```

### Step 2: Initialize AutoFlow

In your main application file (e.g., `app.js`, `index.js`, `server.js`):

```javascript
// At the top of your file
const AutoFlowClient = require('./autoflow-sdk');

const autoflow = new AutoFlowClient({
  endpoint: 'http://localhost:3000/api/event',  // AutoFlow backend
  project: 'my-awesome-app',                    // Your project name
  environment: 'production'                      // or 'staging', 'development'
});

// Enable global error capture
autoflow.captureUncaughtExceptions();
```

### Step 3: Use in Error Handlers

#### For Express.js Apps:

```javascript
const express = require('express');
const app = express();

// Your routes
app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsersFromDatabase();
    res.json(users);
  } catch (error) {
    // Report to AutoFlow
    await autoflow.reportError(error, {
      source: 'user-api',
      endpoint: '/api/users',
      userId: req.user?.id
    });
    
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Global error middleware (catches all errors)
app.use(autoflow.expressMiddleware());

app.listen(3000);
```

#### For Any Node.js App:

```javascript
async function criticalOperation() {
  try {
    await processPayment();
  } catch (error) {
    // Report to AutoFlow
    await autoflow.reportError(error, {
      source: 'payment-service',
      severity: 'critical'  // Optional: override auto-detection
    });
    
    throw error;
  }
}
```

---

## 📊 See Your App in AutoFlow Dashboard

1. **Start AutoFlow backend**:
   ```bash
   cd path/to/autoflow
   npm run dev
   ```

2. **Open dashboard**: http://localhost:3001

3. **Trigger an error in your app**

4. **Watch AutoFlow**:
   - Event appears in dashboard
   - AI classifies severity
   - Policy decides action
   - Workflow executes automatically
   - Real-time logs show everything

---

## 🎯 Advanced Usage

### Custom Events (Not Just Errors)

```javascript
// Report successful operations
await autoflow.reportEvent('info', 'Payment processed successfully', 'low', {
  amount: 100,
  userId: '123'
});

// Report warnings
await autoflow.reportEvent('warning', 'API rate limit approaching', 'medium', {
  currentRate: 950,
  limit: 1000
});

// Report critical alerts
await autoflow.reportEvent('alert', 'Database backup failed', 'critical', {
  database: 'production-db',
  lastBackup: '2 days ago'
});
```

### Configure for Different Environments

```javascript
const autoflow = new AutoFlowClient({
  endpoint: process.env.AUTOFLOW_ENDPOINT || 'http://localhost:3000/api/event',
  project: 'my-app',
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV !== 'test'  // Disable in tests
});
```

### Add Context to Errors

```javascript
try {
  await chargeCustomer(customerId, amount);
} catch (error) {
  await autoflow.reportError(error, {
    source: 'payment-gateway',
    customerId,
    amount,
    paymentMethod: 'credit_card',
    severity: 'critical',  // Force critical severity
    metadata: {
      attemptNumber: 3,
      previousErrors: ['timeout', 'network']
    }
  });
}
```

---

## 🏢 Multi-Project Setup

AutoFlow supports multiple projects simultaneously!

**Project 1 (E-commerce API):**
```javascript
const autoflow = new AutoFlowClient({
  project: 'ecommerce-api',
  environment: 'production'
});
```

**Project 2 (Payment Service):**
```javascript
const autoflow = new AutoFlowClient({
  project: 'payment-gateway',
  environment: 'production'
});
```

**In AutoFlow Dashboard:**
- Filter events by project
- See project-specific health
- Different policies per project

---

## 🔥 Example: Real Application

Here's a complete example with a real Express app:

```javascript
const express = require('express');
const AutoFlowClient = require('./autoflow-sdk');

// Initialize AutoFlow
const autoflow = new AutoFlowClient({
  project: 'blog-api',
  environment: 'production'
});

autoflow.captureUncaughtExceptions();

const app = express();
app.use(express.json());

// Database connection with error reporting
let db;
async function connectDatabase() {
  try {
    db = await connectToMongoDB();
    console.log('✅ Database connected');
  } catch (error) {
    await autoflow.reportError(error, {
      source: 'database-connection',
      severity: 'critical'
    });
    throw error;
  }
}

// API endpoint with error handling
app.post('/api/posts', async (req, res) => {
  try {
    // Validate input
    if (!req.body.title) {
      throw new Error('Title is required');
    }
    
    // Create post
    const post = await db.posts.create(req.body);
    
    // Report success (optional)
    await autoflow.reportEvent('info', 'Post created successfully', 'low', {
      postId: post.id,
      userId: req.user.id
    });
    
    res.json(post);
    
  } catch (error) {
    // Report to AutoFlow
    await autoflow.reportError(error, {
      source: 'posts-api',
      endpoint: '/api/posts',
      userId: req.user?.id,
      requestBody: req.body
    });
    
    res.status(500).json({ error: error.message });
  }
});

// Scheduled task with error handling
setInterval(async () => {
  try {
    await cleanupOldPosts();
  } catch (error) {
    await autoflow.reportError(error, {
      source: 'cleanup-job',
      severity: 'medium'
    });
  }
}, 3600000); // Every hour

// Global error handler
app.use(autoflow.expressMiddleware());

// Start server
connectDatabase().then(() => {
  app.listen(3000, () => {
    console.log('🚀 Blog API running on port 3000');
    console.log('📊 AutoFlow monitoring enabled');
  });
});
```

---

## 📋 What AutoFlow Does Automatically

When you report an error, AutoFlow:

1. **Receives the event** and logs it
2. **AI classifies** the severity (or uses your override)
3. **Checks correlation** - is this a duplicate?
4. **Applies policies** based on:
   - Project name
   - Environment (production/staging/dev)
   - Severity level
5. **Decides action**:
   - **Ignore** - Low priority, log only
   - **Monitor** - Track and schedule follow-up
   - **Auto-fix** - Attempt automated remediation
   - **Escalate** - Notify team, request approval
6. **Executes workflow** - All steps are observable
7. **Shows in dashboard** - Real-time updates

---

## 🎯 Testing AutoFlow Integration

### Test 1: Trigger a Simple Error

```javascript
// In your app
await autoflow.reportError(new Error('Test error from my app'), {
  source: 'test',
  severity: 'high'
});
```

**Expected**: See event in AutoFlow dashboard within seconds!

### Test 2: Trigger Multiple Similar Errors

```javascript
// Send same error 3 times quickly
for (let i = 0; i < 3; i++) {
  await autoflow.reportError(new Error('Database timeout'), {
    source: 'db-test'
  });
}
```

**Expected**: AutoFlow detects alert storm and auto-escalates!

### Test 3: Critical Error (Requires Approval)

```javascript
await autoflow.reportError(new Error('Payment system down'), {
  source: 'payment-gateway',
  severity: 'critical'
});
```

**Expected**: Approval banner appears in AutoFlow dashboard!

---

## 🏆 Benefits for Your Project

- ✅ **Centralized error monitoring** - All errors in one place
- ✅ **AI-powered triage** - Automatic severity classification
- ✅ **Intelligent deduplication** - No alert spam
- ✅ **Policy-based actions** - Safe, governed responses
- ✅ **Observable workflows** - See exactly what happens
- ✅ **Multi-project support** - Monitor entire infrastructure
- ✅ **Zero configuration** - Works out of the box

---

## 📞 Support

Having issues? Check:
1. AutoFlow backend is running on port 3000
2. SDK endpoint matches backend URL
3. Project name is registered (check `/api/projects`)

---

## 🎬 Demo for Judges

**Judges can test AutoFlow with their own projects!**

1. Copy the SDK to your project
2. Add 3 lines of code
3. Trigger an error
4. Watch AutoFlow handle it automatically

**This proves AutoFlow works with ANY Node.js application!**