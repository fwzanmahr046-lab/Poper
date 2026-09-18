import { db, auth } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const loginScreen = $("#loginScreen");
const app = $("#app");
const loginError = $("#loginError");
const toast = $("#toast");

let products = [];
let orders = [];

const ADMIN_EMAIL = "admin@test.com";

const fmt = (n) => new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(n) + " د.ع";
const dateFmt = (ts) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(d);
};
const showToast = (msg, type = "") => {
  toast.textContent = msg;
  toast.className = "toast " + type + " is-visible";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("is-visible"), 2600);
};

// ================================================
// تشخيص: نطبع المفاتيح للتأكد من الربط
// ================================================
console.log("🔥 Firebase initialized");
console.log("👤 Admin email expected:", ADMIN_EMAIL);

onAuthStateChanged(auth, async (user) => {
  console.log("🔄 Auth state changed:", user ? user.email : "no user");
  if (user) {
    if (user.email !== ADMIN_EMAIL) {
      console.warn("❌ Email mismatch:", user.email, "!==", ADMIN_EMAIL);
      await signOut(auth);
      loginError.textContent = "هذا الحساب لا يملك صلاحيات المدير.";
      loginError.hidden = false;
      return;
    }
    console.log("✅ Admin logged in:", user.email);
    loginScreen.hidden = true;
    app.hidden = false;
    $("#userEmail").textContent = user.email;
    $("#settingsEmail").textContent = user.email;
    $("#settingsUid").textContent = user.uid;
    subscribeProducts();
    subscribeOrders();
  } else {
    loginScreen.hidden = false;
    app.hidden = true;
  }
});

// ================================================
// تسجيل الدخول — مع كشف الأخطاء الفعلي
// ================================================
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const fd = new FormData(e.target);
  const email = (fd.get("email") || "").trim().toLowerCase();
  const password = fd.get("password") || "";

  console.log("🔐 محاولة دخول:", { email, passwordLength: password.length });

  const btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "جارٍ الدخول...";

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log("✅ نجح الدخول:", cred.user.email);
    // لا نحتاج شي - onAuthStateChanged يتكفّل بالباقي
  } catch (err) {
    console.error("❌ فشل الدخول:", err.code, "-", err.message);

    const messages = {
      "auth/invalid-email": "البريد الإلكتروني غير صالح",
      "auth/user-disabled": "الحساب معطّل",
      "auth/user-not-found": "المستخدم غير موجود في Firebase",
      "auth/wrong-password": "كلمة المرور خاطئة",
      "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة",
      "auth/invalid-login-credentials": "البريد أو كلمة المرور غير صحيحة",
      "auth/too-many-requests": "محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة",
      "auth/network-request-failed": "فشل الاتصال — تحقق من الإنترنت",
      "auth/operation-not-allowed": "تسجيل الدخول بالبريد غير مُفعّل في Firebase",
      "auth/unauthorized-domain": "النطاق غير مصرّح به في Firebase",
      "auth/invalid-api-key": "مفتاح API غير صحيح",
      "auth/app-not-authorized": "التطبيق غير مصرّح به"
    };

    const msg = messages[err.code] || `${err.code}: ${err.message}`;
    loginError.textContent = msg;
    loginError.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "تسجيل الدخول";
  }
});

$("#logoutBtn").addEventListener("click", () => signOut(auth));

const viewTitles = {
  dashboard: "لوحة المعلومات",
  products: "المنتجات",
  orders: "الطلبات",
  settings: "الإعدادات"
};
$$(".side-link[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.view;
    $$(".side-link[data-view]").forEach((b) => b.classList.toggle("is-active", b === btn));
    $$(".view").forEach((s) => s.classList.toggle("is-active", s.dataset.view === v));
    $("#viewTitle").textContent = viewTitles[v] || "";
  });
});

function subscribeProducts() {
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderProducts();
    updateStats();
  }, (err) => {
    console.error("❌ Products error:", err);
    showToast("فشل تحميل المنتجات", "toast--error");
  });
}
function renderProducts() {
  const body = $("#productsBody");
  if (!products.length) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);padding:2rem;">لا توجد منتجات بعد.</td></tr>`;
    return;
  }
  body.innerHTML = products.map((p) => `
    <tr>
      <td><img src="${p.image || ''}" alt="" /></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.category || "—"}</td>
      <td>${fmt(p.price)}</td>
      <td>${p.active ? `<span class="pill pill--completed">نشط</span>` : `<span class="pill pill--cancelled">معطّل</span>`}</td>
      <td>
        <div class="table__actions">
          <button class="tbl-btn" data-edit="${p.id}">تعديل</button>
          <button class="tbl-btn tbl-btn--danger" data-del="${p.id}">حذف</button>
        </div>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openEditor(products.find((x) => x.id === b.dataset.edit)))
  );
  body.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => removeProduct(b.dataset.del))
  );
}

const editor = $("#productEditor");
const editorTitle = $("#editorTitle");
const productForm = $("#productForm");
const imagePreview = $("#imagePreview");

$("#newProductBtn").addEventListener("click", () => openEditor(null));
$$("[data-close-editor]").forEach((el) => el.addEventListener("click", closeEditor));

function openEditor(product) {
  editorTitle.textContent = product ? "تعديل منتج" : "منتج جديد";
  productForm.reset();
  imagePreview.innerHTML = "";
  if (product) {
    productForm.id.value = product.id;
    productForm.name.value = product.name || "";
    productForm.description.value = product.description || "";
    productForm.price.value = product.price || "";
    productForm.comparePrice.value = product.comparePrice || "";
    productForm.category.value = product.category || "";
    productForm.sizes.value = (product.sizes || []).join(",");
    productForm.active.checked = product.active !== false;
    productForm.image.value = product.image || "";
    if (product.image) imagePreview.innerHTML = `<img src="${product.image}" />`;
  } else {
    productForm.id.value = "";
    productForm.active.checked = true;
    productForm.image.value = "";
  }
  editor.classList.add("is-open");
}
function closeEditor() {
  editor.classList.remove("is-open");
}

const imageUrlInput = $("#imageUrl");
if (imageUrlInput) {
  imageUrlInput.addEventListener("input", (e) => {
    const url = e.target.value.trim();
    imagePreview.innerHTML = url ? `<img src="${url}" onerror="this.style.display='none'" />` : "";
  });
}

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = productForm.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = "جارٍ الحفظ...";

  try {
    const fd = new FormData(productForm);
    const id = fd.get("id");

    const data = {
      name: fd.get("name").trim(),
      description: (fd.get("description") || "").trim(),
      price: Number(fd.get("price")),
      comparePrice: fd.get("comparePrice") ? Number(fd.get("comparePrice")) : null,
      category: (fd.get("category") || "").trim(),
      sizes: (fd.get("sizes") || "").split(",").map((s) => s.trim()).filter(Boolean),
      image: (fd.get("image") || "").trim(),
      active: productForm.active.checked
    };

    if (id) {
      await updateDoc(doc(db, "products", id), data);
      showToast("تم تحديث المنتج ✓");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), data);
      showToast("تمت إضافة المنتج ✓");
    }
    closeEditor();
  } catch (err) {
    console.error(err);
    showToast("فشل الحفظ: " + err.message, "toast--error");
  } finally {
    btn.disabled = false; btn.textContent = "حفظ";
  }
});

async function removeProduct(id) {
  if (!confirm("هل تريد حذف هذا المنتج نهائياً؟")) return;
  try {
    await deleteDoc(doc(db, "products", id));
    showToast("تم حذف المنتج");
  } catch (err) {
    showToast("فشل الحذف", "toast--error");
  }
}

function subscribeOrders() {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrders();
    renderRecentOrders();
    updateStats();
    const pending = orders.filter((o) => o.status === "pending").length;
    const badge = $("#ordersBadge");
    badge.textContent = pending;
    badge.dataset.empty = pending === 0 ? "true" : "false";
  }, (err) => {
    console.error("❌ Orders error:", err);
  });
}

function statusPill(s) {
  const map = { pending: "قيد الانتظار", completed: "مكتمل", cancelled: "ملغى" };
  return `<span class="pill pill--${s}">${map[s] || s}</span>`;
}

function renderOrders() {
  const body = $("#ordersBody");
  if (!orders.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:2rem;">لا توجد طلبات بعد.</td></tr>`;
    return;
  }
  body.innerHTML = orders.map((o) => `
    <tr>
      <td>${dateFmt(o.createdAt)}</td>
      <td><strong>${o.customer?.name || "—"}</strong></td>
      <td dir="ltr">${o.customer?.phone || "—"}</td>
      <td>${o.items?.length || 0} قطعة</td>
      <td>${fmt(o.total || 0)}</td>
      <td>${statusPill(o.status)}</td>
      <td>
        <div class="table__actions">
          <button class="tbl-btn" data-view-order="${o.id}">تفاصيل</button>
        </div>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-view-order]").forEach((b) =>
    b.addEventListener("click", () => openOrder(orders.find((x) => x.id === b.dataset.viewOrder)))
  );
}

function renderRecentOrders() {
  const wrap = $("#recentOrders");
  const recent = orders.slice(0, 5);
  if (!recent.length) {
    wrap.innerHTML = `<p class="muted">لا توجد طلبات حديثة.</p>`;
    return;
  }
  wrap.innerHTML = `
    <table class="table">
      <thead><tr><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
      <tbody>
        ${recent.map((o) => `
          <tr>
            <td>${dateFmt(o.createdAt)}</td>
            <td>${o.customer?.name || "—"}</td>
            <td>${fmt(o.total || 0)}</td>
            <td>${statusPill(o.status)}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

const orderModal = $("#orderModal");
$$("[data-close-order]").forEach((el) => el.addEventListener("click", () => orderModal.classList.remove("is-open")));

function openOrder(o) {
  $("#orderDetails").innerHTML = `
    <div class="order-detail">
      <h3>تفاصيل الطلب</h3>
      <div class="order-detail__row"><span>التاريخ</span><strong>${dateFmt(o.createdAt)}</strong></div>
      <div class="order-detail__row"><span>الاسم</span><strong>${o.customer?.name || "—"}</strong></div>
      <div class="order-detail__row"><span>الهاتف</span><strong dir="ltr">${o.customer?.phone || "—"}</strong></div>
      <div class="order-detail__row"><span>المدينة</span><strong>${o.customer?.city || "—"}</strong></div>
      <div class="order-detail__row"><span>العنوان</span><strong>${o.customer?.address || "—"}</strong></div>
      ${o.customer?.notes ? `<div class="order-detail__row"><span>ملاحظات</span><strong>${o.customer.notes}</strong></div>` : ""}

      <h3 style="margin-top:1.5rem;font-size:1.15rem;">المنتجات</h3>
      <div class="order-detail__items">
        ${(o.items || []).map((it) => `
          <div class="order-detail__item">
            <span>${it.name}${it.size ? ` — ${it.size}` : ""} × ${it.qty}</span>
            <strong>${fmt(it.price * it.qty)}</strong>
          </div>`).join("")}
      </div>
      <div class="order-detail__total"><span>الإجمالي</span><strong>${fmt(o.total || 0)}</strong></div>

      <div style="margin-top:1.5rem;">
        <label style="display:block;font-size:.82rem;color:var(--ink-soft);margin-bottom:.5rem;">تحديث الحالة</label>
        <select class="status-select" id="orderStatus">
          <option value="pending" ${o.status === "pending" ? "selected" : ""}>قيد الانتظار</option>
          <option value="completed" ${o.status === "completed" ? "selected" : ""}>مكتمل</option>
          <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>ملغى</option>
        </select>
      </div>
    </div>
  `;
  orderModal.classList.add("is-open");

  $("#orderStatus").addEventListener("change", async (e) => {
    try {
      await updateDoc(doc(db, "orders", o.id), { status: e.target.value });
      showToast("تم تحديث حالة الطلب ✓");
    } catch (err) {
      showToast("فشل التحديث", "toast--error");
    }
  });
}

function updateStats() {
  $("#statProducts").textContent = products.length;
  $("#statOrders").textContent = orders.length;
  $("#statPending").textContent = orders.filter((o) => o.status === "pending").length;
  const sales = orders.filter((o) => o.status === "completed").reduce((s, o) => s + (o.total || 0), 0);
  $("#statSales").textContent = fmt(sales);
}
