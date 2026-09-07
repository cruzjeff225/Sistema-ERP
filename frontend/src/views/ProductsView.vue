<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  Boxes,
  ImageOff,
  ImagePlus,
  Layers3,
  Link2,
  Package,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Ruler,
  Search,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";
import { getApiErrorMessage } from "../utils/api-error";

type Category = { id: number; name: string; description?: string | null; isActive: boolean; _count?: { subcategories: number; products: number } };
type Subcategory = { id: number; categoryId: number; name: string; description?: string | null; isActive: boolean; category?: { id: number; name: string }; _count?: { products: number } };
type Unit = { id: number; name: string; type: "purchase" | "sale"; isActive: boolean; _count?: { purchaseProducts: number; saleProducts: number } };
type ProductImage = { id: number; path: string; isActive: boolean };
type SupplierOption = { id: number; code: string; name: string };
type ProductSupplier = {
  id: number;
  supplierCode?: string | null;
  isPreferred: boolean;
  isActive: boolean;
  supplier: SupplierOption & { isActive: boolean };
};
type Product = {
  id: number;
  sku: string;
  internalCode: string;
  originalCode?: string | null;
  name: string;
  size?: string | null;
  dimensions?: string | null;
  description?: string | null;
  presentation?: string | null;
  categoryId: number;
  subcategoryId: number;
  purchaseUnitId: number;
  saleUnitId: number;
  unitCost: number | string;
  salePrice: number | string;
  isActive: boolean;
  category: { id: number; name: string; isActive: boolean };
  subcategory: { id: number; name: string; isActive: boolean };
  purchaseUnit: Unit;
  saleUnit: Unit;
  images: ProductImage[];
  suppliers: ProductSupplier[];
  _count?: { stocks: number; purchaseItems: number; quotationItems: number; saleItems: number; transferItems: number };
};

type Editor = "product" | "catalog" | "image" | "supplier" | null;
type CatalogKind = "category" | "subcategory" | "unit";
type Tab = "products" | "categories" | "subcategories" | "units";

const { can, canAny } = usePermissions();
const activeTab = ref<Tab>("products");
const editor = ref<Editor>(null);
const catalogKind = ref<CatalogKind>("category");
const editingId = ref<number | null>(null);
const selectedId = ref<number | null>(null);
const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const subcategories = ref<Subcategory[]>([]);
const units = ref<Unit[]>([]);
const catalogs = ref<{ categories: Category[]; subcategories: Subcategory[]; purchaseUnits: Unit[]; saleUnits: Unit[]; suppliers: SupplierOption[] }>({
  categories: [], subcategories: [], purchaseUnits: [], saleUnits: [], suppliers: [],
});
const loading = ref(false);
const saving = ref(false);
const search = ref("");
const categoryFilter = ref("");
const subcategoryFilter = ref("");
const imageFile = ref<File | null>(null);
const imageInputKey = ref(0);
const imagePreview = ref<ProductImage | null>(null);
const imageErrors = ref<Record<number, true>>({});
const errorMessage = ref("");
const successMessage = ref("");

const productForm = reactive({
  sku: "",
  internalCode: "",
  originalCode: "",
  name: "",
  size: "",
  dimensions: "",
  description: "",
  presentation: "",
  categoryId: "",
  subcategoryId: "",
  purchaseUnitId: "",
  saleUnitId: "",
  unitCost: "0",
  salePrice: "0",
});
const catalogForm = reactive({ name: "", description: "", categoryId: "", type: "purchase" as "purchase" | "sale" });
const imageForm = reactive({ path: "" });
const supplierForm = reactive({ supplierId: "", supplierCode: "", isPreferred: false });

const selected = computed(() => products.value.find((product) => product.id === selectedId.value) ?? null);
const filteredProducts = computed(() => {
  const term = search.value.trim().toLowerCase();
  return products.value.filter((product) => {
    const matchesTerm = !term || `${product.name} ${product.sku} ${product.internalCode} ${product.originalCode ?? ""}`.toLowerCase().includes(term);
    return matchesTerm
      && (!categoryFilter.value || String(product.categoryId) === categoryFilter.value)
      && (!subcategoryFilter.value || String(product.subcategoryId) === subcategoryFilter.value);
  });
});
const formSubcategories = computed(() => catalogs.value.subcategories.filter((subcategory) => String(subcategory.categoryId) === productForm.categoryId));
const filterSubcategories = computed(() => subcategories.value.filter((subcategory) => !categoryFilter.value || String(subcategory.categoryId) === categoryFilter.value));
const activeImage = computed(() => selected.value?.images.find((image) => image.isActive) ?? null);
const activeImages = computed(() => selected.value?.images.filter((image) => image.isActive) ?? []);
const inactiveImages = computed(() => selected.value?.images.filter((image) => !image.isActive) ?? []);
const isEditingProduct = computed(() => editor.value === "product" && editingId.value !== null);

function showError(error: unknown, fallback: string) {
  successMessage.value = "";
  errorMessage.value = getApiErrorMessage(error, fallback);
}

function showSuccess(message: string) {
  errorMessage.value = "";
  successMessage.value = message;
}

function money(value: number | string) {
  return new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(Number(value));
}

function imageUrl(path: string) {
  if (/^(https?:|data:)/i.test(path)) return path;
  const apiBase = String(import.meta.env.VITE_API_URL ?? "http://localhost:3000/api").replace(/\/api\/?$/, "");
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function hasImageError(image: ProductImage) {
  return Boolean(imageErrors.value[image.id]);
}

function markImageAsUnavailable(image: ProductImage) {
  imageErrors.value = { ...imageErrors.value, [image.id]: true };
}

function clearImageError(id: number) {
  if (!imageErrors.value[id]) return;
  const next = { ...imageErrors.value };
  delete next[id];
  imageErrors.value = next;
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [productsResponse, categoriesResponse, subcategoriesResponse, unitsResponse, catalogsResponse] = await Promise.all([
      http.get("/products"),
      http.get("/product-categories"),
      http.get("/product-subcategories"),
      http.get("/product-units"),
      http.get("/products/catalogs"),
    ]);
    products.value = productsResponse.data.data;
    categories.value = categoriesResponse.data.data;
    subcategories.value = subcategoriesResponse.data.data;
    units.value = unitsResponse.data.data;
    catalogs.value = catalogsResponse.data.data;
    if (!selectedId.value && products.value[0]) selectedId.value = products.value[0].id;
    if (selectedId.value && !products.value.some((product) => product.id === selectedId.value)) selectedId.value = null;
  } catch (error) {
    showError(error, "No se pudo cargar el catálogo de productos");
  } finally {
    loading.value = false;
  }
}

function resetProductForm() {
  Object.assign(productForm, {
    sku: "",
    internalCode: "",
    originalCode: "",
    name: "",
    size: "",
    dimensions: "",
    description: "",
    presentation: "",
    categoryId: String(catalogs.value.categories[0]?.id ?? ""),
    subcategoryId: "",
    purchaseUnitId: String(catalogs.value.purchaseUnits[0]?.id ?? ""),
    saleUnitId: String(catalogs.value.saleUnits[0]?.id ?? ""),
    unitCost: "0",
    salePrice: "0",
  });
}

function openProduct() {
  editingId.value = null;
  resetProductForm();
  editor.value = "product";
}

function openProductEdit() {
  if (!selected.value) return;
  editingId.value = selected.value.id;
  Object.assign(productForm, {
    sku: selected.value.sku,
    internalCode: selected.value.internalCode,
    originalCode: selected.value.originalCode ?? "",
    name: selected.value.name,
    size: selected.value.size ?? "",
    dimensions: selected.value.dimensions ?? "",
    description: selected.value.description ?? "",
    presentation: selected.value.presentation ?? "",
    categoryId: String(selected.value.categoryId),
    subcategoryId: String(selected.value.subcategoryId),
    purchaseUnitId: String(selected.value.purchaseUnitId),
    saleUnitId: String(selected.value.saleUnitId),
    unitCost: String(selected.value.unitCost),
    salePrice: String(selected.value.salePrice),
  });
  editor.value = "product";
}

function onProductCategoryChange() {
  productForm.subcategoryId = "";
}

function onFilterCategoryChange() {
  subcategoryFilter.value = "";
}

async function saveProduct() {
  saving.value = true;
  try {
    const payload = {
      ...productForm,
      categoryId: Number(productForm.categoryId),
      subcategoryId: Number(productForm.subcategoryId),
      purchaseUnitId: Number(productForm.purchaseUnitId),
      saleUnitId: Number(productForm.saleUnitId),
      unitCost: Number(productForm.unitCost),
      salePrice: Number(productForm.salePrice),
    };
    const response = editingId.value ? await http.patch(`/products/${editingId.value}`, payload) : await http.post("/products", payload);
    selectedId.value = response.data.data.id;
    showSuccess(editingId.value ? "Producto actualizado correctamente" : "Producto registrado correctamente");
    closeEditor();
    await load();
  } catch (error) {
    showError(error, "No se pudo guardar el producto");
  } finally {
    saving.value = false;
  }
}

async function toggleProduct() {
  if (!selected.value) return;
  saving.value = true;
  try {
    await http.patch(`/products/${selected.value.id}/status`, { isActive: !selected.value.isActive });
    showSuccess(selected.value.isActive ? "Producto desactivado" : "Producto activado");
    await load();
  } catch (error) {
    showError(error, "No se pudo actualizar el estado del producto");
  } finally {
    saving.value = false;
  }
}

function resetCatalogForm() {
  Object.assign(catalogForm, { name: "", description: "", categoryId: String(catalogs.value.categories[0]?.id ?? ""), type: "purchase" });
}

function openCatalog(kind: CatalogKind, row?: Category | Subcategory | Unit) {
  catalogKind.value = kind;
  editingId.value = row?.id ?? null;
  resetCatalogForm();
  if (row) {
    catalogForm.name = row.name;
    if ("description" in row) catalogForm.description = row.description ?? "";
    if ("categoryId" in row) catalogForm.categoryId = String(row.categoryId);
    if ("type" in row) catalogForm.type = row.type;
  }
  editor.value = "catalog";
}

function catalogEndpoint(kind: CatalogKind) {
  return kind === "category" ? "/product-categories" : kind === "subcategory" ? "/product-subcategories" : "/product-units";
}

async function saveCatalog() {
  saving.value = true;
  try {
    const payload =
      catalogKind.value === "category"
        ? { name: catalogForm.name, description: catalogForm.description }
        : catalogKind.value === "subcategory"
          ? { name: catalogForm.name, description: catalogForm.description, categoryId: Number(catalogForm.categoryId) }
          : { name: catalogForm.name, type: catalogForm.type };
    const endpoint = catalogEndpoint(catalogKind.value);
    await (editingId.value ? http.patch(`${endpoint}/${editingId.value}`, payload) : http.post(endpoint, payload));
    const labels: Record<CatalogKind, string> = { category: "Categoría", subcategory: "Subcategoría", unit: "Unidad" };
    showSuccess(`${labels[catalogKind.value]} ${editingId.value ? "actualizada" : "registrada"} correctamente`);
    closeEditor();
    await load();
  } catch (error) {
    showError(error, "No se pudo guardar el catálogo");
  } finally {
    saving.value = false;
  }
}

async function toggleCatalog(kind: CatalogKind, row: Category | Subcategory | Unit) {
  try {
    await http.patch(`${catalogEndpoint(kind)}/${row.id}/status`, { isActive: !row.isActive });
    showSuccess(row.isActive ? "Registro desactivado" : "Registro activado");
    await load();
  } catch (error) {
    showError(error, "No se pudo actualizar el estado");
  }
}

function openImage() {
  if (!selected.value) return;
  editingId.value = null;
  imageForm.path = "";
  imageFile.value = null;
  imageInputKey.value += 1;
  editor.value = "image";
}

function openImageEdit(image: ProductImage) {
  editingId.value = image.id;
  imageForm.path = image.path;
  imageFile.value = null;
  imageInputKey.value += 1;
  editor.value = "image";
}

function selectImageFile(event: Event) {
  const target = event.target as HTMLInputElement;
  imageFile.value = target.files?.[0] ?? null;
}

async function saveImage() {
  if (!selected.value) return;
  const path = imageForm.path.trim();
  const imageId = editingId.value;
  if (!imageFile.value && !path) {
    showError(new Error("Seleccione un archivo o indique una URL"), "Debe indicar una imagen");
    return;
  }
  saving.value = true;
  try {
    if (editingId.value && imageFile.value) {
      const formData = new FormData();
      formData.append("file", imageFile.value);
      await http.patch(`/product-images/${editingId.value}/upload`, formData);
    } else if (imageFile.value) {
      const formData = new FormData();
      formData.append("productId", String(selected.value.id));
      formData.append("file", imageFile.value);
      await http.post("/product-images/upload", formData);
    } else if (editingId.value) {
      await http.patch(`/product-images/${editingId.value}`, { path });
    } else {
      await http.post("/product-images", { productId: selected.value.id, path });
    }
    if (imageId) clearImageError(imageId);
    showSuccess(imageId ? "Imagen actualizada correctamente" : "Imagen registrada correctamente");
    closeEditor();
    await load();
  } catch (error) {
    showError(error, "No se pudo asociar la imagen");
  } finally {
    saving.value = false;
  }
}

async function toggleImage(image: ProductImage) {
  try {
    await http.patch(`/product-images/${image.id}/status`, { isActive: !image.isActive });
    showSuccess(image.isActive ? "Imagen desactivada" : "Imagen activada");
    await load();
  } catch (error) {
    showError(error, "No se pudo actualizar la imagen");
  }
}

async function removeImage(image: ProductImage) {
  if (!window.confirm("¿Eliminar esta imagen del producto? Esta acción no se puede deshacer.")) return;
  saving.value = true;
  try {
    await http.delete(`/product-images/${image.id}`);
    if (imagePreview.value?.id === image.id) imagePreview.value = null;
    showSuccess("Imagen eliminada correctamente");
    await load();
  } catch (error) {
    showError(error, "No se pudo eliminar la imagen");
  } finally {
    saving.value = false;
  }
}

function openSupplier() {
  if (!selected.value) return;
  editingId.value = null;
  Object.assign(supplierForm, { supplierId: "", supplierCode: "", isPreferred: selected.value.suppliers.filter((link) => link.isActive).length === 0 });
  editor.value = "supplier";
}

async function saveSupplier() {
  if (!selected.value) return;
  saving.value = true;
  try {
    await http.post("/product-suppliers", {
      productId: selected.value.id,
      supplierId: Number(supplierForm.supplierId),
      supplierCode: supplierForm.supplierCode,
      isPreferred: supplierForm.isPreferred,
    });
    showSuccess("Proveedor asociado correctamente");
    closeEditor();
    await load();
  } catch (error) {
    showError(error, "No se pudo asociar el proveedor");
  } finally {
    saving.value = false;
  }
}

async function setPreferred(link: ProductSupplier) {
  if (!link.isActive) {
    successMessage.value = "";
    errorMessage.value = "Activa primero la asociación con el proveedor para poder marcarla como preferida.";
    return;
  }
  try {
    await http.patch(`/product-suppliers/${link.id}`, { isPreferred: !link.isPreferred });
    showSuccess(link.isPreferred ? "Proveedor sin prioridad" : "Proveedor marcado como preferido");
    await load();
  } catch (error) {
    showError(error, "No se pudo actualizar la prioridad del proveedor");
  }
}

async function toggleSupplierLink(link: ProductSupplier) {
  try {
    await http.patch(`/product-suppliers/${link.id}/status`, { isActive: !link.isActive });
    showSuccess(link.isActive ? "Proveedor asociado desactivado" : "Proveedor asociado activado");
    await load();
  } catch (error) {
    showError(error, "No se pudo actualizar la asociación");
  }
}

function closeEditor() {
  editor.value = null;
  editingId.value = null;
  imageFile.value = null;
  imageInputKey.value += 1;
}

onMounted(load);
</script>

<template>
  <AdminLayout title="Productos">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p class="text-sm font-medium text-accent">Catálogo comercial</p><h1 class="page-title mt-1">Productos</h1><p class="page-subtitle">Clasificación, presentación y abastecimiento de cada artículo.</p></div>
      <div class="flex gap-2"><AppButton variant="outline" :disabled="loading" title="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton><AppButton v-if="can('products.create')" @click="openProduct"><Plus class="h-4 w-4" />Producto</AppButton></div>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <div class="mb-5 flex overflow-x-auto border-b border-border" role="tablist" aria-label="Secciones de productos">
      <button type="button" class="inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition" :class="activeTab === 'products' ? 'border-accent text-accent' : 'border-transparent text-muted-fg hover:text-fg'" @click="activeTab = 'products'"><Boxes class="h-4 w-4" />Productos</button>
      <button type="button" class="inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition" :class="activeTab === 'categories' ? 'border-accent text-accent' : 'border-transparent text-muted-fg hover:text-fg'" @click="activeTab = 'categories'"><Tags class="h-4 w-4" />Categorías</button>
      <button type="button" class="inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition" :class="activeTab === 'subcategories' ? 'border-accent text-accent' : 'border-transparent text-muted-fg hover:text-fg'" @click="activeTab = 'subcategories'"><Layers3 class="h-4 w-4" />Subcategorías</button>
      <button type="button" class="inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition" :class="activeTab === 'units' ? 'border-accent text-accent' : 'border-transparent text-muted-fg hover:text-fg'" @click="activeTab = 'units'"><Ruler class="h-4 w-4" />Unidades</button>
    </div>

    <section v-if="activeTab === 'products'" class="grid overflow-hidden rounded-lg border border-border bg-surface lg:min-h-[620px] lg:grid-cols-[320px_1fr]">
      <aside class="border-b border-border lg:border-b-0 lg:border-r"><div class="space-y-2 border-b border-border p-3"><div class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg" placeholder="Buscar SKU, código o producto" /></div><select v-model="categoryFilter" class="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" @change="onFilterCategoryChange"><option value="">Todas las categorías</option><option v-for="category in categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option></select><select v-model="subcategoryFilter" class="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" :disabled="!categoryFilter"><option value="">Todas las subcategorías</option><option v-for="subcategory in filterSubcategories" :key="subcategory.id" :value="String(subcategory.id)">{{ subcategory.name }}</option></select></div><div class="max-h-[300px] overflow-y-auto p-2 lg:max-h-[540px]"><button v-for="product in filteredProducts" :key="product.id" type="button" class="mb-1 w-full rounded-lg px-3 py-3 text-left transition" :class="selectedId === product.id ? 'bg-accent/10 text-fg' : 'hover:bg-surface-secondary'" @click="selectedId = product.id"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><p class="truncate font-semibold">{{ product.name }}</p><p class="mt-0.5 truncate text-xs text-muted-fg">{{ product.sku }} / {{ product.category.name }}</p></div><span class="mt-1 h-2 w-2 rounded-full" :class="product.isActive ? 'bg-success' : 'bg-muted-fg'" /></div></button><p v-if="!filteredProducts.length" class="px-3 py-10 text-center text-sm text-muted-fg">Sin productos encontrados.</p></div></aside>

      <main v-if="selected" class="min-w-0"><header class="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5"><div class="flex min-w-0 gap-3"><div class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-accent/10 text-accent"><img v-if="activeImage && !hasImageError(activeImage)" :src="imageUrl(activeImage.path)" alt="" class="h-full w-full object-cover" @error="markImageAsUnavailable(activeImage)" /><ImageOff v-else class="h-5 w-5" /></div><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h2 class="truncate text-xl font-semibold text-fg">{{ selected.name }}</h2><AppBadge :variant="selected.isActive ? 'success' : 'neutral'">{{ selected.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></div><p class="mt-1 text-sm text-muted-fg">{{ selected.sku }} / {{ selected.internalCode }}</p></div></div><div class="flex w-full flex-wrap gap-2 sm:w-auto"><AppButton v-if="can('products.update')" variant="outline" @click="openProductEdit"><Pencil class="h-4 w-4" />Editar</AppButton><AppButton v-if="canAny(['products.activate', 'products.deactivate'])" variant="outline" :disabled="saving" @click="toggleProduct"><Power class="h-4 w-4" />{{ selected.isActive ? 'Desactivar' : 'Activar' }}</AppButton></div></header>
        <section class="grid gap-5 border-b border-border p-5 md:grid-cols-3"><div><p class="text-xs font-semibold uppercase text-muted-fg">Clasificación</p><p class="mt-2 text-sm font-medium text-fg">{{ selected.category.name }}</p><p class="text-sm text-muted-fg">{{ selected.subcategory.name }}</p></div><div><p class="text-xs font-semibold uppercase text-muted-fg">Unidades</p><p class="mt-2 text-sm text-fg">Compra: {{ selected.purchaseUnit.name }}</p><p class="text-sm text-muted-fg">Venta: {{ selected.saleUnit.name }}</p></div><div><p class="text-xs font-semibold uppercase text-muted-fg">Referencia comercial</p><p class="mt-2 text-sm text-fg">Costo: {{ money(selected.unitCost) }}</p><p class="text-sm text-muted-fg">Precio: {{ money(selected.salePrice) }}</p></div><div class="md:col-span-2"><p class="text-xs font-semibold uppercase text-muted-fg">Presentación</p><p class="mt-2 text-sm text-fg">{{ selected.presentation || 'Sin presentación registrada' }}</p><p class="text-sm text-muted-fg">{{ selected.originalCode ? `Código original: ${selected.originalCode}` : 'Sin código original' }}</p></div><div><p class="text-xs font-semibold uppercase text-muted-fg">Uso futuro</p><p class="mt-2 text-sm text-fg">{{ selected._count?.stocks ?? 0 }} existencias</p><p class="text-sm text-muted-fg">{{ (selected._count?.purchaseItems ?? 0) + (selected._count?.saleItems ?? 0) }} movimientos comerciales</p></div></section>
        <section class="grid gap-5 p-5 xl:grid-cols-2"><div><div class="mb-3 flex items-center justify-between gap-3"><div><h3 class="font-semibold text-fg">Imágenes</h3><p class="text-sm text-muted-fg">Vista previa, cambio y control de cada imagen.</p></div><AppButton v-if="can('product_images.create')" variant="outline" size="sm" @click="openImage"><ImagePlus class="h-4 w-4" />Imagen</AppButton></div><div class="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2"><div v-for="image in activeImages" :key="image.id" class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-secondary"><button type="button" class="block h-full w-full" :title="hasImageError(image) ? 'Imagen no disponible. Selecciona cambiar para corregirla.' : `Ver imagen de ${selected.name}`" @click="imagePreview = image"><img v-if="!hasImageError(image)" :src="imageUrl(image.path)" alt="" class="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" @error="markImageAsUnavailable(image)" /><span v-else class="grid h-full w-full place-items-center text-center text-xs text-muted-fg"><ImageOff class="h-6 w-6" /><span class="px-2">Imagen no disponible</span></span></button><div class="absolute right-1 top-1 flex gap-1"><button v-if="can('product_images.update')" type="button" class="grid h-7 w-7 place-items-center rounded-md bg-surface/90 text-fg shadow-sm hover:bg-surface" title="Cambiar imagen" @click="openImageEdit(image)"><Pencil class="h-3.5 w-3.5" /></button><button v-if="can('product_images.delete')" type="button" class="grid h-7 w-7 place-items-center rounded-md bg-surface/90 text-danger shadow-sm hover:bg-surface" title="Eliminar imagen" @click="removeImage(image)"><Trash2 class="h-3.5 w-3.5" /></button></div><button v-if="canAny(['product_images.activate', 'product_images.deactivate'])" type="button" class="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-md bg-surface/90 text-fg shadow-sm hover:bg-surface" title="Desactivar imagen" @click="toggleImage(image)"><Power class="h-3.5 w-3.5" /></button></div><div v-if="!activeImages.length" class="col-span-full grid min-h-28 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-fg">Sin imágenes activas.</div></div><div v-if="inactiveImages.length" class="mt-3 border-t border-border pt-3"><p class="mb-2 text-xs font-semibold uppercase text-muted-fg">Imágenes inactivas</p><div class="flex flex-wrap gap-2"><div v-for="image in inactiveImages" :key="image.id" class="group relative h-16 w-16 overflow-hidden rounded-md border border-border bg-surface-secondary opacity-70"><button type="button" class="block h-full w-full" :title="hasImageError(image) ? 'Imagen no disponible. Selecciona cambiar para corregirla.' : `Ver imagen de ${selected.name}`" @click="imagePreview = image"><img v-if="!hasImageError(image)" :src="imageUrl(image.path)" alt="" class="h-full w-full object-cover" @error="markImageAsUnavailable(image)" /><span v-else class="grid h-full w-full place-items-center"><ImageOff class="h-4 w-4 text-muted-fg" /></span></button><div class="absolute right-0.5 top-0.5 flex gap-0.5"><button v-if="can('product_images.update')" type="button" class="grid h-6 w-6 place-items-center rounded bg-surface/90 text-fg shadow-sm" title="Cambiar imagen" @click="openImageEdit(image)"><Pencil class="h-3 w-3" /></button><button v-if="can('product_images.delete')" type="button" class="grid h-6 w-6 place-items-center rounded bg-surface/90 text-danger shadow-sm" title="Eliminar imagen" @click="removeImage(image)"><Trash2 class="h-3 w-3" /></button></div><button v-if="canAny(['product_images.activate', 'product_images.deactivate'])" type="button" class="absolute bottom-0.5 right-0.5 grid h-6 w-6 place-items-center rounded bg-surface/90 text-fg shadow-sm" title="Activar imagen" @click="toggleImage(image)"><Power class="h-3 w-3" /></button></div></div></div></div>
          <div><div class="mb-3 flex items-center justify-between gap-3"><div><h3 class="font-semibold text-fg">Proveedores</h3><p class="text-sm text-muted-fg">Fuentes de abastecimiento del artículo.</p></div><AppButton v-if="selected.isActive && can('product_suppliers.create')" variant="outline" size="sm" @click="openSupplier"><Link2 class="h-4 w-4" />Asociar</AppButton></div><div class="divide-y divide-border rounded-lg border border-border"><div v-for="link in selected.suppliers" :key="link.id" class="flex items-center justify-between gap-3 px-3 py-3"><div class="min-w-0"><p class="truncate text-sm font-medium text-fg">{{ link.supplier.name }}</p><p class="truncate text-xs text-muted-fg">{{ link.supplierCode || link.supplier.code }}</p></div><div class="flex items-center gap-1"><button v-if="can('product_suppliers.update')" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" :class="link.isPreferred ? 'text-warning' : 'text-muted-fg'" :title="link.isPreferred ? 'Quitar prioridad' : 'Marcar como preferido'" @click="setPreferred(link)"><Star class="h-4 w-4" :fill="link.isPreferred ? 'currentColor' : 'none'" /></button><button v-if="canAny(['product_suppliers.activate', 'product_suppliers.deactivate'])" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" :title="link.isActive ? 'Desactivar asociación' : 'Activar asociación'" @click="toggleSupplierLink(link)"><Power class="h-4 w-4" :class="!link.isActive && 'text-muted-fg'" /></button></div></div><p v-if="!selected.suppliers.length" class="px-3 py-9 text-center text-sm text-muted-fg">Sin proveedores asociados.</p></div></div>
        </section></main>
      <main v-else class="grid place-items-center p-10 text-center text-muted-fg"><div><Package class="mx-auto h-10 w-10" /><p class="mt-3 font-medium text-fg">Selecciona un producto</p><p class="mt-1 text-sm">O registra el primer artículo del catálogo.</p></div></main>
    </section>

    <section v-else class="rounded-lg border border-border bg-surface"><header class="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4"><div><h2 class="text-base font-semibold text-fg">{{ activeTab === 'categories' ? 'Categorías' : activeTab === 'subcategories' ? 'Subcategorías' : 'Unidades de medida' }}</h2><p class="mt-1 text-sm text-muted-fg">{{ activeTab === 'categories' ? 'Clasificación principal del catálogo.' : activeTab === 'subcategories' ? 'Nivel de detalle dentro de cada categoría.' : 'Unidades separadas para compra y venta.' }}</p></div><AppButton v-if="activeTab === 'categories' && can('categories.create')" @click="openCatalog('category')"><Plus class="h-4 w-4" />Categoría</AppButton><AppButton v-else-if="activeTab === 'subcategories' && can('subcategories.create')" @click="openCatalog('subcategory')"><Plus class="h-4 w-4" />Subcategoría</AppButton><AppButton v-else-if="activeTab === 'units' && can('units.create')" @click="openCatalog('unit')"><Plus class="h-4 w-4" />Unidad</AppButton></header><div class="overflow-x-auto"><table class="w-full min-w-[680px] text-left text-sm"><thead class="border-b border-border bg-surface-secondary text-xs uppercase text-muted-fg"><tr><th class="px-5 py-3">Nombre</th><th class="px-5 py-3">{{ activeTab === 'subcategories' ? 'Categoría padre' : activeTab === 'units' ? 'Uso' : 'Uso en catálogo' }}</th><th class="px-5 py-3">Estado</th><th class="w-28 px-5 py-3"></th></tr></thead><tbody class="divide-y divide-border"><template v-if="activeTab === 'categories'"><tr v-for="row in categories" :key="row.id"><td class="px-5 py-4"><p class="font-medium text-fg">{{ row.name }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ row.description || 'Sin descripción' }}</p></td><td class="px-5 py-4 text-muted-fg">{{ row._count?.subcategories ?? 0 }} subcategorías / {{ row._count?.products ?? 0 }} productos</td><td class="px-5 py-4"><AppBadge :variant="row.isActive ? 'success' : 'neutral'">{{ row.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></td><td class="px-5 py-4"><div class="flex gap-1"><button v-if="can('categories.update')" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Editar" @click="openCatalog('category', row)"><Pencil class="h-4 w-4" /></button><button v-if="canAny(['categories.activate', 'categories.deactivate'])" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Cambiar estado" @click="toggleCatalog('category', row)"><Power class="h-4 w-4" /></button></div></td></tr><tr v-if="!categories.length"><td colspan="4" class="px-5 py-10 text-center text-muted-fg">Sin categorías.</td></tr></template><template v-else-if="activeTab === 'subcategories'"><tr v-for="row in subcategories" :key="row.id"><td class="px-5 py-4"><p class="font-medium text-fg">{{ row.name }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ row.description || 'Sin descripción' }}</p></td><td class="px-5 py-4 text-muted-fg">{{ row.category?.name }} / {{ row._count?.products ?? 0 }} productos</td><td class="px-5 py-4"><AppBadge :variant="row.isActive ? 'success' : 'neutral'">{{ row.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></td><td class="px-5 py-4"><div class="flex gap-1"><button v-if="can('subcategories.update')" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Editar" @click="openCatalog('subcategory', row)"><Pencil class="h-4 w-4" /></button><button v-if="canAny(['subcategories.activate', 'subcategories.deactivate'])" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Cambiar estado" @click="toggleCatalog('subcategory', row)"><Power class="h-4 w-4" /></button></div></td></tr><tr v-if="!subcategories.length"><td colspan="4" class="px-5 py-10 text-center text-muted-fg">Sin subcategorías.</td></tr></template><template v-else><tr v-for="row in units" :key="row.id"><td class="px-5 py-4 font-medium text-fg">{{ row.name }}</td><td class="px-5 py-4"><AppBadge :variant="row.type === 'purchase' ? 'info' : 'neutral'">{{ row.type === 'purchase' ? 'Compra' : 'Venta' }}</AppBadge></td><td class="px-5 py-4"><AppBadge :variant="row.isActive ? 'success' : 'neutral'">{{ row.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></td><td class="px-5 py-4"><div class="flex gap-1"><button v-if="can('units.update')" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Editar" @click="openCatalog('unit', row)"><Pencil class="h-4 w-4" /></button><button v-if="canAny(['units.activate', 'units.deactivate'])" type="button" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Cambiar estado" @click="toggleCatalog('unit', row)"><Power class="h-4 w-4" /></button></div></td></tr><tr v-if="!units.length"><td colspan="4" class="px-5 py-10 text-center text-muted-fg">Sin unidades.</td></tr></template></tbody></table></div></section>

    <div v-if="editor" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor"><aside class="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl"><header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6"><div><p class="text-sm font-medium text-accent">{{ editor === 'product' ? (isEditingProduct ? 'Editar producto' : 'Nuevo producto') : editor === 'catalog' ? 'Configuración de catálogo' : editor === 'image' ? (editingId ? 'Cambiar imagen' : 'Nueva imagen') : 'Abastecimiento' }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ editor === 'product' ? (isEditingProduct ? productForm.name : 'Registrar producto') : editor === 'catalog' ? (catalogKind === 'category' ? 'Categoría' : catalogKind === 'subcategory' ? 'Subcategoría' : 'Unidad') : editor === 'image' ? `Imagen de ${selected?.name}` : `Proveedor de ${selected?.name}` }}</h2></div><button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closeEditor"><X class="h-5 w-5" /></button></header>
      <form v-if="editor === 'product'" class="flex min-h-0 flex-1 flex-col" @submit.prevent="saveProduct"><div class="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6"><section><h3 class="mb-3 text-sm font-semibold text-fg">Identificación</h3><div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="productForm.name" class="sm:col-span-2" label="Nombre del producto" required /><AppInput v-model="productForm.sku" label="SKU" required /><AppInput v-model="productForm.internalCode" label="Código interno" required /><AppInput v-model="productForm.originalCode" label="Código original" /><AppInput v-model="productForm.presentation" label="Presentación" /><AppInput v-model="productForm.size" label="Tamaño o talla" /><AppInput v-model="productForm.dimensions" label="Dimensiones" /><AppInput v-model="productForm.description" class="sm:col-span-2" label="Descripción" /></div></section><section><h3 class="mb-3 text-sm font-semibold text-fg">Clasificación y unidades</h3><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Categoría<select v-model="productForm.categoryId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" @change="onProductCategoryChange"><option value="" disabled>Seleccione una categoría</option><option v-for="category in catalogs.categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option></select></label><label class="text-sm font-medium text-fg">Subcategoría<select v-model="productForm.subcategoryId" required :disabled="!productForm.categoryId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg disabled:cursor-not-allowed disabled:bg-surface-secondary"><option value="" disabled>Seleccione una subcategoría</option><option v-for="subcategory in formSubcategories" :key="subcategory.id" :value="String(subcategory.id)">{{ subcategory.name }}</option></select></label><label class="text-sm font-medium text-fg">Unidad de compra<select v-model="productForm.purchaseUnitId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option v-for="unit in catalogs.purchaseUnits" :key="unit.id" :value="String(unit.id)">{{ unit.name }}</option></select></label><label class="text-sm font-medium text-fg">Unidad de venta<select v-model="productForm.saleUnitId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option v-for="unit in catalogs.saleUnits" :key="unit.id" :value="String(unit.id)">{{ unit.name }}</option></select></label></div></section><section><h3 class="mb-3 text-sm font-semibold text-fg">Valores de referencia</h3><div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="productForm.unitCost" type="number" label="Costo unitario" min="0" step="0.01" /><AppInput v-model="productForm.salePrice" type="number" label="Precio de venta" min="0" step="0.01" /></div></section></div><footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar producto' }}</AppButton></footer></form>
      <form v-else-if="editor === 'catalog'" class="flex min-h-0 flex-1 flex-col" @submit.prevent="saveCatalog"><div class="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6"><AppInput v-model="catalogForm.name" :label="catalogKind === 'unit' ? 'Nombre de la unidad' : 'Nombre'" required /><label v-if="catalogKind === 'subcategory'" class="block text-sm font-medium text-fg">Categoría padre<select v-model="catalogForm.categoryId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option v-for="category in catalogs.categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option></select></label><label v-if="catalogKind === 'unit'" class="block text-sm font-medium text-fg">Uso de la unidad<select v-model="catalogForm.type" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option value="purchase">Compra</option><option value="sale">Venta</option></select></label><AppInput v-if="catalogKind !== 'unit'" v-model="catalogForm.description" label="Descripción" /></div><footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</AppButton></footer></form>
      <form v-else-if="editor === 'image'" class="flex min-h-0 flex-1 flex-col" @submit.prevent="saveImage"><div class="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6"><div v-if="editingId && imageForm.path" class="overflow-hidden rounded-lg border border-border bg-surface-secondary"><img v-if="!imageErrors[editingId]" :src="imageUrl(imageForm.path)" alt="" class="h-44 w-full object-contain" @error="imageErrors = { ...imageErrors, [editingId]: true }" /><div v-else class="grid h-44 place-items-center text-sm text-muted-fg"><ImageOff class="h-6 w-6" /><span>La imagen actual no está disponible</span></div></div><label class="block text-sm font-medium text-fg">{{ editingId ? 'Nuevo archivo para reemplazar la imagen' : 'Archivo de imagen' }}<input :key="imageInputKey" type="file" accept="image/jpeg,image/png,image/webp" class="mt-1.5 block w-full text-sm text-muted-fg file:mr-3 file:rounded-md file:border-0 file:bg-accent/10 file:px-3 file:py-2 file:font-medium file:text-accent hover:file:bg-accent/20" @change="selectImageFile" /></label><p class="text-sm text-muted-fg">JPG, PNG o WEBP. Máximo 5 MB.</p><div class="flex items-center gap-3"><span class="h-px flex-1 bg-border"></span><span class="text-xs font-medium uppercase text-muted-fg">o</span><span class="h-px flex-1 bg-border"></span></div><AppInput v-model="imageForm.path" label="URL de la imagen" :required="!imageFile" /><p v-if="editingId" class="text-xs text-muted-fg">Puedes subir un archivo nuevo o reemplazar la dirección de la imagen.</p></div><footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving">{{ saving ? 'Guardando...' : (editingId ? 'Actualizar imagen' : 'Guardar imagen') }}</AppButton></footer></form>
      <form v-else class="flex min-h-0 flex-1 flex-col" @submit.prevent="saveSupplier"><div class="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6"><label class="block text-sm font-medium text-fg">Proveedor<select v-model="supplierForm.supplierId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option value="" disabled>Seleccione un proveedor</option><option v-for="supplier in catalogs.suppliers" :key="supplier.id" :value="String(supplier.id)">{{ supplier.name }} / {{ supplier.code }}</option></select></label><AppInput v-model="supplierForm.supplierCode" label="Código del proveedor" /><label class="flex items-center gap-2 text-sm text-fg"><input v-model="supplierForm.isPreferred" type="checkbox" class="h-4 w-4 rounded border-border text-accent focus:ring-accent" />Proveedor preferido</label></div><footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving">{{ saving ? 'Asociando...' : 'Asociar proveedor' }}</AppButton></footer></form>
    </aside></div>

    <div v-if="imagePreview" class="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-4" @click.self="imagePreview = null"><section class="w-full max-w-3xl overflow-hidden rounded-lg bg-surface shadow-2xl"><header class="flex items-center justify-between border-b border-border px-4 py-3"><p class="font-semibold text-fg">Imagen de {{ selected?.name }}</p><button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar vista previa" @click="imagePreview = null"><X class="h-5 w-5" /></button></header><div class="grid max-h-[70vh] min-h-56 place-items-center bg-surface-secondary p-4"><img v-if="!hasImageError(imagePreview)" :src="imageUrl(imagePreview.path)" alt="" class="max-h-[64vh] max-w-full object-contain" @error="markImageAsUnavailable(imagePreview)" /><div v-else class="grid place-items-center gap-3 text-center text-sm text-muted-fg"><ImageOff class="h-8 w-8" /><p>Esta imagen ya no está disponible.</p></div></div><footer class="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3"><AppButton v-if="can('product_images.update')" variant="outline" @click="openImageEdit(imagePreview); imagePreview = null"><Pencil class="h-4 w-4" />Cambiar</AppButton><AppButton v-if="can('product_images.delete')" variant="outline" class="text-danger" @click="removeImage(imagePreview)"><Trash2 class="h-4 w-4" />Eliminar</AppButton><AppButton variant="outline" @click="imagePreview = null">Cerrar</AppButton></footer></section></div>
  </AdminLayout>
</template>
