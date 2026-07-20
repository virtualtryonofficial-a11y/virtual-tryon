import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { TenantGuard } from '../../guards/tenant.guard';
import { OtpService } from './otp.service';
import { ResendOtpDto, VerifyOtpDto } from './otp.dto';

@Controller('v1/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('resend')
  @UseGuards(TenantGuard)
  @SkipThrottle({ tryon: true })
  @Throttle({ standard: { limit: 10, ttl: 60000 }, burst: { limit: 2, ttl: 1000 } })
  async resendOtp(@Body() dto: ResendOtpDto, @Req() req: any) {
    const tenantId = req.tenant.id;
    return this.otpService.resendOtp(tenantId, dto.otpSessionId);
  }

  @Post('verify')
  @UseGuards(TenantGuard)
  @SkipThrottle({ tryon: true })
  @Throttle({ standard: { limit: 15, ttl: 60000 }, burst: { limit: 3, ttl: 1000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: any) {
    const tenantId = req.tenant.id;
    return this.otpService.verifyOtp(tenantId, dto.otpSessionId, dto.otp);
  }
}
