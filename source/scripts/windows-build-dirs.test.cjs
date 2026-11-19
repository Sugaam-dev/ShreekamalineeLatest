const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helper = fs.readFileSync(process.argv[2], 'utf8');
let active = 0, maximum = 0;
const calls = [];
function complete(target, callback) {
  active++; maximum = Math.max(maximum, active); calls.push(target);
  setImmediate(() => {
    active--;
    if (String(target).endsWith('fail')) callback(Object.assign(new Error('mkdir failed'), {code: 'EPERM'}));
    else callback(null, target + '-created');
  });
}
const mockFs = {
  mkdir(target, options, callback) { complete(target, typeof options === 'function' ? options : callback); },
  promises: { mkdir(target) { return new Promise((resolve, reject) => complete(target, (error, created) => error ? reject(error) : resolve(created))); } },
};
const context = {
  require: name => name === 'node:fs' ? mockFs : require(name),
  process: { platform: 'win32', nextTick: process.nextTick }, Buffer, URL, Promise,
};
vm.runInNewContext(helper, context);
const target = name => path.resolve('.next', name);
const callbackMkdir = (name, options) => new Promise((resolve, reject) => {
  const result = mockFs.mkdir(target(name), options, (error, created) => error ? reject(error) : resolve(created));
  assert.equal(result, undefined);
});
(async () => {
  const results = await Promise.all([
    callbackMkdir('one'), mockFs.promises.mkdir(target('two'), {recursive: true}),
    callbackMkdir('three', {recursive: true}),
  ]);
  assert.equal(maximum, 1);
  assert.deepEqual(results, ['one', 'two', 'three'].map(name => target(name) + '-created'));
  await assert.rejects(callbackMkdir('fail'), {code: 'EPERM'});
  await assert.rejects(mockFs.promises.mkdir(target('fail')), {code: 'EPERM'});
  assert.equal(await mockFs.promises.mkdir(target('after')), target('after') + '-created');
  const beforeOutside = calls.length;
  const outside = path.resolve('.next-other', 'outside');
  const outsidePromise = mockFs.promises.mkdir(outside);
  assert.equal(calls.length, beforeOutside + 1, 'Outside paths must bypass the queue');
  assert.equal(await outsidePromise, outside + '-created');
  console.log('PASS: shared serialization, callback return, recursive created-path results, callback/promise errors, queue recovery and outside-path passthrough.');
})().catch(error => { console.error(error); process.exitCode = 1; });
