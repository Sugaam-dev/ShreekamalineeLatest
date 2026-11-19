"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { json, photoUrl, priceLabel, readPrice, request, type Catalog, type Category, type Collection } from "./admin-data";

type Editor = { kind: "collection"; value?: Collection } | { kind: "subcategory"; value?: Category; parentId?: string };
type Saved = (message: string) => Promise<void>;

function cleanName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Use a name with 2–80 characters.");
  return name;
}

export default function CategoryManager({ catalog, initialSubcategoryParent, onSaved }: {
  catalog: Catalog; initialSubcategoryParent: string | null; onSaved: Saved;
}) {
  const [editor, setEditor] = useState<Editor | null>(initialSubcategoryParent ? { kind: "subcategory", parentId: initialSubcategoryParent } : null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");

  function edit(value: Editor) {
    setEditor(value); setError(""); setSavedNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function saved(message: string) {
    setEditor(null); setError(""); setSavedNotice("");
    try { await onSaved(message); }
    catch { setSavedNotice(message); setError("Your change was saved, but the category list could not refresh. Reload this page before making another change."); }
  }

  async function toggle(item: Collection | Category, isCollection: boolean) {
    if (pending) return;
    setPending(item.id); setError(""); setSavedNotice("");
    try {
      await request(`/api/admin/${isCollection ? "collections" : "categories"}/${encodeURIComponent(item.id)}`, json("PATCH", { hidden: !item.hidden }));
      const message = item.hidden
        ? `${item.name} has been restored.${!isCollection && (item as Category).parentHidden ? " Its parent category is still hidden." : " Individually hidden products and subcategories stay hidden."}`
        : `${item.name} is hidden from the shop, together with its products${isCollection ? " and subcategories" : ""}. You can restore it here.`;
      await saved(message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change visibility."); }
    finally { setPending(""); }
  }

  return <div className="admin-category-manager">
    <section className="admin-panel">
      <div className="admin-section-title"><div><h2>Categories &amp; Subcategories</h2><p>Create categories for your shop, then add subcategories for product types and their prices.</p></div></div>
      <div className="admin-manager-actions"><button type="button" className="admin-button" disabled={Boolean(pending)} onClick={() => edit({ kind: "collection" })}>Add Category</button><button type="button" className="admin-button secondary" disabled={!catalog.collections.length || Boolean(pending)} onClick={() => edit({ kind: "subcategory" })}>Add Subcategory</button></div>
      <p className="admin-callout">A subcategory can use its own price or inherit its category’s default. Price changes apply to existing and new products using those defaults. Individual product price overrides stay as set. All prices are + shipping.</p>
      <p className="admin-help admin-manager-guidance">Hiding a category also hides its subcategories and products. Restoring it keeps individually hidden items hidden.</p>
    </section>
    {savedNotice && <p className="admin-success" role="status">{savedNotice}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {editor?.kind === "collection" && <CollectionForm key={editor.value?.id || "new-collection"} collection={editor.value} catalog={catalog} onCancel={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === "subcategory" && <SubcategoryForm key={editor.value?.id || `new-subcategory-${editor.parentId || ""}`} category={editor.value} parentId={editor.parentId} collections={catalog.collections} onCancel={() => setEditor(null)} onSaved={saved} />}
    <div className="admin-collection-list">{catalog.collections.map(collection => {
      const children = catalog.categories.filter(category => category.collection === collection.id);
      const productCount = catalog.products.filter(product => product.collection === collection.id).length;
      const cover = collection.image || catalog.products.find(product => product.collection === collection.id && !product.hidden && !product.categoryHidden)?.image;
      return <article className="admin-panel admin-collection-card" key={collection.id}>
        <div className="admin-collection-summary">
          {cover && <img src={photoUrl(cover)} alt="" width="76" height="100" loading="lazy" />}
          <div className="admin-collection-info"><span className="admin-product-category">Category</span><h3>{collection.name}</h3>{collection.hidden && <span className="admin-badge">Category hidden</span>}<p className="admin-help">Default: {priceLabel(collection.price)}</p><p className="admin-help">{children.length} {children.length === 1 ? "subcategory" : "subcategories"} · {productCount} {productCount === 1 ? "product" : "products"}</p>{collection.description && <p className="admin-collection-description">{collection.description}</p>}</div>
        </div>
        <div className="admin-row-actions"><button type="button" className="admin-button secondary" disabled={Boolean(pending)} onClick={() => edit({ kind: "collection", value: collection })}>Edit Category</button><button type="button" className="admin-text-link" disabled={Boolean(pending)} onClick={() => void toggle(collection, true)}>{pending === collection.id ? "Saving…" : collection.hidden ? "Restore Category" : "Hide Category"}</button></div>
        <div className="admin-subcategory-list">{children.map(category => {
          const count = catalog.products.filter(product => product.categoryId === category.id).length;
          return <div className="admin-subcategory-row" key={category.id}>
            <div><h4>{category.name}</h4><p className="admin-subcategory-price">{priceLabel(category.price)}</p><p className="admin-help">{category.ownPrice === null ? `Inherits ${collection.name} default` : "Uses its own default price"} · {count} {count === 1 ? "product" : "products"}</p>{category.hidden && <span className="admin-badge">Subcategory hidden</span>}{category.parentHidden && <span className="admin-badge">Hidden by category</span>}</div>
            <div className="admin-row-actions"><button type="button" className="admin-button secondary" disabled={Boolean(pending)} onClick={() => edit({ kind: "subcategory", value: category })}>Edit</button><button type="button" className="admin-text-link" disabled={Boolean(pending)} onClick={() => void toggle(category, false)} aria-label={`${category.hidden ? "Restore" : "Hide"} ${category.name}`}>{pending === category.id ? "Saving…" : category.hidden ? "Restore" : "Hide"}</button></div>
          </div>;
        })}</div>
        {!children.length && <p className="admin-help admin-manager-guidance">Add a subcategory before uploading products into {collection.name}.</p>}
        <button type="button" className="admin-text-link" disabled={Boolean(pending)} onClick={() => edit({ kind: "subcategory", parentId: collection.id })}>Add Subcategory to {collection.name}</button>
      </article>;
    })}</div>
    {!catalog.collections.length && <section className="admin-panel admin-empty"><h3>Your shop is ready for its first category</h3><p>Create a category, add a subcategory, then upload your products.</p></section>}
  </div>;
}

function CollectionForm({ collection, catalog, onCancel, onSaved }: { collection?: Collection; catalog: Catalog; onCancel: () => void; onSaved: Saved }) {
  const [name, setName] = useState(collection?.name || "");
  const [description, setDescription] = useState(collection?.description || "");
  const [price, setPrice] = useState(collection?.price == null ? "" : String(collection.price));
  const [image, setImage] = useState(collection?.image || null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const automatic = catalog.products.find(product => product.collection === collection?.id && !product.hidden && !product.categoryHidden)?.image;
  const displayImage = preview || image || automatic;

  function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG or WebP cover photo. Convert HEIC photos to JPEG first."); return; }
    if (!file.size || file.size > 10 * 1024 * 1024) { setError("The cover photo must be 10 MB or smaller."); return; }
    setFile(file); setPreview(URL.createObjectURL(file));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError("");
    let body: { name: string; description: string; price: number | null; image: string | null };
    try { body = { name: cleanName(name), description: description.trim(), price: readPrice(price), image }; }
    catch (cause) { setError((cause as Error).message); return; }
    setBusy(true);
    try {
      if (file) {
        setProgress("Uploading cover photo…");
        const data = new FormData(); data.append("file", file);
        const uploaded = await request<{ url: string }>("/api/admin/uploads", { method: "POST", body: data });
        body.image = uploaded.url;
      }
      setProgress("Saving category…");
      await request(collection ? `/api/admin/collections/${encodeURIComponent(collection.id)}` : "/api/admin/collections", json(collection ? "PATCH" : "POST", body));
      await onSaved(`${body.name} has been ${collection ? "updated" : "created"}. Its default price is ${priceLabel(body.price)}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this category."); }
    finally { setBusy(false); setProgress(""); }
  }

  return <section className="admin-panel admin-category-editor">
    <div className="admin-section-title"><div><span className="admin-product-category">Category</span><h2>{collection ? "Edit Category" : "Add Category"}</h2><p>A category appears in your shop’s main collections.</p></div></div>
    <form onSubmit={submit} className="admin-product-form"><fieldset disabled={busy}>
      <label>Category name<input autoFocus required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Jewellery" /></label>
      <label>Description (optional)<textarea rows={3} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="A short introduction for your customers" /></label>
      <label>Default category price (₹) + shipping<input type="number" min="0.01" max="10000000" step="0.01" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="Price on request" /></label>
      <p className="admin-help">Leave blank for price on request. Subcategories without their own price inherit this default.</p>
      <div className="admin-category-cover"><div className="admin-cover-preview">{displayImage ? <img src={preview ? displayImage : photoUrl(displayImage)} alt="Category cover preview" /> : <span>Automatic cover once products are added</span>}</div><div><h3>Category cover (optional)</h3><p className="admin-help">JPEG, PNG or WebP, up to 10 MB. Use an uploaded photo or automatically show a product from this category.</p><input ref={fileInput} type="file" id="category-cover" className="admin-file-input" accept="image/jpeg,image/png,image/webp" onChange={event => choose(event.target.files?.[0])} /><label htmlFor="category-cover" className="admin-upload-button">Choose cover</label><button type="button" className="admin-text-link" onClick={() => { setImage(null); setFile(null); setPreview(""); }}>Use automatic cover</button><p className="admin-help">{image || file ? "Custom cover selected" : "Automatic product cover selected"}</p></div></div>
    </fieldset>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><button type="submit" className="admin-button" disabled={busy}>{busy ? "Saving…" : collection ? "Save Category" : "Create Category"}</button><button type="button" className="admin-button secondary" disabled={busy} onClick={onCancel}>Cancel</button></div>{busy && <p className="admin-progress" role="status">{progress}</p>}</form>
  </section>;
}

function SubcategoryForm({ category, parentId, collections, onCancel, onSaved }: { category?: Category; parentId?: string; collections: Collection[]; onCancel: () => void; onSaved: Saved }) {
  const [name, setName] = useState(category?.name || "");
  const [collection, setCollection] = useState(category?.collection || parentId || collections[0]?.id || "");
  const [price, setPrice] = useState(category?.ownPrice == null ? "" : String(category.ownPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parent = collections.find(item => item.id === collection);
  const effectivePrice = price.trim() && Number.isFinite(Number(price)) ? Number(price) : parent?.price;

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError("");
    let body: { name: string; collection: string; price: number | null };
    try {
      if (!parent) throw new Error("Choose a parent category.");
      body = { name: cleanName(name), collection, price: readPrice(price) };
    } catch (cause) { setError((cause as Error).message); return; }
    setBusy(true);
    try {
      await request(category ? `/api/admin/categories/${encodeURIComponent(category.id)}` : "/api/admin/categories", json(category ? "PATCH" : "POST", body));
      await onSaved(`${body.name} has been ${category ? "updated" : "created"} under ${parent!.name}. Products using its default price now use ${priceLabel(body.price ?? parent!.price)}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this subcategory."); }
    finally { setBusy(false); }
  }

  return <section className="admin-panel admin-category-editor"><div className="admin-section-title"><div><span className="admin-product-category">Subcategory</span><h2>{category ? "Edit Subcategory" : "Add Subcategory"}</h2><p>Group related products and choose their default price.</p></div></div>
    <form onSubmit={submit} className="admin-product-form"><fieldset disabled={busy}>
      <label>Parent category<select required value={collection} onChange={event => setCollection(event.target.value)}>{!collections.length && <option value="">Create a category first</option>}{collections.map(item => <option key={item.id} value={item.id}>{item.name}{item.hidden ? " (Hidden)" : ""}</option>)}</select></label>
      <label>Subcategory name<input autoFocus required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Silver Jewellery" /></label>
      <div className="admin-form-grid"><div className="admin-field"><label>Subcategory price (₹) + shipping<input type="number" min="0.01" max="10000000" step="0.01" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="Inherit category price" /></label><p className="admin-help">Leave blank to inherit {parent ? `${parent.name}: ${priceLabel(parent.price)}` : "the parent category’s default"}.</p></div><div className="admin-price-summary"><span>Effective default price</span><strong>{priceLabel(effectivePrice)}</strong><span>{price.trim() ? "Uses subcategory price" : "Inherits parent category price"}</span></div></div>
      {parent?.hidden && <p className="admin-callout">This parent category is hidden. Products in this subcategory stay hidden until the category is restored.</p>}
      {category && collection !== category.collection && <p className="admin-callout">Moving this subcategory also moves its existing products to the selected category. Product links stay the same.</p>}
    </fieldset>{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-form-actions"><button type="submit" className="admin-button" disabled={busy || !parent}>{busy ? "Saving…" : category ? "Save Subcategory" : "Create Subcategory"}</button><button type="button" className="admin-button secondary" disabled={busy} onClick={onCancel}>Cancel</button></div></form>
  </section>;
}
