const collections = new Map();
const originalCollectionCovers = new Map([
  ["sarees", "/sarees.jpg"], ["dress-materials", "/dress-materials.jpg"],
  ["readymades", "/readymades.jpg"], ["accessories", "/accessories.jpg"]
]);
const legacySareeCategories = new Map([
  ["Ajrakh", "sarees-ajrakh"], ["Ikat", "sarees-ikat"], ["Ilkal", "sarees-ilkal"],
  ["Kota Doriya", "sarees-kota-doriya"], ["Maheshwari", "sarees-maheshwari"], ["Paithani", "sarees-paithani"]
]);
const detail = document.querySelector(".detail");
const title = document.querySelector("#detail-title");

const productGrid = document.querySelector(".product-grid");
const catalogStatus = document.querySelector(".catalog-status");
let catalogLoaded = false;
let catalogFailed = false;
let photoProducts = [];
let productGroups = [];
let photoById = new Map();
let familiesByCategory = new Map();
let groupByPhotoId = new Map();
let categoryById = new Map();
const rememberedPhotos = new Map();
let cardCarousels = [];
const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0
});

function collectionRoute(id) {
  return "#" + encodeURIComponent(id);
}

function categoryRoute(id) {
  return "#category/" + encodeURIComponent(id);
}

function renderCollectionPhoto(container, collection) {
  container.className = "photo collection-photo";
  container.replaceChildren();
  container.dataset.collectionId = collection.id;
  const source = collection.image || photoProducts.find(product => product.collection === collection.id)?.image;
  function placeholder() {
    container.classList.add("collection-placeholder");
    const brand = document.createElement("span");
    const name = document.createElement("strong");
    brand.className = "collection-placeholder-brand";
    brand.textContent = "SHREEKAMALINEE";
    name.textContent = collection.name;
    container.replaceChildren(brand, name);
    delete container.dataset.coverSource;
  }
  if (!source) { placeholder(); return; }
  const image = document.createElement("img");
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    if (container.firstElementChild === image) placeholder();
  }, { once: true });
  if (originalCollectionCovers.get(collection.id) === source && collection.id !== "accessories") {
    container.classList.add("original-collection-cover");
  }
  image.src = source;
  container.dataset.coverSource = source;
  container.append(image);
}

function renderCollections() {
  const navigation = document.querySelector("#collection-nav");
  const grid = document.querySelector("#collection-grid");
  const status = document.querySelector("#collections-status");
  navigation.replaceChildren();
  grid.replaceChildren();
  for (const collection of collections.values()) {
    const navLink = document.createElement("a");
    navLink.href = collectionRoute(collection.id);
    navLink.dataset.key = collection.id;
    navLink.textContent = collection.name;
    navigation.append(navLink);
    const card = document.createElement("a");
    const photo = document.createElement("div");
    const caption = document.createElement("div");
    const name = document.createElement("h3");
    const description = document.createElement("p");
    card.className = "card collection-card";
    card.href = navLink.href;
    card.dataset.key = collection.id;
    caption.className = "card-caption";
    name.textContent = collection.name;
    description.textContent = collection.description;
    renderCollectionPhoto(photo, collection);
    caption.append(name);
    card.append(photo, caption, description);
    grid.append(card);
  }
  navigation.setAttribute("aria-busy", String(!catalogLoaded));
  status.hidden = collections.size > 0;
  status.textContent = !catalogLoaded ? "Loading collections…" : catalogFailed
    ? "Collections could not be loaded. Please refresh the page or contact us on WhatsApp."
    : "Our collections will be available soon. Please check back or contact us on WhatsApp.";
  const target = collections.get("sarees")
    || [...collections.values()].find(collection => photoProducts.some(product => product.collection === collection.id))
    || collections.values().next().value;
  const heroShop = document.querySelector("#hero-shop");
  heroShop.href = target ? collectionRoute(target.id) : "#collections";
  heroShop.textContent = target ? "Shop " + target.name : "Browse Collections";
}

function renderSubcategories(collectionId, selectedId) {
  const navigation = document.querySelector("#subcategory-links");
  navigation.replaceChildren();
  const categories = [...categoryById.values()].filter(category => category.collection === collectionId);
  navigation.hidden = !categories.length;
  if (!categories.length) return;
  const all = document.createElement("a");
  all.href = collectionRoute(collectionId);
  all.textContent = "All " + collections.get(collectionId).name;
  if (!selectedId) all.setAttribute("aria-current", "page");
  navigation.append(all);
  for (const category of categories) {
    const link = document.createElement("a");
    link.href = categoryRoute(category.id);
    link.dataset.categoryId = category.id;
    link.textContent = category.name;
    if (category.id === selectedId) link.setAttribute("aria-current", "page");
    navigation.append(link);
  }
}

function productRoute(product) {
  return "product/" + encodeURIComponent(product.id);
}

function productUrl(product) {
  return new URL("/#" + productRoute(product), location.origin).href;
}

function orderUrl(product) {
  const message = [
    "Hello Shreekamalinee, " + (product.price == null ? "I'd like the price and availability of this product." : "I'd like to order this product."),
    "Product: " + product.name,
    "Reference: " + product.designCode,
    "Price: " + productPrice(product),
    "Product link: " + productUrl(product),
    "Photo: " + new URL(product.image, location.origin + "/").href
  ].join("\n");
  return "https://wa.me/919820785210?text=" + encodeURIComponent(message);
}

function rememberPhoto(product) {
  const group = groupByPhotoId.get(product.id);
  if (group) rememberedPhotos.set(group.id, product.id);
}

function carousel(gallery, designs, options) {
  let index = Math.max(0, designs.findIndex(product => product.id === options.initialId));
  let ready = false;
  let width = 0;
  let frame = 0;
  let pointer;
  let suppressClick = false;
  let destroyed = false;
  const listeners = [];
  function listen(element, event, handler, settings) {
    element.addEventListener(event, handler, settings);
    listeners.push(() => element.removeEventListener(event, handler, settings));
  }
  function render() {
    if (destroyed || !designs.length) return;
    options.previous.disabled = index === 0;
    options.next.disabled = index === designs.length - 1;
    options.counter.textContent = (index + 1) + " / " + designs.length;
    gallery.dataset.activePhotoId = designs[index].id;
    [...gallery.children].forEach((slide, slideIndex) => {
      if (slide.matches("a")) slide.tabIndex = slideIndex === index ? 0 : -1;
    });
    options.onSelect(designs[index], index);
  }
  function restore() {
    if (destroyed || !gallery.isConnected || !gallery.clientWidth) return;
    width = gallery.clientWidth;
    gallery.scrollTo({ left: index * width, behavior: "instant" });
    ready = true;
    render();
  }
  function select(nextIndex, behavior = "smooth") {
    const targetIndex = Math.max(0, Math.min(designs.length - 1, nextIndex));
    width = gallery.clientWidth;
    const motion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : behavior;
    gallery.scrollTo({ left: targetIndex * width, behavior: motion });
    if (motion === "instant") { index = targetIndex; render(); }
  }
  function onScroll() {
    if (!ready || !gallery.clientWidth) return;
    if (gallery.clientWidth !== width) { restore(); return; }
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (destroyed) return;
      const nextIndex = Math.max(0, Math.min(designs.length - 1, Math.round(gallery.scrollLeft / gallery.clientWidth)));
      if (nextIndex !== index) { index = nextIndex; render(); }
    });
  }
  listen(gallery, "scroll", onScroll, { passive: true });
  listen(options.previous, "click", () => select(index - 1));
  listen(options.next, "click", () => select(index + 1));
  listen(gallery, "keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); select(index + (event.key === "ArrowLeft" ? -1 : 1));
    }
  });
  listen(gallery, "focusin", event => {
    const link = event.target.closest("a[data-photo-id]");
    if (!link) return;
    const focused = designs.findIndex(product => product.id === link.dataset.photoId);
    if (focused !== index) select(focused, "instant");
  });
  listen(gallery, "pointerdown", event => {
    suppressClick = false;
    pointer = event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, left: gallery.scrollLeft, moved: false } : undefined;
  }, { passive: true });
  listen(gallery, "pointermove", event => {
    if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) pointer.moved = true;
  }, { passive: true });
  const endPointer = event => {
    if (pointer?.id !== event.pointerId) return;
    suppressClick = pointer.moved || Math.abs(gallery.scrollLeft - pointer.left) > 6;
    pointer = undefined;
  };
  listen(gallery, "pointerup", endPointer, { passive: true });
  listen(gallery, "pointercancel", endPointer, { passive: true });
  listen(gallery, "click", event => {
    if (!event.detail || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  }, true);
  render();
  requestAnimationFrame(restore);
  return {
    restore,
    getIndex: () => index,
    destroy() { destroyed = true; if (frame) cancelAnimationFrame(frame); listeners.forEach(remove => remove()); }
  };
}

function blendStudioBackground(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  if (!canvas.width || !canvas.height) return;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = pixels;
  const width = canvas.width;
  const area = width * canvas.height;
  const visited = new Uint8Array(area);
  const queue = new Int32Array(area);
  let tail = 0;

  function visit(index) {
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    if (min >= 224 && max - min <= 19) queue[tail++] = index;
  }

  for (let x = 0; x < width; x++) {
    visit(x);
    visit(area - width + x);
  }
  for (let y = 0; y < area; y += width) {
    visit(y);
    visit(y + width - 1);
  }
  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    if (index >= width) visit(index - width);
    if (index < area - width) visit(index + width);
    if (index % width) visit(index - 1);
    if ((index + 1) % width) visit(index + 1);
    const offset = index * 4;
    const minimum = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    data[offset + 3] = Math.round(255 * Math.max(0, (245 - minimum) / 21));
  }
  context.putImageData(pixels, 0, 0);
  canvas.toBlob(blob => {
    if (!blob || !image.isConnected) return;
    const url = URL.createObjectURL(blob);
    image.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    image.src = url;
  }, "image/png");
}

function framePhoto(image, source, frame = document.createElement("div")) {
  frame.classList.add("gallery-slide");
  if (studioPhotos.has(source.replace(/^\//, ""))) {
    frame.classList.add("studio-slide");
    if (image.complete) blendStudioBackground(image);
    else image.addEventListener("load", () => blendStudioBackground(image), { once: true });
  } else {
    const setBackdrop = () => frame.style.setProperty("--photo-backdrop", "url(" + JSON.stringify(source) + ")");
    if (image.complete) setBackdrop();
    else image.addEventListener("load", setBackdrop, { once: true });
  }
  frame.append(image);
  return frame;
}

function productPrice(product) {
  if (product.price == null) return "Price on request";
  return rupees.format(product.price) + " + shipping";
}

function createProductCard(group) {
  const card = document.createElement("article");
  const link = document.createElement("a");
  const name = document.createElement("h3");
  const price = document.createElement("p");
  const familyName = document.createElement("p");
  familyName.className = "product-family-name";
  familyName.textContent = group.name;
  card.dataset.groupId = group.id;
  link.className = "product-caption-link";
  const gallery = document.createElement("div");
  gallery.className = group.collection === "sarees" ? "product-gallery saree-gallery" : "product-gallery";
  gallery.tabIndex = group.designs.length > 1 ? 0 : -1;
  gallery.setAttribute("role", "group");
  gallery.setAttribute("aria-label", group.name + " designs");
  for (const [index, product] of group.designs.entries()) {
    const image = document.createElement("img");
    const photoLink = document.createElement("a");
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    photoLink.className = "product-cover-link";
    photoLink.href = "#" + productRoute(product);
    photoLink.dataset.photoId = product.id;
    photoLink.setAttribute("aria-label", "View " + product.name);
    if (index === 0 && group.collection !== "sarees") {
      const fitCardToCover = () => {
        if (image.naturalWidth && image.naturalHeight) gallery.style.setProperty("--card-ratio", image.naturalWidth + " / " + image.naturalHeight);
      };
      image.addEventListener("load", fitCardToCover, { once: true });
      if (image.complete) fitCardToCover();
    }
    gallery.append(framePhoto(image, product.image, photoLink));
  }
  const controls = document.createElement("div");
  controls.className = "card-gallery-controls";
  controls.hidden = group.designs.length < 2;
  const previous = document.createElement("button");
  const next = document.createElement("button");
  const counter = document.createElement("span");
  previous.type = next.type = "button";
  previous.textContent = "Prev";
  next.textContent = "Next";
  previous.setAttribute("aria-label", "Previous " + group.name + " design");
  next.setAttribute("aria-label", "Next " + group.name + " design");
  counter.className = "card-photo-count";
  counter.setAttribute("aria-live", "polite");
  controls.append(previous, counter, next);
  const hint = document.createElement("p");
  hint.className = "gallery-hint";
  hint.textContent = "Swipe to browse";
  const action = document.createElement("span");
  action.className = "product-card-action";
  action.textContent = "View product";
  const order = document.createElement("a");
  order.className = "product-card-order";
  link.append(familyName, name, price, action);
  card.append(gallery, controls);
  if (group.designs.length > 1) card.append(hint);
  card.append(link, order);
  const controller = carousel(gallery, group.designs, {
    initialId: rememberedPhotos.get(group.id), previous, next, counter,
    onSelect(product) {
      rememberPhoto(product);
      card.dataset.activePhotoId = product.id;
      name.textContent = product.name;
      price.textContent = productPrice(product);
      link.href = "#" + productRoute(product);
      order.href = orderUrl(product);
      order.textContent = product.price == null ? "Ask for price" : "Order on WhatsApp";
      order.setAttribute("aria-label", (product.price == null ? "Ask for price of " : "Order ") + product.name + " on WhatsApp");
    }
  });
  cardCarousels.push(controller);
  return card;
}

function rebuildProductGroups() {
  const groups = new Map();
  familiesByCategory = new Map();
  photoById = new Map();
  groupByPhotoId = new Map();
  for (const product of photoProducts) {
    photoById.set(product.id, product);
    if (!familiesByCategory.has(product.categoryId)) familiesByCategory.set(product.categoryId, []);
    familiesByCategory.get(product.categoryId).push(product);
    const id = product.collection === "readymades" ? "source-" + product.sourceProductId : "category-" + product.categoryId;
    if (!groups.has(id)) groups.set(id, {
      id, name: categoryById.get(product.categoryId)?.name || product.type || product.name,
      collection: product.collection, categoryId: product.categoryId, designs: []
    });
    groups.get(id).designs.push(product);
    groupByPhotoId.set(product.id, groups.get(id));
  }
  productGroups = [...groups.values()];
}

function showProducts(key, categoryId) {
  cardCarousels.forEach(controller => controller.destroy());
  cardCarousels = [];
  const products = productGroups.filter(group => group.collection === key && (!categoryId || group.categoryId === categoryId));
  productGrid.replaceChildren(...products.map(createProductCard));
  productGrid.hidden = products.length === 0;
  detail.classList.toggle("has-products", products.length > 0);
  catalogStatus.hidden = products.length > 0;
  catalogStatus.textContent = !catalogLoaded ? "Loading products…" : catalogFailed
    ? "Products could not be loaded. Please refresh the page or contact us on WhatsApp for availability."
    : "No products are currently listed in this " + (categoryId ? "subcategory." : "collection.");
}

const productDetail = document.querySelector(".product-detail");
const mainGallery = document.querySelector("#main-gallery");
const productTitle = document.querySelector("#product-title");
const previousPhoto = document.querySelector("#photo-prev");
const nextPhoto = document.querySelector("#photo-next");
const photoCount = document.querySelector("#photo-count");
let activeDesigns = [];
let mainCarousel;

function setOrderLink(product) {
  const orderLink = document.querySelector("#product-shop");
  orderLink.href = orderUrl(product);
  orderLink.textContent = product.price == null ? "Ask for price & order ↗" : "Order on WhatsApp ↗";
  document.querySelector(".order-note").textContent = product.price != null ? "Confirm availability and shipping on WhatsApp."
    : "Confirm availability, price, options, and shipping with Shreekamalinee on WhatsApp.";
}

function setProductNotes(product) {
  const specs = document.querySelector("#product-specs");
  specs.replaceChildren(...(product.details ?? []).map(detail => {
    const item = document.createElement("li");
    item.textContent = detail;
    return item;
  }));
  specs.hidden = !specs.children.length;
  const variation = document.querySelector("#product-variation");
  variation.textContent = product.variationNote ?? "";
  variation.hidden = !product.variationNote;
}

function showProduct(product, moveFocus) {
  mainCarousel?.destroy();
  activeDesigns = familiesByCategory.get(product.categoryId) || [product];
  document.querySelector("#product-back").href = collectionRoute(product.collection);

  mainGallery.setAttribute("aria-label", (categoryById.get(product.categoryId)?.name || product.name) + " designs");
  mainGallery.classList.toggle("saree-gallery", product.collection === "sarees");
  mainGallery.style.removeProperty("--detail-ratio");
  mainGallery.replaceChildren(...activeDesigns.map(design => {
    const image = document.createElement("img");
    image.src = design.image;
    image.alt = design.name;
    image.loading = design.id === product.id ? "eager" : "lazy";
    image.decoding = "async";
    image.draggable = false;
    image.addEventListener("load", () => {
      if (mainGallery.dataset.activePhotoId === design.id) fitDetailPhoto(image);
    });
    const slide = framePhoto(image, design.image);
    slide.dataset.photoId = design.id;
    return slide;
  }));
  document.querySelector(".gallery-controls").hidden = mainGallery.children.length < 2;
  mainCarousel = carousel(mainGallery, activeDesigns, {
    initialId: product.id, previous: previousPhoto, next: nextPhoto, counter: photoCount,
    onSelect(design, index) {
      rememberPhoto(design);
      productTitle.textContent = design.name;
      document.querySelector("#product-price").textContent = productPrice(design);
      document.querySelector("#product-reference").textContent = "Product reference: " + design.designCode;
      setProductNotes(design);
      setOrderLink(design);
      fitDetailPhoto(mainGallery.children[index]?.querySelector("img"));
      document.title = design.name + " | Shreekamalinee";
      const canonical = "#" + productRoute(design);
      if (location.hash !== canonical) history.replaceState(history.state, "", location.pathname + location.search + canonical);
    }
  });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (moveFocus) productTitle.focus({ preventScroll: true });
}

function fitDetailPhoto(image) {
  if (!mainGallery.classList.contains("saree-gallery") && image?.naturalWidth && image.naturalHeight) {
    mainGallery.style.setProperty("--detail-ratio", image.naturalWidth + " / " + image.naturalHeight);
  }
}

function resolveProduct(key) {
  if (!key.startsWith("product/")) return;
  let id;
  try { id = decodeURIComponent(key.slice("product/".length)); } catch { return; }
  if (photoById.has(id)) return photoById.get(id);
  const source = catalog.find(product => product.id === id);
  if (source) return photoProducts.find(product => product.sourceProductId === id && product.image === source.image)
    || photoProducts.find(product => product.sourceProductId === id);
  const legacyType = Object.keys(sareeGroupIds).find(type => sareeGroupIds[type] === id);
  if (legacyType) return photoProducts.find(product => product.categoryId === legacySareeCategories.get(legacyType));
}

function showUnavailable(kind, moveFocus) {
  cardCarousels.forEach(controller => controller.destroy());
  cardCarousels = [];
  productGrid.replaceChildren();
  productGrid.hidden = true;
  mainGallery.replaceChildren();
  delete mainGallery.dataset.activePhotoId;
  document.querySelector("#product-shop").removeAttribute("href");
  document.querySelector(".hero").hidden = true;
  document.querySelector("#collections").hidden = true;
  document.querySelector("#subcategory-links").hidden = true;
  document.querySelector("#subcategory-links").replaceChildren();
  document.querySelector("#detail-photo").hidden = true;
  detail.hidden = false;
  detail.classList.remove("has-products");
  detail.classList.add("is-unavailable");
  detail.dataset.routeStatus = catalogLoaded ? "unavailable" : "loading";
  delete detail.dataset.collectionId;
  delete detail.dataset.categoryId;
  title.textContent = !catalogLoaded ? "Loading " + kind.toLowerCase() + "…" : kind + " unavailable";
  document.querySelector("#detail-description").textContent = !catalogLoaded ? "" : "Return to All Collections to browse the latest designs.";
  catalogStatus.hidden = !catalogFailed;
  catalogStatus.textContent = "Collections and products could not be loaded. Please refresh the page and try again.";
  document.title = catalogLoaded ? kind + " unavailable | Shreekamalinee" : "Shreekamalinee | Indian Fashion Boutique";
  if (moveFocus) {
    window.scrollTo({ top: 0, behavior: "instant" });
    title.focus({ preventScroll: true });
  }
}

function showCollection(moveFocus = false) {
  let key = location.hash.slice(1);
  if (!key.startsWith("product/") && !key.startsWith("category/")) {
    try { key = decodeURIComponent(key); } catch {}
  }
  let category;
  if (key.startsWith("category/")) {
    try { category = categoryById.get(decodeURIComponent(key.slice("category/".length))); } catch {}
  }
  const collection = category ? collections.get(category.collection) : collections.get(key);
  const product = resolveProduct(key);
  if (!product) { mainCarousel?.destroy(); mainCarousel = undefined; }
  productDetail.hidden = !product;
  document.querySelector(".hero").hidden = Boolean(collection || product);
  document.querySelector("#collections").hidden = Boolean(collection || product);
  detail.hidden = !collection;
  detail.classList.remove("is-unavailable");
  if (!collection) {
    document.querySelector("#subcategory-links").hidden = true;
    document.querySelector("#subcategory-links").replaceChildren();
  }
  for (const link of document.querySelectorAll("#collection-nav a")) {
    if (link.dataset.key === (product?.collection ?? collection?.id)) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (!collection && !product && key && key !== "collections") {
    showUnavailable(key.startsWith("product/") ? "Product" : key.startsWith("category/") ? "Subcategory" : "Collection", moveFocus);
    return;
  }

  if (product) {
    showProduct(product, moveFocus);
  } else if (collection) {
    showProducts(collection.id, category?.id);
    detail.dataset.routeStatus = category ? "category" : "collection";
    detail.dataset.collectionId = collection.id;
    if (category) detail.dataset.categoryId = category.id;
    else delete detail.dataset.categoryId;
    title.textContent = category?.name || collection.name;
    document.querySelector("#detail-description").textContent = collection.description;
    const cover = document.querySelector("#detail-photo");
    cover.hidden = false;
    renderCollectionPhoto(cover, collection);
    renderSubcategories(collection.id, category?.id);
    document.title = (category?.name || collection.name) + " | Shreekamalinee";
    if (moveFocus) {
      window.scrollTo({ top: 0, behavior: "instant" });
      title.focus({ preventScroll: true });
    }
  } else {
    document.title = "Shreekamalinee | Indian Fashion Boutique";
    if (key === "collections") document.querySelector("#collections").scrollIntoView();
  }
}

addEventListener("hashchange", () => showCollection(true));
addEventListener("resize", () => {
  requestAnimationFrame(() => {
    if (!productDetail.hidden) mainCarousel?.restore();
    if (!detail.hidden && !productGrid.hidden) cardCarousels.forEach(controller => controller.restore());
  });
});
showCollection();

async function refreshCatalog() {
  try {
    const response = await fetch("/api/catalog", {cache:"no-store"});
    if (!response.ok) throw new Error("Catalog unavailable");
    const data = await response.json();
    if (!Array.isArray(data.products) || !Array.isArray(data.photoProducts) || !Array.isArray(data.categories) || !Array.isArray(data.collections)) throw new Error("Product selection unavailable");
    const collectionIds = new Set();
    for (const collection of data.collections) {
      if (!collection || typeof collection.id !== "string" || !collection.id || collectionIds.has(collection.id)
        || typeof collection.name !== "string" || !collection.name || typeof collection.description !== "string"
        || (collection.image !== null && (typeof collection.image !== "string" || !collection.image))) throw new Error("Invalid collection");
      collectionIds.add(collection.id);
    }
    const categoryIds = new Set();
    for (const category of data.categories) {
      if (!category || typeof category.id !== "string" || !category.id || categoryIds.has(category.id)
        || typeof category.name !== "string" || !category.name || !collectionIds.has(category.collection)) throw new Error("Invalid subcategory");
      categoryIds.add(category.id);
    }
    const seen = new Set();
    const sourceIds = new Set(data.products.map(product => product.id));
    const nextCategories = new Map(data.categories.map(category => [category.id, category]));
    for (const product of data.photoProducts) {
      if (!product || typeof product.id !== "string" || !product.id || seen.has(product.id)
        || typeof product.image !== "string" || !product.image || typeof product.name !== "string" || !product.name
        || !sourceIds.has(product.sourceProductId) || typeof product.designCode !== "string" || !/^SK-\S+$/u.test(product.designCode)
        || (product.price !== null && (typeof product.price !== "number" || !Number.isFinite(product.price) || product.price < 0))
        || !categoryIds.has(product.categoryId) || !collectionIds.has(product.collection)
        || nextCategories.get(product.categoryId).collection !== product.collection) throw new Error("Invalid photo products");
      seen.add(product.id);
    }
    catalog = data.products;
    photoProducts = data.photoProducts;
    categoryById = nextCategories;
    collections.clear();
    data.collections.forEach(collection => collections.set(collection.id, collection));
    catalogLoaded = true;
    catalogFailed = false;
    rebuildProductGroups();
    renderCollections();
    showCollection();
  } catch {
    catalog = [];
    photoProducts = [];
    categoryById = new Map();
    collections.clear();
    catalogLoaded = true;
    catalogFailed = true;
    rebuildProductGroups();
    renderCollections();
    showCollection();
  }
}
refreshCatalog();
