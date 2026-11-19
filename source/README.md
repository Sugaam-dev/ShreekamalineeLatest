# Shreekamalinee VPS edition

Node.js/Next.js, PostgreSQL and persistent local image storage. Open `../START-HERE.txt` and `../hosting/HOSTING-VPS.md` before installation. The original Cloudflare runtime is removed from this edition.

```sh
npm ci
cp .env.example .env.production
# Privately configure the destination database, image directory and HTTPS origin.
npm run db:migrate
npm run catalog:import
npm run admin:setup -- --env-file .env.production --origin https://YOUR-STAGING-DOMAIN
npm run build
npm start
```

Run the catalog import only once against a fresh destination database. Create the admin login by opening the setup helper's private link after HTTPS is working. Use a supervisor such as the provided systemd service for production.

`UPLOAD_DIR` must be an absolute permanent directory outside the application/release directory. The service account must be able to read/write that directory. Uploads use atomic hard-link publication where supported, with an exclusive-copy fallback for filesystems that prohibit hard links. The image URL is returned only after the write completes; existing UUID files are never replaced. Nginx must overwrite the proxy headers, and the Node port must remain private when `TRUST_PROXY=true`.

The PostgreSQL migration runner uses immutable, checksummed SQL under `database/`. Future migrations must be new top-level numbered SQL files. Drizzle's generation command writes draft SQL under `database/generated`; review and move a new migration to `database/` before applying it. Never edit a migration already applied to a running database.

Validation commands for the provider's staging environment:

```sh
node scripts/postgres.test.mjs
node scripts/request-security.test.mjs
node scripts/file-storage.test.mjs
node scripts/photo-products.test.mjs
node scripts/windows-build-dirs.test.cjs scripts/windows-build-dirs.cjs
```

The PostgreSQL test uses a temporary table. The file-storage test uses a temporary directory. Node.js 24 is the locally tested version; older supported Node versions may require `--experimental-strip-types` for test scripts importing `.ts` modules. Normal application build/start compiles TypeScript through Next.js.

Windows builds serialize directory creation inside `.next` to prevent concurrent generated-folder failures. The helper is loaded only for Windows builds, forwards filesystem errors, and does not change permissions. Linux builds and the running application use the normal filesystem APIs.

Three production builds, including a clean rebuild, passed. The production server was verified with native PostgreSQL 18.7, Nginx HTTPS requests, browser admin/bulk uploads and persistence across restarts. See `../verification-summary.json` for details. The provider should run its normal deployment smoke checks and configure the actual domain certificates before DNS cutover.
