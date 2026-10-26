/**
 * SHOPNGHIAZ - CLIENT APP CONTROLLER
 * Real-time Product Shop with Socket.io & VietQR
 */

const App = {
  socket: null,
  state: {
    token: localStorage.getItem('shopnghiaz_token') || null,
    user: null,
    config: null,
    accounts: [],
    selectedAccount: null,
    filter: {
      category: 'all',
      rank: 'all',
      maxPrice: '',
      search: ''
    },
    currentDepositTx: null
  },

  async init() {
    this.setupSocket();
    await this.loadConfig();
    await this.checkAuth();
    await this.loadAccounts();
    this.bindEvents();

    // Init Admin Controller
    if (window.AdminController) {
      window.AdminController.init();
    }
  },

  // ----------------- SOCKET.IO REAL-TIME -----------------
  setupSocket() {
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('⚡ Connected to ShopNghiaZ Real-Time Server!');
      if (this.state.user) {
        this.socket.emit('register_client', {
          userId: this.state.user.id,
          role: this.state.user.role
        });
      }
    });

    // Event: Live Site Config Updated by Admin -> Apply immediately on ALL devices
    this.socket.on('site_config_updated', (newConfig) => {
      console.log('⚡ Received live site configuration update:', newConfig);
      this.state.config = newConfig;
      this.applyConfigToUI(newConfig);

      // Subtle toast
      this.showToast('Hệ thống vừa cập nhật giao diện mới!', 'info');
    });

    // Event: Accounts updated (added, edited, deleted)
    this.socket.on('accounts_updated', (accounts) => {
      console.log('⚡ Products catalog updated in real-time');
      this.state.accounts = accounts;
      this.renderAccounts();
      if (this.state.user && this.state.user.role === 'admin' && window.AdminController) {
        window.AdminController.renderAccountManagementTable();
      }
    });

    // Event: Account sold in real-time
    this.socket.on('account_sold', (data) => {
      const acc = this.state.accounts.find(a => a.id === data.accountId);
      if (acc) {
        acc.status = 'sold';
        this.renderAccounts();
      }
    });

    // Event: Balance updated
    this.socket.on('balance_updated', (data) => {
      if (this.state.user) {
        this.state.user.balance = data.balance;
        this.updateUserUI();
        this.triggerConfetti();
      }
    });

    // Event: Deposit completed
    this.socket.on('deposit_completed', (data) => {
      Swal.fire({
        icon: 'success',
        title: 'Nạp Tiền Thành Công!',
        html: `Tài khoản của bạn đã được cộng <b class="text-amber-400 font-bold">${Number(data.finalAmount).toLocaleString('vi-VN')} VNĐ</b> (Đã bao gồm khuyến mãi)!`,
        confirmButtonColor: '#ff4d00'
      });
      this.closeModal('depositModalBackdrop');
    });

    // Event: Global Broadcast from Admin
    this.socket.on('broadcast_alert', (data) => {
      Swal.fire({
        icon: data.type || 'info',
        title: data.title || 'THÔNG BÁO TỪ SHOPNGHIAZ',
        text: data.message,
        confirmButtonColor: '#ff4d00',
        backdrop: `rgba(0,0,123,0.4)`
      });
    });

    // Event: Social proof activity ticker
    this.socket.on('site_activity', (data) => {
      this.showFloatingActivity(data.message);
    });
  },

  // ----------------- CONFIG & UI SYNC -----------------
  async loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success) {
        this.state.config = data.config;
        this.applyConfigToUI(data.config);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  },

  applyConfigToUI(cfg) {
    if (!cfg) return;

    // Document title
    document.title = `${cfg.siteName || 'shopnghiaz'} - Cửa Hàng Sản Phẩm Tự Động`;

    // Logo & Brand Name
    const brandElements = document.querySelectorAll('.brand-site-name');
    brandElements.forEach(el => el.innerText = cfg.siteName || 'shopnghiaz');

    // Slogans
    const sloganEl = document.getElementById('heroSubtitle');
    if (sloganEl && cfg.bannerSubtitle) sloganEl.innerText = cfg.bannerSubtitle;

    const heroTitleEl = document.getElementById('heroTitle');
    if (heroTitleEl && cfg.bannerTitle) heroTitleEl.innerText = cfg.bannerTitle;

    // Marquee announcement
    const tickerEl = document.getElementById('tickerText');
    if (tickerEl) {
      tickerEl.innerText = cfg.announcement || 'CHÀO MỪNG ĐẾN VỚI SHOPNGHIAZ!';
    }

    // Topup Bonus Pills
    const bonusPills = document.querySelectorAll('.topup-bonus-percent');
    bonusPills.forEach(p => p.innerText = `${cfg.topupBonusPercent || 20}%`);

    // Contact info
    const hotlineEl = document.getElementById('contactHotline');
    if (hotlineEl && cfg.hotline) hotlineEl.innerText = cfg.hotline;

    const zaloLink = document.getElementById('contactZaloLink');
    if (zaloLink && cfg.zalo) zaloLink.href = cfg.zalo;

    const tiktokLink = document.getElementById('contactTiktokLink');
    if (tiktokLink && cfg.tiktok) tiktokLink.href = cfg.tiktok;
  },

  // ----------------- AUTHENTICATION -----------------
  async checkAuth() {
    if (!this.state.token) {
      this.updateUserUI();
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        this.state.user = data.user;
        this.updateUserUI();
        if (this.socket) {
          this.socket.emit('register_client', {
            userId: this.state.user.id,
            role: this.state.user.role
          });
        }
      } else {
        this.logout();
      }
    } catch (err) {
      this.logout();
    }
  },

  updateUserUI() {
    const user = this.state.user;
    const authLoggedOut = document.getElementById('authLoggedOut');
    const authLoggedIn = document.getElementById('authLoggedIn');
    const adminToggleBtn = document.getElementById('adminToggleBtn');

    if (user) {
      if (authLoggedOut) authLoggedOut.classList.add('hidden');
      if (authLoggedIn) authLoggedIn.classList.remove('hidden');

      document.getElementById('navUsername').innerText = user.fullName || user.username;
      document.getElementById('navBalance').innerText = `${Number(user.balance || 0).toLocaleString('vi-VN')}đ`;

      if (user.role === 'admin') {
        if (adminToggleBtn) adminToggleBtn.classList.remove('hidden');
      } else {
        if (adminToggleBtn) adminToggleBtn.classList.add('hidden');
      }
    } else {
      if (authLoggedOut) authLoggedOut.classList.remove('hidden');
      if (authLoggedIn) authLoggedIn.classList.add('hidden');
      if (adminToggleBtn) adminToggleBtn.classList.add('hidden');
    }
  },

  async handleLogin(username, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        this.state.token = data.token;
        this.state.user = data.user;
        localStorage.setItem('shopnghiaz_token', data.token);
        this.updateUserUI();
        this.closeModal('authModalBackdrop');

        if (this.socket) {
          this.socket.emit('register_client', {
            userId: data.user.id,
            role: data.user.role
          });
        }

        Swal.fire({
          icon: 'success',
          title: `Xin chào ${data.user.fullName || data.user.username}!`,
          text: data.user.role === 'admin' ? 'Bạn đang đăng nhập bằng quyền Quản trị viên!' : 'Đăng nhập thành công',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Đăng nhập thất bại', text: data.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi kết nối', text: err.message });
    }
  },

  async handleRegister(username, password, fullName) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, fullName })
      });
      const data = await res.json();
      if (data.success) {
        this.state.token = data.token;
        this.state.user = data.user;
        localStorage.setItem('shopnghiaz_token', data.token);
        this.updateUserUI();
        this.closeModal('authModalBackdrop');

        if (this.socket) {
          this.socket.emit('register_client', {
            userId: data.user.id,
            role: data.user.role
          });
        }

        Swal.fire({
          icon: 'success',
          title: 'Đăng ký thành công!',
          text: `Chào mừng ${data.user.username} gia nhập shopnghiaz!`,
          confirmButtonColor: '#ff4d00'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Đăng ký thất bại', text: data.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi kết nối', text: err.message });
    }
  },

  toggleUserDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('userDropdownMenu');
    if (menu) {
      menu.classList.toggle('hidden');
    }
  },

  closeUserDropdown() {
    const menu = document.getElementById('userDropdownMenu');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
    }
  },

  logout() {
    this.closeUserDropdown();
    this.state.token = null;
    this.state.user = null;
    localStorage.removeItem('shopnghiaz_token');
    this.updateUserUI();
    Swal.fire({
      icon: 'info',
      title: 'Đã Đăng Xuất',
      timer: 1500,
      showConfirmButton: false
    });
  },

  // ----------------- PRODUCTS BROWSING -----------------
  async loadAccounts() {
    try {
      const query = new URLSearchParams(this.state.filter).toString();
      const res = await fetch(`/api/accounts?${query}`);
      const data = await res.json();
      if (data.success) {
        this.state.accounts = data.accounts;
        this.renderAccounts();
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  },

  renderAccounts() {
    const container = document.getElementById('accountListGrid');
    if (!container) return;

    let filtered = [...this.state.accounts];
    if (this.state.filter.category && this.state.filter.category !== 'all') {
      filtered = filtered.filter(a => a.category === this.state.filter.category);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 text-center text-slate-400">
          <i class="fa-solid fa-box-open text-5xl mb-4 text-slate-600"></i>
          <p class="text-lg">Không tìm thấy sản phẩm phù hợp với điều kiện lọc.</p>
          <button onclick="App.resetFilters()" class="btn-dark mt-4">Đặt lại bộ lọc</button>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(acc => {
      const isSold = acc.status === 'sold' || (acc.stock !== undefined && acc.stock <= 0);
      const discount = Math.round(((acc.originalPrice - acc.price) / acc.originalPrice) * 100);
      const thumbnail = acc.images && acc.images.length > 0 ? acc.images[0] : 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';

      return `
        <div class="gaming-card group flex flex-col justify-between ${isSold ? 'opacity-70' : ''}">
          ${isSold ? `
            <div class="card-sold-overlay">
              <div class="stamp-sold">HẾT HÀNG</div>
            </div>
          ` : ''}

          <!-- Card Header & Image -->
          <div class="relative overflow-hidden aspect-[16/10] bg-slate-900">
            <img src="${thumbnail}" alt="${acc.title}" class="w-full h-full object-cover transition duration-500 group-hover:scale-105" loading="lazy">
            
            <!-- Badges -->
            <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
              <span class="badge-vip font-gaming uppercase">${acc.badge || 'VIP'}</span>
              ${discount > 0 ? `<span class="bg-amber-500 text-black text-xs font-black px-2 py-0.5 rounded">-${discount}%</span>` : ''}
            </div>
            
            <div class="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded text-xs font-mono font-bold text-orange-400 border border-orange-500/30 z-10">
              #${acc.id}
            </div>

            <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent p-3 pt-6">
              <div class="text-xs text-orange-400 font-bold uppercase tracking-wider">
                <i class="fa-solid fa-layer-group mr-1"></i>
                ${acc.category === 'android' ? 'Định Vị Android' : acc.category === 'ios' ? 'Định Vị iOS' : acc.category === 'free' ? 'Định Vị Free' : 'Sản Phẩm Định Vị'}
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="p-4 flex-1 flex flex-col justify-between">
            <div>
              <h3 class="font-bold text-white text-sm line-clamp-2 mb-3 group-hover:text-orange-400 transition" title="${acc.title}">
                ${acc.title}
              </h3>

              <!-- Info Box -->
              <div class="text-xs text-slate-300 mb-4 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500">Danh mục:</span>
                  <span class="text-cyan-400 font-bold uppercase">${acc.category === 'android' ? 'Android' : acc.category === 'ios' ? 'iOS' : acc.category === 'free' ? 'Free' : 'VIP'}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-500">Kho hàng:</span>
                  <span class="font-mono font-bold ${(acc.stock || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}">
                    <i class="fa-solid fa-boxes-stacked mr-1"></i>${(acc.stock || 0) > 0 ? `Còn ${acc.stock} cái` : 'Tạm hết hàng'}
                  </span>
                </div>
                <div class="truncate" title="${acc.gunSkins || 'Bàn giao link tải & kích hoạt tự động'}">
                  <span class="text-slate-500">Chi tiết:</span> <b class="text-amber-300 font-medium">${acc.gunSkins || 'Bàn giao link tải & kích hoạt tự động'}</b>
                </div>
              </div>
            </div>

            <!-- Price & Actions -->
            <div class="pt-2 border-t border-slate-800">
              <div class="flex items-baseline justify-between mb-3">
                <div>
                  <div class="text-xs text-slate-500 line-through">${Number(acc.originalPrice).toLocaleString('vi-VN')}đ</div>
                  <div class="text-xl font-gaming font-black text-amber-400">${Number(acc.price).toLocaleString('vi-VN')}đ</div>
                </div>
                <span class="text-xs text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800/40">
                  <i class="fa-solid fa-bolt mr-1"></i>Tự động 100%
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <button onclick="App.viewAccountDetail('${acc.id}')" class="btn-dark !py-2 !px-2 text-xs flex items-center justify-center gap-1">
                  <i class="fa-solid fa-eye"></i> Chi tiết
                </button>
                <button onclick="App.quickBuy('${acc.id}')" class="btn-fire !py-2 !px-2 text-xs" ${isSold ? 'disabled' : ''}>
                  ${isSold ? 'Hết hàng' : '<i class="fa-solid fa-cart-shopping"></i> MUA NGAY'}
                </button>
              </div>

              <!-- Admin Quick In-Place Action -->
              ${this.state.user && this.state.user.role === 'admin' ? `
                <div class="mt-2.5 pt-2 border-t border-purple-500/30 bg-purple-950/40 p-2 rounded-lg flex items-center justify-between text-xs">
                  <span class="text-purple-300 font-bold flex items-center gap-1"><i class="fa-solid fa-crown text-amber-300"></i> Admin:</span>
                  <div class="flex items-center gap-1.5">
                    <button onclick="AdminController.openAdminModal(); AdminController.editAccount('${acc.id}')" class="px-2 py-1 bg-blue-600/60 hover:bg-blue-600 text-blue-100 rounded font-semibold transition cursor-pointer">
                      <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                    <button onclick="App.deleteProductDirect('${acc.id}', '${acc.title.replace(/'/g, "\\'")}')" class="px-2 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded font-bold transition cursor-pointer">
                      <i class="fa-solid fa-trash-can"></i> Xoá
                    </button>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  resetFilters() {
    this.state.filter = { category: 'all' };
    document.querySelectorAll('.filter-category-btn').forEach(btn => {
      if (btn.getAttribute('data-category') === 'all') {
        btn.classList.add('bg-orange-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        btn.classList.remove('bg-orange-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-300');
      }
    });
    this.renderAccounts();
  },

  viewAccountDetail(accId) {
    const acc = this.state.accounts.find(a => a.id === accId);
    if (!acc) return;

    this.state.selectedAccount = acc;
    const isSold = acc.status === 'sold' || (acc.stock !== undefined && acc.stock <= 0);

    document.getElementById('detailAccId').innerText = `#${acc.id}`;
    document.getElementById('detailAccTitle').innerText = acc.title;
    document.getElementById('detailAccPrice').innerText = `${Number(acc.price).toLocaleString('vi-VN')}đ`;
    document.getElementById('detailAccOriginalPrice').innerText = `${Number(acc.originalPrice).toLocaleString('vi-VN')}đ`;
    if (document.getElementById('detailAccCategory')) {
      const catMap = { android: 'Định Vị Android', ios: 'Định Vị iOS', free: 'Định Vị Free' };
      document.getElementById('detailAccCategory').innerText = catMap[acc.category] || acc.category || 'Định vị VIP';
    }
    const stockEl = document.getElementById('detailAccStock');
    if (stockEl) {
      if (acc.stock !== undefined && acc.stock > 0) {
        stockEl.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-boxes-stacked mr-1"></i>Còn ${acc.stock} sản phẩm</span>`;
      } else {
        stockEl.innerHTML = `<span class="text-rose-400 font-bold"><i class="fa-solid fa-circle-xmark mr-1"></i>Tạm hết hàng</span>`;
      }
    }
    if (document.getElementById('detailAccGuns')) {
      document.getElementById('detailAccGuns').innerText = acc.gunSkins || 'Bàn giao link tải & hướng dẫn cài đặt tự động 100%';
    }

    const buyBtn = document.getElementById('detailBuyBtn');
    if (buyBtn) {
      buyBtn.disabled = isSold;
      buyBtn.innerHTML = isSold ? 'Sản Phẩm Tạm Hết Hàng' : `<i class="fa-solid fa-cart-shopping mr-2"></i> MUA SẢN PHẨM NGAY (${Number(acc.price).toLocaleString('vi-VN')}đ)`;
    }

    const imgContainer = document.getElementById('detailAccImages');
    if (imgContainer) {
      imgContainer.innerHTML = (acc.images || []).map(img => `
        <div class="rounded-lg overflow-hidden border border-slate-700 aspect-[16/9] bg-slate-900">
          <img src="${img}" alt="${acc.title}" class="w-full h-full object-cover">
        </div>
      `).join('');
    }

    // Admin controls inside detail modal
    const adminControls = document.getElementById('detailAdminControls');
    if (adminControls) {
      if (this.state.user && this.state.user.role === 'admin') {
        adminControls.classList.remove('hidden');
        document.getElementById('detailAdminEditBtn').onclick = () => {
          this.closeModal('accountDetailModalBackdrop');
          AdminController.openAdminModal();
          AdminController.editAccount(acc.id);
        };
        document.getElementById('detailAdminDeleteBtn').onclick = () => {
          this.deleteProductDirect(acc.id, acc.title);
        };
      } else {
        adminControls.classList.add('hidden');
      }
    }

    this.openModal('accountDetailModalBackdrop');
  },

  // ----------------- ADMIN DIRECT DELETE PRODUCT -----------------
  async deleteProductDirect(accId, accTitle = '') {
    if (!this.state.user || this.state.user.role !== 'admin') {
      Swal.fire({
        icon: 'error',
        title: 'Quyền Hạn',
        text: 'Chỉ tài khoản Quản trị viên (admin) mới có quyền xoá sản phẩm!',
        confirmButtonColor: '#ff4d00'
      });
      return;
    }

    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Xoá Sản Phẩm?',
      html: `Bạn có chắc chắn muốn xoá sản phẩm <b>#${accId}</b>${accTitle ? `<br><span class="text-sm text-slate-300">(${accTitle})</span>` : ''} khỏi shop không?<br><small class="text-rose-400 font-semibold">* Sản phẩm sẽ biến mất ngay lập tức trên tất cả thiết bị của người dùng!</small>`,
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash-can mr-1"></i> Xoá Ngay',
      cancelButtonText: 'Huỷ',
      confirmButtonColor: '#ef4444'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/accounts/${accId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        this.closeModal('accountDetailModalBackdrop');
        Swal.fire({
          icon: 'success',
          title: 'Đã Xoá Sản Phẩm!',
          text: `Sản phẩm #${accId} đã được xoá hoàn toàn khỏi hệ thống trên mọi thiết bị.`,
          confirmButtonColor: '#ff4d00'
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  // ----------------- QUICK BUY PRODUCT -----------------
  async quickBuy(accId) {
    if (!this.state.user) {
      this.openAuthModal('login');
      return;
    }

    const acc = this.state.accounts.find(a => a.id === accId);
    if (!acc) return;

    if (acc.status === 'sold') {
      Swal.fire({ icon: 'warning', title: 'Thông báo', text: 'Sản phẩm này đã có người mua!' });
      return;
    }

    if (this.state.user.balance < acc.price) {
      const needed = acc.price - this.state.user.balance;
      const confirm = await Swal.fire({
        icon: 'warning',
        title: 'Số Dư Không Đủ!',
        html: `Bạn đang có <b>${this.state.user.balance.toLocaleString('vi-VN')}đ</b>.<br>Giá sản phẩm: <b>${acc.price.toLocaleString('vi-VN')}đ</b>.<br>Bạn cần nạp thêm <b>${needed.toLocaleString('vi-VN')}đ</b> nữa.`,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-qrcode mr-1"></i> Nạp Tiền VietQR Ngay',
        cancelButtonText: 'Đóng',
        confirmButtonColor: '#ff4d00'
      });
      if (confirm.isConfirmed) {
        this.openDepositModal(needed);
      }
      return;
    }

    const confirmBuy = await Swal.fire({
      icon: 'question',
      title: 'Xác Nhận Mua Sản Phẩm?',
      html: `Bạn có chắc chắn muốn mua sản phẩm <b>#${acc.id}</b> với giá <b class="text-amber-400 font-bold">${acc.price.toLocaleString('vi-VN')} VNĐ</b>?`,
      showCancelButton: true,
      confirmButtonText: 'Xác Nhận Mua',
      cancelButtonText: 'Huỷ',
      confirmButtonColor: '#ff4d00'
    });
    if (!confirmBuy.isConfirmed) return;

    try {
      const res = await fetch(`/api/accounts/${accId}/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.state.token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        this.state.user.balance = data.newBalance;
        this.updateUserUI();
        this.closeModal('accountDetailModalBackdrop');
        this.triggerConfetti();

        // Show delivery link immediately
        const creds = data.order.credentials || {};
        const deliveryLink = creds.link || creds.account || 'https://shopnghiaz.com';
        Swal.fire({
          icon: 'success',
          title: '🎉 MUA SẢN PHẨM THÀNH CÔNG! 🎉',
          html: `
            <div class="text-left bg-slate-900 p-4 rounded-xl border border-slate-700 text-sm mt-3 space-y-3">
              <div class="text-amber-400 font-bold border-b border-slate-800 pb-2 flex items-center justify-between">
                <span><i class="fa-solid fa-circle-check text-emerald-400 mr-1.5"></i>THÔNG TIN BÀN GIAO #${acc.id}</span>
                <span class="text-xs text-slate-400">${acc.title}</span>
              </div>
              <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <div class="text-xs text-slate-400 font-semibold"><i class="fa-solid fa-link text-orange-400 mr-1"></i>LINK BÀN GIAO SẢN PHẨM / TẢI VỀ:</div>
                <div class="p-2.5 bg-slate-900 rounded border border-slate-700 break-all font-mono text-cyan-400 text-xs select-all">
                  ${deliveryLink}
                </div>
                <div class="flex items-center gap-2 pt-1">
                  <a href="${deliveryLink}" target="_blank" rel="noopener noreferrer" class="btn-cyan !py-1.5 !px-3 text-xs flex-1 text-center font-bold">
                    <i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> MỞ LINK NGAY
                  </a>
                  <button type="button" onclick="navigator.clipboard.writeText('${deliveryLink.replace(/'/g, "\\'")}'); alert('Đã sao chép link bàn giao!');" class="btn-dark !py-1.5 !px-3 text-xs font-bold cursor-pointer">
                    <i class="fa-solid fa-copy mr-1"></i> Sao chép
                  </button>
                </div>
              </div>
              <div class="text-xs text-slate-400 pt-1 border-t border-slate-800">
                * Link bàn giao này đã được lưu vào <b class="text-white">Kho Đơn Hàng & Sản Phẩm Đã Mua</b> của bạn để xem lại bất cứ lúc nào!
              </div>
            </div>
          `,
          confirmButtonColor: '#ff4d00',
          confirmButtonText: 'Đã Lưu Link Bàn Giao'
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Mua Thất Bại', text: err.message });
    }
  },

  // ----------------- VIETQR DEPOSIT -----------------
  openDepositModal(suggestedAmount = 50000) {
    if (!this.state.user) {
      this.openAuthModal('login');
      return;
    }

    document.getElementById('depositCustomAmount').value = suggestedAmount;
    this.updateDepositCalculation(suggestedAmount);
    document.getElementById('qrDisplaySection').classList.add('hidden');
    document.getElementById('qrFormSection').classList.remove('hidden');

    this.openModal('depositModalBackdrop');
  },

  updateDepositCalculation(amount) {
    const num = Number(amount) || 0;
    const bonus = Number(this.state.config?.topupBonusPercent) || 0;
    const bonusVal = Math.round(num * (bonus / 100));
    const total = num + bonusVal;

    document.getElementById('depositBonusPreview').innerText = `+${bonusVal.toLocaleString('vi-VN')}đ (${bonus}%)`;
    document.getElementById('depositTotalPreview').innerText = `${total.toLocaleString('vi-VN')} VNĐ`;
  },

  async handleGenerateVietQR() {
    const amount = Number(document.getElementById('depositCustomAmount').value);
    if (!amount || amount < 10000) {
      Swal.fire({ icon: 'warning', title: 'Số tiền không hợp lệ', text: 'Số tiền nạp tối thiểu là 10.000 VNĐ' });
      return;
    }

    try {
      const res = await fetch('/api/deposit/vietqr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.state.token}`
        },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.success) {
        this.state.currentDepositTx = data.transaction;
        const vqr = data.vietqr;

        const imgEl = document.getElementById('vietqrImage');
        if (imgEl) imgEl.src = vqr.qrUrl;

        const bankNameEl = document.getElementById('vietqrBankName');
        if (bankNameEl) bankNameEl.innerText = vqr.bankName;

        const accNoEl = document.getElementById('vietqrAccountNo');
        if (accNoEl) accNoEl.innerText = vqr.accountNumber;

        const accNameEl = document.getElementById('vietqrAccountName');
        if (accNameEl) accNameEl.innerText = vqr.accountName;

        const amountEl = document.getElementById('vietqrAmount');
        if (amountEl) amountEl.innerText = `${vqr.amount.toLocaleString('vi-VN')} VNĐ`;

        const contentEl = document.getElementById('vietqrContent');
        if (contentEl) contentEl.innerText = vqr.content;

        const totalReceiveEl = document.getElementById('vietqrTotalReceive');
        if (totalReceiveEl) totalReceiveEl.innerText = `${vqr.finalAmount.toLocaleString('vi-VN')} VNĐ`;

        const formSection = document.getElementById('qrFormSection');
        if (formSection) formSection.classList.add('hidden');

        const displaySection = document.getElementById('qrDisplaySection');
        if (displaySection) displaySection.classList.remove('hidden');

        // Start countdown
        this.startDepositTimer(600); // 10 minutes
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi tạo mã QR', text: err.message });
    }
  },

  startDepositTimer(seconds) {
    const timerEl = document.getElementById('depositCountdown');
    if (!timerEl) return;
    let remain = seconds;

    if (this._depositInterval) clearInterval(this._depositInterval);

    this._depositInterval = setInterval(() => {
      remain--;
      if (remain <= 0) {
        clearInterval(this._depositInterval);
        timerEl.innerText = "00:00 (Hết hạn)";
        return;
      }
      const m = Math.floor(remain / 60).toString().padStart(2, '0');
      const s = (remain % 60).toString().padStart(2, '0');
      timerEl.innerText = `${m}:${s}`;
    }, 1000);
  },

  async handleConfirmPayment() {
    if (!this.state.currentDepositTx) return;

    Swal.fire({
      title: 'Đang Kiểm Tra Giao Dịch...',
      text: 'Vui lòng chờ giây lát, hệ thống đang tự động xác thực...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await fetch('/api/deposit/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.state.token}`
        },
        body: JSON.stringify({ transactionId: this.state.currentDepositTx.id })
      });
      const data = await res.json();
      if (data.success) {
        if (data.autoApproved) {
          this.state.user.balance = data.newBalance;
          this.updateUserUI();
          this.closeModal('depositModalBackdrop');
          this.triggerConfetti();

          Swal.fire({
            icon: 'success',
            title: 'Nạp Tiền Thành Công!',
            text: data.message,
            confirmButtonColor: '#ff4d00'
          });
        } else {
          Swal.fire({
            icon: 'info',
            title: 'Giao Dịch Đang Chờ Duyệt',
            text: data.message,
            confirmButtonColor: '#ff4d00'
          });
        }
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`Đã sao chép ${label}!`, 'success');
    }).catch(() => {
      this.showToast(`Không thể sao chép`, 'error');
    });
  },

  // ----------------- ORDERS / PURCHASE HISTORY -----------------
  async openOrdersModal() {
    if (!this.state.user) {
      this.openAuthModal('login');
      return;
    }

    try {
      const res = await fetch('/api/orders/my-orders', {
        headers: { 'Authorization': `Bearer ${this.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        this.renderOrders(data.orders);
        this.openModal('ordersModalBackdrop');
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  renderOrders(orders) {
    const container = document.getElementById('ordersListContainer');
    if (!container) return;

    if (!orders || orders.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <i class="fa-solid fa-box-open text-4xl mb-3 text-slate-600"></i>
          <p>Bạn chưa mua sản phẩm nào. Hãy dạo shop và chọn sản phẩm ưng ý nhé!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(ord => `
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <div>
            <span class="text-orange-400 font-mono font-bold">#${ord.accountId}</span>
            <span class="text-white font-semibold ml-2">${ord.accountTitle}</span>
          </div>
          <span class="text-amber-400 font-bold">${Number(ord.price).toLocaleString('vi-VN')}đ</span>
        </div>

        ${(() => {
          const creds = ord.credentials || {};
          const link = creds.link || creds.account || 'https://shopnghiaz.com';
          return `
            <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
              <div class="text-xs text-slate-400 font-semibold flex items-center justify-between">
                <span><i class="fa-solid fa-link text-orange-400 mr-1.5"></i>Link Bàn Giao / Tải Về:</span>
                <span class="text-emerald-400 text-[11px]"><i class="fa-solid fa-circle-check mr-1"></i>Sẵn sàng</span>
              </div>
              <div class="p-2.5 bg-slate-900 rounded border border-slate-700 break-all font-mono text-cyan-300 text-xs select-all">
                ${link}
              </div>
              <div class="flex items-center justify-between pt-1 text-xs">
                <span class="text-slate-500">Thời gian: ${new Date(ord.createdAt).toLocaleTimeString('vi-VN')} ${new Date(ord.createdAt).toLocaleDateString('vi-VN')}</span>
                <div class="flex items-center gap-2">
                  <a href="${link}" target="_blank" rel="noopener noreferrer" class="btn-cyan !py-1 !px-2.5 text-xs font-bold">
                    <i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> Mở link
                  </a>
                  <button type="button" onclick="App.copyToClipboard('${link.replace(/'/g, "\\'")}', 'Link bàn giao')" class="btn-dark !py-1 !px-2.5 text-xs font-bold cursor-pointer">
                    <i class="fa-solid fa-copy mr-1"></i> Sao chép
                  </button>
                </div>
              </div>
            </div>
          `;
        })()}
      </div>
    `).join('');
  },

  // ----------------- MODALS & UI HELPERS -----------------
  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  },

  openAuthModal(type = 'login') {
    this.openModal('authModalBackdrop');
    this.switchAuthTab(type);
  },

  switchAuthTab(type) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginTab = document.getElementById('authLoginTab');
    const registerTab = document.getElementById('authRegisterTab');

    if (type === 'login') {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      loginTab.classList.add('border-orange-500', 'text-orange-500');
      loginTab.classList.remove('border-transparent', 'text-slate-400');
      registerTab.classList.remove('border-orange-500', 'text-orange-500');
      registerTab.classList.add('border-transparent', 'text-slate-400');
    } else {
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
      registerTab.classList.add('border-orange-500', 'text-orange-500');
      registerTab.classList.remove('border-transparent', 'text-slate-400');
      loginTab.classList.remove('border-orange-500', 'text-orange-500');
      loginTab.classList.add('border-transparent', 'text-slate-400');
    }
  },

  showFloatingActivity(text) {
    const box = document.getElementById('floatingActivity');
    const msg = document.getElementById('floatingActivityMsg');
    if (!box || !msg) return;

    msg.innerText = text;
    box.classList.add('show');

    if (this._activityTimeout) clearTimeout(this._activityTimeout);
    this._activityTimeout = setTimeout(() => {
      box.classList.remove('show');
    }, 4500);
  },

  showToast(text, icon = 'info') {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
    Toast.fire({ icon, title: text });
  },

  triggerConfetti() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  },

  // ----------------- BIND EVENTS -----------------
  bindEvents() {
    // Auth Forms
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('loginUsername').value.trim();
      const p = document.getElementById('loginPassword').value.trim();
      this.handleLogin(u, p);
    });

    document.getElementById('registerForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('regUsername').value.trim();
      const p = document.getElementById('regPassword').value.trim();
      const fn = document.getElementById('regFullName').value.trim();
      this.handleRegister(u, p, fn);
    });

    // Category Tabs Filter
    document.querySelectorAll('.filter-category-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-category-btn').forEach(b => {
          b.classList.remove('bg-orange-600', 'text-white');
          b.classList.add('bg-slate-800', 'text-slate-300');
        });
        e.currentTarget.classList.add('bg-orange-600', 'text-white');
        e.currentTarget.classList.remove('bg-slate-800', 'text-slate-300');
        this.state.filter.category = e.currentTarget.getAttribute('data-category');
        this.renderAccounts();
      });
    });

    // Deposit Amount Pills
    document.querySelectorAll('.deposit-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const amt = Number(e.currentTarget.getAttribute('data-amount'));
        document.getElementById('depositCustomAmount').value = amt;
        this.updateDepositCalculation(amt);
      });
    });

    document.getElementById('depositCustomAmount')?.addEventListener('input', (e) => {
      this.updateDepositCalculation(e.target.value);
    });

    document.getElementById('generateVietQrBtn')?.addEventListener('click', () => {
      this.handleGenerateVietQR();
    });

    document.getElementById('confirmPaymentBtn')?.addEventListener('click', () => {
      this.handleConfirmPayment();
    });

    document.getElementById('backToDepositFormBtn')?.addEventListener('click', () => {
      document.getElementById('qrDisplaySection').classList.add('hidden');
      document.getElementById('qrFormSection').classList.remove('hidden');
    });

    // Detail buy button
    document.getElementById('detailBuyBtn')?.addEventListener('click', () => {
      if (this.state.selectedAccount) {
        this.quickBuy(this.state.selectedAccount.id);
      }
    });

    // Dismiss user dropdown on outside click
    document.addEventListener('click', (e) => {
      const container = document.getElementById('userMenuContainer');
      if (container && !container.contains(e.target)) {
        this.closeUserDropdown();
      }
    });
  }
};

window.App = App;

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
