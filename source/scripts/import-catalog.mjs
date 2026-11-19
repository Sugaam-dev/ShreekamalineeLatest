import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRuntimeEnv } from './runtime-env.mjs';

loadRuntimeEnv();
const fail = message => { throw new Error(message); };
const text = (value, label, max = 180) => typeof value === 'string' && value.length && value.length <= max ? value : fail(`Invalid ${label}.`);
const price = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000000 && Math.abs(Math.round(value * 100) - value * 100) < 0.000001) ? value : fail('Invalid catalog price.');
const visible = value => typeof value === 'boolean' ? value : fail('Invalid visibility value.');
const nameKey = value => value.normalize('NFKC').toLowerCase();
const image = value => {
  text(value, 'photo path', 250);
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020?#]/u.test(value) || value.split('/').includes('..')) fail('Invalid photo path.');
  if (value.startsWith('/media/') && !/^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/.test(value)) fail('Invalid uploaded photo path.');
  return value;
};
const snapshotPath = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../../data/catalog-snapshot.json', import.meta.url));
const catalog = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (!catalog || !Array.isArray(catalog.collections) || !Array.isArray(catalog.categories) || !Array.isArray(catalog.products)) fail('Invalid catalog snapshot.');
const collectionIds = new Set();
const collectionNames = new Set();
const collections = catalog.collections.map(item => {
  const id = text(item.id, 'category id', 100);
  const name = text(item.name, 'category name', 80);
  if (collectionIds.has(id) || collectionNames.has(nameKey(name))) fail('Duplicate category in snapshot.');
  collectionIds.add(id); collectionNames.add(nameKey(name));
  if (typeof item.description !== 'string' || item.description.length > 500) fail('Invalid category description.');
  return { id, name, description: item.description, image: item.image === null ? null : image(item.image), price: price(item.price), hidden: visible(item.hidden) };
});
const categoryIds = new Set();
const categoryNames = new Set();
const categories = catalog.categories.map(item => {
  const id = text(item.id, 'subcategory id', 100);
  const name = text(item.name, 'subcategory name', 80);
  const collection = text(item.collection, 'parent category id', 100);
  const scope = JSON.stringify([collection, nameKey(name)]);
  if (categoryIds.has(id) || categoryNames.has(scope) || !collectionIds.has(collection)) fail('Invalid or duplicate subcategory in snapshot.');
  categoryIds.add(id); categoryNames.add(scope);
  return { id, name, collection, price: price(item.ownPrice), hidden: visible(item.hidden) };
});
const productIds = new Set();
const products = catalog.products.map(item => {
  const id = text(item.id, 'product id', 200);
  const category = categories.find(candidate => candidate.id === item.categoryId);
  if (productIds.has(id) || !category || item.collection !== category.collection) fail('Invalid or duplicate product in snapshot.');
  productIds.add(id);
  if (!Array.isArray(item.gallery) || item.gallery.length > 29) fail('Invalid product gallery.');
  const product = { id, name: text(item.name, 'product name'), categoryId: category.id, collection: category.collection, image: image(item.image), gallery: item.gallery.map(image), priceOverride: price(item.priceOverride), hidden: visible(item.hidden) };
  if (item.type !== undefined) product.type = text(item.type, 'product type', 100);
  if (item.details !== undefined) {
    if (!Array.isArray(item.details) || item.details.length > 20 || item.details.some(value => typeof value !== 'string' || value.length > 300)) fail('Invalid product details.');
    product.details = [...item.details];
  }
  if (item.variationNote !== undefined) {
    if (typeof item.variationNote !== 'string' || item.variationNote.length > 500) fail('Invalid photo note.');
    product.variationNote = item.variationNote;
  }
  return product;
});
if (!process.env.DATABASE_URL) fail('Set DATABASE_URL before importing the catalog.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
const client = await pool.connect();
let transaction = false;
try {
  await client.query('BEGIN'); transaction = true;
  const tables = ['category_prices', 'product_overrides', 'admin_users', 'admin_credentials', 'admin_sessions', 'admin_login_limits', 'collection_definitions', 'category_definitions'];
  await client.query('LOCK TABLE ' + tables.join(', ') + ' IN EXCLUSIVE MODE');
  for (const table of tables) {
    const found = await client.query('SELECT 1 FROM ' + table + ' LIMIT 1');
    if (found.rowCount) fail(`Import refused: ${table} is not empty. Use a fresh database to preserve existing data.`);
  }
  for (const item of collections) await client.query('INSERT INTO collection_definitions (id, name_key, data) VALUES ($1, $2, $3)', [item.id, nameKey(item.name), JSON.stringify(item)]);
  for (const item of categories) await client.query('INSERT INTO category_definitions (id, collection_id, name_key, data) VALUES ($1, $2, $3, $4)', [item.id, item.collection, nameKey(item.name), JSON.stringify(item)]);
  for (const item of products) await client.query('INSERT INTO product_overrides (id, data) VALUES ($1, $2)', [item.id, JSON.stringify(item)]);
  await client.query('COMMIT'); transaction = false;
  console.log(JSON.stringify({ success: true, collections: collections.length, subcategories: categories.length, products: products.length, authenticationRowsImported: 0 }));
} catch (error) {
  if (transaction) { try { await client.query('ROLLBACK'); } catch {} }
  console.error('Catalog import failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
