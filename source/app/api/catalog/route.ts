import { apiError, json } from "@/lib/admin-auth";
import { loadCatalog } from "@/lib/product-store";
import { projectPhotoProducts } from "@/lib/photo-products";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const catalog = await loadCatalog();
    return json({
      products: catalog.products.map(({ priceOverride, hidden, categoryHidden, ...product }) => product),
      photoProducts: projectPhotoProducts(catalog.products),
      collections: catalog.collections.map(({ hidden, ...collection }) => collection),
      categories: catalog.categories.map(({ hidden, ownPrice, parentHidden, ...category }) => category),
    });
  } catch (error) { return apiError(error); }
}
