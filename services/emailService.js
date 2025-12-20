/**
 * Email Service for AutoFlow
 * Sends real email alerts via Gmail
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';

// Create transporter
let transporter = null;

if (EMAIL_ENABLED) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  // Verify connection
  transporter.verify((error) => {
    if (error) {
      console.error('❌ Email service failed to initialize:', error.message);
    } else {
      console.log('✅ Email service ready');
    }
  });
}

/**
 * Send escalation email
 */
export async function sendEscalationEmail(eventData, classification, decision) {
  if (!EMAIL_ENABLED) {
    console.log('📧 Email disabled - would have sent escalation email');
    return { success: false, reason: 'Email disabled' };
  }

  const severity = classification.severity;
  const severityEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  }[severity] || '⚪';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
        }
        .content { 
          background: #f7fafc;
          padding: 20px;
          border-radius: 0 0 8px 8px;
        }
        .alert-box {
          background: ${severity === 'critical' ? '#fee2e2' : severity === 'high' ? '#fef3c7' : '#e0e7ff'};
          border-left: 4px solid ${severity === 'critical' ? '#ef4444' : severity === 'high' ? '#f59e0b' : '#6366f1'};
          padding: 15px;
          margin: 15px 0;
          border-radius: 4px;
        }
        .detail-row { 
          display: flex;
          padding: 8px 0;
          border-bottom: 1px solid #e2e8f0;
        }
        .detail-label { 
          font-weight: bold;
          width: 150px;
        }
        .footer {
          text-align: center;
          color: #718096;
          margin-top: 20px;
          font-size: 12px;
        }
        .btn {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 6px;
          margin: 10px 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚡ AutoFlow Alert</h1>
          <p>Automated Incident Response System</p>
        </div>
        
        <div class="content">
          <div class="alert-box">
            <h2>${severityEmoji} ${severity.toUpperCase()} Severity Incident</h2>
            <p><strong>${eventData.message}</strong></p>
          </div>

          <h3>📋 Incident Details</h3>
          <div class="detail-row">
            <span class="detail-label">Event ID:</span>
            <span>${eventData.id}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Type:</span>
            <span>${eventData.type}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Source:</span>
            <span>${eventData.source}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Project:</span>
            <span>${eventData.metadata?.project || 'unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Environment:</span>
            <span>${eventData.metadata?.environment || 'production'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Timestamp:</span>
            <span>${new Date(eventData.timestamp).toLocaleString()}</span>
          </div>

          <h3>🤖 AI Analysis</h3>
          <div class="detail-row">
            <span class="detail-label">Severity:</span>
            <span>${classification.severity}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Category:</span>
            <span>${classification.category}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Confidence:</span>
            <span>${Math.round(classification.confidence * 100)}%</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Reasoning:</span>
            <span>${classification.reasoning}</span>
          </div>

          <h3>⚙️ Recommended Action</h3>
          <div class="detail-row">
            <span class="detail-label">Action:</span>
            <span><strong>${decision.action}</strong></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Priority:</span>
            <span>${decision.priority}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Reasoning:</span>
            <span>${decision.reasoning}</span>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <a href="http://localhost:3001" class="btn">View Dashboard</a>
            <a href="http://localhost:3001/events/${eventData.id}" class="btn">View Event Details</a>
          </div>
        </div>

        <div class="footer">
          <p>This alert was automatically generated by AutoFlow</p>
          <p>Autonomous Event-Driven Backend Orchestrator</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'AutoFlow <noreply@autoflow.dev>',
    to: process.env.EMAIL_TO || process.env.EMAIL_USER,
    subject: `${severityEmoji} ${severity.toUpperCase()} Alert: ${eventData.message}`,
    html: htmlContent,
    text: `
AutoFlow Alert - ${severity.toUpperCase()} Severity

${eventData.message}

Event ID: ${eventData.id}
Type: ${eventData.type}
Source: ${eventData.source}
Project: ${eventData.metadata?.project || 'unknown'}

AI Analysis:
- Severity: ${classification.severity}
- Confidence: ${Math.round(classification.confidence * 100)}%
- Reasoning: ${classification.reasoning}

Recommended Action: ${decision.action}
Priority: ${decision.priority}

View details: http://localhost:3001
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    console.log('📧 Recipient:', mailOptions.to);
    
    return {
      success: true,
      messageId: info.messageId,
      recipient: mailOptions.to
    };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send approval request email
 */
export async function sendApprovalRequestEmail(approvalRequest) {
  if (!EMAIL_ENABLED) {
    console.log('📧 Email disabled - would have sent approval request');
    return { success: false, reason: 'Email disabled' };
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { 
          background: #fbbf24;
          color: #78350f;
          padding: 20px;
          border-radius: 8px 8px 0 0;
        }
        .content { 
          background: #fef3c7;
          padding: 20px;
          border-radius: 0 0 8px 8px;
        }
        .approval-box {
          background: white;
          border: 2px solid #fbbf24;
          padding: 20px;
          margin: 15px 0;
          border-radius: 8px;
        }
        .btn {
          display: inline-block;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 10px 5px;
          font-weight: bold;
        }
        .btn-approve {
          background: #10b981;
          color: white;
        }
        .btn-reject {
          background: #ef4444;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏸️ Approval Required</h1>
          <p>Human Decision Needed for Critical Action</p>
        </div>
        
        <div class="content">
          <div class="approval-box">
            <h2>🚨 ${approvalRequest.event.message}</h2>
            
            <p><strong>Event Details:</strong></p>
            <ul>
              <li>Type: ${approvalRequest.event.type}</li>
              <li>Source: ${approvalRequest.event.source}</li>
              <li>Severity: ${approvalRequest.event.severity}</li>
              <li>Project: ${approvalRequest.project}</li>
            </ul>

            <p><strong>Proposed Action:</strong></p>
            <ul>
              <li>Action: ${approvalRequest.proposedAction.action}</li>
              <li>Reasoning: ${approvalRequest.proposedAction.reasoning}</li>
            </ul>

            <p><strong>Expires:</strong> ${new Date(approvalRequest.expiresAt).toLocaleString()}</p>
          </div>

          <div style="text-align: center;">
            <a href="http://localhost:3001" class="btn btn-approve">✅ View & Approve in Dashboard</a>
          </div>

          <p style="text-align: center; margin-top: 20px; color: #78350f;">
            <strong>Action required within 10 minutes or will auto-escalate</strong>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'AutoFlow <noreply@autoflow.dev>',
    to: process.env.EMAIL_TO || process.env.EMAIL_USER,
    subject: `⏸️ APPROVAL REQUIRED: ${approvalRequest.event.message}`,
    html: htmlContent,
    priority: 'high'
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Approval email sent:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('❌ Failed to send approval email:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send workflow completion notification
 */
export async function sendCompletionEmail(eventData, result) {
  if (!EMAIL_ENABLED) {
    return { success: false, reason: 'Email disabled' };
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { 
          background: #10b981;
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
        }
        .content { 
          background: #f7fafc;
          padding: 20px;
          border-radius: 0 0 8px 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Workflow Completed</h1>
        </div>
        <div class="content">
          <p><strong>Event:</strong> ${eventData.message}</p>
          <p><strong>Status:</strong> ${result.verification?.status || 'completed'}</p>
          <p><strong>Summary:</strong> ${result.summary}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `✅ Resolved: ${eventData.message}`,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Completion email sent');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send completion email:', error.message);
    return { success: false, error: error.message };
  }
}