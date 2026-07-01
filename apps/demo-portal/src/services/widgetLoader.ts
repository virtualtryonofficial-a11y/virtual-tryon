import type { BrandConfig, ProductConfig } from '../types';

let scriptLoadingPromise: Promise<void> | null = null;

export function loadWidgetScript(): Promise<void> {
  if (window.TryOnWidget) {
    return Promise.resolve();
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    
    // Configurable widget URL (falls back to localhost widget dev server or a generic path)
    const widgetUrl = 
      import.meta.env.VITE_WIDGET_URL || 
      'https://virtual-tryon-api-service.onrender.com/widget.js'; // Fallback to public widget delivery

    script.src = widgetUrl;
    script.type = 'module';
    script.async = true;

    script.onload = () => {
      console.log('DemoPortal: TryOnWidget script loaded successfully.');
      resolve();
    };

    script.onerror = (err) => {
      console.error('DemoPortal: Failed to load TryOnWidget script.', err);
      scriptLoadingPromise = null;
      reject(new Error('Failed to load Try-On widget script'));
    };

    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}

export async function launchTryOn(brand: BrandConfig, product: ProductConfig): Promise<void> {
  await loadWidgetScript();

  if (window.TryOnWidget) {
    const apiUrl = import.meta.env.VITE_API_URL || 'https://virtual-tryon-api-service.onrender.com';
    
    console.log(`DemoPortal: Initializing Try-On for tenant: ${brand.tenantId}, product: ${product.shopifyProductId}`);
    
    window.TryOnWidget.init({
      tenantId: brand.tenantId,
      productId: product.shopifyProductId,
      tenantApiKey: brand.publicWidgetKey,
      apiUrl: apiUrl,
      debug: true
    });
  } else {
    throw new Error('TryOnWidget library is not loaded on window.');
  }
}
