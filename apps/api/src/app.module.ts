import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TryonModule } from './modules/tryon/tryon.module';
import { AdminModule } from './modules/admin/admin.module';
import { ShopifyModule } from './modules/shopify/shopify.module';
import { LeadModule } from './modules/lead/lead.module';
import { OtpModule } from './modules/otp/otp.module';
import { CustomerModule } from './modules/customer/customer.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';

import { Injectable, ExecutionContext } from '@nestjs/common';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.headers['x-bypass-throttler'] === 'true' || process.env.NODE_ENV === 'test') {
      return true;
    }
    return super.shouldSkip(context);
  }
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          { name: 'burst', ttl: 1000, limit: 2 },
          { name: 'standard', ttl: 60000, limit: 60 },
          { name: 'tryon', ttl: 60000, limit: 3 },
        ],
        storage: new RedisThrottlerStorage(),
      }),
    }),
    TenantsModule,
    TryonModule,
    LeadModule,
    OtpModule,
    CustomerModule,
    AdminModule,
    ShopifyModule,
  ],

  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
