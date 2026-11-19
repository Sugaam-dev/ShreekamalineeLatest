import { createHash } from "node:crypto";
import type { Product } from "./catalog-seed";

type PhotoSource = Pick<Product, "id" | "name" | "collection" | "type" | "categoryId" | "image" | "gallery" | "price" | "details" | "variationNote"> & { hidden?: boolean };

export type PhotoProduct = {
  id: string;
  sourceProductId: string;
  designCode: string;
  name: string;
  image: string;
  gallery: [];
  categoryId: string;
  collection: string;
  type?: string;
  price: number | null;
  details?: string[];
  variationNote?: string;
};

function canonicalImagePath(image: string): string {
  return image.startsWith("/") ? image : "/" + image.replace(/^(?:\.\/)+/, "");
}

export function projectPhotoProducts(sources: readonly PhotoSource[]): PhotoProduct[] {
  return sources.flatMap(source => {
    if (source.hidden) return [];
    const images = [...new Set([source.image, ...source.gallery].map(canonicalImagePath))];
    return images.map((image, index) => {
      const hash = createHash("sha256").update(source.id + "\0" + image).digest("hex");
      const name = images.length === 1 ? source.name : source.name + " – Design " + (index + 1);
      const referenceName = name.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]/gu, "") || name.replace(/\s+/gu, "");
      return {
        id: source.id + "--photo-" + hash.slice(0, 24),
        sourceProductId: source.id,
        designCode: "SK-" + referenceName,
        name,
        image,
        gallery: [] as [],
        categoryId: source.categoryId,
        collection: source.collection,
        type: source.type,
        price: source.price ?? null,
        ...(source.details ? { details: [...source.details] } : {}),
        ...(source.variationNote !== undefined ? { variationNote: source.variationNote } : {}),
      };
    });
  });
}
