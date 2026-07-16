import { Controller, Post, Get, Body, Param, Query, UseGuards, Req, Inject } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { TenantGuard } from '../../guards/tenant.guard';
import { TryonService } from './tryon.service';
import { CreateTryonDto, TryonResponse, TryonStatusResponse } from './tryon.dto';

@Controller('v1/tryon')
export class TryonController {
  constructor(@Inject(TryonService) private tryonService: TryonService) {
    // Defensive: instantiate directly if DI fails (reflect-metadata timing)
    if (!this.tryonService) {
      this.tryonService = new TryonService();
    }
  }

  @Post()
  @UseGuards(TenantGuard)
  @Throttle({ tryon: { limit: 3, ttl: 60000 }, burst: { limit: 2, ttl: 1000 } })
  async create(
    @Body() dto: CreateTryonDto,
    @Req() req: any,
  ): Promise<TryonResponse> {
    const requestId = req.requestId;
    
    let sessionToken = undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.split(' ')[1];
    }
    
    return this.tryonService.create(dto, requestId, sessionToken);
  }

  @Get(':jobId')
  @UseGuards(TenantGuard)
  @SkipThrottle({ burst: true, standard: true, tryon: true })
  async getStatus(
    @Param('jobId') jobId: string,
    @Query('tenantId') tenantId: string,
  ): Promise<TryonStatusResponse> {
    return this.tryonService.getStatus(jobId, tenantId);
  }
}
