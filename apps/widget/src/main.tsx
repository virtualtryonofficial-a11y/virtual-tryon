import React from 'react';
import ReactDOM from 'react-dom/client';
import TryOnApp from './TryOnApp';
import { useStore } from './store/useStore';
import './index.css';

declare global {
  interface Window {
    TryOnWidget: {
      init: (options: {
        tenantId: string;
        productId: string;
        apiUrl?: string;
        useMock?: boolean;
        debug?: boolean;
      }) => void;
    };
  }
}

window.TryOnWidget = {
  init: (options) => {
    const { tenantId, productId, apiUrl, useMock, debug } = options;

    // Runtime validation
    if (!tenantId) throw new Error('TryOnWidget: tenantId is required');
    if (!productId) throw new Error('TryOnWidget: productId is required');

    const store = useStore.getState();
    const finalUseMock = useMock ?? store.runtimeConfig.useMock;
    const finalApiUrl = apiUrl ?? store.runtimeConfig.apiUrl;

    if (!finalUseMock && !finalApiUrl) {
      throw new Error('TryOnWidget: apiUrl is required when useMock is false');
    }

    // Update store with runtime config and identifiers
    store.setRuntimeConfig({
      apiUrl: finalApiUrl,
      useMock: finalUseMock,
      debug: debug ?? store.runtimeConfig.debug,
    });

    store.setIdentifiers({ tenantId, productId });

    if (debug) {
      console.log('TryOnWidget: Initialized with', { tenantId, productId, apiUrl: finalApiUrl, useMock: finalUseMock });
    }

    const containerId = 'trail-tryon-widget-root';
    let container = document.getElementById(containerId);

    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'tryon-widget-container';
      document.body.appendChild(container);
    }

    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <TryOnApp tenantId={tenantId} productId={productId} />
      </React.StrictMode>
    );
  },
};
