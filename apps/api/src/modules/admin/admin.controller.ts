import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../guards/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('tenants')
  async getTenants() {
    return this.adminService.getTenants();
  }

  @Post('tenants')
  async createTenant(
    @Body()
    body: {
      name: string;
      shopifyDomain: string;
      features?: string[];
      primaryColor?: string;
      complimentTone?: string;
      segmindModel?: string;
      logoUrl?: string;
    }
  ) {
    return this.adminService.createTenant(body);
  }

  @Get('requests')
  async getRequests(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string
  ) {
    return this.adminService.getRequests({ tenantId, status });
  }

  @Get('analytics')
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }

  @Get('costs')
  async getCosts() {
    return this.adminService.getCosts();
  }
}
