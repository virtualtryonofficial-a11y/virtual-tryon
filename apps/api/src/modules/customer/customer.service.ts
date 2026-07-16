import { Injectable, UnauthorizedException } from '@nestjs/common';
import { prisma, Customer, CustomerSession } from '@trail/db';
import * as crypto from 'crypto';

@Injectable()
export class CustomerService {
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async validateSession(tenantId: string, token: string) {
    const sessionTokenHash = this.hashToken(token);
    
    const session = await prisma.customerSession.findFirst({
      where: {
        sessionTokenHash,
        isActive: true,
        customer: {
          tenantId
        }
      },
      include: {
        customer: true
      }
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const now = new Date();
    
    if (session.expiresAt && session.expiresAt.getTime() < now.getTime()) {
      await prisma.customerSession.update({
        where: { id: session.id },
        data: { isActive: false }
      });
      throw new UnauthorizedException('Session has expired');
    }

    // Session Rotation Logic (Rotate if older than 7 days)
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    let rotatedToken: string | undefined;

    if (now.getTime() - session.createdAt.getTime() > SEVEN_DAYS_MS) {
      const newToken = crypto.randomBytes(32).toString('hex');
      const newHash = this.hashToken(newToken);
      
      await prisma.$transaction([
        prisma.customerSession.update({
          where: { id: session.id },
          data: { isActive: false, revokedAt: now, lastSeenAt: now }
        }),
        prisma.customerSession.create({
          data: {
            customerId: session.customerId,
            sessionTokenHash: newHash,
            expiresAt: session.expiresAt,
            lastSeenAt: now
          }
        }),
        prisma.customer.update({
          where: { id: session.customerId },
          data: { lastSeenAt: now }
        })
      ]);
      
      rotatedToken = newToken;
    } else {
      // Update lastSeenAt for both session and customer
      await prisma.$transaction([
        prisma.customerSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now }
        }),
        prisma.customer.update({
          where: { id: session.customerId },
          data: { lastSeenAt: now }
        })
      ]);
    }

    return {
      trusted: true,
      rotatedToken,
      customer: {
        id: session.customer.id,
        // In the future, displayName could come from profile data (currently in Lead)
      },
      preferences: {
        language: session.customer.preferredLanguage || 'en'
      }
    };
  }

  async revokeSession(tenantId: string, token: string) {
    const sessionTokenHash = this.hashToken(token);
    
    const session = await prisma.customerSession.findFirst({
      where: {
        sessionTokenHash,
        customer: { tenantId }
      }
    });

    if (session) {
      await prisma.customerSession.update({
        where: { id: session.id },
        data: { isActive: false, revokedAt: new Date() }
      });
    }

    return { success: true };
  }
}
