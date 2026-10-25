import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';
@Global()
@Module({ imports: [AuditModule], controllers: [TrashController], providers: [TrashService], exports: [TrashService] })
export class TrashModule {
}
