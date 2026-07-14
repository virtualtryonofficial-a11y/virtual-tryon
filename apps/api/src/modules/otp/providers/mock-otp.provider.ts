import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider, OtpProviderResponse } from '../otp.interface';
import * as crypto from 'crypto';

@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly logger = new Logger(MockOtpProvider.name);

  async sendOtp(
    phoneNumber: string,
    countryCode: string,
    otp: string,
    tenantName: string,
    brandName?: string,
    logoUrl?: string
  ): Promise<OtpProviderResponse> {
    if (process.env.OTP_DEBUG === 'true') {
      this.logger.log(
        `[MockOtpProvider] OTP code is: ${otp} (Sent to ${countryCode}${phoneNumber}) for brand: ${brandName || tenantName}`
      );
    } else {
      this.logger.log(
        `[MockOtpProvider] OTP sent successfully to ${countryCode}${phoneNumber} (OTP logging hidden: OTP_DEBUG !== true)`
      );
    }

    return {
      otpId: crypto.randomUUID(),
      provider: 'mock',
      status: 'sent',
      createdAt: new Date(),
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
