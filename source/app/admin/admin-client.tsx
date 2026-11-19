"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { authRequest, CredentialsForm, LoginForm, ReauthenticationDialog } from "./auth-controls";
import CategoryManager from "./category-manager";
import { json, photoUrl, priceLabel, readPrice, request, type Catalog, type Category, type Collection, type Product } from "./admin-data";
type Session = { authenticated: boolean; authorized: boolean; configured: boolean; username?: string };
type Photo = { file: File; preview: string; name: string };
const nameFromFile = (file: File) => file.name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim().slice(0, 180) || "Product";

export default function AdminClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState("add");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [newSubcategoryParent, setNewSubcategoryParent] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pending, setPending] = useState("");
  const [reauthenticate, setReauthenticate] = useState(false);
  const [changingLogin, setChangingLogin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function reload() {
    const data = await request<Catalog>("/api/admin/catalog");
    setCatalog(data);
  }

  async function loadSession() {
    setSessionError("");
    try {
      const response = await fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json() as Partial<Session> & { error?: string };
      if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error(data.error || "Unable to check your login.");
      const next = { authenticated: response.status !== 401 && Boolean(data.authenticated), authorized: response.ok && Boolean(data.authorized), configured: Boolean(data.configured), username: data.username };
      setSession(next);
      if (next.authorized) {
        try { await reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load your products."); }
      }
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Unable to connect. Please try again.");
    }
  }

  useEffect(() => {
    void loadSession();
    const expired = () => setReauthenticate(true);
    window.addEventListener("admin-session-expired", expired);
    return () => window.removeEventListener("admin-session-expired", expired);
  }, []);

  async function signedIn(username: string) {
    setSession({ authenticated: true, authorized: true, configured: true, username });
    setSessionError("");
    setReauthenticate(false);
    if (!catalog) {
      try { await reload(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load your products. Please try again."); }
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setError("");
    try {
      await authRequest("/api/admin/logout", {});
      setSession({ authenticated: false, authorized: false, configured: true });
      setCatalog(null); setEditing(null); setChangingLogin(false); setReauthenticate(false); setNotice("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign out. Please try again."); }
    finally { setSigningOut(false); }
  }

  async function completed(message: string) {
    await reload();
    setNotice(message);
    setError("");
    setEditing(null);
  }

  async function toggleHidden(product: Product) {
    setPending(product.id);
    setError("");
    try {
      await request(`/api/admin/products/${encodeURIComponent(product.id)}`, json("PATCH", { hidden: !product.hidden }));
      await completed(`${product.name} ${product.hidden ? product.categoryHidden ? "has been restored, but its category is still hidden." : "is now visible in the shop." : "is hidden from the shop. You can restore it here."}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change visibility.");
    } finally { setPending(""); }
  }

  const shown = useMemo(() => catalog?.products.filter(product =>
    (!collectionFilter || product.collection === collectionFilter) &&
    (!categoryFilter || product.categoryId === categoryFilter) &&
    (statusFilter === "all" || (statusFilter === "hidden" ? product.hidden || product.categoryHidden : !product.hidden && !product.categoryHidden)) &&
    `${product.name} ${product.type || ""}`.toLowerCase().includes(search.toLowerCase().trim())
  ) ?? [], [catalog, search, collectionFilter, categoryFilter, statusFilter]);

  function manageCategories(parent?: string) {
    setNewSubcategoryParent(parent || null);
    setTab("categories"); setNotice(""); setError("");
    window.scrollTo({ top: 0 });
  }

  return <div className="admin-shell">
    <header className="admin-header">
      <a href="/" aria-label="Shreekamalinee home"><img src="/logo-240.png" alt="Shreekamalinee" width="190" height="78" /></a>
      <div className="admin-header-actions"><a href="/" className="admin-text-link">View shop</a>{session?.authorized && <><button type="button" className="admin-text-link" onClick={() => setChangingLogin(current => !current)}>Change login</button><button type="button" className="admin-text-link" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button></>}</div>
    </header>
    <main className="admin-main">
      {!session?.authorized ? <section className="admin-login admin-panel">
        <span className="admin-kicker">SHREEKAMALINEE</span>
        <h1>Product Manager</h1>
        {sessionError ? <><p role="alert" className="admin-error">{sessionError}</p><button className="admin-button" onClick={() => void loadSession()}>Try again</button></> : !session ? <p role="status">Checking your login…</p> : session.configured ? <>
          <p>Upload product photos and manage category prices from your phone or computer.</p>
          <LoginForm onSuccess={signedIn} />
          <p className="admin-help">Use your Shreekamalinee admin username and password.</p>
        </> : <>
          <p>Your admin login has not been set up yet.</p>
          <p className="admin-help">Use the private setup link provided by your website administrator to choose your username and password.</p>
        </>}
      </section> : <>
        <div className="admin-heading"><div><span className="admin-kicker">YOUR SHOP, AT YOUR FINGERTIPS</span><h1>Product Manager</h1><p>Keep your collections fresh and your prices up to date.</p></div><span className="admin-owner">Owner access</span></div>
        {changingLogin && <section className="admin-panel admin-security-panel"><h2>Change your login</h2><p className="admin-help">Update your admin username or password.</p><CredentialsForm mode="change" username={session.username} onCancel={() => setChangingLogin(false)} onSuccess={username => { setSession(current => current ? { ...current, username } : current); setChangingLogin(false); setNotice("Your admin login has been updated. Other devices have been signed out."); }} /></section>}
        <nav className="admin-tabs" aria-label="Product management">
          {[['add', 'Add Product'], ['products', 'Products'], ['categories', 'Categories']].map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setEditing(null); setNewSubcategoryParent(null); setNotice(""); setError(""); }}>{label}</button>)}
        </nav>
        {notice && <div className="admin-success" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
        {error && <p className="admin-error" role="alert">{error}</p>}
        {!catalog ? <section className="admin-panel"><p role="status">Loading your products…</p><button className="admin-button secondary" onClick={() => void reload().catch(cause => setError(cause.message))}>Retry loading</button></section> : <>
          {tab === "add" && <ProductForm key="add" categories={catalog.categories} collections={catalog.collections} onManageCategories={manageCategories} onSaved={completed} />}
          {tab === "products" && (editing ? <ProductForm key={editing.id} categories={catalog.categories} collections={catalog.collections} onManageCategories={manageCategories} product={editing} onCancel={() => setEditing(null)} onSaved={completed} /> : <section className="admin-panel">
            <div className="admin-section-title"><div><h2>Your products</h2><p className="admin-help">Edit details or hide products that are unavailable.</p></div><span className="admin-count">{catalog.products.length} products</span></div>
            <div className="admin-filters admin-product-filters">
              <label>Search<input type="search" placeholder="Find a product" value={search} onChange={event => setSearch(event.target.value)} /></label>
              <label>Category<select value={collectionFilter} onChange={event => { setCollectionFilter(event.target.value); setCategoryFilter(""); }}><option value="">All categories</option>{catalog.collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label>
              <label>Subcategory<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">All subcategories</option>{catalog.categories.filter(category => !collectionFilter || category.collection === collectionFilter).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>Visibility<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All products</option><option value="visible">Visible in shop</option><option value="hidden">Hidden from shop</option></select></label>
            </div>
            <p className="admin-help">Showing {shown.length} {shown.length === 1 ? "product" : "products"}</p>
            <div className="admin-product-list">{shown.map(product => <article key={product.id} className={`admin-product-row${product.hidden ? " is-hidden" : ""}`}>
              <img src={photoUrl(product.image)} alt="" loading="lazy" width="86" height="129" />
              <div className="admin-product-info"><span className="admin-product-category">{catalog.collections.find(collection => collection.id === product.collection)?.name} · {catalog.categories.find(category => category.id === product.categoryId)?.name}</span><h3>{product.name}</h3><p className="admin-product-price">{priceLabel(product.price)}</p>{product.hidden && <span className="admin-badge">Product hidden</span>}{product.categoryHidden && <span className="admin-badge">Hidden by category</span>}<div className="admin-row-actions"><button type="button" className="admin-button secondary" disabled={Boolean(pending)} onClick={() => { setEditing(product); setNotice(""); setError(""); window.scrollTo({ top: 0 }); }}>Edit product</button><button type="button" className="admin-text-link" disabled={Boolean(pending)} onClick={() => void toggleHidden(product)}>{pending === product.id ? "Saving…" : product.hidden ? "Restore" : "Hide"}</button>{!product.hidden && !product.categoryHidden && <a className="admin-text-link" href={`/#product/${product.id}`} target="_blank" rel="noreferrer">View</a>}</div></div>
            </article>)}</div>
            {!shown.length && <div className="admin-empty"><h3>No matching products</h3><p>Try another search or category.</p></div>}
          </section>)}
          {tab === "categories" && <CategoryManager catalog={catalog} initialSubcategoryParent={newSubcategoryParent} onSaved={completed} />}
        </>}
      </>}
    </main>
    <footer className="admin-footer">Shreekamalinee · For the auspicious you</footer>
    {reauthenticate && session?.authorized && <ReauthenticationDialog username={session.username} onSuccess={signedIn} onCancel={() => setReauthenticate(false)} />}
  </div>;
}

function ProductForm({ categories, collections, product, onCancel, onSaved, onManageCategories }: { categories: Category[]; collections: Collection[]; product?: Product; onCancel?: () => void; onSaved: (message: string) => Promise<void>; onManageCategories: (parent?: string) => void }) {
  const initialCollection = product?.collection || collections.find(collection => collection.id === "sarees")?.id || collections[0]?.id || "";
  const [collection, setCollection] = useState(initialCollection);
  const [categoryId, setCategoryId] = useState(product?.categoryId || categories.find(category => category.collection === initialCollection)?.id || "");
  const [name, setName] = useState(product?.name || "");
  const [price, setPrice] = useState(product?.priceOverride == null ? "" : String(product.priceOverride));
  const [details, setDetails] = useState(product?.details?.join("\n") || "");
  const [existingImages, setExistingImages] = useState(product ? [product.image, ...product.gallery] : []);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [addMode, setAddMode] = useState("bulk");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [complete, setComplete] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const livePhotos = useRef<Photo[]>([]);
  const category = categories.find(item => item.id === categoryId);
  const parent = collections.find(item => item.id === collection);
  const subcategories = categories.filter(item => item.collection === collection);
  const isSaree = collection === "sarees";
  const bulk = !product && (isSaree || addMode === "bulk");
  const totalPhotos = existingImages.length + photos.length;
  useEffect(() => { livePhotos.current = photos; }, [photos]);
  useEffect(() => () => { livePhotos.current.forEach(photo => URL.revokeObjectURL(photo.preview)); }, []);

  function changeCollection(value: string) {
    setCollection(value);
    setCategoryId(categories.find(item => item.collection === value)?.id || "");
  }

  function changeMode(value: string) {
    setAddMode(value);
    if (value === "gallery" && !name.trim() && photos[0]) setName(photos[0].name);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    setComplete("");
    const incoming = [...files];
    for (const file of incoming) {
      if (/heic|heif/i.test(`${file.type} ${file.name}`)) { setError("This photo is HEIC. Export it as JPEG, PNG or WebP before uploading. On iPhone, you can save a JPEG copy from Photos or use Most Compatible camera format."); return; }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError(`${file.name}: choose a JPEG, PNG or WebP photo.`); return; }
      if (!file.size || file.size > 10 * 1024 * 1024) { setError(`${file.name}: each photo must be smaller than 10 MB.`); return; }
    }
    if (totalPhotos + incoming.length > 30) { setError("Choose up to 30 photos at a time."); return; }
    if (product && isSaree && totalPhotos + incoming.length > 1) { setError("Keep one photo for this saree design. Remove the current photo to replace it, or add another design from Add Product."); return; }
    setPhotos(current => [...current, ...incoming.map(file => ({ file, preview: URL.createObjectURL(file), name: nameFromFile(file) }))]);
    if (!product && !name.trim() && incoming[0]) setName(nameFromFile(incoming[0]));
    if (fileInput.current) fileInput.current.value = "";
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].preview);
    setPhotos(current => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(""); setComplete("");
    let override: number | null;
    try { override = readPrice(price); } catch (cause) { setError((cause as Error).message); return; }
    if (!bulk && !name.trim()) { setError("Enter a product name."); return; }
    if (bulk && photos.some(photo => !photo.name.trim() || photo.name.trim().length > 180)) { setError("Enter a product name of up to 180 characters for every selected photo."); return; }
    if (!category || category.collection !== collection) { setError("Choose a subcategory before adding products."); return; }
    if (!totalPhotos) { setError("Choose at least one product photo."); return; }
    if (product && isSaree && totalPhotos !== 1) { setError("Keep one main photo for each saree design."); return; }
    setBusy(true);
    let created = 0;
    const uploaded: string[] = [];
    async function notifySaved(message: string) {
      try { await onSaved(message); }
      catch { setError("Your changes were saved, but the product list could not refresh. Open Products or reload this page before making more changes."); }
    }
    try {
      for (let index = 0; index < photos.length; index++) {
        setProgress(`Uploading photo ${index + 1} of ${photos.length}…`);
        const data = new FormData(); data.append("file", photos[index].file);
        const result = await request<{ url: string }>("/api/admin/uploads", { method: "POST", body: data });
        uploaded.push(result.url);
      }
      const images = [...existingImages, ...uploaded];
      const shared = { categoryId, priceOverride: override, details: details.split("\n").map(line => line.trim()).filter(Boolean) };
      if (product) {
        setProgress("Saving product…");
        await request(`/api/admin/products/${encodeURIComponent(product.id)}`, json("PATCH", { ...shared, name: name.trim(), images }));
        await notifySaved(`${name.trim()} has been updated.`);
      } else if (bulk) {
        for (let index = 0; index < images.length; index++) {
          setProgress(`Adding product ${index + 1} of ${images.length}…`);
          await request("/api/admin/products", json("POST", { ...shared, name: photos[index].name.trim(), images: [images[index]] }));
          created++;
        }
        await notifySaved(`${created} ${created === 1 ? "product has" : "products have"} been added to ${category.name}.`);
      } else {
        setProgress("Adding product…");
        await request("/api/admin/products", json("POST", { ...shared, name: name.trim(), images }));
        created = 1;
        await notifySaved(`${name.trim()} has been added to the shop.`);
      }
      if (!product) {
        photos.forEach(photo => URL.revokeObjectURL(photo.preview));
        setPhotos([]); setName(""); setDetails(""); setPrice("");
        setComplete(created > 1 ? `${created} products added. You can upload another batch below.` : "Product added. You can add another below.");
      }
    } catch (cause) {
      if (created > 0) {
        const remaining = photos.slice(created);
        photos.slice(0, created).forEach(photo => URL.revokeObjectURL(photo.preview));
        setPhotos(remaining);
        await notifySaved(`${created} ${created === 1 ? "product was" : "products were"} added. The remaining photos and names are still in the form.`);
        setError(`${created} ${created === 1 ? "product was" : "products were"} added successfully. ${(cause as Error).message} Only the remaining photos and their names are kept below.`);
      } else {
        setError(cause instanceof Error ? cause.message : "Unable to save this product.");
      }
    } finally { setBusy(false); setProgress(""); }
  }

  return <section className="admin-panel">
    <div className="admin-section-title"><div><h2>{product ? "Edit product" : "Add products"}</h2><p className="admin-help">{product ? "Update the details your customers see." : "Choose a category and upload up to 30 products together. File names become product names."}</p></div>{onCancel && <button type="button" className="admin-button secondary" disabled={busy} onClick={onCancel}>Cancel</button>}</div>
    <form onSubmit={submit} className="admin-product-form">
      <fieldset disabled={busy}>
        <div className="admin-form-grid"><label>Category<select required value={collection} onChange={event => changeCollection(event.target.value)}>{!collections.length && <option value="">No categories yet</option>}{collections.map(item => <option value={item.id} key={item.id}>{item.name}{item.hidden ? " (Hidden)" : ""}</option>)}</select></label><label>Subcategory<select required value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={!subcategories.length}>{!subcategories.length && <option value="">Create a subcategory first</option>}{subcategories.map(item => <option key={item.id} value={item.id}>{item.name}{item.hidden || item.parentHidden ? " (Hidden)" : ""}</option>)}</select></label></div>
        {!subcategories.length && <div className="admin-empty-subcategory"><p>{parent ? `${parent.name} has no subcategories yet.` : "Create your first category and subcategory before adding products."}</p><button type="button" className="admin-text-link" onClick={() => onManageCategories(parent?.id)}>{parent ? "Create a subcategory" : "Manage categories"}</button></div>}
        {(parent?.hidden || category?.hidden || category?.parentHidden) && <p className="admin-callout">This category or subcategory is hidden. You can save products here, but they will stay hidden from the shop until the category and subcategory are restored.</p>}
        {!product && !isSaree && <label>Upload option<select value={addMode} onChange={event => changeMode(event.target.value)}><option value="bulk">Bulk products — one product per photo</option><option value="gallery">One product with multiple photos</option></select></label>}
        {!bulk && <div className="admin-field"><label htmlFor="product-name">Product name</label><input id="product-name" required maxLength={180} value={name} onChange={event => setName(event.target.value)} placeholder={isSaree ? "e.g. Indigo Ajrakh Saree" : "e.g. Ajrakh Sling Bag"} />{!product && <p className="admin-help">Filled from the first photo’s file name. You can change it.</p>}</div>}
        <div className="admin-upload-area">
          <div className="admin-upload-heading"><div><h3>Product photos</h3><p className="admin-help">JPEG, PNG or WebP · Up to 10 MB each · Maximum 30 photos</p></div><span className="admin-count">{totalPhotos} selected</span></div>
          <input ref={fileInput} type="file" id="product-photos" accept="image/jpeg,image/png,image/webp" multiple={!product || !isSaree} onChange={event => addFiles(event.target.files)} className="admin-file-input" aria-describedby="photo-help" />
          <label htmlFor="product-photos" className="admin-upload-button">Choose photos</label>
          <p id="photo-help" className="admin-help">Full photos are kept without cropping or stretching. {bulk ? "Each photo becomes a separate product. Names are filled from the file names and can be edited below." : isSaree ? "Keep one photo for this saree design." : "The first photo is the cover. Additional photos appear in its swipe gallery."}</p>
          {bulk && photos.length > 0 && <p className="admin-callout">{photos.length} {photos.length === 1 ? "product" : "separate products"} will use this category, price and product details.</p>}
          {totalPhotos > 0 && <div className={`admin-photo-grid${bulk ? " admin-bulk-photos" : ""}`}>{existingImages.map((url, index) => <div className="admin-photo" key={url}><img src={photoUrl(url)} alt={`Current photo ${index + 1}`} /><span>{index === 0 ? "Cover" : `Photo ${index + 1}`}</span><button type="button" onClick={() => setExistingImages(current => current.filter((_, itemIndex) => index !== itemIndex))} aria-label={`Remove current photo ${index + 1}`}>Remove</button></div>)}{photos.map((photo, index) => <div className="admin-photo" key={photo.preview}><img src={photo.preview} alt={`Selected photo ${index + 1}`} />{bulk ? <label className="admin-photo-name"><span>Product name</span><input required maxLength={180} aria-label={`Product name for photo ${index + 1}`} value={photo.name} onChange={event => setPhotos(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label> : <span>{existingImages.length + index === 0 ? "Cover" : `Photo ${existingImages.length + index + 1}`}</span>}<button type="button" onClick={() => removePhoto(index)} aria-label={`Remove selected photo ${index + 1}`}>Remove</button></div>)}</div>}
        </div>
        <div className="admin-form-grid"><div className="admin-field"><label htmlFor="product-price">{bulk ? "Price override for this batch (optional)" : "Product price override (optional)"}</label><div className="admin-currency"><span aria-hidden="true">₹</span><input id="product-price" type="number" min="0.01" max="10000000" step="0.01" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="Use category price" /></div><p className="admin-help">Leave blank to use {category ? priceLabel(category.price) : "the category price"}. All prices are + shipping.</p></div><div className="admin-price-summary"><span>Customer sees</span><strong>{price.trim() && Number.isFinite(Number(price)) ? priceLabel(Number(price)) : priceLabel(category?.price)}</strong><span>{bulk ? "Applies to every product in this batch" : price.trim() ? "Individual product price" : "Uses category price"}</span></div></div>
        <div className="admin-field"><label htmlFor="product-details">{bulk ? "Product details for this batch (optional)" : "Product details (optional)"}</label><textarea id="product-details" value={details} onChange={event => setDetails(event.target.value)} rows={4} maxLength={4000} placeholder={"Material: Cotton\nSize: 8 × 10 inches\nOne detail per line"} /></div>
      </fieldset>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {complete && <p className="admin-success" role="status">{complete} <a href="/" target="_blank" rel="noreferrer">View shop</a></p>}
      <div className="admin-form-actions"><button type="submit" className="admin-button" disabled={busy || !category || !parent}>{busy ? "Saving…" : product ? "Save changes" : bulk && photos.length > 1 ? `Add ${photos.length} products` : "Add product"}</button>{onCancel && <button type="button" className="admin-text-link" disabled={busy} onClick={onCancel}>Cancel</button>}<p className="admin-help">{parent?.hidden || category?.hidden ? "Saved products remain hidden until this category is restored." : "Saved products appear in the shop immediately."}</p></div>
      {busy && <p className="admin-progress" role="status">{progress} Keep this page open until saving finishes.</p>}
    </form>
  </section>;
}
