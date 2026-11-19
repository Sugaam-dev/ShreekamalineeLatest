import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const storefront = await readFile(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  return new Response(storefront, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
}
