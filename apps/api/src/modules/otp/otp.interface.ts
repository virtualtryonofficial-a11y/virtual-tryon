export interface OtpProviderResponse {
  otpId: string;
  provider: string;
  status: string;
  createdAt: Date;
}

export interface OtpProvider {
  sendOtp(
    phoneNumber: string,
    countryCode: string,
    otp: string,
    tenantName: string,
    brandName?: string,
    logoUrl?: string
  ): Promise<OtpProviderResponse>;

  healthCheck(): Promise<boolean>;
}
