import assert from 'node:assert/strict';
import { applicationOrigin, trustedClientIp } from '../lib/request-security.ts';

const internal = new Request('http://127.0.0.1:3000/api/admin/login', { headers: { origin: 'https://shreekamalinee.com', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'http', 'x-real-ip': '192.0.2.10', 'cf-connecting-ip': '198.51.100.10', 'x-forwarded-for': '198.51.100.20' } });
assert.equal(applicationOrigin(internal, { APP_ORIGIN: 'https://shreekamalinee.com/', NODE_ENV: 'production' }), 'https://shreekamalinee.com');
assert.throws(() => applicationOrigin(internal, { NODE_ENV: 'production' }));
for (const value of ['http://example.com', 'https://name:password@example.com', 'https://example.com/path', 'https://example.com/?x=1', 'https://example.com/#x']) assert.throws(() => applicationOrigin(internal, { APP_ORIGIN: value, NODE_ENV: 'production' }));
assert.equal(applicationOrigin(internal, { NODE_ENV: 'development' }), 'http://127.0.0.1:3000');
assert.equal(trustedClientIp(internal, { TRUST_PROXY: 'true' }), '192.0.2.10');
assert.equal(trustedClientIp(internal, {}), 'unavailable');
assert.equal(trustedClientIp(internal, { TRUST_PROXY: 'false' }), 'unavailable');
for (const value of ['192.0.2.10, 198.51.100.10', 'attacker.example', '127.0.0.1:8080', 'unknown', '']) {
  const request = new Request(internal.url, { headers: { 'x-real-ip': value, 'cf-connecting-ip': '192.0.2.30', 'x-forwarded-for': '192.0.2.40' } });
  assert.equal(trustedClientIp(request, { TRUST_PROXY: 'true' }), 'unavailable');
}
assert.equal(trustedClientIp(new Request(internal.url, {headers: {'x-real-ip': '2001:db8::1'}}), { TRUST_PROXY: 'true' }), '2001:db8::1');
console.log('PASS: canonical public origin, production configuration checks, forwarded-host isolation and explicit validated proxy IP trust.');
