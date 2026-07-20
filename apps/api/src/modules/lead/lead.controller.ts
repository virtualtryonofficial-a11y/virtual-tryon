import { Controller, Post, Get, Body, Query, UseGuards, Req, Inject } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { TenantGuard } from '../../guards/tenant.guard';
import { LeadService } from './lead.service';
import { CreateLeadDto, UnlockTryonDto, LeadResponse, TrackEventDto } from './lead.dto';

@Controller('v1')
export class LeadController {
  constructor(@Inject(LeadService) private readonly leadService: LeadService) {
    if (!this.leadService) {
      this.leadService = new LeadService();
    }
  }

  @Post('leads')
  @UseGuards(TenantGuard)
  @SkipThrottle({ tryon: true })
  @Throttle({ standard: { limit: 20, ttl: 60000 }, burst: { limit: 5, ttl: 1000 } })
  async createLead(@Body() dto: CreateLeadDto, @Req() req: any): Promise<LeadResponse> {
    const tenantId = req.tenant.id;
    return this.leadService.createOrUpdateLead(tenantId, dto);
  }

  @Post('events')
  @UseGuards(TenantGuard)
  @SkipThrottle({ tryon: true })
  @Throttle({ standard: { limit: 100, ttl: 60000 }, burst: { limit: 20, ttl: 1000 } })
  async trackEvent(@Body() dto: TrackEventDto, @Req() req: any) {
    const tenantId = req.tenant.id;
    return this.leadService.trackEvent(tenantId, dto);
  }

  @Post('tryon/unlock')
  @UseGuards(TenantGuard)
  @SkipThrottle({ tryon: true })
  @Throttle({ standard: { limit: 30, ttl: 60000 }, burst: { limit: 5, ttl: 1000 } })
  async unlockTryon(@Body() dto: UnlockTryonDto, @Req() req: any) {
    const tenantId = req.tenant.id;
    return this.leadService.unlockTryon(tenantId, dto);
  }

  @Get('leads')
  @UseGuards(TenantGuard)
  @SkipThrottle({ burst: true, standard: true, tryon: true })
  async getLeads(
    @Req() req: any,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
  ) {
    const tenantId = req.tenant.id;
    return this.leadService.getLeadsByTenant(tenantId, { productId, status });
  }
}
