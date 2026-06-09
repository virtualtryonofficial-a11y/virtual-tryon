import { useStore } from '../store/useStore';
import { resizeImageBeforeUpload } from './image';

const MOCK_STATE: Record<string, number> = {};

export async function startTryOn(tenantId: string, productId: string, userImage: string): Promise<string> {
  const { runtimeConfig } = useStore.getState();

  if (runtimeConfig.useMock) {
    if (runtimeConfig.debug) {
      console.log('TryOnWidget: [MOCK] Starting try-on for', productId);
    }
    const jobId = 'mock-job-' + Math.random().toString(36).substring(7);
    MOCK_STATE[jobId] = 0;
    return jobId;
  }

  // Optimize base64 image client-side before sending to save network costs and upload time
  let optimizedImage = userImage;
  try {
    if (runtimeConfig.debug) {
      console.log('TryOnWidget: Optimizing user upload via canvas resizing...');
    }
    optimizedImage = await resizeImageBeforeUpload(userImage);
    if (runtimeConfig.debug) {
      const originalSize = Math.round((userImage.length * 3) / 4);
      const optSize = Math.round((optimizedImage.length * 3) / 4);
      const ratio = ((1 - optSize / originalSize) * 100).toFixed(2);
      console.log(`TryOnWidget: Optimization complete. Original: ${originalSize}B, Optimized: ${optSize}B (Saved ${ratio}%)`);
    }
  } catch (err: any) {
    if (runtimeConfig.debug) {
      console.warn('TryOnWidget: Resizing failed, falling back to original payload size:', err.message);
    }
  }

  if (runtimeConfig.debug) {
    console.log('TryOnWidget: Starting try-on at', `${runtimeConfig.apiUrl}/v1/tryon`);
  }

  const response = await fetch(`${runtimeConfig.apiUrl}/v1/tryon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      productId,
      tenantApiKey: runtimeConfig.tenantApiKey,
      userImage: optimizedImage,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to start try-on');
  }

  const data = await response.json();
  return data.jobId;
}

export async function getTryOnStatus(tenantId: string, jobId: string) {
  const { runtimeConfig } = useStore.getState();

  if (runtimeConfig.useMock && jobId.startsWith('mock-job')) {
    await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network latency
    
    const count = MOCK_STATE[jobId] || 0;
    MOCK_STATE[jobId] = count + 1;

    if (runtimeConfig.debug) {
      console.log(`TryOnWidget: [MOCK] Polling ${jobId}, attempt: ${count}`);
    }

    if (count < 4) { // Complete after 4 polls
      return { status: 'processing' };
    }

    return {
      status: 'completed',
      imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000',
      compliment: "This outfit perfectly complements your style! The fit is impeccable and the color palette really makes the look pop.",
      styleScore: 9.2,
      complimentCached: false
    };
  }

  if (runtimeConfig.debug) {
    console.log(`TryOnWidget: Polling ${jobId} at ${runtimeConfig.apiUrl}`);
  }

  const response = await fetch(
    `${runtimeConfig.apiUrl}/v1/tryon/${jobId}?tenantId=${tenantId}&tenantApiKey=${encodeURIComponent(runtimeConfig.tenantApiKey)}`
  );
  if (!response.ok) throw new Error('Failed to fetch status');
  return await response.json();
}
