import { constants } from "node:fs";
import { access, lstat, mkdir, open, realpath, link, unlink, copyFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

const keyPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.(jpg|png|webp)$/;
const mimeTypes: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const cacheControl = "public, max-age=31536000, immutable";
const maximumBytes = 10 * 1024 * 1024;

function validateKey(key: string): string {
  if (!keyPattern.test(key)) throw new Error("Invalid image storage key.");
  return key;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function configuredDirectory(): string {
  const configured = process.env.UPLOAD_DIR;
  if (process.env.NODE_ENV === "production" && (!configured || !path.isAbsolute(configured))) throw new Error("UPLOAD_DIR must be an absolute permanent directory in production.");
  const directory = path.resolve(configured || ".data/uploads");
  const relative = path.relative(process.cwd(), directory);
  if (process.env.NODE_ENV === "production" && (relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)))) {
    throw new Error("UPLOAD_DIR must be outside the application/release directory.");
  }
  return directory;
}

export async function prepareImageDirectory(directory = configuredDirectory()): Promise<string> {
  if (!path.isAbsolute(directory)) throw new Error("Image storage directory must be absolute.");
  const resolved = path.resolve(directory);
  await mkdir(resolved, { recursive: true, mode: 0o750 });
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || !samePath(await realpath(resolved), resolved)) throw new Error("Image storage directory must not contain symbolic links.");
  await access(resolved, constants.R_OK | constants.W_OK | constants.X_OK);
  return resolved;
}

export function createFileStore(directory: string) {
  if (!path.isAbsolute(directory)) throw new Error("Image storage directory must be absolute.");

  async function openImage(key: string) {
    validateKey(key);
    const root = await prepareImageDirectory(directory);
    const filename = path.join(root, key);
    let handle: FileHandle | undefined;
    try {
      const before = await lstat(filename);
      if (!before.isFile() || before.isSymbolicLink()) return null;
      handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const after = await handle.stat();
      if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
        await handle.close();
        return null;
      }
      return { handle, size: after.size };
    } catch (error) {
      if (handle) await handle.close();
      if (["ENOENT", "ELOOP"].includes((error as NodeJS.ErrnoException).code || "")) return null;
      throw error;
    }
  }

  return {
    async head(key: string) {
      const photo = await openImage(key);
      if (!photo) return null;
      await photo.handle.close();
      return { key, size: photo.size };
    },
    async put(key: string, bytes: Uint8Array, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
      validateKey(key);
      const type = mimeTypes[key.slice(key.lastIndexOf(".") + 1)];
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > maximumBytes) throw new Error("Image must be between 1 byte and 10 MB.");
      if (options?.httpMetadata?.contentType && options.httpMetadata.contentType !== type) throw new Error("Image MIME type does not match its extension.");
      const root = await prepareImageDirectory(directory);
      const temporary = path.join(root, `.${key}.${randomUUID()}.pending`);
      const destination = path.join(root, key);
      const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o640);
      try {
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally { await handle.close(); }
        try { await link(temporary, destination); }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code || "";
          if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV", "ENOSYS"].includes(code)) throw error;
          await copyFile(temporary, destination, constants.COPYFILE_EXCL);
        }
      } finally { await unlink(temporary); }
      return { key, size: bytes.byteLength };
    },
    async get(key: string) {
      const photo = await openImage(key);
      if (!photo) return null;
      try {
        const hash = createHash("sha256");
        for await (const chunk of photo.handle.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
        const httpEtag = '"' + hash.digest("hex") + '"';
        const stream = photo.handle.createReadStream({ start: 0, autoClose: true });
        const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
        return {
          key,
          size: photo.size,
          httpEtag,
          body,
          writeHttpMetadata(headers: Headers) {
            headers.set("Content-Type", mimeTypes[key.slice(key.lastIndexOf(".") + 1)]);
            headers.set("Content-Length", String(photo.size));
            headers.set("Cache-Control", cacheControl);
          },
        };
      } catch (error) {
        await photo.handle.close();
        throw error;
      }
    },
  };
}

export function getImageStore() {
  return createFileStore(configuredDirectory());
}

export const fileStore = getImageStore;
