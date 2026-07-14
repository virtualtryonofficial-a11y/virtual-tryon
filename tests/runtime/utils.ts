import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_AUTH = Buffer.from('admin:44c96cb320ce5577404265f20ff06e044595713c526d1f4c57915702469bd3b2').toString('base64'); // base64 of admin:ADMIN_API_KEY from .env

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'x-bypass-throttler': 'true',
  },
  validateStatus: () => true,
});

export const adminClient = axios.create({
  baseURL: API_URL,
  headers: {
    Authorization: `Basic ${ADMIN_AUTH}`,
    'x-bypass-throttler': 'true',
  },
  validateStatus: () => true,
});

export const logResult = (name: string, passed: boolean, error?: any) => {
  if (passed) {
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name}`);
    if (error) console.error(error);
  }
};
