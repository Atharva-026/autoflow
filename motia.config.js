import { defineConfig } from '@motiadev/core';

export default defineConfig({
  name: 'autoflow',
  version: '1.0.0',
  
  plugins: [
    // Enable API endpoints
    '@motiadev/plugin-endpoint',
    
    // Enable job queue (for background jobs)
    '@motiadev/plugin-bullmq',
    
    // Enable observability (logs, traces)
    '@motiadev/plugin-observability',
    
    // Enable state management
    '@motiadev/plugin-states',
    
    // Enable logging
    '@motiadev/plugin-logs'
  ],
  
  // Define your workflows directory
  workflows: './workflows',
  
  // Define your API routes directory  
  api: './api',
  
  // Define your steps directory
  steps: './steps',
  
  // Environment variables
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    MOTIA_ENV: process.env.MOTIA_ENV || 'development'
  }
});