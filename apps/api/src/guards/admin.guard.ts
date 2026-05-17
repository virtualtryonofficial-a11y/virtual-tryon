import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { config } from '@trail/config';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-admin-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Admin API Key is missing');
    }

    if (apiKey !== config.admin.apiKey) {
      throw new UnauthorizedException('Invalid Admin API Key');
    }

    return true;
  }
}
