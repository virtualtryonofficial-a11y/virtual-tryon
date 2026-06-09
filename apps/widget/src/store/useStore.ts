import { create } from 'zustand';

export type WidgetStatus = 'idle' | 'uploading' | 'queued' | 'polling' | 'completed' | 'failed' | 'timeout';

interface WidgetState {
  status: WidgetStatus;
  jobId: string | null;
  userImage: string | null;
  resultImage: string | null;
  compliment: string | null;
  styleScore: number | null;
  error: string | null;
  tenantId: string | null;
  productId: string | null;
  config: {
    primaryColor: string;
    complimentTone: string;
    logoUrl?: string | null;
    buttonStyle?: string;
    widgetTheme?: string;
    features: string[];
  } | null;
  runtimeConfig: {
    apiUrl: string;
    useMock: boolean;
    debug: boolean;
    tenantApiKey: string;
  };

  // Actions
  setStatus: (status: WidgetStatus) => void;
  setJobId: (id: string | null) => void;
  setUserImage: (image: string | null) => void;
  setResult: (data: { image: string; compliment: string; score: number }) => void;
  setError: (error: string | null) => void;
  setConfig: (config: WidgetState['config']) => void;
  setRuntimeConfig: (config: Partial<WidgetState['runtimeConfig']>) => void;
  setIdentifiers: (data: { tenantId: string; productId: string }) => void;
  reset: () => void;
}

export const useStore = create<WidgetState>((set) => ({
  status: 'idle',
  jobId: null,
  userImage: null,
  resultImage: null,
  compliment: null,
  styleScore: null,
  error: null,
  tenantId: null,
  productId: null,
  config: null,
  runtimeConfig: {
    apiUrl: '',
    useMock: false,
    debug: false,
    tenantApiKey: '',
  },

  setStatus: (status) => set({ status }),
  setJobId: (jobId) => set({ jobId }),
  setUserImage: (userImage) => set({ userImage }),
  setResult: (data) => set({
    resultImage: data.image,
    compliment: data.compliment,
    styleScore: data.score,
    status: 'completed',
  }),
  setError: (error) => set({ error, status: 'failed' }),
  setConfig: (config) => set({ config }),
  setRuntimeConfig: (config) => set((state) => ({
    runtimeConfig: { ...state.runtimeConfig, ...config }
  })),
  setIdentifiers: (data) => set({ tenantId: data.tenantId, productId: data.productId }),
  reset: () => set((state) => ({
    status: 'idle',
    jobId: null,
    userImage: null,
    resultImage: null,
    compliment: null,
    styleScore: null,
    error: null,
  })),
}));
