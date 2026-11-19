export type Collection = { id: string; name: string; description: string; image: string | null; price: number | null; hidden: boolean };
export type Category = { id: string; name: string; collection: string; type?: string; price: number | null; ownPrice: number | null; hidden: boolean; parentHidden: boolean };
export type Product = {
  id: string; name: string; collection: string; type?: string; categoryId: string;
  image: string; gallery: string[]; price: number | null; priceOverride: number | null;
  details: string[]; hidden: boolean; categoryHidden: boolean;
};
export type Catalog = { products: Product[]; categories: Category[]; collections: Collection[] };

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
export const priceLabel = (price: number | null | undefined) => price == null ? "Price on request" : `${money.format(price)} + shipping`;
export const photoUrl = (path: string) => path.startsWith("/") || /^https?:\/\//.test(path) ? path : `/${path}`;

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { credentials: "same-origin", ...options }); }
  catch { throw new Error("Connection interrupted. Check your internet and try again."); }
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event("admin-session-expired"));
      throw new Error("Your session has ended. Sign in again to continue. Your unsaved form is still open.");
    }
    throw new Error(data.error || "We could not save this change. Please try again.");
  }
  return data as T;
}

export function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function readPrice(value: string): number | null {
  if (!value.trim()) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0 || price > 10000000 || Math.abs(Math.round(price * 100) - price * 100) > 0.000001) {
    throw new Error("Enter a price greater than ₹0, with up to two decimal places.");
  }
  return price;
}
