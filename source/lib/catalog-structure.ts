import { seedCategories, seedProducts, type Product } from "./catalog-seed";
import { ApiError, database, imageBucket } from "./admin-auth";
import type { PostgreSQLStatement } from "./postgres";

export interface RootCollection {
  id: string;
  name: string;
  description: string;
  image: string | null;
  price: number | null;
  hidden: boolean;
}

export interface Subcategory {
  id: string;
  name: string;
  collection: string;
  type?: string;
  ownPrice: number | null;
  price: number | null;
  hidden: boolean;
  parentHidden: boolean;
}

type CategoryDefinition = Pick<Subcategory, "id" | "name" | "collection" | "hidden"> & { price: number | null };
type DefinitionRow = { id: string; data: string };

export const seedCollections: readonly RootCollection[] = [
  { id: "sarees", name: "Sarees", description: "Six yards, endless ways to wear them.", image: "/sarees.jpg", price: null, hidden: false },
  { id: "dress-materials", name: "Dress Materials", description: "Unstitched fabrics to tailor your way.", image: "/dress-materials.jpg", price: null, hidden: false },
  { id: "readymades", name: "Readymades", description: "Tops and dresses, ready to wear.", image: "/readymades.jpg", price: null, hidden: false },
  { id: "accessories", name: "Accessories", description: "Sling bags and finishing touches.", image: "/accessories.jpg", price: null, hidden: false },
];

const knownImages = new Set([
  ...seedCollections.flatMap(collection => collection.image ? [collection.image] : []),
  ...seedProducts.flatMap(product => [product.image, ...product.gallery]),
]);

export function validatePrice(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10000000 || Math.abs(Math.round(value * 100) - value * 100) > 0.000001) {
    throw new ApiError("Enter a valid price between ₹0 and ₹1,00,00,000, with up to two decimal places.");
  }
  return Math.round(value * 100) / 100;
}

export async function validateCatalogImage(value: unknown): Promise<string> {
  if (typeof value !== "string" || value.length > 250) throw new ApiError("Choose an existing photo or upload a new one.");
  const image = value.trim();
  if (knownImages.has(image)) return image;
  const match = /^\/media\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/.exec(image);
  if (!match || !(await imageBucket().head(match[1]))) throw new ApiError("A photo is missing. Please upload it again.");
  return image;
}

export async function loadSourceProducts(): Promise<Product[]> {
  const rows = await database().prepare("SELECT id, data FROM product_overrides ORDER BY created_seq").all<DefinitionRow>();
  const products = new Map<string, Product>(seedProducts.map(product => [product.id, { ...product, gallery: [...product.gallery] }]));
  for (const row of rows.results) products.set(row.id, JSON.parse(row.data) as Product);
  return [...products.values()];
}

export async function loadCatalogStructure(): Promise<{ collections: RootCollection[]; categories: Subcategory[] }> {
  const db = database();
  const results = await db.batch([
    db.prepare("SELECT id, price FROM category_prices"),
    db.prepare("SELECT id, data FROM collection_definitions ORDER BY created_seq"),
    db.prepare("SELECT id, data FROM category_definitions ORDER BY created_seq"),
  ]);
  const legacyPrices = new Map((results[0].results as { id: string; price: number | null }[]).map(row => [row.id, row.price]));
  const collections = new Map(seedCollections.map(collection => [collection.id, { ...collection }]));
  for (const row of results[1].results as DefinitionRow[]) collections.set(row.id, JSON.parse(row.data) as RootCollection);
  const categories = new Map<string, CategoryDefinition>(seedCategories.map(category => [category.id, {
    id: category.id,
    name: category.name,
    collection: category.collection,
    price: legacyPrices.has(category.id) ? legacyPrices.get(category.id)! : category.price,
    hidden: false,
  }]));
  for (const row of results[2].results as DefinitionRow[]) categories.set(row.id, JSON.parse(row.data) as CategoryDefinition);
  const effective = [...categories.values()].map(category => {
    const parent = collections.get(category.collection);
    if (!parent) throw new Error("Unknown parent collection");
    return {
      ...category,
      type: category.collection === "sarees" ? category.name.replace(/\s+sarees?$/i, "").trim() || category.name : undefined,
      ownPrice: category.price,
      price: category.price ?? parent.price,
      hidden: Boolean(category.hidden),
      parentHidden: Boolean(parent.hidden),
    };
  });
  return { collections: [...collections.values()], categories: effective };
}

function name(value: unknown, label: string): string {
  if (typeof value !== "string") throw new ApiError(`${label} is required.`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if ([...normalized].length < 2 || [...normalized].length > 80) throw new ApiError(`${label} must contain 2–80 characters.`);
  return normalized;
}

const nameKey = (value: string) => value.normalize("NFKC").toLowerCase();

function hidden(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ApiError("Choose whether this category is hidden.");
  return value;
}

function fields(input: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new ApiError("Some category fields are not supported.");
}

async function saveDefinition(statement: PostgreSQLStatement, duplicateMessage: string) {
  try { await statement.run(); }
  catch (error) {
    const postgresError = error as { code?: string; constraint?: string };
    if (postgresError?.code === "23505" && ["collection_definitions_name_key_unique", "category_definitions_parent_name_unique"].includes(postgresError.constraint ?? "")) throw new ApiError(duplicateMessage, 409);
    throw error;
  }
}

export async function saveCollection(input: Record<string, unknown>, id?: string): Promise<RootCollection> {
  fields(input, ["name", "description", "image", "price", "hidden"]);
  const { collections } = await loadCatalogStructure();
  const existing = id ? collections.find(collection => collection.id === id) : undefined;
  if (id && !existing) throw new ApiError("This category was not found.", 404);
  const collectionName = input.name === undefined && existing ? existing.name : name(input.name, "Category name");
  if (collections.some(collection => collection.id !== existing?.id && nameKey(collection.name) === nameKey(collectionName))) {
    throw new ApiError("A category with this name already exists, including hidden categories.", 409);
  }
  let description = existing?.description ?? "";
  if (input.description !== undefined) {
    if (typeof input.description !== "string" || [...input.description.trim()].length > 500) throw new ApiError("The description must contain up to 500 characters.");
    description = input.description.trim();
  }
  const collection: RootCollection = {
    id: existing?.id ?? "collection-" + crypto.randomUUID(),
    name: collectionName,
    description,
    image: input.image === undefined ? existing?.image ?? null : input.image === null ? null : await validateCatalogImage(input.image),
    price: input.price === undefined ? existing?.price ?? null : validatePrice(input.price),
    hidden: hidden(input.hidden, existing?.hidden ?? false),
  };
  await saveDefinition(database().prepare("INSERT INTO collection_definitions (id, name_key, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name_key = excluded.name_key, data = excluded.data")
    .bind(collection.id, nameKey(collection.name), JSON.stringify(collection)), "A category with this name already exists, including hidden categories.");
  return collection;
}

export async function saveCategory(input: Record<string, unknown>, id?: string): Promise<Subcategory> {
  fields(input, ["name", "collection", "price", "hidden"]);
  const { collections, categories } = await loadCatalogStructure();
  const existing = id ? categories.find(category => category.id === id) : undefined;
  if (id && !existing) throw new ApiError("This subcategory was not found.", 404);
  const categoryName = input.name === undefined && existing ? existing.name : name(input.name, "Subcategory name");
  const collectionId = input.collection === undefined ? existing?.collection : input.collection;
  if (typeof collectionId !== "string" || !collections.some(collection => collection.id === collectionId)) throw new ApiError("Choose an existing parent category.");
  if (categories.some(category => category.id !== existing?.id && category.collection === collectionId && nameKey(category.name) === nameKey(categoryName))) {
    throw new ApiError("A subcategory with this name already exists under this category, including hidden subcategories.", 409);
  }
  if (existing && existing.collection !== "sarees" && collectionId === "sarees") {
    const sources = await loadSourceProducts();
    if (sources.some(product => product.categoryId === existing.id && product.gallery.length > 0)) {
      throw new ApiError("This subcategory contains products with multiple photos. Keep one photo per saree design before moving it into Sarees.", 409);
    }
  }
  const definition: CategoryDefinition = {
    id: existing?.id ?? "category-" + crypto.randomUUID(),
    name: categoryName,
    collection: collectionId,
    price: input.price === undefined ? existing?.ownPrice ?? null : validatePrice(input.price),
    hidden: hidden(input.hidden, existing?.hidden ?? false),
  };
  await saveDefinition(database().prepare("INSERT INTO category_definitions (id, collection_id, name_key, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET collection_id = excluded.collection_id, name_key = excluded.name_key, data = excluded.data")
    .bind(definition.id, definition.collection, nameKey(definition.name), JSON.stringify(definition)), "A subcategory with this name already exists under this category, including hidden subcategories.");
  return (await loadCatalogStructure()).categories.find(category => category.id === definition.id)!;
}
