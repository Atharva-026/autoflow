# ⚡ AutoFlow - Autonomous Event-Driven Backend Orchestrator

> Built with Motia for autonomous operational incident response

[![Motia](https://img.shields.io/badge/Built%20with-Motia-blue)](https://motia.dev)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 🎯 **What is AutoFlow?**

AutoFlow is an **autonomous backend orchestration system** that thinks for itself. Instead of hardcoded scripts, it uses AI agents, policy engines, and intelligent workflows to automatically handle operational incidents.

**The Problem:**
- Alert storms flood your Slack
- Every error gets manual triage
- Duplicate events create noise
- No intelligent decision-making
- Scattered tools and scripts

**The Solution:**
AutoFlow provides a **unified, intelligent, policy-driven incident response system** built entirely on Motia's workflow engine.

---

## ✨ **Key Features**

### 🤖 **AI-Powered Decision Making**
- Automatic severity classification
- Intelligent action recommendation
- Context-aware reasoning
- Learns from patterns

### 📋 **Policy Engine (AI + Rules)**
- Policies override AI when needed
- Environment-based rules (prod/staging/dev)
- Project-specific policies
- Safety guardrails for production

### 👤 **Human-in-the-Loop**
- Critical actions require approval
- Pause workflows for human decision
- Approve/reject from dashboard
- Auto-escalation on timeout

### 🏢 **Multi-Project Awareness**
- Track multiple services simultaneously
- Project-specific policies
- Service health monitoring
- Filter events by project

### 🔗 **Event Correlation & Deduplication**
- Detects duplicate events
- Prevents alert storms
- Correlates related incidents
- Intelligent noise reduction

### 🔄 **Durable Workflows**
- 6-step observable workflow
- Resumable on failure
- Background jobs for long tasks
- Scheduled follow-ups

### 📡 **Real-Time Streaming**
- Live workflow execution logs
- Server-Sent Events (SSE)
- Instant dashboard updates
- Step-by-step visibility

---

## 🏗️ **Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                      AutoFlow System                         │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Event Ingestion                           │
│  • API Webhooks  • SDK Integration  • Direct Events         │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  Motia Workflow Engine                       │
│                                                              │
│  Step 1: Ingest & Validate                                  │
│  Step 2: AI Classification (severity, category)             │
│  Step 3: AI Decision (ignore, monitor, fix, escalate)       │
│  Step 4: Policy Engine (apply rules & governance)           │
│  Step 5: Human Approval (if critical)                       │
│  Step 6: Execute Action (background jobs)                   │
│  Step 7: Verify Outcome                                     │
│  Step 8: Schedule Follow-Up                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Real-Time Dashboard                       │
│  • Live Logs  • Approvals  • Project Health  • Analytics   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+
- npm or yarn

### **Installation**

```bash
# Clone the repository
git clone https://github.com/yourusername/autoflow.git
cd autoflow

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your Anthropic API key (optional - works with mock mode)

# Start backend
npm run dev

# In a new terminal, start frontend
cd frontend
npm install
npm start
```

**AutoFlow will be running at:**
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:3001`

---

## 🔌 **Integrate with Your Project (3 Steps)**

AutoFlow can monitor **ANY Node.js application** in 3 minutes:

### **Step 1: Copy the SDK**

```bash
cp -r autoflow-sdk /path/to/your/project/
```

### **Step 2: Initialize in Your App**

```javascript
import AutoFlowClient from './autoflow-sdk/index.js';

const autoflow = new AutoFlowClient({
  endpoint: 'http://localhost:3000/api/event',
  project: 'my-awesome-app',
  environment: 'production'
});

autoflow.captureUncaughtExceptions();
```

### **Step 3: Report Errors**

```javascript
try {
  await riskyOperation();
} catch (error) {
  await autoflow.reportError(error, {
    source: 'payment-service',
    userId: req.user.id
  });
  throw error;
}
```

**That's it!** AutoFlow will now:
- ✅ Receive your errors
- ✅ Classify severity with AI
- ✅ Apply policies
- ✅ Execute intelligent actions
- ✅ Show everything in dashboard

See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for details.

---

## 🧪 **Try the Demo App**

We've included a demo Express app that shows AutoFlow in action:

```bash
cd demo-test-app
npm install
node server.js
```

Visit: `http://localhost:4000`

**Test Scenarios:**
- `/test/low` - Low severity (ignored)
- `/test/medium` - Medium severity (monitored)
- `/test/high` - High severity (auto-fix)
- `/test/critical` - Critical (requires approval!)
- `/test/storm` - Alert storm (deduplication)

---

## 📊 **How It Works**

### **Example: Critical Payment Error**

1. **Event Received**
   ```javascript
   await autoflow.reportError(error, {
     source: 'payment-gateway',
     severity: 'critical'
   });
   ```

2. **AI Classification**
   ```
   Severity: critical
   Category: error
   Confidence: 92%
   Reasoning: Payment errors impact revenue
   ```

3. **AI Decision**
   ```
   Action: escalate
   Priority: critical
   Reasoning: Requires immediate human intervention
   ```

4. **Policy Override**
   ```
   Policy: Production critical events require approval
   Final Action: require_approval
   ```

5. **Human Approval**
   ```
   ⏸️ Workflow paused
   👉 Approval banner appears in dashboard
   ✅ Operator approves
   ```

6. **Execution**
   ```
   🚨 Escalating to: Slack, Email, PagerDuty
   ✅ Notifications sent
   ```

7. **Follow-Up**
   ```
   📅 Scheduled check in 60 minutes
   ```

---

## 🎯 **Use Cases**

### **Production Incident Response**
- Auto-classify incident severity
- Route to correct team
- Attempt automated remediation
- Escalate if needed

### **Alert Management**
- Deduplicate similar alerts
- Prevent alert storms
- Intelligent noise reduction
- Context-aware grouping

### **Multi-Service Monitoring**
- Track health across services
- Project-specific policies
- Service dependency awareness
- Unified observability

### **DevOps Automation**
- Automated fix attempts
- Policy-driven actions
- Audit trail for compliance
- Human approval gates

---

## 🏆 **Why Motia?**

AutoFlow showcases Motia's core strengths:

| Motia Feature | How We Use It |
|--------------|---------------|
| **Steps** | 8 isolated, resumable units |
| **Workflows** | Event-driven orchestration |
| **Background Jobs** | Auto-fix runs async |
| **Scheduled Tasks** | Follow-up checks |
| **Events** | Webhook triggers |
| **Observability** | Every step tracked |
| **State Management** | Durable execution |

**What makes this unique:**
- AI agents make decisions within workflows
- Policies provide safety guardrails
- Human approvals pause workflows
- Event correlation prevents noise
- Multi-project awareness

---

## 🛠️ **Technology Stack**

**Backend:**
- Motia (workflow engine)
- Node.js (runtime)
- Anthropic Claude (AI agent)
- Event correlation engine
- Policy engine

**Frontend:**
- React
- Server-Sent Events (SSE)
- Real-time streaming
- Responsive design

---

## 📈 **Project Structure**

```
autoflow/
├── workflows/           # Main workflow definitions
│   └── handleEvent.js  # 8-step incident response
├── steps/              # Individual workflow steps
│   ├── ingestEvent.js
│   ├── classifyEvent.js
│   ├── decideAction.js
│   ├── executeAction.js
│   ├── verifyOutcome.js
│   └── scheduleFollowUp.js
├── agents/             # AI decision agents
│   └── decisionAgent.js
├── policies/           # Policy engine
│   └── policyEngine.js
├── approvals/          # Approval system
│   └── approvalManager.js
├── registry/           # Project registry
│   └── projects.js
├── correlation/        # Event correlation
│   └── eventCorrelator.js
├── autoflow-sdk/       # Integration SDK
│   └── index.js
├── demo-test-app/      # Demo application
│   └── server.js
├── frontend/           # React dashboard
│   └── src/
└── index.js           # Main backend server
```

---

## 🎬 **Demo Video**

Watch AutoFlow in action: [Link to Video]

**Highlights:**
- 0:00 - Problem statement
- 0:30 - Multi-project setup
- 1:00 - AI classification
- 1:30 - Policy engine
- 2:00 - Human approval flow
- 2:30 - Event correlation
- 3:00 - Live integration demo

---

## 🔮 **Future Enhancements**

- [ ] Machine learning from historical incidents
- [ ] Slack/PagerDuty native integrations
- [ ] Custom action plugins
- [ ] Incident playbooks
- [ ] Advanced analytics dashboard
- [ ] Multi-language SDK support
- [ ] Cloud deployment templates

---

## 🤝 **Contributing**

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 **License**

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 **Acknowledgments**

Built for [Hackathon Name] using:
- [Motia](https://motia.dev) - Unified workflow runtime
- [Anthropic Claude](https://anthropic.com) - AI decision engine
- [React](https://react.dev) - Frontend framework

---

## 📞 **Contact**

- **Developer:** [Your Name]
- **Email:** [your.email@example.com]
- **GitHub:** [@yourusername](https://github.com/yourusername)
- **Demo:** [Live Demo Link]

---

**Built with ❤️ and Motia**