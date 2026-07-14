import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@trail/db';

@Injectable()
export class OtpRepository {
  async createSession(data: Prisma.OtpSessionUncheckedCreateInput) {
    return prisma.otpSession.create({ data });
  }

  async getSession(id: string) {
    return prisma.otpSession.findUnique({
      where: { id },
    });
  }

  async getSessionByTryon(tryonRequestId: string) {
    return prisma.otpSession.findUnique({
      where: { tryonRequestId },
    });
  }

  async updateSession(id: string, data: Prisma.OtpSessionUpdateInput) {
    return prisma.otpSession.update({
      where: { id },
      data,
    });
  }

  async deleteSession(id: string) {
    return prisma.otpSession.delete({
      where: { id },
    });
  }

  async deleteExpiredSessions() {
    const now = new Date();
    return prisma.otpSession.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
  }
}
