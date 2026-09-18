import { db } from "./firebase-config.js";
import {
  collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allProducts = [];
let activeCategory = "all";
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let selectedProduct = null;
let selectedSize = null;

const $ = (s) => document.querySelector(s);
const productsGrid = $("#productsGrid");
const categoriesGrid = $("#categoriesGrid");
const emptyState = $("#emptyState");
const cartDrawer = $("#cartDrawer");
const cartItemsEl = $("#cartItems");
const cartCount = $("#cartCount");
const cartTotalEl = $("#cartTotal");
const checkoutTotalEl = $("#checkoutTotal");
const productModal = $("#productModal");
const productModalContent = $("#productModalContent");
const checkoutModal = $("#checkoutModal");
const toast = $("#toast");

const formatPrice = (n) =>
  new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(n) + " د.ع";

const showToast = (msg, type = "") => {
  toast.textContent = msg;
  toast.className = "toast " + type + " is-visible";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("is-visible"), 2600);
};

const header = $("#header");
window.addEventListener("scroll", () => {
  header.classList.toggle("is-scrolled", window.scrollY > 20);
}, { passive: true });

$("#menuBtn").addEventListener("click", () => $("#nav").classList.toggle("is-open"));
document.querySelectorAll("#nav a").forEach(a =>
  a.addEventListener("click", () => $("#nav").classList.remove("is-open"))
);

const productsQuery = query(
  collection(db, "products"),
  where("active", "==", true),
  orderBy("createdAt", "desc")
);

onSnapshot(productsQuery, (snap) => {
  allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCategories();
  renderProducts();
}, (err) => {
  console.error("Products load error:", err);
  productsGrid.innerHTML = "";
  emptyState.hidden = false;
  emptyState.querySelector("p").textContent = "تعذّر تحميل المنتجات. تحقق من إعدادات Firebase.";
});

function renderCategories() {
  const cats = [...new Set(allProducts.map((p) => p.category).filter(Boolean))];
  categoriesGrid.innerHTML =
    `<button class="chip chip--active" data-cat="all">الكل</button>` +
    cats.map((c) => `<button class="chip" data-cat="${c}">${c}</button>`).join("");

  categoriesGrid.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriesGrid.querySelectorAll(".chip").forEach((b) => b.classList.remove("chip--active"));
      btn.classList.add("chip--active");
      activeCategory = btn.dataset.cat;
      renderProducts();
    });
  });
}

function renderProducts() {
  const list = activeCategory === "all"
    ? allProducts
    : allProducts.filter((p) => p.category === activeCategory);

  if (!list.length) {
    productsGrid.innerHTML = "";
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  productsGrid.innerHTML = list.map((p, i) => `
    <article class="product-card" data-id="${p.id}" style="animation-delay:${i * 40}ms">
      <div class="product-card__media">
        <img src="${p.image || 'https://via.placeholder.com/600x750?text=No+Image'}" alt="${p.name}" loading="lazy" />
        ${p.comparePrice && p.comparePrice > p.price ? `<span class="product-card__badge">تخفيض</span>` : ""}
      </div>
      <h3 class="product-card__title">${p.name}</h3>
      <div class="product-card__price">
        ${formatPrice(p.price)}
        ${p.comparePrice && p.comparePrice > p.price ? `<s>${formatPrice(p.comparePrice)}</s>` : ""}
      </div>
    </article>
  `).join("");

  productsGrid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openProductModal(card.dataset.id));
  });
}

function openProductModal(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  selectedProduct = p;
  selectedSize = null;

  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  productModalContent.innerHTML = `
    <button class="icon-btn modal__close" data-close-modal>
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
    </button>
    <div class="pd">
      <div class="pd__media"><img src="${p.image || ''}" alt="${p.name}" /></div>
      <div class="pd__info">
        <h2>${p.name}</h2>
        <div class="pd__price">${formatPrice(p.price)}</div>
        <p class="pd__desc">${p.description || "قطعة راقية بتفاصيل مدروسة."}</p>
        ${sizes.length ? `
          <div>
            <label style="font-size:.82rem;color:var(--ink-soft);display:block;margin-bottom:.5rem;">المقاس</label>
            <div class="pd__sizes">
              ${sizes.map((s) => `<button class="pd__size" data-size="${s}">${s}</button>`).join("")}
            </div>
          </div>` : ""}
        <button class="btn btn--primary btn--block" id="addToCartBtn">أضف إلى السلة</button>
      </div>
    </div>
  `;

  productModalContent.querySelectorAll(".pd__size").forEach((btn) => {
    btn.addEventListener("click", () => {
      productModalContent.querySelectorAll(".pd__size").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      selectedSize = btn.dataset.size;
    });
  });

  productModalContent.querySelector("[data-close-modal]").addEventListener("click", closeProductModal);
  productModalContent.querySelector("#addToCartBtn").addEventListener("click", () => {
    if (sizes.length && !selectedSize) return showToast("الرجاء اختيار المقاس", "toast--error");
    addToCart(p, selectedSize);
    closeProductModal();
  });

  productModal.classList.add("is-open");
  productModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeProductModal() {
  productModal.classList.remove("is-open");
  productModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
productModal.querySelector(".modal__overlay").addEventListener("click", closeProductModal);

function addToCart(product, size) {
  const key = product.id + (size ? `__${size}` : "");
  const existing = cart.find((c) => c.key === key);
  if (existing) existing.qty += 1;
  else cart.push({
    key,
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    size: size || null,
    qty: 1
  });
  persistCart();
  showToast("تمت الإضافة إلى السلة ✓");
  openCart();
}
function persistCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
}
function renderCart() {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  cartCount.textContent = count;
  cartCount.classList.toggle("is-visible", count > 0);
  cartTotalEl.textContent = formatPrice(total);
  checkoutTotalEl.textContent = formatPrice(total);
  $("#checkoutBtn").disabled = cart.length === 0;

  if (!cart.length) {
    cartItemsEl.innerHTML = `<p style="text-align:center;color:var(--ink-soft);padding:3rem 0;font-size:.9rem;">سلتك فارغة</p>`;
    return;
  }
  cartItemsEl.innerHTML = cart.map((it) => `
    <div class="cart-item" data-key="${it.key}">
      <img class="cart-item__img" src="${it.image || ''}" alt="${it.name}" />
      <div>
        <div class="cart-item__title">${it.name}</div>
        <div class="cart-item__price">${formatPrice(it.price)}</div>
        <div class="cart-item__qty">
          <button data-act="dec">−</button>
          <span>${it.qty}</span>
          <button data-act="inc">+</button>
        </div>
      </div>
      <button class="cart-item__remove" data-act="rm" aria-label="حذف">×</button>
    </div>
  `).join("");

  cartItemsEl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.closest(".cart-item").dataset.key;
      const item = cart.find((c) => c.key === key);
      const act = btn.dataset.act;
      if (act === "inc") item.qty += 1;
      if (act === "dec") item.qty = Math.max(1, item.qty - 1);
      if (act === "rm") cart = cart.filter((c) => c.key !== key);
      persistCart();
    });
  });
}

function openCart() {
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeCart() {
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
$("#cartBtn").addEventListener("click", openCart);
document.querySelectorAll("[data-close-cart]").forEach((el) => el.addEventListener("click", closeCart));

$("#checkoutBtn").addEventListener("click", () => {
  if (!cart.length) return;
  closeCart();
  checkoutModal.classList.add("is-open");
  checkoutModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
});
function closeCheckout() {
  checkoutModal.classList.remove("is-open");
  checkoutModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
document.querySelectorAll("[data-close-checkout]").forEach((el) => el.addEventListener("click", closeCheckout));

$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = "جارٍ إرسال الطلب...";

  const fd = new FormData(e.target);
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  try {
    await addDoc(collection(db, "orders"), {
      customer: {
        name: fd.get("name").trim(),
        phone: fd.get("phone").trim(),
        city: fd.get("city").trim(),
        address: fd.get("address").trim(),
        notes: (fd.get("notes") || "").trim()
      },
      items: cart.map(({ id, name, price, qty, size }) => ({ id, name, price, qty, size })),
      total,
      status: "pending",
      createdAt: serverTimestamp()
    });

    cart = [];
    persistCart();
    e.target.reset();
    closeCheckout();
    showToast("تم إرسال طلبك بنجاح، سنتواصل معك قريباً ✓");
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء إرسال الطلب", "toast--error");
  } finally {
    btn.disabled = false; btn.textContent = "تأكيد الطلب";
  }
});

renderCart();
