import dotenv from 'dotenv';
dotenv.config();

console.log('Testing .env loading...');
console.log('API Key found:', !!process.env.ANTHROPIC_API_KEY);
console.log('API Key value:', process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...');