/**
 * SHOPNGHIAZ - ADMIN LIVE CONTROL CONTROLLER
 * Real-time direct customization and instant synchronization across all user devices.
 */

const AdminController = {
  stats: null,
  transactions: [],
  editingAccountId: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Nav tabs in admin modal
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Form: Site Config
    const configForm = document.getElementById('adminConfigForm');
    if (configForm) {
      configForm.addEventListener('submit', (e) => this.handleSaveConfig(e));
    }

    // Form: Bank VietQR Config
    const bankForm = document.getElementById('adminBankForm');
    if (bankForm) {
      bankForm.addEventListener('submit', (e) => this.handleSaveBankConfig(e));
    }

    // Form: Add/Edit Account
    const accountForm = document.getElementById('adminAccountForm');
    if (accountForm) {
      accountForm.addEventListener('submit', (e) => this.handleSaveAccount(e));
    }

    // Form: Live Broadcast Alert
    const broadcastForm = document.getElementById('adminBroadcastForm');
    if (broadcastForm) {
      broadcastForm.addEventListener('submit', (e) => this.handleSendBroadcast(e));
    }
  },

  switchTab(tabId) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('bg-orange-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        btn.classList.remove('bg-orange-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-300');
      }
    });

    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
      pane.classList.add('hidden');
    });

    const activePane = document.getElementById(`tab-${tabId}`);
    if (activePane) {
      activePane.classList.remove('hidden');
    }

    if (tabId === 'stats') this.loadStats();
    if (tabId === 'deposits') this.loadTransactions();
    if (tabId === 'accounts') this.renderAccountManagementTable();
    if (tabId === 'users') this.loadUsers();
  },

  openAdminModal() {
    if (!App.state.user || App.state.user.role !== 'admin') {
      Swal.fire({
        icon: 'error',
        title: 'Quyền Truy Cập',
        text: 'Bạn cần đăng nhập tài khoản Quản trị viên (admin) để sử dụng bảng điều khiển này!',
        confirmButtonColor: '#ff4d00'
      });
      return;
    }

    this.populateConfigFields();
    this.populateBankFields();
    this.loadStats();
    this.loadTransactions();
    this.renderAccountManagementTable();
    this.loadUsers();
    this.initDragAndDrop();
    this.switchTab('config');

    document.getElementById('adminModalBackdrop').classList.add('active');
  },

  closeAdminModal() {
    document.getElementById('adminModalBackdrop').classList.remove('active');
  },

  populateConfigFields() {
    const cfg = App.state.config;
    if (!cfg) return;

    document.getElementById('cfgSiteName').value = cfg.siteName || '';
    document.getElementById('cfgSiteSlogan').value = cfg.siteSlogan || '';
    document.getElementById('cfgBannerTitle').value = cfg.bannerTitle || '';
    document.getElementById('cfgBannerSubtitle').value = cfg.bannerSubtitle || '';
    document.getElementById('cfgAnnouncement').value = cfg.announcement || '';
    document.getElementById('cfgHotline').value = cfg.hotline || '';
    document.getElementById('cfgZalo').value = cfg.zalo || '';
    document.getElementById('cfgTiktok').value = cfg.tiktok || '';
    document.getElementById('cfgTopupBonus').value = cfg.topupBonusPercent || 0;
  },

  populateBankFields() {
    const bank = App.state.config.bankInfo || {};
    document.getElementById('bankCodeSelect').value = bank.bankCode || 'mbbank';
    document.getElementById('bankNameInput').value = bank.bankId || 'MBBank';
    document.getElementById('bankAccNumber').value = bank.accountNumber || '';
    document.getElementById('bankAccName').value = bank.accountName || '';
    document.getElementById('bankTransferPrefix').value = bank.transferPrefix || 'NAP SHOPNGHIAZ';
    document.getElementById('bankAutoApprove').checked = bank.autoApprove !== false;
  },

  // Save General Site Config -> BROADCASTS TO ALL CLIENTS
  async handleSaveConfig(e) {
    e.preventDefault();
    const payload = {
      siteName: document.getElementById('cfgSiteName').value.trim(),
      siteSlogan: document.getElementById('cfgSiteSlogan').value.trim(),
      bannerTitle: document.getElementById('cfgBannerTitle').value.trim(),
      bannerSubtitle: document.getElementById('cfgBannerSubtitle').value.trim(),
      announcement: document.getElementById('cfgAnnouncement').value.trim(),
      hotline: document.getElementById('cfgHotline').value.trim(),
      zalo: document.getElementById('cfgZalo').value.trim(),
      tiktok: document.getElementById('cfgTiktok').value.trim(),
      topupBonusPercent: Number(document.getElementById('cfgTopupBonus').value)
    };

    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.state.token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Đã Lưu & Đồng Bộ Thành Công!',
          text: 'Tất cả các máy tính và thiết bị người dùng đang truy cập web đã được cập nhật trực tiếp theo thời gian thực!',
          confirmButtonColor: '#ff4d00'
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  // Save Bank / VietQR Config
  async handleSaveBankConfig(e) {
    e.preventDefault();
    const selectedBank = document.getElementById('bankCodeSelect');
    const bankName = selectedBank.options[selectedBank.selectedIndex].text.split('-')[0].trim();

    const bankPayload = {
      bankInfo: {
        bankCode: selectedBank.value,
        bankId: bankName,
        accountNumber: document.getElementById('bankAccNumber').value.trim(),
        accountName: document.getElementById('bankAccName').value.trim().toUpperCase(),
        transferPrefix: document.getElementById('bankTransferPrefix').value.trim().toUpperCase(),
        autoApprove: document.getElementById('bankAutoApprove').checked
      }
    };

    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.state.token}`
        },
        body: JSON.stringify(bankPayload)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Đã Cập Nhật VietQR!',
          text: 'Thông tin tài khoản ngân hàng và mã QR đã được cập nhật tức thì trên toàn hệ thống!',
          confirmButtonColor: '#ff4d00'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  // Render Accounts Table for Admin
  renderAccountManagementTable() {
    const container = document.getElementById('adminAccountsTableBody');
    if (!container) return;

    const accounts = App.state.accounts || [];
    if (accounts.length === 0) {
      container.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400">Chưa có tài khoản nào. Hãy thêm tài khoản mới!</td></tr>`;
      return;
    }

    container.innerHTML = accounts.map(acc => {
      const isSold = acc.status === 'sold';
      const linkVal = acc.credentials?.link || acc.credentials?.account || '';
      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/40 transition">
          <td class="py-3 px-4 font-mono font-bold text-orange-400">#${acc.id}</td>
          <td class="py-3 px-4">
            <div class="font-semibold text-white truncate max-w-[220px]" title="${acc.title}">${acc.title}</div>
            <div class="text-xs text-slate-400 truncate max-w-[220px]">${acc.gunSkins || 'Link tải phần mềm & key'}</div>
          </td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 text-xs rounded font-bold ${acc.category === 'dinhvi_android' ? 'bg-emerald-900/60 text-emerald-300' : acc.category === 'dinhvi_ios' ? 'bg-cyan-900/60 text-cyan-300' : 'bg-amber-900/60 text-amber-300'}">
              ${acc.category === 'dinhvi_android' ? 'ANDROID' : acc.category === 'dinhvi_ios' ? 'IOS' : 'FREE'}
            </span>
          </td>
          <td class="py-3 px-4 font-bold text-amber-400">
            ${Number(acc.price).toLocaleString('vi-VN')}đ
          </td>
          <td class="py-3 px-4 font-bold text-center">
            <span class="px-2 py-0.5 rounded text-xs font-mono font-bold ${(acc.stock || 0) > 0 ? 'bg-emerald-950/70 border border-emerald-700/50 text-emerald-300' : 'bg-rose-950/70 border border-rose-700/50 text-rose-300'}">
              ${(acc.stock || 0) > 0 ? `${acc.stock} cái` : 'Hết hàng'}
            </span>
          </td>
          <td class="py-3 px-4">
            <button onclick="AdminController.toggleAccountStatus('${acc.id}', '${isSold ? 'available' : 'sold'}')" class="px-2.5 py-1 text-xs rounded-full font-bold cursor-pointer transition ${isSold ? 'bg-slate-700 text-slate-400 hover:bg-slate-600' : 'bg-emerald-600/30 text-emerald-400 hover:bg-emerald-600/50'}">
              ${isSold ? 'HẾT HÀNG / KHOÁ' : 'ĐANG BÁN (Kho)'}
            </button>
          </td>
          <td class="py-3 px-4 text-xs font-mono text-slate-300">
            <div class="truncate max-w-[180px]" title="${linkVal}">
              <span class="text-cyan-400 font-bold">Link:</span> 
              <a href="${linkVal || '#'}" target="_blank" class="text-slate-300 underline hover:text-cyan-300">
                ${linkVal || 'Chưa có link'}
              </a>
            </div>
          </td>
          <td class="py-3 px-4 text-right space-x-2">
            <button onclick="AdminController.editAccount('${acc.id}')" class="px-2 py-1 text-xs bg-blue-600/40 text-blue-300 hover:bg-blue-600 rounded cursor-pointer">Sửa</button>
            <button onclick="AdminController.deleteAccount('${acc.id}')" class="px-2 py-1 text-xs bg-red-600/40 text-red-300 hover:bg-red-600 rounded cursor-pointer">Xoá</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  resetAccountForm() {
    this.editingAccountId = null;
    document.getElementById('accFormTitle').innerText = "Thêm Sản Phẩm Mới";
    document.getElementById('adminAccountForm').reset();
    document.getElementById('accIdInput').value = '';
    const linkInput = document.getElementById('accLinkInput');
    if (linkInput) linkInput.value = '';
    const stockInput = document.getElementById('accStockInput');
    if (stockInput) stockInput.value = '10';
    this.removeImagePreview();
  },

  editAccount(accId) {
    const acc = App.state.accounts.find(a => a.id === accId);
    if (!acc) return;

    this.editingAccountId = accId;
    document.getElementById('accFormTitle').innerText = `Chỉnh Sửa Sản Phẩm #${acc.id}`;
    document.getElementById('accIdInput').value = acc.id;
    document.getElementById('accTitleInput').value = acc.title || '';
    document.getElementById('accCategorySelect').value = acc.category || 'dinhvi_android';
    document.getElementById('accGunsInput').value = acc.gunSkins || '';
    document.getElementById('accPriceInput').value = acc.price || 100000;
    document.getElementById('accOriginalPriceInput').value = acc.originalPrice || 200000;
    document.getElementById('accBadgeInput').value = acc.badge || 'VIP';

    const stockInput = document.getElementById('accStockInput');
    if (stockInput) stockInput.value = acc.stock !== undefined ? acc.stock : 1;

    // Link credentials
    const linkVal = acc.credentials ? (acc.credentials.link || acc.credentials.twoFactor || acc.credentials.account || '') : '';
    const linkInput = document.getElementById('accLinkInput');
    if (linkInput) linkInput.value = linkVal;

    // Image preview
    const imgUrl = acc.images && acc.images[0] ? acc.images[0] : '';
    const imgUrlInput = document.getElementById('accImageUrlInput');
    if (imgUrlInput) imgUrlInput.value = imgUrl;

    if (imgUrl) {
      this.showImagePreview(imgUrl);
    } else {
      this.removeImagePreview();
    }

    // Scroll to form
    document.getElementById('adminAccountForm').scrollIntoView({ behavior: 'smooth' });
  },

  async handleSaveAccount(e) {
    e.preventDefault();
    const imgUrl = document.getElementById('accImageUrlInput').value.trim() || 
                   document.getElementById('accImagePreview')?.src || 
                   'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=800&q=80';

    const stockVal = document.getElementById('accStockInput') ? Math.max(0, parseInt(document.getElementById('accStockInput').value) || 0) : 1;

    const payload = {
      id: document.getElementById('accIdInput').value.trim() || undefined,
      title: document.getElementById('accTitleInput').value.trim(),
      category: document.getElementById('accCategorySelect').value,
      gunSkins: document.getElementById('accGunsInput').value.trim(),
      price: Number(document.getElementById('accPriceInput').value),
      originalPrice: Number(document.getElementById('accOriginalPriceInput').value),
      stock: stockVal,
      badge: document.getElementById('accBadgeInput').value.trim(),
      images: [imgUrl],
      credentials: {
        link: document.getElementById('accLinkInput').value.trim()
      }
    };

    try {
      let url = '/api/admin/accounts';
      let method = 'POST';

      if (this.editingAccountId) {
        url = `/api/admin/accounts/${this.editingAccountId}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.state.token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: this.editingAccountId ? 'Cập Nhật Sản Phẩm Thành Công!' : 'Thêm Sản Phẩm Thành Công!',
          text: 'Sản phẩm mới đã xuất hiện trực tiếp trên tất cả màn hình người dùng!',
          confirmButtonColor: '#ff4d00'
        });
        this.resetAccountForm();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  async toggleAccountStatus(accId, newStatus) {
    try {
      const res = await fetch(`/api/admin/accounts/${accId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.state.token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Đã Thay Đổi Trạng Thái!',
          text: `Sản phẩm #${accId} hiện là: ${newStatus === 'sold' ? 'ĐÃ BÁN' : 'ĐANG BÁN'} (Tự động cập nhật toàn bộ thiết bị)`,
          confirmButtonColor: '#ff4d00'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  async deleteAccount(accId) {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Xoá Sản Phẩm?',
      text: `Bạn có chắc chắn muốn xoá sản phẩm #${accId} khỏi shop?`,
      showCancelButton: true,
      confirmButtonText: 'Xoá ngay',
      cancelButtonText: 'Huỷ',
      confirmButtonColor: '#ef4444'
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/accounts/${accId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${App.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: 'success', title: 'Đã Xoá!', text: `Sản phẩm #${accId} đã được gỡ khỏi shop trên mọi thiết bị.` });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  // Deposit Management
  async loadTransactions() {
    try {
      const res = await fetch('/api/admin/transactions', {
        headers: { 'Authorization': `Bearer ${App.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        this.transactions = data.transactions;
        this.renderTransactionsTable();
      }
    } catch (err) {
      console.error(err);
    }
  },

  renderTransactionsTable() {
    const container = document.getElementById('adminDepositsTableBody');
    if (!container) return;

    if (!this.transactions || this.transactions.length === 0) {
      container.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400">Chưa có giao dịch nạp tiền nào.</td></tr>`;
      return;
    }

    container.innerHTML = this.transactions.map(tx => {
      const isCompleted = tx.status === 'completed';
      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/40 transition">
          <td class="py-3 px-4 font-mono font-bold text-orange-400">${tx.id}</td>
          <td class="py-3 px-4">
            <span class="font-bold text-white">${tx.username}</span>
          </td>
          <td class="py-3 px-4 font-bold text-emerald-400">
            ${Number(tx.amount).toLocaleString('vi-VN')}đ
            ${tx.bonusAmount > 0 ? `<div class="text-xs text-amber-400">+${Number(tx.bonusAmount).toLocaleString('vi-VN')}đ (KM)</div>` : ''}
          </td>
          <td class="py-3 px-4 text-xs font-mono text-slate-300">
            <div class="bg-slate-900 px-2 py-1 rounded select-all">${tx.code}</div>
          </td>
          <td class="py-3 px-4 text-xs text-slate-400">
            ${new Date(tx.createdAt).toLocaleTimeString('vi-VN')} ${new Date(tx.createdAt).toLocaleDateString('vi-VN')}
          </td>
          <td class="py-3 px-4">
            <span class="px-2.5 py-1 text-xs rounded-full font-bold ${isCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'}">
              ${isCompleted ? 'ĐÃ DUYỆT' : 'CHỜ DUYỆT'}
            </span>
          </td>
          <td class="py-3 px-4 text-right">
            ${!isCompleted ? `
              <button onclick="AdminController.approveDeposit('${tx.id}')" class="btn-fire !py-1 !px-3 !text-xs">
                Duyệt Nạp
              </button>
            ` : `<span class="text-xs text-slate-500">Hoàn tất</span>`}
          </td>
        </tr>
      `;
    }).join('');
  },

  async approveDeposit(txId) {
    try {
      const res = await fetch(`/api/admin/transactions/${txId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${App.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Đã Duyệt Nạp Tiền!',
          text: `Số dư của người dùng đã được cộng tự động và hiển thị ngay trên thiết bị của họ!`,
          confirmButtonColor: '#ff4d00'
        });
        this.loadTransactions();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  // Live Broadcast Alert to ALL Connected Users
  async handleSendBroadcast(e) {
    e.preventDefault();
    const title = document.getElementById('broadcastTitleInput').value.trim();
    const message = document.getElementById('broadcastMessageInput').value.trim();
    const type = document.getElementById('broadcastTypeSelect').value;

    if (!message) return;

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.state.token}`
        },
        body: JSON.stringify({ title, message, type })
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Đã Phát Sóng Thông Báo!',
          text: 'Tất cả người dùng trên mọi thiết bị đang xem web đã nhận được thông báo này trực tiếp!',
          confirmButtonColor: '#ff4d00'
        });
        document.getElementById('broadcastMessageInput').value = '';
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  // Load Business Analytics Stats
  async loadStats() {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${App.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        const s = data.stats;
        document.getElementById('statTotalRevenue').innerText = `${Number(s.totalRevenue).toLocaleString('vi-VN')}đ`;
        document.getElementById('statTotalDeposited').innerText = `${Number(s.totalDeposited).toLocaleString('vi-VN')}đ`;
        document.getElementById('statTotalAccounts').innerText = s.totalAccounts;
        document.getElementById('statAvailableAccounts').innerText = s.availableAccounts;
        document.getElementById('statSoldAccounts').innerText = s.soldAccounts;
        document.getElementById('statTotalUsers').innerText = s.totalUsers;
      }
    } catch (err) {
      console.error(err);
    }
  },

  // ----------------- DRAG & DROP IMAGE UPLOAD -----------------
  initDragAndDrop() {
    const dropZone = document.getElementById('accImageDropZone');
    const fileInput = document.getElementById('accImageFileInput');
    if (!dropZone || !fileInput || this._dragAndDropBound) return;
    this._dragAndDropBound = true;

    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // ignore click on remove preview button
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleImageFile(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('border-orange-500', 'bg-orange-950/20');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('border-orange-500', 'bg-orange-950/20');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        this.handleImageFile(dt.files[0]);
      }
    });
  },

  async handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      Swal.fire({ icon: 'warning', title: 'File Không Hợp Lệ', text: 'Vui lòng chọn hoặc kéo thả file hình ảnh (JPG, PNG, WEBP, GIF)!' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target.result;
      this.showImagePreview(base64Data);

      try {
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${App.state.token}`
          },
          body: JSON.stringify({ imageBase64: base64Data, filename: file.name })
        });
        const data = await res.json();
        if (data.success && data.url) {
          document.getElementById('accImageUrlInput').value = data.url;
        } else {
          document.getElementById('accImageUrlInput').value = base64Data;
        }
      } catch (err) {
        document.getElementById('accImageUrlInput').value = base64Data;
      }
    };
    reader.readAsDataURL(file);
  },

  showImagePreview(src) {
    const preview = document.getElementById('accImagePreview');
    const container = document.getElementById('accImagePreviewContainer');
    if (preview && container) {
      preview.src = src;
      container.classList.remove('hidden');
    }
  },

  removeImagePreview(e) {
    if (e) e.stopPropagation();
    const preview = document.getElementById('accImagePreview');
    const container = document.getElementById('accImagePreviewContainer');
    const fileInput = document.getElementById('accImageFileInput');
    const urlInput = document.getElementById('accImageUrlInput');
    if (preview) preview.src = '';
    if (container) container.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
  },

  // ----------------- USER MANAGEMENT -----------------
  async loadUsers() {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${App.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        this.renderUsersTable(data.users);
      }
    } catch (err) {
      console.error('Error loading users:', err);
    }
  },

  renderUsersTable(users) {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-500">Chưa có người dùng nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isAdmin = u.role === 'admin';
      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/40 transition">
          <td class="py-3 px-3 font-mono text-[11px] text-slate-400">${u.id}</td>
          <td class="py-3 px-3 font-bold text-white">${u.username}</td>
          <td class="py-3 px-3 text-slate-300">${u.fullName || 'Chưa cập nhật'}</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isAdmin ? 'bg-purple-900/60 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-300'}">
              ${isAdmin ? '👑 ADMIN' : '👤 USER'}
            </span>
          </td>
          <td class="py-3 px-3 font-mono font-bold text-amber-400">
            ${Number(u.balance || 0).toLocaleString('vi-VN')}đ
          </td>
          <td class="py-3 px-3 text-[11px] text-slate-400 font-mono">
            ${new Date(u.createdAt).toLocaleDateString('vi-VN')}
          </td>
          <td class="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
            <button onclick="AdminController.promptAdjustBalance('${u.id}', '${u.username}', ${u.balance || 0})" class="px-2.5 py-1 text-xs bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded font-semibold transition cursor-pointer">
              <i class="fa-solid fa-plus-minus mr-1"></i> Số Dư
            </button>
            ${!isAdmin ? `
              <button onclick="AdminController.deleteUser('${u.id}', '${u.username}')" class="px-2.5 py-1 text-xs bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white rounded font-semibold transition cursor-pointer">
                <i class="fa-solid fa-trash mr-1"></i> Xoá
              </button>
            ` : '<span class="text-slate-600 text-[11px] italic">Bảo vệ</span>'}
          </td>
        </tr>
      `;
    }).join('');
  },

  async promptAdjustBalance(userId, username, currentBalance) {
    const { value: formValues } = await Swal.fire({
      title: `Điều Chỉnh Số Dư: ${username}`,
      html: `
        <div class="text-left text-xs space-y-3 pt-2">
          <div>
            <span class="text-slate-400">Số dư hiện tại:</span> 
            <b class="text-amber-400 font-mono text-sm">${Number(currentBalance).toLocaleString('vi-VN')} VNĐ</b>
          </div>
          <div>
            <label class="block font-bold text-slate-200 mb-1">Hình thức:</label>
            <select id="swalAction" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
              <option value="add">➕ Cộng Thêm Vào Ví</option>
              <option value="subtract">➖ Trừ Tiền Khỏi Ví</option>
              <option value="set">🎯 Đặt Lại Số Dư Chính Xác</option>
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-200 mb-1">Số tiền (VNĐ):</label>
            <input type="number" id="swalAmount" min="0" step="10000" placeholder="VD: 50000" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono font-bold">
          </div>
          <div>
            <label class="block font-bold text-slate-200 mb-1">Lý do điều chỉnh (thông báo tới user):</label>
            <input type="text" id="swalReason" placeholder="VD: Khuyến mãi / Thưởng sự kiện / Bù nạp..." class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Xác Nhận Cập Nhật',
      cancelButtonText: 'Huỷ',
      confirmButtonColor: '#ff4d00',
      preConfirm: () => {
        const action = document.getElementById('swalAction').value;
        const amount = Number(document.getElementById('swalAmount').value);
        const reason = document.getElementById('swalReason').value.trim();
        if (isNaN(amount) || amount <= 0) {
          Swal.showValidationMessage('Vui lòng nhập số tiền hợp lệ (> 0)!');
          return false;
        }
        return { action, amount, reason };
      }
    });

    if (!formValues) return;

    let finalAmount = formValues.amount;
    let finalAction = 'add';
    if (formValues.action === 'subtract') {
      finalAmount = -formValues.amount;
      finalAction = 'add';
    } else if (formValues.action === 'set') {
      finalAmount = formValues.amount;
      finalAction = 'set';
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.state.token}`
        },
        body: JSON.stringify({ amount: finalAmount, action: finalAction, reason: formValues.reason })
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Đã Cập Nhật Số Dư!',
          text: data.message,
          confirmButtonColor: '#ff4d00'
        });
        this.loadUsers();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  },

  async deleteUser(userId, username) {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: `Xoá Tài Khoản [${username}]?`,
      html: `Bạn có chắc chắn muốn xoá hoàn toàn tài khoản <b>${username}</b> khỏi hệ thống không?<br><small class="text-rose-400">* Người dùng sẽ bị đăng xuất và tài khoản không thể phục hồi!</small>`,
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash mr-1"></i> Xoá Vĩnh Viễn',
      cancelButtonText: 'Huỷ',
      confirmButtonColor: '#ef4444'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${App.state.token}` }
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: 'success', title: 'Đã Xoá!', text: data.message, confirmButtonColor: '#ff4d00' });
        this.loadUsers();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  }
};

window.AdminController = AdminController;
