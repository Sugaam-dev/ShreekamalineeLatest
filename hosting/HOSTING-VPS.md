# Shreekamalinee: provider deployment instructions

Follow [the final setup checklist](../Shreekamalinee-Final-VPS-Setup.txt) for the deployment sequence, including installing build dependencies, issuing the admin setup link after HTTPS is ready, and certificate renewal. This guide supplies supplementary technical details.

This package is the Linux VPS edition: Node.js/Next.js, PostgreSQL and a permanent image directory on the VPS. It does not require Cloudflare Workers, D1 or R2. Uploading the ZIP into `public_html` is not a deployment. The hosting provider should run the application as a supervised Node service behind an HTTPS reverse proxy.

## Required services

- Node.js 22.13 or newer, npm, and a Linux service manager such as systemd.
- PostgreSQL, with a dedicated database and restricted application role; keep its port private or otherwise restrict access to the application server.
- An absolute, writable, permanent image directory outside application releases, for example `/var/lib/shreekamalinee/uploads`. Keep this directory across upgrades and rollbacks. It must be a real directory rather than a symlink.
- Nginx or an equivalent reverse proxy, valid HTTPS certificates, and domain support for both `shreekamalinee.com` and `www.shreekamalinee.com`.
- Backups of PostgreSQL, the permanent image directory and protected runtime configuration, with a tested restore procedure. Capacity must allow for catalog growth and backups; no fixed RAM/disk capacity guarantee has been established.

The application accepts JPEG, PNG and WebP up to 10 MiB each. Its multipart request limit is 11 MiB. Configure the proxy to permit at least that amount; the supplied example uses `12m`. Bulk selection is up to 30 images uploaded sequentially, not a single 300 MB request.

## 1. Prepare directories and environment

Extract `source` to a stable application path, for example `/opt/shreekamalinee/source`. Keep `data` and `hosting` alongside it for the initial setup. Create a non-root Linux service user named `shreekamalinee`; grant it read access to the application and ownership of the upload directory. For example, after creating the service user:

```sh
sudo install -d -m 0750 -o shreekamalinee -g shreekamalinee /var/lib/shreekamalinee/uploads
cd /opt/shreekamalinee/source
cp .env.example .env.production
chmod 600 .env.production
```

Edit `.env.production` privately. Do not paste credentials into a public ticket or commit them to Git. Configure at least:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://APP_USER:APP_PASSWORD@127.0.0.1:5432/shreekamalinee
UPLOAD_DIR=/var/lib/shreekamalinee/uploads
APP_ORIGIN=https://shreekamalinee.com
APP_BIND_HOST=127.0.0.1
PORT=3000
TRUST_PROXY=true
```

Use the provider's real PostgreSQL connection details. For a remote database, use the provider's required certificate-verified TLS configuration. Do not disable certificate checks. Leave admin setup secrets for the setup helper. Ensure the service user can read this protected environment file.

`APP_ORIGIN` must exactly match the public canonical HTTPS origin. The supplied Nginx example redirects `www` to the apex domain. For initial testing, the provider may use an owned HTTPS staging hostname instead; configure that same hostname in both `APP_ORIGIN` and the proxy, then update both consistently before final cutover.

## 2. Install, migrate and import into the new database

As the application service user, from `source`:

```sh
npm ci
node scripts/migrate-postgres.mjs
node scripts/import-catalog.mjs ../data/catalog-snapshot.json
rsync -a --ignore-existing ../data/media/ /var/lib/shreekamalinee/uploads/
node scripts/file-storage.test.mjs
npm run build
```

Run the catalog import once on the new destination database. Do not reimport the original snapshot over a live store containing newer changes. The snapshot and exported media preserve existing product/category names, prices, visibility and original photo identifiers. The source also includes built-in product photos. If `data/media` is empty, there are no separately uploaded media files in this snapshot.

The package has passed three production builds, including a clean rebuild, and production-mode checks against native PostgreSQL 18.7 and Nginx 1.30.7. Windows builds serialize generated-directory creation to avoid a Windows concurrency failure; Linux uses the standard build behavior. The provider still needs to verify its actual runtime configuration and public certificates.

The filesystem adapter refuses traversal keys, symlink storage paths and replacement of an existing UUID photo. It writes a complete temporary file, then publishes with an atomic hard link where supported. Filesystems that prohibit hard links use an exclusive copy; the URL is returned only after that copy completes. Media responses stream from disk and retain ETags and the original image content type.

## 3. Prepare fresh admin setup

After the database migration/import, create a private one-hour setup link:

```sh
node scripts/setup-admin.mjs --env-file .env.production --origin https://shreekamalinee.com --dry-run
node scripts/setup-admin.mjs --env-file .env.production --origin https://shreekamalinee.com
```

Use the configured staging origin instead if testing on staging. The helper checks that the destination has no admin, stores new setup secrets in the protected environment file, preserves an existing valid password pepper, and prints the private setup link once. Do not forward that link to unrelated parties. The website owner will open it after the application and HTTPS proxy start, then choose the admin username and password. Original admin passwords and login sessions are not included in this migration package.

## 4. Start the production service

Use `npm start` from `source`, supervised by systemd or the provider's Node process manager. The application must bind to loopback; do not expose port 3000 publicly. A systemd example is supplied as `shreekamalinee.service`. Adjust its application path, service user and actual Node executable path before installation.

```sh
sudo cp ../hosting/shreekamalinee.service /etc/systemd/system/shreekamalinee.service
sudo systemctl daemon-reload
sudo systemctl enable --now shreekamalinee
sudo systemctl status shreekamalinee
```

If this source is deployed elsewhere, adjust `../hosting` accordingly. After future environment-file changes, restart the service so the process reloads the configuration.

## 5. Configure HTTPS and the proxy

`nginx-bootstrap.conf` contains an HTTP-only maintenance/ACME configuration and no certificate paths, so it can be syntax-checked before certificates are installed. It does not proxy the application or permit an insecure admin login. The provider must install valid certificates for both domain names, using its normal verified certificate process.

After certificates exist, use `nginx-shreekamalinee.conf`, adjusting the certificate paths. It redirects HTTP and `www` to `https://shreekamalinee.com`, proxies to loopback port 3000, permits image uploads, and overwrites `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-Port`, `X-Real-IP` and `X-Forwarded-For` before sending requests to the app. `TRUST_PROXY=true` assumes this single trusted proxy and a Node port inaccessible from the Internet. If adding another CDN/proxy, the provider must explicitly adapt and verify the trusted-client-IP handling.

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Do not claim HTTPS works until the actual certificate and both public names have been tested. DNS/domain changes are a separate provider action; this package does not change them automatically.

## 6. Verify before switching the public website

Use the provider's HTTPS staging hostname or another controlled preview method. Check every collection, prices with `+ shipping`, full photos in their boxes, swipe galleries and the admin sign-in/setup flow. Test one admin upload and category edit, restart the application and confirm that the upload still exists. The photo must remain in `UPLOAD_DIR`; the database record must remain in PostgreSQL.

Open a product and confirm its reference is `SK-ProductNameWithoutSpaces`. Its WhatsApp link must address `919820785210` and include the selected product name, reference, price, product link and original image link. Hide the test product afterwards.

After owner admin setup succeeds, remove `ADMIN_SETUP_TOKEN_HASH` and `ADMIN_SETUP_EXPIRES_AT` from `.env.production`, retain `ADMIN_PASSWORD_PEPPER` unchanged, and restart the service. Keep a protected backup of the pepper: changing or losing it prevents existing password verification.

Only after validation should the provider update the domain to the new host. Preserve email, TXT verification and unrelated DNS records. Check both apex and `www` over HTTPS, and retain the old hosting until cutover is confirmed.

## Updates and backups

For later releases: back up the database, upload folder and environment configuration; install dependencies from the lockfile; apply new migrations; build; restart the supervised service; verify. Keep the same PostgreSQL data and `UPLOAD_DIR`. Never delete the permanent image folder, rebuild the database, rotate the password pepper, or reimport the initial snapshot during a normal application update.

The source archive deliberately excludes `.env.production`. When installing a new release directory, securely provide the same protected runtime variables before starting it; do not generate a fresh pepper or lose the existing database connection settings.

Schedule provider-managed database and file backups to a separate location with retention and restore tests. PostgreSQL's [backup documentation](https://www.postgresql.org/docs/current/backup.html) and [pg_dump reference](https://www.postgresql.org/docs/current/app-pgdump.html) describe the database portion; image files and runtime secrets also require their own protected backup.

Provider references: [Nginx proxy headers](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header), [Nginx request-size limit](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size), [systemd services](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).
