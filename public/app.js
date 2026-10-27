/* ========================================================
   SHOPNGHIAZ - FRONTEND CONTROLLER & APP ENGINE
   ======================================================== */

// 1. Tự động tương thích cả khi chạy Localhost lẫn triển khai Netlify
const API_BASE = (window.location.hostname.includes('netlify.app')) 
  ? 'https://shopnghiaz.onrender.com' 
  : '';

const _rawFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string' && url.startsWith('/api/') && API_BASE) {
    return _rawFetch(API_BASE + url, options);
  }
  return _rawFetch(url, options);
};

// Chuẩn hóa đường dẫn ảnh: Tự động trỏ về domain máy chủ nếu cần
function formatImageUrl(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60';
  }
  if (url.startsWith('/uploads/')) {
    return API_BASE ? API_BASE + url : url;
  }
  return url;
}

// Global State
let currentUser = null;
let allProducts = [];
let currentCategory = 'Tất cả';
let currentSettings = {
  shopName: 'ShopNghiaZ',
  shopTitle: 'Shop định vị uy tín số 1 Việt Nam',
  shopDesc: 'SHOP ĐỊNH VỊ UY TÍN - GIÁ RẺ - TỰ ĐỘNG SỐ 1 VIỆT NAM. Bảo hành trọn đời, hỗ trợ 24/7.',
  shopNotice: '🔥 CHÀO MỪNG ĐẾN VỚI SHOPNGHIAZ! NẠP TIỀN QUA VIETQR DUYỆT NHANH CHÓNG 24/7! 🔥',
  shopNoticeActive: true,
  contactZalo: '0868915360',
  contactPhone: '0868915360',
  contactTelegram: 'NghiazXdinhvi',
  contactFacebook: 'https://facebook.com',
  bankId: 'MOMO',
  accountNo: '0349340730',
  accountName: 'VU TRONG NGHIA',
  categories: ['Tất cả', 'Định Vị Android', 'Định Vị iOS', 'Tài khoản VIP', 'Phần mềm bản quyền', 'Game & Code']
};

let currentUploadedBase64 = null;
let currentSelectedFile = null;
let editingProductId = null;
let currentAuthTab = 'login';
let currentBalanceMode = 'add';
let currentDownloadLink = '';
let currentTxId = '';
let currentMemo = '';

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = localStorage.getItem('shopnghiaz_user');
    if (saved) {
      currentUser = JSON.parse(saved);
    }
  } catch (e) {
    currentUser = null;
  }

  updateAuthUI();
  loadSettings();
  loadProducts();
  refreshUserBalance();

  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
});

// ---------------- TOAST THÔNG BÁO ----------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200',
    error: 'bg-rose-950/90 border-rose-500/50 text-rose-200',
    warning: 'bg-amber-950/90 border-amber-500/50 text-amber-200',
    info: 'bg-slate-900/90 border-teal-500/50 text-teal-200'
  };

  const icons = {
    success: '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>',
    error: '<i data-lucide="alert-circle" class="w-4 h-4 text-rose-400"></i>',
    warning: '<i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400"></i>',
    info: '<i data-lucide="info" class="w-4 h-4 text-teal-400"></i>'
  };

  toast.className = `toast flex items-center gap-2 px-3.5 py-2.5 rounded-xl border shadow-xl text-xs backdrop-blur-md ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <span class="shrink-0">${icons[type] || icons.info}</span>
    <span class="font-medium">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---------------- MODAL CONTROLS ----------------
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
  }
}

function dismissNotice() {
  const banner = document.getElementById('shopNoticeBanner');
  if (banner) banner.classList.add('hidden');
}

// ---------------- LOAD CẤU HÌNH SHOP ----------------
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.data) {
      currentSettings = { ...currentSettings, ...data.data };
      applyShopSettingsToUI();
    }
  } catch (err) {
    console.error('Failed to load shop settings');
  }
}

function applyShopSettingsToUI() {
  const s = currentSettings;

  // 1. Tên Shop
  const navShopName = document.getElementById('navShopName');
  if (navShopName) navShopName.innerText = s.shopName || 'ShopNghiaZ';
  const footerShopName = document.getElementById('footerShopName');
  if (footerShopName) footerShopName.innerText = s.shopName || 'ShopNghiaZ';
  const heroHighlight = document.getElementById('heroShopHighlight');
  if (heroHighlight) heroHighlight.innerText = s.shopName || 'ShopNghiaZ';

  // 2. Tiêu đề & Mô tả
  const heroTitle = document.getElementById('heroShopTitle');
  if (heroTitle && s.shopTitle) {
    const sName = s.shopName || 'ShopNghiaZ';
    if (s.shopTitle.toLowerCase().includes(sName.toLowerCase())) {
      heroTitle.innerHTML = s.shopTitle.replace(new RegExp(sName, 'i'), `<span class="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">${sName}</span>`);
    } else {
      heroTitle.innerHTML = `${s.shopTitle} <span class="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">${sName}</span>`;
    }
  }
  const heroDesc = document.getElementById('heroShopDesc');
  if (heroDesc) heroDesc.innerText = s.shopDesc || '';

  // 3. Thông báo đầu trang
  const noticeBanner = document.getElementById('shopNoticeBanner');
  const noticeText = document.getElementById('shopNoticeText');
  if (noticeBanner && noticeText) {
    if (s.shopNoticeActive === false) {
      noticeBanner.classList.add('hidden');
    } else {
      noticeBanner.classList.remove('hidden');
      noticeText.innerText = s.shopNotice || '⚡ Ưu đãi nạp tiền: Quét mã VietQR duyệt nhanh chóng 24/7!';
    }
  }

  // 4. Liên hệ ở Footer
  const footerContacts = document.getElementById('footerContacts');
  if (footerContacts) {
    let contactsHtml = '';
    if (s.contactZalo) {
      contactsHtml += `<a href="https://zalo.me/${s.contactZalo}" target="_blank" class="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 transition">Zalo: ${s.contactZalo}</a>`;
    }
    if (s.contactTelegram) {
      contactsHtml += `<a href="https://t.me/${s.contactTelegram.replace('@','')}" target="_blank" class="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/25 transition">Telegram: ${s.contactTelegram}</a>`;
    }
    if (s.contactFacebook) {
      contactsHtml += `<a href="${s.contactFacebook}" target="_blank" class="px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/25 transition">Fanpage Facebook</a>`;
    }
    footerContacts.innerHTML = contactsHtml || '<span class="text-slate-500">Hỗ trợ 24/7 toàn quốc</span>';
  }

  renderCategoryPills();
  fillAdminSettingsForms();
}

function renderCategoryPills() {
  const container = document.getElementById('categoryPillsContainer');
  if (!container) return;

  const cats = Array.isArray(currentSettings.categories) ? currentSettings.categories : ['Tất cả'];
  container.innerHTML = cats.map(cat => {
    const isActive = cat.toLowerCase() === currentCategory.toLowerCase();
    return `
      <button onclick="filterCategory('${cat}')" class="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
        isActive 
          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20' 
          : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-emerald-500/40'
      }">
        ${cat}
      </button>
    `;
  }).join('');

  // Cập nhật select danh mục trong form thêm sản phẩm
  const admCatSelect = document.getElementById('admProdCategory');
  if (admCatSelect) {
    admCatSelect.innerHTML = cats.filter(c => c.toLowerCase() !== 'tất cả').map(c => `
      <option value="${c}">${c}</option>
    `).join('');
  }
}

function fillAdminSettingsForms() {
  const s = currentSettings;
  const nameInp = document.getElementById('cfgShopName');
  if (nameInp) nameInp.value = s.shopName || '';
  const titleInp = document.getElementById('cfgShopTitle');
  if (titleInp) titleInp.value = s.shopTitle || '';
  const descInp = document.getElementById('cfgShopDesc');
  if (descInp) descInp.value = s.shopDesc || '';
  const noticeInp = document.getElementById('cfgShopNotice');
  if (noticeInp) noticeInp.value = s.shopNotice || '';
  const noticeChk = document.getElementById('cfgShopNoticeActive');
  if (noticeChk) noticeChk.checked = s.shopNoticeActive !== false;
  const zaloInp = document.getElementById('cfgContactZalo');
  if (zaloInp) zaloInp.value = s.contactZalo || '';
  const teleInp = document.getElementById('cfgContactTelegram');
  if (teleInp) teleInp.value = s.contactTelegram || '';
  const fbInp = document.getElementById('cfgContactFacebook');
  if (fbInp) fbInp.value = s.contactFacebook || '';

  const bankInp = document.getElementById('admCfgBankId');
  if (bankInp) bankInp.value = s.bankId || 'MB';
  const accNoInp = document.getElementById('admCfgAccountNo');
  if (accNoInp) accNoInp.value = s.accountNo || '';
  const accNameInp = document.getElementById('admCfgAccountName');
  if (accNameInp) accNameInp.value = s.accountName || '';
}

// ---------------- PRODUCTS LOGIC ----------------
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      allProducts = data.data;
      localStorage.setItem('shopnghiaz_cached_products', JSON.stringify(allProducts));
      renderProducts();
      renderAdminProductsList();
    }
  } catch (err) {
    console.error('Error loading products:', err);
    const cached = localStorage.getItem('shopnghiaz_cached_products');
    if (cached && allProducts.length === 0) {
      allProducts = JSON.parse(cached);
      renderProducts();
      renderAdminProductsList();
    }
  }
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const countBadge = document.getElementById('productCountBadge');
  if (!grid) return;

  const searchVal = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

  let filtered = allProducts.filter(p => {
    const matchCat = (currentCategory === 'Tất cả') || (p.category && p.category.toLowerCase() === currentCategory.toLowerCase());
    const matchSearch = !searchVal || p.name.toLowerCase().includes(searchVal) || (p.description && p.description.toLowerCase().includes(searchVal));
    return matchCat && matchSearch;
  });

  if (countBadge) {
    countBadge.innerText = `${filtered.length} sản phẩm`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-500">
        <i data-lucide="package-search" class="w-10 h-10 mx-auto mb-2 text-slate-600"></i>
        <p class="text-sm font-semibold">Không tìm thấy sản phẩm nào phù hợp!</p>
        <p class="text-xs text-slate-600 mt-1">Hãy thử tìm từ khóa khác hoặc chọn danh mục "Tất cả".</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isOutOfStock = p.stock <= 0;

    return `
      <div class="cyber-card rounded-2xl overflow-hidden flex flex-col justify-between relative group">
        <div class="relative h-32 sm:h-44 bg-slate-950 overflow-hidden">
          <img src="${formatImageUrl(p.image)}" alt="${p.name}" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          <div class="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-lg border border-emerald-500/25 text-[10px] sm:text-xs font-semibold text-emerald-300">
            ${p.category || 'Sản phẩm'}
          </div>
          <div class="absolute top-2 right-2 ${isOutOfStock ? 'bg-rose-500/90' : 'bg-emerald-500/90'} backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-bold text-slate-950 shadow">
            ${isOutOfStock ? 'Hết hàng' : `Còn: ${p.stock}`}
          </div>
        </div>

        <div class="p-3 sm:p-4 flex-1 flex flex-col justify-between">
          <div>
            <h4 class="font-bold text-white text-xs sm:text-sm line-clamp-2 mb-1 group-hover:text-emerald-400 transition" title="${p.name}">
              ${p.name}
            </h4>
            <p class="text-slate-400 text-[11px] sm:text-xs line-clamp-2 mb-3">
              ${p.description || 'Sản phẩm chất lượng cao, bảo hành uy tín từ ShopNghiaZ.'}
            </p>
          </div>

          <div class="pt-2.5 border-t border-slate-800 flex items-center justify-between gap-1.5">
            <div>
              <span class="text-[10px] text-slate-500 block">Giá bán</span>
              <span class="text-sm sm:text-base font-black text-emerald-400 font-mono">
                ${Number(p.price).toLocaleString('vi-VN')} đ
              </span>
            </div>

            <button onclick="handleBuyProduct('${p.id}')" ${isOutOfStock ? 'disabled' : ''} class="${
              isOutOfStock 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold shadow-md shadow-emerald-500/20 active:scale-95'
            } px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1 transition">
              <i data-lucide="shopping-cart" class="w-3.5 h-3.5"></i>
              <span>${isOutOfStock ? 'Hết' : 'Mua'}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function filterCategory(cat) {
  currentCategory = cat;
  renderCategoryPills();
  renderProducts();
}

function handleSearch() {
  renderProducts();
}

// ---------------- KÉO THẢ ẢNH & CHỌN TỪ THƯ MỤC ----------------
function triggerFileInput() {
  const inp = document.getElementById('admProductFileInput');
  if (inp) inp.click();
}

function handleFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (file) processSelectedImage(file);
}

function handleDragOver(e) {
  e.preventDefault();
  const dz = document.getElementById('dropzoneContainer');
  if (dz) dz.classList.add('dropzone-active');
}

function handleDragLeave(e) {
  e.preventDefault();
  const dz = document.getElementById('dropzoneContainer');
  if (dz) dz.classList.remove('dropzone-active');
}

function handleDrop(e) {
  e.preventDefault();
  const dz = document.getElementById('dropzoneContainer');
  if (dz) dz.classList.remove('dropzone-active');
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    processSelectedImage(e.dataTransfer.files[0]);
  }
}

function processSelectedImage(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Vui lòng chọn file hình ảnh (JPG, PNG, WEBP, GIF, SVG)!', 'error');
    return;
  }
  currentSelectedFile = file;
  const reader = new FileReader();
  reader.onload = (event) => {
    currentUploadedBase64 = event.target.result;
    const previewCont = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreviewImg');
    const previewName = document.getElementById('imagePreviewName');
    const previewStatus = document.getElementById('imagePreviewStatus');

    if (previewCont) previewCont.classList.remove('hidden');
    if (previewImg) previewImg.src = currentUploadedBase64;
    if (previewName) previewName.innerText = file.name;
    if (previewStatus) previewStatus.innerText = (file.size / 1024).toFixed(1) + ' KB - Đã sẵn sàng';
    showToast('Đã nhận diện ảnh: ' + file.name, 'success');
  };
  reader.readAsDataURL(file);
}

function clearSelectedImage(e) {
  if (e) e.stopPropagation();
  currentSelectedFile = null;
  currentUploadedBase64 = null;
  const inp = document.getElementById('admProductFileInput');
  if (inp) inp.value = '';
  const previewCont = document.getElementById('imagePreviewContainer');
  if (previewCont) previewCont.classList.add('hidden');
}

// ---------------- THÊM / SỬA / XÓA SẢN PHẨM ----------------
function openEditProductModal(id) {
  const prod = allProducts.find(p => p.id === id);
  if (!prod) return;

  editingProductId = id;
  document.getElementById('admEditingProdId').value = id;
  document.getElementById('admProdName').value = prod.name;
  document.getElementById('admProdPrice').value = prod.price;
  document.getElementById('admProdStock').value = prod.stock;
  document.getElementById('admProdCategory').value = prod.category;
  document.getElementById('admProdDesc').value = prod.description || '';
  document.getElementById('admProdImage').value = prod.image || '';
  const dlInput = document.getElementById('admProdDownloadUrl');
  if (dlInput) dlInput.value = prod.downloadUrl || '';

  const previewCont = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreviewImg');
  const previewName = document.getElementById('imagePreviewName');
  const previewStatus = document.getElementById('imagePreviewStatus');
  if (previewCont && prod.image) {
    previewCont.classList.remove('hidden');
    previewImg.src = formatImageUrl(prod.image);
    previewName.innerText = 'Ảnh hiện tại của sản phẩm';
    previewStatus.innerText = 'Kéo thả hoặc chọn ảnh mới nếu muốn thay';
  }

  document.getElementById('admProdSubmitBtn').innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Cập Nhật Sản Phẩm';
  document.getElementById('admCancelEditBtn').classList.remove('hidden');

  openModal('adminModal');
  switchAdminTab('product');
  if (window.lucide) lucide.createIcons();
}

function cancelEditingProduct() {
  editingProductId = null;
  document.getElementById('admEditingProdId').value = '';
  document.getElementById('adminAddProductForm').reset();
  const dlInput = document.getElementById('admProdDownloadUrl');
  if (dlInput) dlInput.value = '';
  clearSelectedImage();
  document.getElementById('admProdSubmitBtn').innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Đăng Sản Phẩm';
  document.getElementById('admCancelEditBtn').classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

async function handleAdminAddProductSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('admProdName').value.trim();
  const price = document.getElementById('admProdPrice').value;
  const stock = document.getElementById('admProdStock').value;
  const category = document.getElementById('admProdCategory').value;
  let image = document.getElementById('admProdImage').value.trim();
  const description = document.getElementById('admProdDesc').value.trim();
  const downloadUrl = (document.getElementById('admProdDownloadUrl') ? document.getElementById('admProdDownloadUrl').value.trim() : '');

  if (currentUploadedBase64) {
    try {
      showToast('Đang tải hình ảnh lên máy chủ...', 'info');
      const upRes = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUsername: currentUser ? currentUser.username : 'nghiaz',
          imageBase64: currentUploadedBase64,
          filename: currentSelectedFile ? currentSelectedFile.name : 'product.png'
        })
      });
      const upData = await upRes.json();
      if (upData.success && upData.imageUrl) {
        image = upData.imageUrl;
      }
    } catch (err) {
      image = currentUploadedBase64;
    }
  }

  if (!image) {
    image = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60';
  }

  try {
    const isEdit = !!editingProductId;
    const endpoint = isEdit ? `/api/products/${editingProductId}` : '/api/products';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(endpoint, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUsername: currentUser ? currentUser.username : 'nghiaz',
        name, price, stock, category, image, description, downloadUrl
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(isEdit ? 'Đã cập nhật sản phẩm thành công!' : 'Đã đăng sản phẩm mới thành công!', 'success');
      cancelEditingProduct();
      loadProducts();
    } else {
      showToast(data.message || 'Lỗi khi xử lý sản phẩm', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

async function deleteProduct(productId) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (!confirm('Bạn có chắc chắn muốn xóa sản phẩm này khỏi Shop?')) return;

  try {
    const res = await fetch(`/api/products/${productId}?adminUsername=${currentUser.username}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadProducts();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi khi xóa sản phẩm', 'error');
  }
}

function renderAdminProductsList() {
  const container = document.getElementById('adminProductsList');
  if (!container) return;

  if (allProducts.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-2">Chưa có sản phẩm nào trong shop.</p>`;
    return;
  }

  container.innerHTML = allProducts.map(p => `
    <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-2.5 min-w-0">
        <img src="${formatImageUrl(p.image)}" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'" class="w-10 h-10 object-cover rounded-lg border border-slate-800 shrink-0">
        <div class="min-w-0">
          <p class="font-bold text-slate-200 truncate">${p.name}</p>
          <p class="text-[11px] text-slate-400">
            <span class="text-emerald-400 font-bold">${Number(p.price).toLocaleString('vi-VN')} đ</span> • Còn: ${p.stock} • ${p.category || 'Mặc định'}
            ${p.downloadUrl ? '<span class="ml-1 text-cyan-400 font-semibold">[Có link tải]</span>' : ''}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button onclick="openEditProductModal('${p.id}')" title="Sửa sản phẩm" class="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 font-bold rounded-lg transition flex items-center gap-1">
          <i data-lucide="edit-3" class="w-3 h-3"></i> Sửa
        </button>
        <button onclick="deleteProduct('${p.id}')" title="Xóa sản phẩm" class="p-1 bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white rounded-lg transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// ---------------- DANH MỤC SẢN PHẨM ----------------
function renderAdminCategoriesList() {
  const container = document.getElementById('adminCategoriesList');
  if (!container) return;

  const cats = Array.isArray(currentSettings.categories) ? currentSettings.categories : [];
  container.innerHTML = cats.map(c => {
    const isAll = c.toLowerCase() === 'tất cả';
    return `
      <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
        <span class="font-bold text-slate-200 flex items-center gap-2">
          <i data-lucide="tag" class="w-3.5 h-3.5 text-teal-400"></i> ${c}
        </span>
        ${!isAll ? `
          <button onclick="handleDeleteCategory('${c}')" title="Xóa danh mục" class="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        ` : `
          <span class="text-[10px] text-slate-500 font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">Mặc định</span>
        `}
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function handleAddCategory() {
  const input = document.getElementById('newCategoryInput');
  const cat = input.value.trim();
  if (!cat) {
    showToast('Vui lòng nhập tên mục sản phẩm!', 'warning');
    return;
  }

  const existing = currentSettings.categories || [];
  if (existing.some(c => c.toLowerCase() === cat.toLowerCase())) {
    showToast('Mục sản phẩm này đã tồn tại!', 'warning');
    return;
  }

  const newCats = [...existing, cat];
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUsername: currentUser ? currentUser.username : 'nghiaz',
        categories: newCats
      })
    });
    const data = await res.json();
    if (data.success) {
      currentSettings.categories = newCats;
      input.value = '';
      applyShopSettingsToUI();
      renderAdminCategoriesList();
      showToast(`Đã thêm mục [${cat}] vào Shop!`, 'success');
    }
  } catch (err) {
    showToast('Lỗi khi thêm mục sản phẩm', 'error');
  }
}

async function handleDeleteCategory(catName) {
  if (catName.toLowerCase() === 'tất cả') return;
  if (!confirm(`Bạn có chắc muốn xóa mục sản phẩm [${catName}]?`)) return;

  const newCats = (currentSettings.categories || []).filter(c => c !== catName);
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUsername: currentUser ? currentUser.username : 'nghiaz',
        categories: newCats
      })
    });
    const data = await res.json();
    if (data.success) {
      currentSettings.categories = newCats;
      applyShopSettingsToUI();
      renderAdminCategoriesList();
      showToast(`Đã xóa mục [${catName}]`, 'success');
    }
  } catch (err) {
    showToast('Lỗi khi xóa mục sản phẩm', 'error');
  }
}

// ---------------- LƯU THÔNG TIN SHOP & MÔ TẢ ----------------
async function handleAdminSaveShopInfo(e) {
  e.preventDefault();

  const shopName = document.getElementById('cfgShopName').value.trim();
  const shopTitle = document.getElementById('cfgShopTitle').value.trim();
  const shopDesc = document.getElementById('cfgShopDesc').value.trim();
  const shopNotice = document.getElementById('cfgShopNotice').value.trim();
  const shopNoticeActive = document.getElementById('cfgShopNoticeActive').checked;
  const contactZalo = document.getElementById('cfgContactZalo').value.trim();
  const contactTelegram = document.getElementById('cfgContactTelegram').value.trim();
  const contactFacebook = document.getElementById('cfgContactFacebook').value.trim();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUsername: currentUser ? currentUser.username : 'nghiaz',
        shopName,
        shopTitle,
        shopDesc,
        shopNotice,
        shopNoticeActive,
        contactZalo,
        contactTelegram,
        contactFacebook
      })
    });

    const data = await res.json();
    if (data.success) {
      currentSettings = { ...currentSettings, ...data.data };
      applyShopSettingsToUI();
      showToast('Đã lưu toàn bộ thay đổi tên shop, mô tả và cấu hình!', 'success');
      closeModal('adminModal');
    } else {
      showToast(data.message || 'Lỗi khi lưu cấu hình', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// ---------------- LƯU CẤU HÌNH VIETQR ----------------
async function handleAdminSaveSettings(e) {
  e.preventDefault();
  const bankId = document.getElementById('admCfgBankId').value;
  const accountNo = document.getElementById('admCfgAccountNo').value.trim();
  const accountName = document.getElementById('admCfgAccountName').value.trim().toUpperCase();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUsername: currentUser ? currentUser.username : 'nghiaz',
        bankId, accountNo, accountName
      })
    });

    const data = await res.json();
    if (data.success) {
      currentSettings.bankId = bankId;
      currentSettings.accountNo = accountNo;
      currentSettings.accountName = accountName;
      showToast('Đã lưu cấu hình tài khoản VietQR của Shop!', 'success');
      closeModal('adminModal');
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi khi lưu cấu hình', 'error');
  }
}

// ---------------- MUA HÀNG (BUY PRODUCT) ----------------
async function handleBuyProduct(productId) {
  if (!currentUser) {
    showToast('Vui lòng đăng nhập để mua sản phẩm!', 'warning');
    openAuthModal('login');
    return;
  }

  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  const currentBal = Number(currentUser.balance || 0);
  if (currentBal < product.price) {
    showToast(`Số dư không đủ (${currentBal.toLocaleString('vi-VN')} đ). Vui lòng nạp thêm tiền qua VietQR!`, 'warning');
    openDepositModal();
    return;
  }

  const ok = confirm(`Xác nhận mua [${product.name}]\nGiá tiền: ${product.price.toLocaleString('vi-VN')} đ\nSố dư sau khi mua: ${(currentBal - product.price).toLocaleString('vi-VN')} đ`);
  if (!ok) return;

  try {
    const res = await fetch('/api/orders/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        productId: product.id,
        quantity: 1
      })
    });

    const data = await res.json();
    if (data.success) {
      currentUser.balance = data.newBalance;
      localStorage.setItem('shopnghiaz_user', JSON.stringify(currentUser));
      updateAuthUI();
      loadProducts();

      if (data.downloadUrl && data.downloadUrl.trim() !== '') {
        currentDownloadLink = data.downloadUrl.trim();
        const pNameElem = document.getElementById('buySuccessProductName');
        if (pNameElem) pNameElem.innerText = `Sản phẩm: ${data.productName || product.name}`;
        const pLinkElem = document.getElementById('buySuccessDownloadLinkText');
        if (pLinkElem) pLinkElem.innerText = currentDownloadLink;
        const pBtnElem = document.getElementById('buySuccessDownloadBtn');
        if (pBtnElem) pBtnElem.href = currentDownloadLink;
        openModal('buySuccessModal');
      } else {
        showToast('Mua hàng thành công! Kiểm tra lịch sử giao dịch.', 'success');
      }
    } else {
      showToast(data.message || 'Lỗi khi mua hàng', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi thanh toán', 'error');
  }
}

function copyBuySuccessLink() {
  if (currentDownloadLink) {
    navigator.clipboard.writeText(currentDownloadLink);
    showToast('Đã sao chép link tải sản phẩm!', 'success');
  }
}

// ---------------- AUTH LOGIC ----------------
function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  openModal('authModal');
}

function switchAuthTab(tab) {
  currentAuthTab = tab;
  const isLogin = tab === 'login';

  document.getElementById('tabLogin').className = isLogin
    ? 'flex-1 py-2 text-xs font-bold text-emerald-400 border-b-2 border-emerald-500'
    : 'flex-1 py-2 text-xs font-medium text-slate-400 hover:text-white';

  document.getElementById('tabRegister').className = !isLogin
    ? 'flex-1 py-2 text-xs font-bold text-emerald-400 border-b-2 border-emerald-500'
    : 'flex-1 py-2 text-xs font-medium text-slate-400 hover:text-white';

  const fullnameGroup = document.getElementById('fullnameGroup');
  const authSubmitBtn = document.getElementById('authSubmitBtn');

  if (isLogin) {
    fullnameGroup.classList.add('hidden');
    authSubmitBtn.innerText = 'Đăng Nhập';
  } else {
    fullnameGroup.classList.remove('hidden');
    authSubmitBtn.innerText = 'Đăng Ký Tài Khoản Mới';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const fullname = document.getElementById('authFullname').value.trim();

  const endpoint = currentAuthTab === 'login' ? '/api/auth/login' : '/api/auth/register';
  const body = currentAuthTab === 'login' 
    ? { username, password } 
    : { username, password, fullname };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      currentUser = data.data;
      localStorage.setItem('shopnghiaz_user', JSON.stringify(currentUser));
      updateAuthUI();
      closeModal('authModal');
      document.getElementById('authForm').reset();
      renderProducts();
    } else {
      showToast(data.message || 'Thao tác không thành công', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('shopnghiaz_user');
  updateAuthUI();
  renderProducts();
  showToast('Đã đăng xuất tài khoản!', 'info');
}

function updateAuthUI() {
  const loggedInBlock = document.getElementById('userLoggedInBlock');
  const loggedOutBlock = document.getElementById('userLoggedOutBlock');
  const navAdminBtn = document.getElementById('navAdminBtn');
  const mobileNavAdminBtn = document.getElementById('mobileNavAdminBtn');
  const adminBadge = document.getElementById('adminBadge');
  const mobileAccountLabel = document.getElementById('mobileAccountLabel');

  if (currentUser) {
    loggedInBlock.classList.remove('hidden');
    loggedOutBlock.classList.add('hidden');
    document.getElementById('usernameText').innerText = currentUser.fullname || currentUser.username;
    document.getElementById('userBalanceText').innerText = Number(currentUser.balance || 0).toLocaleString('vi-VN') + ' đ';
    if (mobileAccountLabel) mobileAccountLabel.innerText = currentUser.username;

    const isAdmin = currentUser.role === 'admin';
    if (isAdmin) {
      if (navAdminBtn) navAdminBtn.classList.remove('hidden');
      if (mobileNavAdminBtn) mobileNavAdminBtn.classList.remove('hidden');
      if (adminBadge) adminBadge.classList.remove('hidden');
    } else {
      if (navAdminBtn) navAdminBtn.classList.add('hidden');
      if (mobileNavAdminBtn) mobileNavAdminBtn.classList.add('hidden');
      if (adminBadge) adminBadge.classList.add('hidden');
    }
  } else {
    loggedInBlock.classList.add('hidden');
    loggedOutBlock.classList.remove('hidden');
    if (navAdminBtn) navAdminBtn.classList.add('hidden');
    if (mobileNavAdminBtn) mobileNavAdminBtn.classList.add('hidden');
    if (adminBadge) adminBadge.classList.add('hidden');
    if (mobileAccountLabel) mobileAccountLabel.innerText = 'Tài Khoản';
  }
  if (window.lucide) lucide.createIcons();
}

function handleMobileAccountClick() {
  if (currentUser) {
    const ok = confirm(`Tài khoản: ${currentUser.username}\nSố dư: ${Number(currentUser.balance || 0).toLocaleString('vi-VN')} đ\nBạn có muốn đăng xuất không?`);
    if (ok) logout();
  } else {
    openAuthModal('login');
  }
}

async function refreshUserBalance() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/auth/me/${currentUser.username}`);
    const data = await res.json();
    if (data.success) {
      currentUser.balance = data.data.balance;
      currentUser.role = data.data.role;
      localStorage.setItem('shopnghiaz_user', JSON.stringify(currentUser));
      updateAuthUI();
    }
  } catch (err) {}
}

// ---------------- ADMIN PANEL LOGIC ----------------
function openAdminPanel() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Vui lòng đăng nhập tài khoản Admin nghiaz để vào trang quản trị!', 'error');
    openAuthModal('login');
    return;
  }
  openModal('adminModal');
  switchAdminTab('product');
}

const adminTabConfig = {
  product: { btnId: 'admTabProduct', secId: 'admSectionProduct' },
  categories: { btnId: 'admTabCategories', secId: 'admSectionCategories' },
  shopInfo: { btnId: 'admTabShopInfo', secId: 'admSectionShopInfo' },
  shop_info: { btnId: 'admTabShopInfo', secId: 'admSectionShopInfo' },
  users: { btnId: 'admTabUsers', secId: 'admSectionUsers' },
  deposits: { btnId: 'admTabDeposits', secId: 'admSectionDeposits' },
  orders: { btnId: 'admTabOrders', secId: 'admSectionOrders' },
  settings: { btnId: 'admTabSettings', secId: 'admSectionSettings' }
};

function switchAdminTab(rawTab) {
  let tab = rawTab;
  if (tab === 'shop_info') tab = 'shopInfo';
  if (!adminTabConfig[tab]) tab = 'product';

  const tabKeys = ['product', 'categories', 'shopInfo', 'users', 'deposits', 'orders', 'settings'];

  tabKeys.forEach(key => {
    const cfg = adminTabConfig[key];
    if (!cfg) return;
    const btn = document.getElementById(cfg.btnId);
    const sec = document.getElementById(cfg.secId);
    const isCurrent = (key === tab);

    if (btn) {
      if (isCurrent) {
        btn.className = 'admin-tab active shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 transition flex items-center gap-1 shadow-sm';
      } else {
        btn.className = 'admin-tab shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1';
      }
    }
    if (sec) {
      if (isCurrent) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    }
  });

  try {
    if (tab === 'product') {
      renderAdminProductsList();
    } else if (tab === 'categories') {
      renderAdminCategoriesList();
    } else if (tab === 'shopInfo' || tab === 'settings') {
      fillAdminSettingsForms();
    } else if (tab === 'users') {
      loadAdminUsers();
    } else if (tab === 'deposits') {
      loadAdminDeposits();
    } else if (tab === 'orders') {
      loadAdminOrders();
    }
  } catch (err) {
    console.error('Lỗi khi tải tab admin:', err);
  }

  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

// ---------------- QUẢN LÝ THÀNH VIÊN & SỐ DƯ (ADMIN) ----------------
async function loadAdminUsers() {
  const table = document.getElementById('adminUsersTable');
  table.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-500">Đang tải danh sách người dùng...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/users?adminUsername=${currentUser.username}`);
    const data = await res.json();

    if (!data.success || data.data.length === 0) {
      table.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-500">Chưa có người dùng nào.</td></tr>`;
      return;
    }

    table.innerHTML = data.data.map(u => {
      const isSelf = u.username.toLowerCase() === currentUser.username.toLowerCase();
      const isAdmin = u.role === 'admin';

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-2.5 font-mono font-bold text-emerald-300 flex items-center gap-1">
            ${isAdmin ? '👑' : '👤'} ${u.username}
          </td>
          <td class="p-2.5 text-slate-300">${u.fullname || '-'}</td>
          <td class="p-2.5 font-extrabold text-emerald-400">
            ${Number(u.balance || 0).toLocaleString('vi-VN')} đ
          </td>
          <td class="p-2.5">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isAdmin ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'}">
              ${u.role.toUpperCase()}
            </span>
          </td>
          <td class="p-2.5 text-right space-x-1">
            <button onclick="openAdjustBalanceModal('${u.username}', ${u.balance || 0})" title="Cộng / Giảm / Xóa tiền" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-[11px] font-bold transition shadow-sm">
              💰 Quản lý tiền
            </button>
            ${!isSelf ? `
              <button onclick="adminDeleteUser('${u.username}')" title="Xóa tài khoản" class="px-2 py-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-[11px] font-bold transition">
                🗑️
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    table.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-rose-400">Lỗi khi tải danh sách người dùng.</td></tr>`;
  }
}

function setBalanceMode(mode) {
  currentBalanceMode = mode;
  const btnAdd = document.getElementById('btnModeAdd');
  const btnDeduct = document.getElementById('btnModeDeduct');
  const btnReset = document.getElementById('btnModeReset');
  const amountGroup = document.getElementById('balanceAmountGroup');
  const resetWarning = document.getElementById('balanceResetWarning');
  const submitBtn = document.getElementById('balanceSubmitBtn');
  const amountLabel = document.getElementById('balanceAmountLabel');
  const amountInput = document.getElementById('balanceAmountInput');

  if (btnAdd) {
    btnAdd.className = mode === 'add'
      ? 'py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white transition flex items-center justify-center gap-1 shadow-sm'
      : 'py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1';
  }
  if (btnDeduct) {
    btnDeduct.className = mode === 'deduct'
      ? 'py-1.5 text-xs font-bold rounded-lg bg-amber-600 text-white transition flex items-center justify-center gap-1 shadow-sm'
      : 'py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1';
  }
  if (btnReset) {
    btnReset.className = mode === 'reset'
      ? 'py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white transition flex items-center justify-center gap-1 shadow-sm'
      : 'py-1.5 text-xs font-medium rounded-lg text-rose-400 hover:bg-rose-500/10 transition flex items-center justify-center gap-1';
  }

  if (mode === 'reset') {
    if (amountGroup) amountGroup.classList.add('hidden');
    if (resetWarning) resetWarning.classList.remove('hidden');
    if (amountInput) amountInput.removeAttribute('required');
    if (submitBtn) {
      submitBtn.className = 'w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 text-xs';
      submitBtn.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4"></i> Xác Nhận XÓA VỀ 0 VNĐ';
    }
  } else if (mode === 'deduct') {
    if (amountGroup) amountGroup.classList.remove('hidden');
    if (resetWarning) resetWarning.classList.add('hidden');
    if (amountLabel) {
      amountLabel.className = 'block text-xs font-semibold text-amber-400 mb-1';
      amountLabel.innerText = 'Số tiền muốn GIẢM BỚT (VNĐ):';
    }
    if (amountInput) amountInput.setAttribute('required', 'true');
    if (submitBtn) {
      submitBtn.className = 'w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 text-xs';
      submitBtn.innerHTML = '<i data-lucide="minus-circle" class="w-4 h-4"></i> Xác Nhận Giảm Tiền';
    }
  } else {
    if (amountGroup) amountGroup.classList.remove('hidden');
    if (resetWarning) resetWarning.classList.add('hidden');
    if (amountLabel) {
      amountLabel.className = 'block text-xs font-semibold text-emerald-400 mb-1';
      amountLabel.innerText = 'Số tiền muốn CỘNG THÊM (VNĐ):';
    }
    if (amountInput) amountInput.setAttribute('required', 'true');
    if (submitBtn) {
      submitBtn.className = 'w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 text-xs';
      submitBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Xác Nhận Cộng Tiền';
    }
  }
  if (window.lucide) lucide.createIcons();
}

function openAdjustBalanceModal(username, currentBal) {
  document.getElementById('adjustUsername').value = username;
  document.getElementById('adjustTargetUserLabel').innerText = `Tài khoản: ${username}`;
  document.getElementById('adjustCurrentBalanceText').innerText = Number(currentBal || 0).toLocaleString('vi-VN') + ' đ';
  document.getElementById('balanceAmountInput').value = '';
  document.getElementById('balanceReasonInput').value = '';
  setBalanceMode('add');
  openModal('adjustBalanceModal');
}

async function handleAdjustBalanceSubmit(e) {
  e.preventDefault();
  const targetUsername = document.getElementById('adjustUsername').value;
  const amount = Number(document.getElementById('balanceAmountInput').value);
  const reason = document.getElementById('balanceReasonInput').value.trim();

  let action = currentBalanceMode;
  let confirmText = '';

  if (action === 'reset') {
    confirmText = `Bạn có chắc chắn muốn XÓA SẠCH toàn bộ số dư của [${targetUsername}] về 0đ?`;
  } else if (action === 'deduct') {
    confirmText = `Xác nhận GIẢM TRỪ -${amount.toLocaleString('vi-VN')} đ của tài khoản [${targetUsername}]?`;
  } else {
    confirmText = `Xác nhận CỘNG THÊM +${amount.toLocaleString('vi-VN')} đ cho tài khoản [${targetUsername}]?`;
  }

  if (!confirm(confirmText)) return;

  try {
    const res = await fetch('/api/admin/add-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUsername: currentUser.username,
        targetUsername,
        amount,
        action,
        reason
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('adjustBalanceModal');
      loadAdminUsers();
      if (targetUsername.toLowerCase() === currentUser.username.toLowerCase()) {
        currentUser.balance = data.newBalance;
        localStorage.setItem('shopnghiaz_user', JSON.stringify(currentUser));
        updateAuthUI();
      }
    } else {
      showToast(data.message || 'Lỗi khi điều chỉnh số dư', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

async function adminDeleteUser(username) {
  if (!confirm(`Bạn có chắc muốn XÓA VĨNH VIỄN tài khoản [${username}]?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${username}?adminUsername=${currentUser.username}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminUsers();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi khi xóa người dùng', 'error');
  }
}

// ---------------- DUYỆT ĐƠN NẠP TIỀN VIETQR ----------------
async function loadAdminDeposits() {
  const table = document.getElementById('adminDepositsTable');
  table.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-500">Đang tải danh sách nạp tiền...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/deposits?adminUsername=${currentUser.username}`);
    const data = await res.json();

    if (!data.success || data.data.length === 0) {
      table.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-500">Chưa có giao dịch nạp tiền nào.</td></tr>`;
      return;
    }

    const pending = data.data.filter(d => d.status === 'PENDING').length;
    const badge = document.getElementById('pendingBadge');
    if (badge) {
      if (pending > 0) {
        badge.innerText = pending;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    table.innerHTML = data.data.map(tx => {
      const isPending = tx.status === 'PENDING';

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-2.5 font-mono font-bold text-amber-400">${tx.code || tx.id.slice(-6)}</td>
          <td class="p-2.5 font-bold text-emerald-300">${tx.username}</td>
          <td class="p-2.5 font-extrabold text-emerald-400">
            +${Number(tx.amount).toLocaleString('vi-VN')} đ
          </td>
          <td class="p-2.5 font-mono text-slate-300 text-[11px]">${tx.memo || '-'}</td>
          <td class="p-2.5">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isPending ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}">
              ${isPending ? '⏳ Chờ duyệt' : '✅ Đã duyệt'}
            </span>
          </td>
          <td class="p-2.5 text-right">
            ${isPending ? `
              <button onclick="adminApproveDeposit('${tx.id}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 ml-auto">
                <i data-lucide="check" class="w-3 h-3"></i> Duyệt
              </button>
            ` : `
              <span class="text-[11px] text-slate-500">Hoàn tất</span>
            `}
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    table.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-rose-400">Lỗi khi tải danh sách nạp tiền.</td></tr>`;
  }
}

let allAdminOrders = [];

async function loadAdminOrders() {
  const table = document.getElementById('adminOrdersTable');
  if (!table) return;
  table.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Đang tải lịch sử đơn mua của các user...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/orders?adminUsername=${encodeURIComponent(currentUser.username)}`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) {
      table.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Chưa có user nào mua hàng.</td></tr>`;
      updateOrderStats([]);
      return;
    }

    allAdminOrders = data.data;
    updateOrderStats(allAdminOrders);
    renderAdminOrdersList(allAdminOrders);
  } catch (err) {
    console.error('Lỗi khi tải lịch sử đơn hàng cho admin:', err);
    table.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-400">Không thể tải dữ liệu: ${err.message}</td></tr>`;
  }
}

function updateOrderStats(orders) {
  const totalOrdersEl = document.getElementById('statTotalOrders');
  const totalRevEl = document.getElementById('statTotalRevenue');
  const uniqueBuyersEl = document.getElementById('statUniqueBuyers');

  if (totalOrdersEl) totalOrdersEl.innerText = orders.length;
  if (totalRevEl) {
    const total = orders.reduce((sum, o) => sum + (Number(o.totalCost) || Number(o.price) || 0), 0);
    totalRevEl.innerText = total.toLocaleString('vi-VN') + ' đ';
  }
  if (uniqueBuyersEl) {
    const buyers = new Set(orders.map(o => (o.username || '').toLowerCase()).filter(Boolean));
    uniqueBuyersEl.innerText = buyers.size;
  }
}

function renderAdminOrdersList(orders) {
  const table = document.getElementById('adminOrdersTable');
  if (!table) return;

  if (orders.length === 0) {
    table.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Không tìm thấy đơn hàng nào phù hợp.</td></tr>`;
    return;
  }

  table.innerHTML = orders.map(ord => {
    const time = new Date(ord.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(ord.createdAt).toLocaleDateString('vi-VN');
    const total = Number(ord.totalCost) || (Number(ord.price) * (Number(ord.quantity) || 1)) || 0;
    const download = ord.downloadUrl ? ord.downloadUrl : '';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2.5">
          <div class="font-mono font-bold text-emerald-400 text-[11px]">${ord.id || '-'}</div>
          <div class="text-[10px] text-slate-400">${time}</div>
        </td>
        <td class="p-2.5 font-bold text-teal-300">
          <div class="flex items-center gap-1.5">
            <span class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
              ${(ord.username || 'U')[0].toUpperCase()}
            </span>
            <span>${ord.username || 'Khách'}</span>
          </div>
        </td>
        <td class="p-2.5">
          <div class="font-semibold text-white max-w-[200px] truncate" title="${ord.productName || ''}">${ord.productName || 'Sản phẩm'}</div>
          <div class="text-[10px] text-slate-500 font-mono">ID: ${(ord.productId || '').slice(-6)}</div>
        </td>
        <td class="p-2.5 text-right font-medium text-slate-300">
          <div>SL: <strong class="text-white">${ord.quantity || 1}</strong></div>
          <div class="text-[10px] text-slate-400">${(Number(ord.price) || 0).toLocaleString('vi-VN')} đ</div>
        </td>
        <td class="p-2.5 text-right font-extrabold text-emerald-400">
          ${total.toLocaleString('vi-VN')} đ
        </td>
        <td class="p-2.5 text-center">
          ${download ? `
            <a href="${download}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold transition" title="${download}">
              <i data-lucide="external-link" class="w-3 h-3"></i> Mở Link
            </a>
          ` : `<span class="text-slate-500 text-[11px] italic">Không có link</span>`}
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

function filterAdminOrders() {
  const query = (document.getElementById('adminOrderSearch')?.value || '').trim().toLowerCase();
  if (!query) {
    renderAdminOrdersList(allAdminOrders);
    return;
  }
  const filtered = allAdminOrders.filter(o => 
    (o.username && o.username.toLowerCase().includes(query)) ||
    (o.productName && o.productName.toLowerCase().includes(query)) ||
    (o.id && o.id.toLowerCase().includes(query))
  );
  renderAdminOrdersList(filtered);
}

async function adminApproveDeposit(txId) {
  try {
    const res = await fetch('/api/admin/approve-deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUsername: currentUser.username,
        txId: txId
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminDeposits();
      if (data.targetUser.toLowerCase() === currentUser.username.toLowerCase()) {
        currentUser.balance = data.newBalance;
        localStorage.setItem('shopnghiaz_user', JSON.stringify(currentUser));
        updateAuthUI();
      }
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi khi duyệt nạp tiền', 'error');
  }
}

// ---------------- NẠP TIỀN QUA VIETQR (USER) ----------------
function openDepositModal() {
  if (!currentUser) {
    showToast('Vui lòng đăng nhập để nạp tiền vào tài khoản!', 'warning');
    openAuthModal('login');
    return;
  }
  backToStep1();
  openModal('depositModal');
}

function selectAmount(val) {
  document.getElementById('customAmount').value = val;
  document.querySelectorAll('.amt-btn').forEach(b => {
    b.classList.remove('border-emerald-500', 'bg-emerald-950/30', 'text-emerald-300');
    if (b.innerText.replace(/[^0-9]/g, '') === String(val)) {
      b.classList.add('border-emerald-500', 'bg-emerald-950/30', 'text-emerald-300');
    }
  });
}

function backToStep1() {
  document.getElementById('depositStep1').classList.remove('hidden');
  document.getElementById('depositStep2').classList.add('hidden');
}

async function createVietQR() {
  const amtInput = document.getElementById('customAmount');
  const amount = Number(amtInput.value);

  if (!amount || amount < 10000) {
    showToast('Số tiền nạp tối thiểu là 10.000 VNĐ!', 'error');
    amtInput.focus();
    return;
  }

  try {
    const res = await fetch('/api/wallet/create-deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        amount: amount
      })
    });

    const data = await res.json();
    if (data.success) {
      currentTxId = data.data.txId;
      currentMemo = data.data.memo;

      document.getElementById('vietqrImage').src = data.data.qrUrl;
      document.getElementById('qrBankName').innerText = data.data.bankId;
      document.getElementById('qrAccountNo').innerText = data.data.accountNo;
      document.getElementById('qrAccountName').innerText = data.data.accountName;
      document.getElementById('qrAmountText').innerText = amount.toLocaleString('vi-VN') + ' VNĐ';
      document.getElementById('qrMemo').innerText = data.data.memo;

      document.getElementById('depositStep1').classList.add('hidden');
      document.getElementById('depositStep2').classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    } else {
      showToast(data.message || 'Không thể tạo mã VietQR', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi tạo mã VietQR', 'error');
  }
}

function copyMemo() {
  if (currentMemo) {
    navigator.clipboard.writeText(currentMemo);
    showToast('Đã sao chép nội dung chuyển khoản: ' + currentMemo, 'success');
  }
}

function handleFinishDeposit() {
  closeModal('depositModal');
  showToast('Đã ghi nhận yêu cầu nạp tiền! Vui lòng chờ Admin duyệt.', 'info');
}

// ---------------- LỊCH SỬ GIAO DỊCH ----------------
async function openHistoryModal() {
  if (!currentUser) {
    showToast('Vui lòng đăng nhập để xem lịch sử giao dịch!', 'warning');
    openAuthModal('login');
    return;
  }

  const list = document.getElementById('historyList');
  list.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">Đang tải lịch sử...</div>`;
  openModal('historyModal');

  try {
    const res = await fetch(`/api/transactions/${currentUser.username}`);
    const data = await res.json();

    if (!data.success || data.data.length === 0) {
      list.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">Bạn chưa có giao dịch nào.</div>`;
      return;
    }

    list.innerHTML = data.data.map(tx => {
      const isDeposit = tx.type.includes('DEPOSIT') || tx.type === 'ADMIN_DEPOSIT';
      const time = new Date(tx.createdAt).toLocaleString('vi-VN');

      return `
        <div class="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between text-xs">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg ${isDeposit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-teal-500/10 text-teal-400'} flex items-center justify-center shrink-0">
              <i data-lucide="${isDeposit ? 'arrow-down-left' : 'shopping-bag'}" class="w-4 h-4"></i>
            </div>
            <div>
              <p class="font-bold text-white">${isDeposit ? `Nạp tiền ${tx.code ? `(${tx.code})` : ''}` : `Mua hàng: ${tx.productName || 'Sản phẩm'}`}</p>
              <p class="text-[10px] text-slate-500">${tx.memo || time}</p>
              ${tx.downloadUrl ? `
                <a href="${tx.downloadUrl}" target="_blank" class="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-slate-950 text-[10px] font-bold shadow-sm transition">
                  <i data-lucide="download" class="w-2.5 h-2.5"></i> Mở link tải về
                </a>
              ` : ''}
            </div>
          </div>
          <div class="text-right">
            <span class="font-extrabold ${isDeposit ? 'text-emerald-400' : 'text-slate-300'} block">
              ${isDeposit ? '+' : '-'}${Number(isDeposit ? tx.amount : tx.totalCost).toLocaleString('vi-VN')} đ
            </span>
            <span class="text-[9px] px-1.5 py-0.2 rounded ${tx.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}">
              ${tx.status === 'COMPLETED' ? 'Thành công' : 'Chờ duyệt'}
            </span>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    list.innerHTML = `<div class="text-center py-6 text-rose-400 text-xs">Lỗi tải lịch sử</div>`;
  }
}
