import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './modules/auth/presentation/decorators/public.decorator';
import { PrismaService } from './infrastructure/database/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Public() @Get()
  live() { return { status: 'ok' }; }
  @Public() @Get('ready')
  async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`;return {status:'ready'}; }
    catch { throw new ServiceUnavailableException('El servicio aún no está disponible'); }
  }
}
