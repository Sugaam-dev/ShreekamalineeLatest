const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

if (process.platform === 'win32') {
  const buildRoot = path.resolve('.next');
  const mkdir = fs.mkdir.bind(fs);
  const mkdirPromise = fs.promises.mkdir.bind(fs.promises);
  let pending = Promise.resolve();

  function isBuildPath(target) {
    if (target instanceof URL) target = fileURLToPath(target);
    if (Buffer.isBuffer(target)) target = target.toString();
    if (typeof target !== 'string') return false;
    const relative = path.relative(buildRoot, path.resolve(target));
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
  }

  function enqueue(operation) {
    const result = pending.then(operation);
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  fs.mkdir = function (target, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    if (!isBuildPath(target) || typeof callback !== 'function') return mkdir(target, options, callback);
    enqueue(() => new Promise((resolve, reject) => {
      const complete = (error, createdPath) => error ? reject(error) : resolve(createdPath);
      if (options === undefined) mkdir(target, complete);
      else mkdir(target, options, complete);
    })).then(
      createdPath => process.nextTick(callback, null, createdPath),
      error => process.nextTick(callback, error),
    );
  };

  fs.promises.mkdir = function (target, options) {
    return isBuildPath(target) ? enqueue(() => mkdirPromise(target, options)) : mkdirPromise(target, options);
  };
}
