import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './store/useStore';
import TryOnButton from './components/TryOnButton';
import Modal from './components/Modal';
import { checkCustomerSession } from './utils/api';

interface TryOnAppProps {
  tenantId: string;
  productId: string;
}

const MOCK_CONFIG = {
  primaryColor: '#FF5A5F',
  complimentTone: 'friendly',
  features: ['tryon']
};

const TryOnApp: React.FC<TryOnAppProps> = ({ tenantId, productId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { config, setConfig, runtimeConfig, setIsTrusted } = useStore();

  useEffect(() => {
    const fetchConfig = async () => {
      if (runtimeConfig.debug) {
        console.log('TryOnWidget: Fetching config from', `${runtimeConfig.apiUrl}/v1/tenant/${tenantId}/config`);
      }

      try {
        const response = await fetch(`${runtimeConfig.apiUrl}/v1/tenant/${tenantId}/config`, {
          headers: {
            'x-tenant-api-key': runtimeConfig.tenantApiKey,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch config');
        const data = await response.json();
        if (runtimeConfig.debug) console.log('TryOnWidget: Config loaded', data);
        setConfig(data);
      } catch (error) {
        console.error('TryOnWidget: Config fetch failed', error);
        if (runtimeConfig.useMock) {
          if (runtimeConfig.debug) console.log('TryOnWidget: Using mock config');
          setConfig(MOCK_CONFIG);
        }
      }
    };

    if (runtimeConfig.apiUrl || runtimeConfig.useMock) {
      fetchConfig();
    }
  }, [tenantId, setConfig, runtimeConfig.apiUrl, runtimeConfig.useMock, runtimeConfig.debug]);

  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem(`vt_trust_token_${tenantId}`);
      if (token && (runtimeConfig.apiUrl || runtimeConfig.useMock)) {
        try {
          const res = await checkCustomerSession(tenantId, token);
          if (res.trusted) {
            setIsTrusted(true);
            if (res.rotatedToken) {
              localStorage.setItem(`vt_trust_token_${tenantId}`, res.rotatedToken);
              if (runtimeConfig.debug) console.log('TryOnWidget: Session token successfully rotated');
            }
            if (runtimeConfig.debug) console.log('TryOnWidget: Trusted session recognized');
          }
        } catch (e) {
          // Token invalid, remove it
          localStorage.removeItem(`vt_trust_token_${tenantId}`);
          if (runtimeConfig.debug) console.log('TryOnWidget: Trusted session check failed');
        }
      }
    };
    verifySession();
  }, [tenantId, runtimeConfig.apiUrl, runtimeConfig.useMock, runtimeConfig.debug, setIsTrusted]);

  if (!config) return null;

  return (
    <div className="tryon-widget-container">
      <TryOnButton onClick={() => setIsModalOpen(true)} />
      <AnimatePresence>
        {isModalOpen && (
          <Modal
            key="modal"
            onClose={() => setIsModalOpen(false)}
            productId={productId}
            tenantId={tenantId}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default TryOnApp;
