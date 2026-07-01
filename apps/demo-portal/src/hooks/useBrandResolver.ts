import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { BrandConfig } from '../types';
import { applyBrandMeta, resetMeta } from '../services/metaService';

export function useBrandResolver() {
  const { brandId: pathBrandId } = useParams<{ brandId: string }>();
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Resolve Brand ID (Subdomain first, then path parameter)
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    
    // Subdomain routing checks: e.g., effilo.demo.virtualtrail.local
    // Ignore generic subdomains like 'www', 'demo', or localhost hostname
    let resolvedBrandId = pathBrandId;
    if (parts.length > 2 && parts[0] !== 'www' && parts[0] !== 'demo' && !hostname.includes('localhost')) {
      resolvedBrandId = parts[0];
    }

    if (!resolvedBrandId) {
      setBrand(null);
      setError('No brand specified');
      setLoading(false);
      resetMeta();
      return;
    }

    const brandKey = resolvedBrandId.toLowerCase();
    
    const fetchBrandConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/assets/brands/${brandKey}/config.json`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Brand "${resolvedBrandId}" is not configured in the demo platform`);
          }
          throw new Error('Failed to load brand configuration');
        }
        
        const configData: BrandConfig = await response.json();
        
        // Validate Config Schema Version
        if (configData.schemaVersion !== 1) {
          console.warn(`DemoPortal: Schema version mismatch for brand ${brandKey}. Expected 1, found ${configData.schemaVersion}`);
        }
        
        // Inject ID explicitly if missing
        if (!configData.id) {
          configData.id = brandKey;
        }

        setBrand(configData);
        applyBrandMeta(configData);
      } catch (err: any) {
        console.error('DemoPortal: Resolver error:', err);
        setError(err.message || 'An error occurred while resolving the brand');
        setBrand(null);
        resetMeta();
      } finally {
        setLoading(false);
      }
    };

    fetchBrandConfig();
  }, [pathBrandId]);

  return { brand, loading, error };
}
