import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { getTryOnStatus } from '../utils/api';

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 80;

const usePolling = (tenantId: string, jobId: string | null) => {
  const { setResult, setError, setStatus, setAwaitingLead } = useStore();
  const attemptsRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!jobId || !tenantId) return;

    const poll = async () => {
      try {
        attemptsRef.current += 1;
        
        if (attemptsRef.current > MAX_ATTEMPTS) {
          setError('Processing timed out. Please try again.');
          setStatus('timeout');
          return;
        }

        const data = await getTryOnStatus(tenantId, jobId);

        if (data.status === 'awaiting_lead') {
          setAwaitingLead({
            previewImageUrl: data.previewImageUrl || data.previewImage || '',
            unlockToken: data.unlockToken || '',
          });
          return;
        }

        if (data.status === 'unlocked' || data.status === 'completed') {
          setResult({
            image: data.imageUrl,
            compliment: data.compliment,
            score: data.styleScore,
          });
          return;
        }

        if (data.status === 'failed') {
          setError(data.errorMessage || 'AI generation failed');
          return;
        }

        // Continue polling
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err: any) {
        console.error('Polling error:', err);
        // Don't fail immediately on network error, keep trying
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    setStatus('polling');
    poll();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [jobId, tenantId, setResult, setError, setStatus, setAwaitingLead]);
};

export default usePolling;
