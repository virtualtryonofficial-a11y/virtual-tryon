import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

async function runE2ETest() {
  console.log('--- STARTING END-TO-END PIPELINE TEST ---');

  const personImagePath = 'd:/Projects/Virtual-Trail/test-assets/good/person1.jpg';
  if (!fs.existsSync(personImagePath)) {
    throw new Error(`Person image not found at ${personImagePath}`);
  }

  console.log('Reading test image and converting to base64...');
  const imageBuffer = fs.readFileSync(personImagePath);
  const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

  const payload = {
    tenantId: 'demo-tenant',
    productId: 'premium-jacket',
    userImage: base64Image,
  };

  console.log('Sending POST request to local API (http://localhost:3000/v1/tryon)...');
  const postRes = await axios.post('http://localhost:3000/v1/tryon', payload, {
    headers: {
      'Content-Type': 'application/json',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const { jobId } = postRes.data;
  console.log(`✓ Job accepted successfully. Job ID: ${jobId}`);

  console.log('Starting status polling...');
  let attempts = 0;
  const maxAttempts = 90; // 180 seconds max
  let completed = false;

  while (attempts < maxAttempts && !completed) {
    attempts++;
    console.log(`Polling attempt ${attempts}/${maxAttempts}...`);
    
    const getRes = await axios.get(`http://localhost:3000/v1/tryon/${jobId}?tenantId=demo-tenant`);
    const statusData = getRes.data;

    console.log(`Status: ${statusData.status}`);

    if (statusData.status === 'completed') {
      completed = true;
      console.log('\n--- E2E PIPELINE SUCCESS ---');
      console.log('Output Image URL:', statusData.imageUrl);
      console.log('Compliment:', statusData.compliment);
      console.log('Style Score:', statusData.styleScore);
      break;
    } else if (statusData.status === 'failed') {
      console.error('\n--- E2E PIPELINE FAILED ---');
      console.error('API Error Response:', statusData);
      throw new Error(`Job ${jobId} failed to process`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!completed) {
    throw new Error('E2E pipeline test timed out');
  }
}

runE2ETest().catch((err: any) => {
  console.error('✗ E2E Test failed:', err.response?.data || err.message);
  process.exit(1);
});
