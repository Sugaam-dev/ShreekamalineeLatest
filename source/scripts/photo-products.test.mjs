import assert from 'node:assert/strict';
import { projectPhotoProducts } from '../lib/photo-products.ts';
import { seedProducts } from '../lib/catalog-seed.ts';

const projected = projectPhotoProducts(seedProducts);
assert.equal(seedProducts.length, 113);
assert.equal(projected.length, 194);
assert.equal(new Set(projected.map(photo => photo.id)).size, 194);
assert.equal(new Set(projected.map(photo => photo.designCode)).size, 194);
assert.equal(projected.filter(photo => photo.collection === 'sarees').length, 103);
assert.equal(projected.filter(photo => photo.collection === 'dress-materials').length, 70);
assert.equal(projected.filter(photo => photo.collection === 'readymades').length, 3);
assert.equal(projected.filter(photo => photo.collection === 'accessories').length, 18);
const sources = new Map(seedProducts.map(source => [source.id, source]));
for (const photo of projected) {
  const source = sources.get(photo.sourceProductId);
  assert.ok(source);
  assert.deepEqual(photo.gallery, []);
  assert.ok(photo.image.startsWith('/products/') || photo.image.startsWith('/media/'));
  assert.ok(!photo.image.startsWith('blob:'));
  assert.ok([source.image, ...source.gallery].includes(photo.image), 'Photo files must retain their original paths');
  assert.equal(photo.price, source.price ?? null);
  assert.equal(photo.categoryId, source.categoryId);
  assert.equal(photo.collection, source.collection);
  assert.equal(photo.type, source.type);
  assert.deepEqual(photo.details, source.details);
  assert.equal(photo.variationNote, source.variationNote);
  assert.ok(!Object.hasOwn(photo, 'hidden'));
  assert.ok(!Object.hasOwn(photo, 'priceOverride'));
  assert.equal(photo.designCode, 'SK-' + photo.name.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]/gu, ''));
  const index = [source.image, ...source.gallery].indexOf(photo.image);
  assert.equal(photo.name, source.gallery.length ? `${source.name} – Design ${index + 1}` : source.name);
}

const source = seedProducts.find(product => product.gallery.length > 2);
const original = projectPhotoProducts([source]);
const originalImages = [source.image, ...source.gallery];
const reversed = [...originalImages].reverse();
const changed = projectPhotoProducts([{ ...source, name: 'Updated title', price: 1234.56, image: reversed[0], gallery: reversed.slice(1) }]);
for (const photo of original) {
  const match = changed.find(candidate => candidate.image === photo.image);
  assert.equal(match.id, photo.id, 'Reordering and title edits must not change a photo route');
  assert.equal(match.designCode, 'SK-UpdatedtitleDesign' + (reversed.indexOf(photo.image) + 1));
  assert.equal(match.price, 1234.56, 'Projected photos must use the resolved live price');
}

const removedImage = originalImages[1];
const remainingImages = originalImages.filter(image => image !== removedImage);
const remaining = projectPhotoProducts([{ ...source, image: remainingImages[0], gallery: remainingImages.slice(1) }]);
const removedId = original.find(photo => photo.image === removedImage).id;
assert.equal(remaining.length, original.length - 1);
assert.ok(!remaining.some(photo => photo.id === removedId));
for (const photo of remaining) assert.equal(photo.id, original.find(candidate => candidate.image === photo.image).id);
assert.deepEqual(projectPhotoProducts([{ ...source, hidden: true }]), []);

const duplicatePhotos = projectPhotoProducts([{ ...source, gallery: [source.image, ...source.gallery, source.gallery[0]] }]);
assert.equal(duplicatePhotos.length, original.length, 'Repeated source URLs must not duplicate products');
const relative = projectPhotoProducts([{ ...source, image: source.image.slice(1), gallery: source.gallery }]);
assert.equal(relative[0].id, original[0].id, 'Relative and canonical representations of the same photo must share identity');
assert.equal(relative[0].image, original[0].image);

const single = seedProducts.find(product => !product.gallery.length);
const namedReference = projectPhotoProducts([{ ...single, name: 'Beige with Brick Red Ajrakh Saree' }])[0];
assert.equal(namedReference.designCode, 'SK-BeigewithBrickRedAjrakhSaree');
assert.equal(namedReference.id, projectPhotoProducts([single])[0].id, 'Name-based references must preserve existing product links');
const futurePhoto = '/media/00000000-0000-4000-8000-000000000001.jpg';
const extended = projectPhotoProducts([{ ...single, gallery: [futurePhoto] }]);
assert.equal(extended[0].id, projectPhotoProducts([single])[0].id, 'Adding gallery photos must preserve the original cover identity');
assert.equal(extended[1].image, futurePhoto);
const onRequest = projectPhotoProducts([{ ...single, price: null }]);
assert.equal(onRequest[0].price, null);
assert.ok(!Object.hasOwn(onRequest[0], 'priceOverride'));
console.log('PASS: 194 photo products, unique name-based references, stable routes after renaming/reordering, inherited prices/details, full original image paths, remove/hide behavior, deduplication and private field exclusion.');
