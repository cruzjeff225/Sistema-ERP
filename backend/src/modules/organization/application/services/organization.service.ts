import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { companyTransaction } from "../../../../common/services/company-transaction";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { CreateBranchDto } from "../dto/create-branch.dto";
import { CreateCompanyDto } from "../dto/create-company.dto";
import { CreateLocationDto } from "../dto/create-location.dto";
import { CreateWarehouseCategoryDto } from "../dto/create-warehouse-category.dto";
import { CreateWarehouseDto } from "../dto/create-warehouse.dto";
import { UpdateBranchDto } from "../dto/update-branch.dto";
import { UpdateCompanyDto } from "../dto/update-company.dto";
import { UpdateLocationDto } from "../dto/update-location.dto";
import { UpdateWarehouseCategoryDto } from "../dto/update-warehouse-category.dto";
import { UpdateWarehouseDto } from "../dto/update-warehouse.dto";
import { AuditService } from "../../../audit/application/services/audit.service";

const companyInclude = {
  department: { select: { id: true, name: true } },
  municipality: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  _count: { select: { branches: true } },
} satisfies Prisma.CompanyInclude;

const branchInclude = {
  company: { select: { id: true, name: true, commercialName: true } },
  department: { select: { id: true, name: true } },
  municipality: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  _count: { select: { warehouses: true } },
} satisfies Prisma.BranchInclude;

const warehouseInclude = {
  branch: {
    select: {
      id: true,
      name: true,
      isActive: true,
      deletedAt: true,
      company: { select: { id: true, name: true, commercialName: true } },
    },
  },
  category: { select: { id: true, name: true } },
  _count: { select: { locations: true } },
} satisfies Prisma.WarehouseInclude;

const locationInclude = {
  warehouse: {
    select: {
      id: true,
      name: true,
      branch: {
        select: {
          id: true,
          name: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.LocationInclude;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async catalogs() {
    return {
      departments: await this.prisma.department.findMany({
        where: { isActive: true },
        include: {
          municipalities: {
            where: { isActive: true },
            include: { districts: { where: { isActive: true }, orderBy: { name: "asc" } } },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
    };
  }

  countries() {
    return this.prisma.country.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isoCode: true },
      orderBy: { name: "asc" },
    });
  }

  async resolveNationalAddress(
    countryId: number,
    departmentId?: number | null,
    municipalityId?: number | null,
    districtId?: number | null,
  ) {
    const country = await this.prisma.country.findFirst({
      where: { id: countryId, isActive: true },
      select: { id: true, isoCode: true },
    });
    if (!country) throw new BadRequestException("El pais indicado no existe o esta inactivo");

    if (country.isoCode !== "SV") {
      return { countryId: country.id, departmentId: null, municipalityId: null, districtId: null };
    }
    if (!departmentId || !municipalityId || !districtId) {
      throw new BadRequestException("Para una direccion nacional debe seleccionar departamento, municipio y distrito");
    }

    await this.assertValidGeography(departmentId, municipalityId, districtId);
    return { countryId: country.id, departmentId, municipalityId, districtId };
  }

  async companies(user?: { sub: number; roles: string[] }) {
    return this.prisma.company.findMany({
      where: {
        deletedAt: null,
        ...(user && !user.roles.includes("superadmin") ? { userCompanies: { some: { userId: user.sub } } } : {}),
      },
      include: companyInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async company(id: number) {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: companyInclude,
    });
    if (!company) throw new NotFoundException("Empresa no encontrada");
    return company;
  }

  async createCompany(dto: CreateCompanyDto, userId?: number) {
    await this.assertValidGeography(dto.departmentId, dto.municipalityId, dto.districtId);
    await this.assertCompanyUnique(dto.nit, dto.nrc);

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: this.companyData(dto) as Prisma.CompanyUncheckedCreateInput,
        include: companyInclude,
      });
      if (userId) await tx.userCompany.create({ data: { userId, companyId: company.id } });
      await this.auditService.record(tx, {
        controller: "companies",
        action: "CREATE",
        recordId: company.id,
        modifiedData: company,
        userId,
      });
      return company;
    });
  }

  async updateCompany(id: number, dto: UpdateCompanyDto, userId?: number) {
    const current = await this.company(id);
    const departmentId = dto.departmentId ?? current.departmentId;
    const municipalityId = dto.municipalityId ?? current.municipalityId;
    const districtId = dto.districtId ?? current.districtId;

    await this.assertValidGeography(departmentId, municipalityId, districtId);
    if (dto.nit || dto.nrc) {
      await this.assertCompanyUnique(dto.nit ?? current.nit, dto.nrc ?? current.nrc, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: this.companyData(dto) as Prisma.CompanyUncheckedUpdateInput,
        include: companyInclude,
      });
      await this.auditService.record(tx, {
        controller: "companies",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async updateCompanyStatus(id: number, isActive: boolean, userId?: number) {
    const current = await this.company(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({ where: { id }, data: { isActive }, include: companyInclude });
      await this.auditService.record(tx, {
        controller: "companies",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async branches(companyId?: number) {
    return this.prisma.branch.findMany({
      where: { deletedAt: null, ...(companyId ? { companyId } : {}) },
      include: branchInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async branch(id: number, companyId?: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null, ...(companyId ? { companyId } : {}) },
      include: branchInclude,
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");
    return branch;
  }

  async createBranch(dto: CreateBranchDto, userId?: number, scopedCompanyId?: number) {
    if (scopedCompanyId && dto.companyId !== scopedCompanyId) {
      throw new BadRequestException("La sucursal debe pertenecer a la empresa seleccionada");
    }
    const companyId = scopedCompanyId ?? dto.companyId;
    const branchDto = { ...dto, companyId };
    await this.assertCompanyActive(companyId);
    await this.assertValidGeography(branchDto.departmentId, branchDto.municipalityId, branchDto.districtId);
    await this.assertBranchUnique(companyId, branchDto.name);

    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: this.branchData(branchDto) as Prisma.BranchUncheckedCreateInput,
        include: branchInclude,
      });
      await this.auditService.record(tx, {
        controller: "branches",
        action: "CREATE",
        recordId: branch.id,
        modifiedData: branch,
        userId,
      });
      return branch;
    });
  }

  async updateBranch(id: number, dto: UpdateBranchDto, userId?: number, scopedCompanyId?: number) {
    const current = await this.branch(id, scopedCompanyId);
    if (dto.companyId && dto.companyId !== current.companyId) {
      throw new BadRequestException("No se puede mover una sucursal entre empresas");
    }
    const companyId = current.companyId;
    const departmentId = dto.departmentId ?? current.departmentId;
    const municipalityId = dto.municipalityId ?? current.municipalityId;
    const districtId = dto.districtId ?? current.districtId;

    await this.assertCompanyActive(companyId);
    await this.assertValidGeography(departmentId, municipalityId, districtId);
    if (dto.name || dto.companyId) {
      await this.assertBranchUnique(companyId, dto.name ?? current.name, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id },
        data: this.branchData({ ...dto, companyId }) as Prisma.BranchUncheckedUpdateInput,
        include: branchInclude,
      });
      await this.auditService.record(tx, {
        controller: "branches",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async updateBranchStatus(id: number, isActive: boolean, userId?: number, scopedCompanyId?: number) {
    const current = await this.branch(id, scopedCompanyId);
    return companyTransaction(this.prisma, current.companyId, async (tx) => {
      if (!isActive && await tx.erpConfiguration.count({ where: { generalWarehouse: { branchId: id } } })) throw new ConflictException('La sucursal contiene el centro general configurado; configure otro centro antes de desactivarla');
      if (!isActive && await tx.inventoryStock.count({ where: { location: { warehouse: { branchId: id } }, quantity: { gt: 0 } } })) throw new ConflictException("No se puede desactivar una sucursal con existencias");
      const updated = await tx.branch.update({ where: { id }, data: { isActive }, include: branchInclude });
      await this.auditService.record(tx, {
        controller: "branches",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async warehouseCategories() {
    return this.prisma.warehouseCategory.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { warehouses: true } } },
      orderBy: { name: "asc" },
    });
  }

  async createWarehouseCategory(dto: CreateWarehouseCategoryDto, userId?: number) {
    await this.assertWarehouseCategoryUnique(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.warehouseCategory.create({
        data: { name: dto.name, description: dto.description },
        include: { _count: { select: { warehouses: true } } },
      });
      await this.auditService.record(tx, {
        controller: "warehouse_category",
        action: "CREATE",
        recordId: category.id,
        modifiedData: category,
        userId,
      });
      return category;
    });
  }

  async updateWarehouseCategory(id: number, dto: UpdateWarehouseCategoryDto, userId?: number) {
    const current = await this.assertWarehouseCategory(id);
    if (dto.name) await this.assertWarehouseCategoryUnique(dto.name, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.warehouseCategory.update({
        where: { id },
        data: { name: dto.name, description: dto.description },
        include: { _count: { select: { warehouses: true } } },
      });
      await this.auditService.record(tx, {
        controller: "warehouse_category",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async updateWarehouseCategoryStatus(id: number, isActive: boolean, userId?: number) {
    const current = await this.assertWarehouseCategory(id);
    if (!isActive) {
      const warehouses = await this.prisma.warehouse.count({
        where: { categoryId: id, deletedAt: null, isActive: true },
      });
      if (warehouses > 0) {
        throw new ConflictException("No se puede desactivar una categoría con almacenes activos");
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.warehouseCategory.update({
        where: { id },
        data: { isActive },
        include: { _count: { select: { warehouses: true } } },
      });
      await this.auditService.record(tx, {
        controller: "warehouse_category",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async warehouses(branchId?: number, companyId?: number) {
    return this.prisma.warehouse.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(companyId ? { branch: { companyId, deletedAt: null } } : {}),
      },
      include: warehouseInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async warehouse(id: number, companyId?: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, deletedAt: null, ...(companyId ? { branch: { companyId, deletedAt: null } } : {}) },
      include: warehouseInclude,
    });
    if (!warehouse) throw new NotFoundException("Almacén no encontrado");
    return warehouse;
  }

  async createWarehouse(dto: CreateWarehouseDto, userId?: number, scopedCompanyId?: number) {
    await this.assertBranchActive(dto.branchId, scopedCompanyId);
    await this.assertWarehouseCategoryActive(dto.categoryId);
    await this.assertWarehouseUnique(dto.branchId, dto.name);
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({
        data: this.warehouseData(dto) as Prisma.WarehouseUncheckedCreateInput,
        include: warehouseInclude,
      });
      await this.auditService.record(tx, {
        controller: "warehouses",
        action: "CREATE",
        recordId: warehouse.id,
        modifiedData: warehouse,
        userId,
      });
      return warehouse;
    });
  }

  async updateWarehouse(id: number, dto: UpdateWarehouseDto, userId?: number, scopedCompanyId?: number) {
    const current = await this.warehouse(id, scopedCompanyId);
    const branchId = dto.branchId ?? current.branchId;
    const categoryId = dto.categoryId ?? current.categoryId;
    await this.assertBranchActive(branchId, scopedCompanyId);
    await this.assertWarehouseCategoryActive(categoryId);
    if (dto.name || dto.branchId) await this.assertWarehouseUnique(branchId, dto.name ?? current.name, id);

    return companyTransaction(this.prisma, current.branch.company.id, async (tx) => {
      const fresh = await tx.warehouse.findUniqueOrThrow({ where: { id } });
      if (dto.branchId !== undefined && dto.branchId !== fresh.branchId && (await tx.inventoryStock.count({ where: { location: { warehouseId: id } } }) || await tx.purchaseOrder.count({ where: { warehouseId: id } }))) throw new ConflictException("No se puede cambiar la sucursal de un almacen con historial");
      const updated = await tx.warehouse.update({
        where: { id },
        data: this.warehouseData(dto) as Prisma.WarehouseUncheckedUpdateInput,
        include: warehouseInclude,
      });
      await this.auditService.record(tx, {
        controller: "warehouses",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async updateWarehouseStatus(id: number, isActive: boolean, userId?: number, scopedCompanyId?: number) {
    const current = await this.warehouse(id, scopedCompanyId);
    return companyTransaction(this.prisma, current.branch.company.id, async (tx) => {
      if (!isActive && await tx.erpConfiguration.count({ where: { generalWarehouseId: id } })) throw new ConflictException('Este es el centro general configurado; configure otro centro antes de desactivarlo');
      if (!isActive && await tx.inventoryStock.count({ where: { location: { warehouseId: id }, quantity: { gt: 0 } } })) throw new ConflictException("No se puede desactivar una ubicacion o almacen con existencias");
      const updated = await tx.warehouse.update({ where: { id }, data: { isActive }, include: warehouseInclude });
      await this.auditService.record(tx, {
        controller: "warehouses",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async locations(warehouseId?: number, companyId?: number) {
    return this.prisma.location.findMany({
      where: {
        deletedAt: null,
        ...(warehouseId ? { warehouseId } : {}),
        ...(companyId ? { warehouse: { branch: { companyId, deletedAt: null } } } : {}),
      },
      include: locationInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async location(id: number, companyId?: number) {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null, ...(companyId ? { warehouse: { branch: { companyId, deletedAt: null } } } : {}) },
      include: locationInclude,
    });
    if (!location) throw new NotFoundException("Espacio no encontrado");
    return location;
  }

  async createLocation(dto: CreateLocationDto, userId?: number, scopedCompanyId?: number) {
    await this.assertWarehouseActive(dto.warehouseId, scopedCompanyId);
    await this.assertLocationUnique(dto.warehouseId, dto.code, dto);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.create({
        data: this.locationData(dto) as Prisma.LocationUncheckedCreateInput,
        include: locationInclude,
      });
      await this.auditService.record(tx, {
        controller: "locations",
        action: "CREATE",
        recordId: location.id,
        modifiedData: location,
        userId,
      });
      return location;
    });
  }

  async updateLocation(id: number, dto: UpdateLocationDto, userId?: number, scopedCompanyId?: number) {
    const current = await this.location(id, scopedCompanyId);
    const warehouseId = dto.warehouseId ?? current.warehouseId;
    await this.assertWarehouseActive(warehouseId, scopedCompanyId);
    await this.assertLocationUnique(
      warehouseId,
      dto.code ?? current.code,
      {
        aisle: dto.aisle ?? current.aisle,
        rack: dto.rack ?? current.rack,
        level: dto.level ?? current.level,
        position: dto.position ?? current.position,
      },
      id,
    );

    return companyTransaction(this.prisma, current.warehouse.branch.company.id, async (tx) => {
      const fresh = await tx.location.findUniqueOrThrow({ where: { id } });
      if (dto.capacity !== undefined) {
        const occupied = await tx.inventoryStock.aggregate({ where: { locationId: id, quantity: { gt: 0 } }, _sum: { quantity: true } });
        if (occupied._sum.quantity?.gt(dto.capacity)) throw new ConflictException("La capacidad no puede ser menor que las existencias del espacio");
      }
      if (dto.warehouseId !== undefined && dto.warehouseId !== fresh.warehouseId && (await tx.inventoryStock.count({ where: { locationId: id } }) || await tx.purchaseItem.count({ where: { locationId: id } }))) throw new ConflictException("No se puede mover una ubicacion con historial a otro almacen");
      const updated = await tx.location.update({
        where: { id },
        data: this.locationData(dto) as Prisma.LocationUncheckedUpdateInput,
        include: locationInclude,
      });
      await this.auditService.record(tx, {
        controller: "locations",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  async updateLocationStatus(id: number, isActive: boolean, userId?: number, scopedCompanyId?: number) {
    const current = await this.location(id, scopedCompanyId);
    return companyTransaction(this.prisma, current.warehouse.branch.company.id, async (tx) => {
      if (!isActive && await tx.inventoryStock.count({ where: { locationId: id, quantity: { gt: 0 } } })) throw new ConflictException("No se puede desactivar una ubicacion o almacen con existencias");
      const updated = await tx.location.update({ where: { id }, data: { isActive }, include: locationInclude });
      await this.auditService.record(tx, {
        controller: "locations",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: updated,
        userId,
      });
      return updated;
    });
  }

  private companyData(dto: Partial<CreateCompanyDto>): Record<string, unknown> {
    return {
      name: dto.name,
      commercialName: dto.commercialName,
      nit: dto.nit,
      nrc: dto.nrc,
      commercialLine1: dto.commercialLine1,
      commercialLine2: dto.commercialLine2,
      commercialLine3: dto.commercialLine3,
      address: dto.address,
      departmentId: dto.departmentId,
      municipalityId: dto.municipalityId,
      districtId: dto.districtId,
      phone: dto.phone,
      email: dto.email,
      webSite: dto.webSite,
      logo: dto.logo,
    };
  }

  private branchData(dto: Partial<CreateBranchDto>): Record<string, unknown> {
    return {
      companyId: dto.companyId,
      name: dto.name,
      address: dto.address,
      departmentId: dto.departmentId,
      municipalityId: dto.municipalityId,
      districtId: dto.districtId,
      phone: dto.phone,
      email: dto.email,
    };
  }

  private warehouseData(dto: Partial<CreateWarehouseDto>): Record<string, unknown> {
    return {
      branchId: dto.branchId,
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
    };
  }

  private locationData(dto: Partial<CreateLocationDto>): Record<string, unknown> {
    return {
      warehouseId: dto.warehouseId,
      code: dto.code,
      aisle: dto.aisle,
      rack: dto.rack,
      level: dto.level,
      position: dto.position,
      capacity: dto.capacity,
      notes: dto.notes,
    };
  }

  async assertValidGeography(departmentId: number, municipalityId: number, districtId: number) {
    const district = await this.prisma.district.findFirst({
      where: {
        id: districtId,
        isActive: true,
        municipality: {
          id: municipalityId,
          isActive: true,
          departmentId,
          department: { isActive: true },
        },
      },
    });
    if (!district) {
      throw new BadRequestException("Departamento, municipio o distrito inválido");
    }
  }

  private async assertCompanyUnique(nit: string, nrc: string, ignoreId?: number) {
    const existing = await this.prisma.company.findFirst({
      where: {
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        OR: [{ nit }, { nrc }],
      },
    });
    if (existing) {
      throw new ConflictException(existing.nit === nit ? "El NIT ya está registrado" : "El NRC ya está registrado");
    }
  }

  private async assertCompanyActive(companyId: number) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null, isActive: true },
    });
    if (!company) throw new BadRequestException("La empresa no existe o está inactiva");
  }

  private async assertBranchActive(branchId: number, companyId?: number) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
        isActive: true,
        ...(companyId ? { companyId } : {}),
        company: { isActive: true, deletedAt: null },
      },
    });
    if (!branch) throw new BadRequestException("La sucursal no existe o está inactiva");
  }

  private async assertWarehouseCategory(id: number) {
    const category = await this.prisma.warehouseCategory.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { warehouses: true } } },
    });
    if (!category) throw new NotFoundException("Categoría no encontrada");
    return category;
  }

  private async assertWarehouseCategoryActive(id: number) {
    const category = await this.prisma.warehouseCategory.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!category) throw new BadRequestException("La categoría no existe o está inactiva");
  }

  private async assertWarehouseActive(id: number, companyId?: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
        branch: {
          isActive: true,
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
          company: { isActive: true, deletedAt: null },
        },
      },
    });
    if (!warehouse) throw new BadRequestException("El almacén no existe o está inactivo");
  }

  private async assertBranchUnique(companyId: number, name: string, ignoreId?: number) {
    const existing = await this.prisma.branch.findFirst({
      where: { companyId, name, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException("Ya existe una sucursal con ese nombre en la empresa");
  }

  private async assertWarehouseCategoryUnique(name: string, ignoreId?: number) {
    const existing = await this.prisma.warehouseCategory.findFirst({
      where: { name, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException("Ya existe una categoría con ese nombre");
  }

  private async assertWarehouseUnique(branchId: number, name: string, ignoreId?: number) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { branchId, name, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException("Ya existe un almacén con ese nombre en la sucursal");
  }

  private async assertLocationUnique(
    warehouseId: number,
    code: string,
    physical: Pick<CreateLocationDto, "aisle" | "rack" | "level" | "position">,
    ignoreId?: number,
  ) {
    const existing = await this.prisma.location.findFirst({
      where: {
        warehouseId,
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        OR: [
          { code },
          {
            aisle: physical.aisle,
            rack: physical.rack,
            level: physical.level,
            position: physical.position,
          },
        ],
      },
    });
    if (existing) {
      throw new ConflictException(
        existing.code === code
          ? "El código de espacio ya existe en el almacén"
          : "Ya existe un espacio con esa combinación física",
      );
    }
  }

}
