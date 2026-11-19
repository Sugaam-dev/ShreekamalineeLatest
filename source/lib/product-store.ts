import { type Product } from "@/lib/catalog-seed";
import { ApiError, database, imageBucket, readLimitedBody } from "./admin-auth";
import { loadCatalogStructure, loadSourceProducts, saveCategory, validateCatalogImage, validatePrice } from "./catalog-structure";

export { validatePrice } from "./catalog-structure";
export type ManagedProduct = Product & { categoryHidden: boolean };

export async function loadCatalog(includeHidden = false) {
  const [{ collections, categories }, sources] = await Promise.all([loadCatalogStructure(), loadSourceProducts()]);
  const byCategory = new Map(categories.map(category => [category.id, category]));
  const effective = sources.map(product => {
    const category = byCategory.get(product.categoryId);
    if (!category) throw new Error("Unknown product category");
    const item: ManagedProduct = {
      ...product,
      collection: category.collection,
      type: category.type,
      price: product.priceOverride ?? category.price,
      gallery: product.gallery ?? [],
      hidden: Boolean(product.hidden),
      categoryHidden: category.hidden || category.parentHidden,
    };
    delete item.originalPrice;
    return item;
  });
  const visibleProducts = effective.filter(product => !product.hidden && !product.categoryHidden);
  return {
    products: includeHidden ? effective : visibleProducts,
    categories: includeHidden ? categories : categories.filter(category => !category.hidden && !category.parentHidden),
    collections: includeHidden ? collections : collections.filter(collection => !collection.hidden).map(collection => ({
      ...collection,
      image: collection.image ?? visibleProducts.find(product => product.collection === collection.id)?.image ?? null,
    })),
  };
}

export async function updateCategory(id: string, input: Record<string, unknown>) {
  return saveCategory(input, id);
}

function text(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new ApiError(`${label} is required.`);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > maximum) throw new ApiError(`${label} must be ${allowEmpty ? "up to" : "between 1 and"} ${maximum} characters.`);
  return result;
}

async function validateImages(value: unknown): Promise<string[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new ApiError("Add between 1 and 30 photos.");
  const images: string[] = [];
  for (const valueImage of value) {
    images.push(await validateCatalogImage(valueImage));
  }
  return [...new Set(images)];
}

export async function saveProduct(input: Record<string, unknown>, id?: string) {
  const catalog = await loadCatalog(true);
  const existing = id ? catalog.products.find(product => product.id === id) : undefined;
  if (id && !existing) throw new ApiError("This product was not found.", 404);
  const supported = new Set(["name", "categoryId", "images", "priceOverride", "details", "hidden", "variationNote"]);
  if (Object.keys(input).some(key => !supported.has(key))) throw new ApiError("Some product fields are not supported.");
  const categoryId = input.categoryId === undefined ? existing?.categoryId : text(input.categoryId, "Category", 100);
  const category = catalog.categories.find(item => item.id === categoryId);
  if (!category) throw new ApiError("Choose an existing category.");
  const name = input.name === undefined && existing ? existing.name : text(input.name, "Product name", 180);
  const images = input.images === undefined && existing ? [existing.image, ...existing.gallery] : await validateImages(input.images);
  if (category.collection === "sarees" && images.length !== 1) throw new ApiError("Keep one photo per saree design. Add other designs as separate products.");
  let details = existing?.details ?? [];
  if (input.details !== undefined) {
    if (!Array.isArray(input.details) || input.details.length > 20) throw new ApiError("Add up to 20 product details.");
    details = input.details.map(detail => text(detail, "Product detail", 300)).filter(Boolean);
  }
  if (input.hidden !== undefined && typeof input.hidden !== "boolean") throw new ApiError("Choose whether the product is visible.");
  const product: Product = {
    ...(existing ?? {}),
    id: existing?.id ?? "product-" + crypto.randomUUID(),
    name,
    categoryId: category.id,
    collection: category.collection,
    type: category.type,
    image: images[0],
    gallery: images.slice(1),
    priceOverride: input.priceOverride === undefined ? existing?.priceOverride ?? null : validatePrice(input.priceOverride),
    hidden: input.hidden === undefined ? Boolean(existing?.hidden) : input.hidden as boolean,
    details,
  };
  if (input.variationNote !== undefined) product.variationNote = text(input.variationNote, "Photo note", 500, true);
  delete product.price;
  delete product.originalPrice;
  delete product.categoryHidden;
  await database().prepare("INSERT INTO product_overrides (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").bind(product.id, JSON.stringify(product)).run();
  return (await loadCatalog(true)).products.find(item => item.id === product.id)!;
}

export async function uploadImage(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new ApiError("Choose a photo to upload.", 415);
  const body = await readLimitedBody(request, 11 * 1024 * 1024, "Each photo must be 10 MB or smaller.");
  let form: FormData;
  try { form = await new Response(body.buffer as ArrayBuffer, { headers: { "content-type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new ApiError("The photo upload could not be read. Please choose the photo again."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("Choose a JPEG, PNG or WebP photo.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new ApiError("Each photo must be between 1 byte and 10 MB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let type: string, extension: string;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { type = "image/jpeg"; extension = "jpg"; }
  else if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) { type = "image/png"; extension = "png"; }
  else if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") { type = "image/webp"; extension = "webp"; }
  else throw new ApiError("This file is not a JPEG, PNG or WebP photo. Convert HEIC photos to JPEG before uploading.", 415);
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type.toLowerCase()) || file.type.toLowerCase() !== type) throw new ApiError("The photo format does not match the file. Please save it as JPEG, PNG or WebP.", 415);
  const key = crypto.randomUUID() + "." + extension;
  await imageBucket().put(key, bytes, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  return "/media/" + key;
}
