import { Controller, Get, Param, ParseIntPipe, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AUDIT_PERMISSIONS } from "../../../../common/constants/audit-permissions.constant";
import { RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { QueryLogsDto } from "../../application/dto/query-logs.dto";
import { AuditService } from "../../application/services/audit.service";

@ApiTags("logs")
@ApiBearerAuth()
@Controller("logs")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions(AUDIT_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Consultar la bitacora con filtros" })
  async findAll(@Query() query: QueryLogsDto) {
    const result = await this.auditService.findAll(query);
    return { success: true, message: "Bitacora obtenida correctamente", data: result.items, meta: result.meta };
  }

  @RequirePermissions(AUDIT_PERMISSIONS.EXPORT)
  @Get("export")
  @ApiOperation({ summary: "Exportar la bitacora en CSV" })
  async export(@Query() query: QueryLogsDto, @Res({ passthrough: true }) response: Response) {
    const csv = await this.auditService.exportCsv(query);
    response.type("text/csv; charset=utf-8");
    response.header("Content-Disposition", `attachment; filename="bitacora-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  }

  @RequirePermissions(AUDIT_PERMISSIONS.DETAIL)
  @Get(":id")
  @ApiOperation({ summary: "Consultar el detalle de un evento" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.auditService.findOne(id);
    return { success: true, message: "Evento obtenido correctamente", data };
  }
}
