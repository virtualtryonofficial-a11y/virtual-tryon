import { Controller, Get, Delete, Req, UnauthorizedException } from '@nestjs/common';
import { CustomerService } from './customer.service';

@Controller('v1/customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get('session')
  async getSession(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    const authHeader = req.headers.authorization;
    if (!tenantId || !authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token or tenant');
    }
    const token = authHeader.split(' ')[1];
    
    return this.customerService.validateSession(tenantId, token);
  }

  @Delete('session')
  async deleteSession(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    const authHeader = req.headers.authorization;
    if (!tenantId || !authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token or tenant');
    }
    const token = authHeader.split(' ')[1];
    
    return this.customerService.revokeSession(tenantId, token);
  }
}
