export interface ProductConfig {
  id: string;
  shopifyProductId: string;
  name: string;
  price: string;
  imageUrl: string;
}

export interface BrandTheme {
  primaryColor: string;
  accentColor: string;
  widgetTheme?: 'light' | 'dark' | 'glassmorphism';
}

export interface BrandConfig {
  schemaVersion: number;
  lastUpdated: string;
  id: string;
  name: string;
  welcomeTitle: string;
  description: string;
  tenantId: string;
  publicWidgetKey: string;
  logoUrl: string;
  bannerUrl: string;
  theme: BrandTheme;
  products: ProductConfig[];
}

export interface DemoSettings {
  maxTryOnsPerSession: number;
  downloadEnabled: boolean;
  showDemoBanner: boolean;
  bannerText: string;
}

// Global declaration for window.TryOnWidget to bypass TypeScript validation on window properties
declare global {
  interface Window {
    TryOnWidget?: {
      init: (options: {
        tenantId: string;
        productId: string;
        tenantApiKey: string;
        apiUrl?: string;
        useMock?: boolean;
        debug?: boolean;
      }) => void;
    };
  }
}
