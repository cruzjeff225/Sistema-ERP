import { Global, Module } from "@nestjs/common";
import { CompanyScopeService } from "../../../common/services/company-scope.service";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService, CompanyScopeService],
  exports: [PrismaService, CompanyScopeService],
})
export class PrismaModule {}
