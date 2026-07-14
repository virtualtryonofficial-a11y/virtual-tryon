import { create } from 'zustand';

export type WidgetStatus = 'idle' | 'uploading' | 'queued' | 'polling' | 'awaiting_lead' | 'sending_otp' | 'awaiting_otp' | 'verifying_otp' | 'unlocking' | 'completed' | 'failed' | 'timeout';

interface WidgetState {
  status: WidgetStatus;
  jobId: string | null;
  userImage: string | null;
  resultImage: string | null;
  previewImageUrl: string | null;
  unlockToken: string | null;
  otpSessionId: string | null;
  expiresAt: string | null;
  resendAfter: number | null;
  maskedPhone: string | null;
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
    leadCapture?: {
      title?: string;
      subtitle?: string;
      consentText?: string;
      fields?: string[];
      otpVerification?: {
        enabled: boolean;
        otpLength: number;
        expirySeconds: number;
        maxAttempts: number;
        maxResends: number;
        resendCooldown: number;
        maskPhone: boolean;
        autoSubmit: boolean;
      };
    };
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
  setAwaitingLead: (data: { previewImageUrl: string; unlockToken: string }) => void;
  setOtpSession: (data: { otpSessionId: string; expiresAt: string; resendAfter: number; maskedPhone: string }) => void;
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
  previewImageUrl: null,
  unlockToken: null,
  otpSessionId: null,
  expiresAt: null,
  resendAfter: null,
  maskedPhone: null,
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
  setAwaitingLead: (data) => set({
    previewImageUrl: data.previewImageUrl,
    unlockToken: data.unlockToken,
    status: 'awaiting_lead'
  }),
  setOtpSession: (data) => set({
    otpSessionId: data.otpSessionId,
    expiresAt: data.expiresAt,
    resendAfter: data.resendAfter,
    maskedPhone: data.maskedPhone,
    status: 'awaiting_otp'
  }),
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
    previewImageUrl: null,
    unlockToken: null,
    otpSessionId: null,
    expiresAt: null,
    resendAfter: null,
    maskedPhone: null,
    compliment: null,
    styleScore: null,
    error: null,
  })),
}));
