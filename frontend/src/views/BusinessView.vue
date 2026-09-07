<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { RefreshCw, Save } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import AppBadge from '../components/base/AppBadge.vue';
import AppButton from '../components/base/AppButton.vue';
import AppCard from '../components/base/AppCard.vue';
import AppInput from '../components/base/AppInput.vue';
import { http } from '../services/http.service';

type Tab = 'parties' | 'products' | 'inventory' | 'documents' | 'fleet';

const route = useRoute();
const activeTab = ref<Tab>((route.query.tab as Tab) || 'parties');
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const customers = ref<any[]>([]);
const suppliers = ref<any[]>([]);
const products = ref<any[]>([]);
const inventory = ref<any[]>([]);
const purchases = ref<any[]>([]);
const quotations = ref<any[]>([]);
const sales = ref<any[]>([]);
const transfers = ref<any[]>([]);
const vehicles = ref<any[]>([]);
const drivers = ref<any[]>([]);
const branches = ref<any[]>([]);
const warehouses = ref<any[]>([]);
const locations = ref<any[]>([]);

const customerForm = reactive({ name: '', document: '', phone: '', email: '', address: '' });
const supplierForm = reactive({ name: '', document: '', phone: '', email: '', address: '' });
const productForm = reactive({ sku: '', name: '', description: '', unitCost: '0', salePrice: '0' });
const inventoryForm = reactive({ productId: '', locationId: '', quantity: '1', minStock: '0' });
const purchaseForm = reactive({ supplierId: '', branchId: '', documentNumber: '', productId: '', locationId: '', quantity: '1', unitCost: '1' });
const quotationForm = reactive({ customerId: '', branchId: '', documentNumber: '', productId: '', quantity: '1', unitPrice: '1' });
const saleForm = reactive({ customerId: '', branchId: '', documentNumber: '', productId: '', locationId: '', quantity: '1', unitPrice: '1' });
const transferForm = reactive({ fromWarehouseId: '', toWarehouseId: '', documentNumber: '', productId: '', fromLocationId: '', toLocationId: '', quantity: '1' });
const vehicleForm = reactive({ plate: '', brand: '', model: '', year: '' });
const driverForm = reactive({ name: '', license: '', phone: '' });

const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'parties', label: 'Clientes y proveedores' },
    { id: 'products', label: 'Productos' },
    { id: 'inventory', label: 'Inventario' },
    { id: 'documents', label: 'Compras, ventas y traslados' },
    { id: 'fleet', label: 'Flota' },
];

const locationOptions = computed(() => locations.value.map((location) => ({
    ...location,
    label: `${location.warehouse?.branch?.name ?? 'Sucursal'} / ${location.warehouse?.name ?? 'Almacén'} / ${location.code}`,
})));

function resetMessages() {
    errorMessage.value = '';
    successMessage.value = '';
}

function nextDocument(prefix: string) {
    return `${prefix}-${new Date().toISOString().slice(11, 19).replaceAll(':', '')}`;
}

function fillDefaults() {
    customerForm.document ||= nextDocument('CLI');
    supplierForm.document ||= nextDocument('PRO');
    productForm.sku ||= nextDocument('SKU');
    purchaseForm.documentNumber ||= nextDocument('COM');
    quotationForm.documentNumber ||= nextDocument('COT');
    saleForm.documentNumber ||= nextDocument('VEN');
    transferForm.documentNumber ||= nextDocument('TRS');

    purchaseForm.supplierId ||= suppliers.value[0] ? String(suppliers.value[0].id) : '';
    purchaseForm.branchId ||= branches.value[0] ? String(branches.value[0].id) : '';
    purchaseForm.productId ||= products.value[0] ? String(products.value[0].id) : '';
    purchaseForm.locationId ||= locations.value[0] ? String(locations.value[0].id) : '';

    quotationForm.customerId ||= customers.value[0] ? String(customers.value[0].id) : '';
    quotationForm.branchId ||= branches.value[0] ? String(branches.value[0].id) : '';
    quotationForm.productId ||= products.value[0] ? String(products.value[0].id) : '';

    saleForm.customerId ||= customers.value[0] ? String(customers.value[0].id) : '';
    saleForm.branchId ||= branches.value[0] ? String(branches.value[0].id) : '';
    saleForm.productId ||= products.value[0] ? String(products.value[0].id) : '';
    saleForm.locationId ||= locations.value[0] ? String(locations.value[0].id) : '';

    inventoryForm.productId ||= products.value[0] ? String(products.value[0].id) : '';
    inventoryForm.locationId ||= locations.value[0] ? String(locations.value[0].id) : '';

    transferForm.productId ||= products.value[0] ? String(products.value[0].id) : '';
    transferForm.fromLocationId ||= locations.value[0] ? String(locations.value[0].id) : '';
    transferForm.toLocationId ||= locations.value[1] ? String(locations.value[1].id) : transferForm.fromLocationId;
    transferForm.fromWarehouseId ||= warehouses.value[0] ? String(warehouses.value[0].id) : '';
    transferForm.toWarehouseId ||= warehouses.value[1] ? String(warehouses.value[1].id) : transferForm.fromWarehouseId;
}

async function loadAll() {
    loading.value = true;
    resetMessages();
    try {
        const [
            customersRes,
            suppliersRes,
            productsRes,
            inventoryRes,
            purchasesRes,
            quotationsRes,
            salesRes,
            transfersRes,
            vehiclesRes,
            driversRes,
            branchesRes,
            warehousesRes,
            locationsRes,
        ] = await Promise.all([
            http.get('/customers'),
            http.get('/suppliers'),
            http.get('/products'),
            http.get('/inventory'),
            http.get('/purchases'),
            http.get('/quotations'),
            http.get('/sales'),
            http.get('/transfers'),
            http.get('/vehicles'),
            http.get('/drivers'),
            http.get('/branches'),
            http.get('/warehouses'),
            http.get('/locations'),
        ]);

        customers.value = customersRes.data.data;
        suppliers.value = suppliersRes.data.data;
        products.value = productsRes.data.data;
        inventory.value = inventoryRes.data.data;
        purchases.value = purchasesRes.data.data;
        quotations.value = quotationsRes.data.data;
        sales.value = salesRes.data.data;
        transfers.value = transfersRes.data.data;
        vehicles.value = vehiclesRes.data.data;
        drivers.value = driversRes.data.data;
        branches.value = branchesRes.data.data;
        warehouses.value = warehousesRes.data.data;
        locations.value = locationsRes.data.data;
        fillDefaults();
    } catch (error: any) {
        errorMessage.value = error.response?.data?.message ?? 'No se pudieron cargar los módulos operativos';
    } finally {
        loading.value = false;
    }
}

async function save(endpoint: string, payload: Record<string, unknown>, message: string, reset?: () => void) {
    saving.value = true;
    resetMessages();
    try {
        await http.post(endpoint, payload);
        successMessage.value = message;
        reset?.();
        await loadAll();
    } catch (error: any) {
        errorMessage.value = error.response?.data?.message ?? 'No se pudo guardar';
    } finally {
        saving.value = false;
    }
}

function numberValue(value: string) {
    return Number(value);
}

function createCustomer() {
    return save('/customers', { ...customerForm }, 'Cliente registrado', () => Object.assign(customerForm, { name: '', phone: '', email: '', address: '', document: nextDocument('CLI') }));
}

function createSupplier() {
    return save('/suppliers', { ...supplierForm }, 'Proveedor registrado', () => Object.assign(supplierForm, { name: '', phone: '', email: '', address: '', document: nextDocument('PRO') }));
}

function createProduct() {
    return save('/products', { ...productForm, unitCost: numberValue(productForm.unitCost), salePrice: numberValue(productForm.salePrice) }, 'Producto registrado', () => Object.assign(productForm, { sku: nextDocument('SKU'), name: '', description: '', unitCost: '0', salePrice: '0' }));
}

function adjustInventory() {
    return save('/inventory/adjust', { productId: numberValue(inventoryForm.productId), locationId: numberValue(inventoryForm.locationId), quantity: numberValue(inventoryForm.quantity), minStock: numberValue(inventoryForm.minStock) }, 'Inventario ajustado');
}

function createPurchase() {
    return save('/purchases', {
        supplierId: numberValue(purchaseForm.supplierId),
        branchId: numberValue(purchaseForm.branchId),
        documentNumber: purchaseForm.documentNumber,
        items: [{ productId: numberValue(purchaseForm.productId), locationId: numberValue(purchaseForm.locationId), quantity: numberValue(purchaseForm.quantity), unitCost: numberValue(purchaseForm.unitCost) }],
    }, 'Compra registrada', () => Object.assign(purchaseForm, { documentNumber: nextDocument('COM') }));
}

function createQuotation() {
    return save('/quotations', {
        customerId: numberValue(quotationForm.customerId),
        branchId: numberValue(quotationForm.branchId),
        documentNumber: quotationForm.documentNumber,
        items: [{ productId: numberValue(quotationForm.productId), quantity: numberValue(quotationForm.quantity), unitPrice: numberValue(quotationForm.unitPrice) }],
    }, 'Cotización registrada', () => Object.assign(quotationForm, { documentNumber: nextDocument('COT') }));
}

function createSale() {
    return save('/sales', {
        customerId: numberValue(saleForm.customerId),
        branchId: numberValue(saleForm.branchId),
        documentNumber: saleForm.documentNumber,
        items: [{ productId: numberValue(saleForm.productId), locationId: numberValue(saleForm.locationId), quantity: numberValue(saleForm.quantity), unitPrice: numberValue(saleForm.unitPrice) }],
    }, 'Venta registrada', () => Object.assign(saleForm, { documentNumber: nextDocument('VEN') }));
}

function createTransfer() {
    return save('/transfers', {
        fromWarehouseId: numberValue(transferForm.fromWarehouseId),
        toWarehouseId: numberValue(transferForm.toWarehouseId),
        documentNumber: transferForm.documentNumber,
        items: [{ productId: numberValue(transferForm.productId), fromLocationId: numberValue(transferForm.fromLocationId), toLocationId: numberValue(transferForm.toLocationId), quantity: numberValue(transferForm.quantity) }],
    }, 'Traslado registrado', () => Object.assign(transferForm, { documentNumber: nextDocument('TRS') }));
}

function createVehicle() {
    return save('/vehicles', { ...vehicleForm, year: vehicleForm.year ? numberValue(vehicleForm.year) : undefined }, 'Vehículo registrado', () => Object.assign(vehicleForm, { plate: '', brand: '', model: '', year: '' }));
}

function createDriver() {
    return save('/drivers', { ...driverForm }, 'Conductor registrado', () => Object.assign(driverForm, { name: '', license: '', phone: '' }));
}

watch(() => route.query.tab, (tab) => {
    if (tab && tabs.some((item) => item.id === tab)) activeTab.value = tab as Tab;
});

onMounted(loadAll);
</script>

<template>
    <AdminLayout title="Comercial">
        <div class="mb-5 flex items-center justify-between gap-3">
            <div>
                <h1 class="text-2xl font-semibold text-fg">Módulos operativos</h1>
                <p class="mt-1 text-sm text-muted-fg">Clientes, proveedores, productos, inventario, compras, ventas, traslados y flota.</p>
            </div>
            <AppButton variant="outline" :disabled="loading" @click="loadAll"><RefreshCw class="h-4 w-4" />Actualizar</AppButton>
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
            <button v-for="tab in tabs" :key="tab.id" type="button" class="h-9 rounded-lg border px-3 text-sm font-medium"
                :class="activeTab === tab.id ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-surface text-fg hover:bg-surface-secondary'"
                @click="activeTab = tab.id">
                {{ tab.label }}
            </button>
        </div>

        <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
        <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

        <div v-if="activeTab === 'parties'" class="grid gap-4 xl:grid-cols-2">
            <AppCard>
                <form class="grid gap-3 md:grid-cols-2" @submit.prevent="createCustomer">
                    <AppInput v-model="customerForm.name" label="Cliente" />
                    <AppInput v-model="customerForm.document" label="Documento" />
                    <AppInput v-model="customerForm.phone" label="Teléfono" />
                    <AppInput v-model="customerForm.email" label="Correo" />
                    <AppInput v-model="customerForm.address" label="Dirección" class="md:col-span-2" />
                    <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar cliente</AppButton>
                </form>
            </AppCard>
            <AppCard>
                <form class="grid gap-3 md:grid-cols-2" @submit.prevent="createSupplier">
                    <AppInput v-model="supplierForm.name" label="Proveedor" />
                    <AppInput v-model="supplierForm.document" label="Documento" />
                    <AppInput v-model="supplierForm.phone" label="Teléfono" />
                    <AppInput v-model="supplierForm.email" label="Correo" />
                    <AppInput v-model="supplierForm.address" label="Dirección" class="md:col-span-2" />
                    <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar proveedor</AppButton>
                </form>
            </AppCard>
        </div>

        <AppCard v-if="activeTab === 'products'">
            <form class="grid gap-3 md:grid-cols-5" @submit.prevent="createProduct">
                <AppInput v-model="productForm.sku" label="SKU" />
                <AppInput v-model="productForm.name" label="Producto" />
                <AppInput v-model="productForm.unitCost" label="Costo" type="number" />
                <AppInput v-model="productForm.salePrice" label="Precio venta" type="number" />
                <AppInput v-model="productForm.description" label="Descripción" />
                <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar producto</AppButton>
            </form>
        </AppCard>

        <AppCard v-if="activeTab === 'inventory'">
            <form class="grid gap-3 md:grid-cols-5" @submit.prevent="adjustInventory">
                <label class="text-sm font-medium text-fg">Producto<select v-model="inventoryForm.productId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="p in products" :key="p.id" :value="String(p.id)">{{ p.sku }} - {{ p.name }}</option></select></label>
                <label class="text-sm font-medium text-fg">Espacio<select v-model="inventoryForm.locationId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="l in locationOptions" :key="l.id" :value="String(l.id)">{{ l.label }}</option></select></label>
                <AppInput v-model="inventoryForm.quantity" label="Cantidad" type="number" />
                <AppInput v-model="inventoryForm.minStock" label="Mínimo" type="number" />
                <div class="flex items-end"><AppButton type="submit" :disabled="saving || !products.length || !locations.length"><Save class="h-4 w-4" />Ajustar</AppButton></div>
            </form>
        </AppCard>

        <div v-if="activeTab === 'documents'" class="grid gap-4 xl:grid-cols-2">
            <AppCard>
                <form class="grid gap-3 md:grid-cols-2" @submit.prevent="createPurchase">
                    <AppInput v-model="purchaseForm.documentNumber" label="Compra No." />
                    <label class="text-sm font-medium text-fg">Proveedor<select v-model="purchaseForm.supplierId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="s in suppliers" :key="s.id" :value="String(s.id)">{{ s.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Sucursal<select v-model="purchaseForm.branchId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="b in branches" :key="b.id" :value="String(b.id)">{{ b.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Producto<select v-model="purchaseForm.productId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="p in products" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Espacio<select v-model="purchaseForm.locationId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="l in locationOptions" :key="l.id" :value="String(l.id)">{{ l.label }}</option></select></label>
                    <AppInput v-model="purchaseForm.quantity" label="Cantidad" type="number" />
                    <AppInput v-model="purchaseForm.unitCost" label="Costo unitario" type="number" />
                    <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar compra</AppButton>
                </form>
            </AppCard>
            <AppCard>
                <form class="grid gap-3 md:grid-cols-2" @submit.prevent="createSale">
                    <AppInput v-model="saleForm.documentNumber" label="Venta No." />
                    <label class="text-sm font-medium text-fg">Cliente<select v-model="saleForm.customerId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="c in customers" :key="c.id" :value="String(c.id)">{{ c.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Sucursal<select v-model="saleForm.branchId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="b in branches" :key="b.id" :value="String(b.id)">{{ b.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Producto<select v-model="saleForm.productId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="p in products" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Espacio<select v-model="saleForm.locationId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="l in locationOptions" :key="l.id" :value="String(l.id)">{{ l.label }}</option></select></label>
                    <AppInput v-model="saleForm.quantity" label="Cantidad" type="number" />
                    <AppInput v-model="saleForm.unitPrice" label="Precio unitario" type="number" />
                    <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar venta</AppButton>
                </form>
            </AppCard>
            <AppCard>
                <form class="grid gap-3 md:grid-cols-2" @submit.prevent="createQuotation">
                    <AppInput v-model="quotationForm.documentNumber" label="Cotización No." />
                    <label class="text-sm font-medium text-fg">Cliente<select v-model="quotationForm.customerId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="c in customers" :key="c.id" :value="String(c.id)">{{ c.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Sucursal<select v-model="quotationForm.branchId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="b in branches" :key="b.id" :value="String(b.id)">{{ b.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Producto<select v-model="quotationForm.productId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="p in products" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select></label>
                    <AppInput v-model="quotationForm.quantity" label="Cantidad" type="number" />
                    <AppInput v-model="quotationForm.unitPrice" label="Precio" type="number" />
                    <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar cotización</AppButton>
                </form>
            </AppCard>
            <AppCard>
                <form class="grid gap-3 md:grid-cols-2" @submit.prevent="createTransfer">
                    <AppInput v-model="transferForm.documentNumber" label="Traslado No." />
                    <label class="text-sm font-medium text-fg">Producto<select v-model="transferForm.productId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="p in products" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Almacén origen<select v-model="transferForm.fromWarehouseId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="w in warehouses" :key="w.id" :value="String(w.id)">{{ w.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Almacén destino<select v-model="transferForm.toWarehouseId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="w in warehouses" :key="w.id" :value="String(w.id)">{{ w.name }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Espacio origen<select v-model="transferForm.fromLocationId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="l in locationOptions" :key="l.id" :value="String(l.id)">{{ l.label }}</option></select></label>
                    <label class="text-sm font-medium text-fg">Espacio destino<select v-model="transferForm.toLocationId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option v-for="l in locationOptions" :key="l.id" :value="String(l.id)">{{ l.label }}</option></select></label>
                    <AppInput v-model="transferForm.quantity" label="Cantidad" type="number" />
                    <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar traslado</AppButton>
                </form>
            </AppCard>
        </div>

        <div v-if="activeTab === 'fleet'" class="grid gap-4 xl:grid-cols-2">
            <AppCard><form class="grid gap-3 md:grid-cols-2" @submit.prevent="createVehicle"><AppInput v-model="vehicleForm.plate" label="Placa" /><AppInput v-model="vehicleForm.brand" label="Marca" /><AppInput v-model="vehicleForm.model" label="Modelo" /><AppInput v-model="vehicleForm.year" label="Año" type="number" /><AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar vehículo</AppButton></form></AppCard>
            <AppCard><form class="grid gap-3 md:grid-cols-2" @submit.prevent="createDriver"><AppInput v-model="driverForm.name" label="Conductor" /><AppInput v-model="driverForm.license" label="Licencia" /><AppInput v-model="driverForm.phone" label="Teléfono" /><div /><AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />Registrar conductor</AppButton></form></AppCard>
        </div>

        <div class="mt-5 grid gap-4 xl:grid-cols-2">
            <div class="overflow-hidden rounded-lg border border-border bg-surface">
                <table class="w-full text-left text-sm">
                    <thead class="bg-surface-secondary text-xs uppercase text-muted-fg"><tr><th class="p-3">Módulo</th><th class="p-3">Registros</th><th class="p-3">Estado</th></tr></thead>
                    <tbody class="divide-y divide-border">
                        <tr><td class="p-3">Clientes</td><td class="p-3">{{ customers.length }}</td><td class="p-3"><AppBadge>Activo</AppBadge></td></tr>
                        <tr><td class="p-3">Proveedores</td><td class="p-3">{{ suppliers.length }}</td><td class="p-3"><AppBadge>Activo</AppBadge></td></tr>
                        <tr><td class="p-3">Productos</td><td class="p-3">{{ products.length }}</td><td class="p-3"><AppBadge>Activo</AppBadge></td></tr>
                        <tr><td class="p-3">Inventario</td><td class="p-3">{{ inventory.length }}</td><td class="p-3"><AppBadge>Activo</AppBadge></td></tr>
                    </tbody>
                </table>
            </div>
            <div class="overflow-hidden rounded-lg border border-border bg-surface">
                <table class="w-full text-left text-sm">
                    <thead class="bg-surface-secondary text-xs uppercase text-muted-fg"><tr><th class="p-3">Documento</th><th class="p-3">Cantidad</th><th class="p-3">Total</th></tr></thead>
                    <tbody class="divide-y divide-border">
                        <tr><td class="p-3">Compras</td><td class="p-3">{{ purchases.length }}</td><td class="p-3">{{ purchases.reduce((s, p) => s + Number(p.total), 0).toFixed(2) }}</td></tr>
                        <tr><td class="p-3">Cotizaciones</td><td class="p-3">{{ quotations.length }}</td><td class="p-3">{{ quotations.reduce((s, p) => s + Number(p.total), 0).toFixed(2) }}</td></tr>
                        <tr><td class="p-3">Ventas</td><td class="p-3">{{ sales.length }}</td><td class="p-3">{{ sales.reduce((s, p) => s + Number(p.total), 0).toFixed(2) }}</td></tr>
                        <tr><td class="p-3">Traslados</td><td class="p-3">{{ transfers.length }}</td><td class="p-3">{{ vehicles.length }} vehículos / {{ drivers.length }} conductores</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </AdminLayout>
</template>
