export const TRASH_ENTITIES = {
    users: { model: 'user', label: 'Usuarios', view: 'users.view', scope: 'user', title: 'username' },
    employees: { model: 'employee', label: 'Empleados', view: 'users.view', scope: 'employee', title: 'fullName' },
    roles: { model: 'role', label: 'Roles', view: 'roles.view', scope: 'global', title: 'name' },
    permissions: { model: 'permission', label: 'Permisos', view: 'permissions.view', scope: 'global', title: 'name' },
    modules: { model: 'module', label: 'Módulos de permisos', view: 'modules.view', scope: 'global', title: 'name' },
    companies: { model: 'company', label: 'Empresas', view: 'companies.view', scope: 'company', title: 'commercialName' },
    branches: { model: 'branch', label: 'Sucursales', view: 'branches.view', scope: 'direct', title: 'name' },
    warehouse_categories: { model: 'warehouseCategory', label: 'Categorías de almacén', view: 'warehouse_categories.view', scope: 'global', title: 'name' },
    warehouses: { model: 'warehouse', label: 'Almacenes', view: 'warehouses.view', scope: 'warehouse', title: 'name' },
    locations: { model: 'location', label: 'Espacios', view: 'locations.view', scope: 'location', title: 'code' },
    suppliers: { model: 'supplier', label: 'Proveedores', view: 'suppliers.view', scope: 'direct', title: 'name' },
    customers: { model: 'customer', label: 'Clientes', view: 'customers.view', scope: 'direct', title: 'name' },
    supplier_contacts: { model: 'supplierContact', label: 'Contactos de proveedor', view: 'supplier_contacts.view', scope: 'contact', title: 'fullName' },
    categories: { model: 'productCategory', label: 'Categorías de producto', view: 'categories.view', scope: 'global', title: 'name' },
    subcategories: { model: 'productSubcategory', label: 'Subcategorías de producto', view: 'subcategories.view', scope: 'global', title: 'name' },
    units: { model: 'productUnit', label: 'Unidades', view: 'units.view', scope: 'global', title: 'name' },
    products: { model: 'product', label: 'Productos', view: 'products.view', scope: 'direct', title: 'name' },
    product_images: { model: 'productImage', label: 'Imágenes de producto', view: 'products.view', scope: 'product', title: 'fileName' },
    product_suppliers: { model: 'productSupplier', label: 'Proveedores de producto', view: 'products.view', scope: 'product', title: 'supplierCode' },
    purchase_requests: { model: 'purchaseRequest', label: 'Solicitudes', view: 'purchase_requests.view', scope: 'direct', title: 'code' },
    purchase_quotations: { model: 'purchaseQuotation', label: 'Cotizaciones', view: 'purchase_quotations.view', scope: 'direct', title: 'code' },
    purchase_orders: { model: 'purchaseOrder', label: 'Órdenes de compra', view: 'purchase_orders.view', scope: 'direct', title: 'code' },
    purchases: { model: 'purchase', label: 'Recepciones', view: 'purchases.view', scope: 'direct', title: 'documentNumber' },
    retaceos: { model: 'retaceo', label: 'Retaceos', view: 'retaceos.view', scope: 'direct', title: 'code' },
    expense_types: { model: 'expenseType', label: 'Tipos de gasto', view: 'expense_types.view', scope: 'direct', title: 'name' },
    purchase_expense_documents: { model: 'purchaseOrderExpenseDocument', label: 'Adjuntos de gastos', view: 'purchase_orders.view', scope: 'orderExpense', title: 'fileName' },
    purchase_expenses: { model: 'purchaseActualExpense', label: 'Gastos reales', view: 'purchases.view', scope: 'expense', title: 'reference' },
    transfers: { model: 'transfer', label: 'Traslados', view: 'inventory.view', scope: 'direct', title: 'uuid' },
    purchase_processes: { model: 'purchaseConsolidation', label: 'Gestiones de cotización', view: 'purchase_quotations.view', scope: 'direct', title: 'code' },
    rfqs: { model: 'purchaseRfq', label: 'Solicitudes a proveedor', view: 'purchase_quotations.view', scope: 'rfq', title: 'code' },
} as const;
export type TrashEntity = keyof typeof TRASH_ENTITIES;
export function trashScope(entity: TrashEntity, companyId: number): Record<string, unknown> {
    const scope = TRASH_ENTITIES[entity].scope;
    switch (scope) {
        case 'direct': return { companyId };
        case 'company': return { id: companyId };
        case 'warehouse': return { branch: { companyId } };
        case 'location': return { warehouse: { branch: { companyId } } };
        case 'contact': return { supplier: { companyId } };
        case 'product': return { product: { companyId } };
        case 'orderExpense': return { expense: { order: { companyId } } };
        case 'expense': return { purchase: { companyId } };
        case 'rfq': return { consolidation: { companyId } };
        case 'user': return { OR: [{ userCompanies: { some: { companyId } } }, { userRoles: { some: { role: { name: 'superadmin' } } } }] };
        case 'employee': return { user: { userCompanies: { some: { companyId } } } };
        default: return {};
    }
}
