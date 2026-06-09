import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from "@sentry/browser";
import TryOnApp from './TryOnApp';
import { useStore } from './store/useStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN_WIDGET) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN_WIDGET,
    sendDefaultPii: false, // Strict: never log secrets/PII by default
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 1.0,
    tracePropagationTargets: ["localhost", /onrender\.com/, /cloudflare\.com/],
  });
}

declare global {
  interface Window {
    TryOnWidget: {
      init: (options: {
        tenantId: string;
        productId: string;
        tenantApiKey: string;
        apiUrl?: string;
        useMock?: boolean;
        debug?: boolean;
      }) => void;
    };
    Shopify?: {
      shop: string;
    };
    meta?: {
      product?: {
        id: number | string;
      };
    };
  }
}

window.TryOnWidget = {
  init: (options) => {
    const { tenantId, productId, tenantApiKey, apiUrl, useMock, debug } = options;

    // Runtime validation
    if (!tenantId) throw new Error('TryOnWidget: tenantId is required');
    if (!productId) throw new Error('TryOnWidget: productId is required');

    const store = useStore.getState();
    const finalUseMock = useMock ?? store.runtimeConfig.useMock;
    const finalApiUrl = apiUrl ?? store.runtimeConfig.apiUrl;

    if (!finalUseMock) {
      if (!finalApiUrl) throw new Error('TryOnWidget: apiUrl is required when useMock is false');
      if (!tenantApiKey) throw new Error('TryOnWidget: tenantApiKey is required when useMock is false');
    }

    // Update store with runtime config and identifiers
    store.setRuntimeConfig({
      apiUrl: finalApiUrl,
      useMock: finalUseMock,
      debug: debug ?? store.runtimeConfig.debug,
      tenantApiKey: tenantApiKey || '',
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
        <ErrorBoundary tenantId={tenantId} productId={productId}>
          <TryOnApp tenantId={tenantId} productId={productId} />
        </ErrorBoundary>
      </React.StrictMode>
    );
  },
};

// Automatic Bootstrapping for Shopify Storefronts
if (typeof window !== 'undefined') {
  const bootstrapShopifyWidget = () => {
    if (window.Shopify && window.meta && window.meta.product && window.meta.product.id) {
      const shop = window.Shopify.shop || window.location.hostname;
      const tenantId = shop.replace('.myshopify.com', '').toLowerCase();
      const productId = window.meta.product.id.toString();

      // Resolve API URL and tenant API key from the script src URL.
      // The script tag should be injected as:
      //   <script src="https://cdn.../widget.js?tk=<tenantApiKey>"></script>
      let apiUrl = import.meta.env.VITE_API_URL || '';
      let tenantApiKey = '';
      if (document.currentScript) {
        try {
          const src = (document.currentScript as HTMLScriptElement).src;
          const url = new URL(src);
          tenantApiKey = url.searchParams.get('tk') || '';
          if (!apiUrl && !url.origin.includes('virtual-trail-widget.onrender.com')) {
            apiUrl = url.origin;
          }
        } catch (e) {
          // Fallback if URL parsing fails
        }
      }

      if (!apiUrl) {
        apiUrl = 'https://virtual-trail-api.onrender.com';
      }

      console.log(`TryOnWidget: Auto-bootstrap triggered for shop: ${shop}, product: ${productId}`);
      window.TryOnWidget.init({
        tenantId,
        productId,
        tenantApiKey,
        apiUrl,
        debug: true,
      });
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    bootstrapShopifyWidget();
  } else {
    window.addEventListener('DOMContentLoaded', bootstrapShopifyWidget);
  }
}
