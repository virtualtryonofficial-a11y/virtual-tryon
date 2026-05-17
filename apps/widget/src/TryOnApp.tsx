import React, { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import TryOnButton from './components/TryOnButton';
import Modal from './components/Modal';

interface TryOnAppProps {
  tenantId: string;
  productId: string;
}

const MOCK_CONFIG = {
  primaryColor: '#000000',
  complimentTone: 'friendly',
  features: ['tryon']
};

const TryOnApp: React.FC<TryOnAppProps> = ({ tenantId, productId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { config, setConfig, runtimeConfig } = useStore();

  useEffect(() => {
    const fetchConfig = async () => {
      if (runtimeConfig.debug) {
        console.log('TryOnWidget: Fetching config from', `${runtimeConfig.apiUrl}/v1/tenant/${tenantId}/config`);
      }

      try {
        const response = await fetch(`${runtimeConfig.apiUrl}/v1/tenant/${tenantId}/config`);
        if (!response.ok) throw new Error('Failed to fetch config');
        const data = await response.json();
        
        if (runtimeConfig.debug) {
          console.log('TryOnWidget: Config loaded', data);
        }
        setConfig(data);
      } catch (error) {
        console.error('TryOnWidget: Config fetch failed', error);
        if (runtimeConfig.useMock) {
          if (runtimeConfig.debug) {
            console.log('TryOnWidget: Using mock config');
          }
          setConfig(MOCK_CONFIG);
        }
      }
    };

    if (runtimeConfig.apiUrl || runtimeConfig.useMock) {
      fetchConfig();
    }
  }, [tenantId, setConfig, runtimeConfig.apiUrl, runtimeConfig.useMock, runtimeConfig.debug]);

  if (!config) return null;

  return (
    <div className="tryon-widget-container">
      <TryOnButton onClick={() => setIsModalOpen(true)} />
      {isModalOpen && <Modal onClose={() => setIsModalOpen(false)} productId={productId} tenantId={tenantId} />}
    </div>
  );
};

export default TryOnApp;
