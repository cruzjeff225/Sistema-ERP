// Whitelisted table and primary-key names from schema.prisma. Foreign keys are read from PostgreSQL at runtime.
export const TRASH_TABLES: Record<string, {
    table: string;
    id: string;
}> = {
    "customer": { "table": "customers", "id": "id_customer" },
    "user": {
        "table": "users",
        "id": "id"
    },
    "employee": {
        "table": "employees",
        "id": "id_employee"
    },
    "role": {
        "table": "roles",
        "id": "id"
    },
    "permission": {
        "table": "permissions",
        "id": "id"
    },
    "module": {
        "table": "modules",
        "id": "id"
    },
    "company": {
        "table": "companies",
        "id": "id_company"
    },
    "branch": {
        "table": "branches",
        "id": "id_branch"
    },
    "warehouseCategory": {
        "table": "warehouse_category",
        "id": "id_warehouse_category"
    },
    "warehouse": {
        "table": "warehouses",
        "id": "id_warehouse"
    },
    "location": {
        "table": "locations",
        "id": "id_location"
    },
    "supplier": {
        "table": "suppliers",
        "id": "id_supplier"
    },
    "supplierContact": {
        "table": "suppliers_contacts",
        "id": "id_supplier_contact"
    },
    "productCategory": {
        "table": "categories",
        "id": "id_category"
    },
    "productSubcategory": {
        "table": "sub_categories",
        "id": "id_sub_category"
    },
    "productUnit": {
        "table": "units",
        "id": "id_unit"
    },
    "product": {
        "table": "products",
        "id": "id_product"
    },
    "productImage": {
        "table": "products_images",
        "id": "id_product_image"
    },
    "productSupplier": {
        "table": "product_suppliers",
        "id": "id_product_supplier"
    },
    "purchaseRequest": {
        "table": "purchase_requests",
        "id": "id_purchase_request"
    },
    "purchaseQuotation": {
        "table": "purchase_quotations",
        "id": "id_purchase_quotation"
    },
    "purchaseOrder": {
        "table": "purchase_orders",
        "id": "id_purchase_order"
    },
    "purchase": {
        "table": "purchases",
        "id": "id_purchase"
    },
    "retaceo": {
        "table": "retaceos",
        "id": "id_retaceo"
    },
    "expenseType": {
        "table": "expense_types",
        "id": "id_expense_type"
    },
    "purchaseOrderExpenseDocument": {
        "table": "purchase_order_expense_documents",
        "id": "id_purchase_order_expense_document"
    },
    "purchaseActualExpense": {
        "table": "purchase_actual_expenses",
        "id": "id"
    },
    "transfer": {
        "table": "transfers",
        "id": "id_transfer"
    },
    "purchaseConsolidation": {
        "table": "purchase_consolidations",
        "id": "id"
    },
    "purchaseRfq": {
        "table": "purchase_rfqs",
        "id": "id"
    }
};
