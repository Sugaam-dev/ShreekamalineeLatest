import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createFileStore, getImageStore, prepareImageDirectory } from '../lib/file-storage.ts';

const root = await mkdtemp(path.join(os.tmpdir(), 'shreekamalinee-image-test-'));
const directory = path.join(root, 'permanent-uploads');
const key = '00000000-0000-4000-8000-000000000001.jpg';
const missing = '00000000-0000-4000-8000-000000000002.jpg';
const bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4]);
const store = createFileStore(directory);
try {
  const environment = { NODE_ENV: process.env.NODE_ENV, UPLOAD_DIR: process.env.UPLOAD_DIR };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.UPLOAD_DIR;
    assert.throws(() => getImageStore(), /absolute permanent directory/);
    process.env.UPLOAD_DIR = 'relative/uploads';
    assert.throws(() => getImageStore(), /absolute permanent directory/);
    process.env.UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');
    assert.throws(() => getImageStore(), /outside the application/);
  } finally {
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.equal(await store.head(missing), null);
  assert.equal(await store.get(missing), null);
  await store.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  assert.equal((await store.head(key)).size, bytes.length);
  const photo = await store.get(key);
  assert.equal(photo.httpEtag, '"' + createHash('sha256').update(bytes).digest('hex') + '"');
  const headers = new Headers();
  photo.writeHttpMetadata(headers);
  assert.equal(headers.get('content-type'), 'image/jpeg');
  assert.equal(headers.get('content-length'), String(bytes.length));
  assert.equal(headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.deepEqual(new Uint8Array(await new Response(photo.body).arrayBuffer()), bytes);
  const again = await store.get(key);
  assert.equal(again.httpEtag, photo.httpEtag);
  await again.body.cancel();
  await assert.rejects(store.put(key, new Uint8Array([9])), { code: 'EEXIST' });
  assert.deepEqual(new Uint8Array(await readFile(path.join(directory, key))), bytes);
  for (const invalid of ['../outside.jpg', '/etc/passwd', key + '/extra', key.toUpperCase(), 'test.svg']) {
    await assert.rejects(store.head(invalid), /Invalid image storage key/);
    await assert.rejects(store.get(invalid), /Invalid image storage key/);
    await assert.rejects(store.put(invalid, bytes), /Invalid image storage key/);
  }
  await assert.rejects(store.put(missing, new Uint8Array()), /1 byte and 10 MB/);
  await assert.rejects(store.put(missing, bytes, { httpMetadata: { contentType: 'text/html' } }), /MIME type/);
  const linkKey = '00000000-0000-4000-8000-000000000003.jpg';
  let symlinksAvailable = true;
  try { await symlink(path.join(directory, key), path.join(directory, linkKey)); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { symlinksAvailable = false; console.log('NOTE: Windows denied file-symlink creation; run this test on the Linux VPS to exercise that assertion.'); }
    else throw error;
  }
  if (symlinksAvailable) {
    assert.equal(await store.head(linkKey), null);
    assert.equal(await store.get(linkKey), null);
    await assert.rejects(store.put(linkKey, bytes), { code: 'EEXIST' });
  }
  const outside = path.join(root, 'outside');
  const linkedDirectory = path.join(root, 'linked-directory');
  await mkdir(outside);
  try {
    await symlink(outside, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(prepareImageDirectory(linkedDirectory), /symbolic links/);
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') console.log('NOTE: Windows denied directory-symlink creation; run this test on the Linux VPS to exercise that assertion.');
    else throw error;
  }
  console.log('PASS: permanent file storage, round trip, streamed body, metadata/ETag, cancellation, missing files, traversal rejection, exclusive no-overwrite writes; symlink assertions run when the OS permits creating test links.');
} finally { await rm(root, { recursive: true, force: true }); }
