# 🔥 SHOPNGHIAZ - HỆ THỐNG MUA BÁN ĐỊNH VỊ TỰ ĐỘNG & REAL-TIME ADMIN

Hệ thống website bán các gói sản phẩm phần mềm Định Vị chuyên nghiệp, hiện đại, tích hợp cổng thanh toán VietQR động và bảng điều khiển Quản trị viên (Admin) thời gian thực.

---

## 🌟 TÍNH NĂNG NỔI BẬT

### 1. 📱 Danh mục Sản phẩm Định Vị Chuyên Nghiệp
- **Chủ đề Gaming Cyber/Dark Neon**: Tối ưu hiển thị trên cả điện thoại (mobile) và máy tính (desktop).
- **Phân loại danh mục chuẩn**:
  - **Định Vị Android**: Các gói định vị chuyên dụng cho hệ điều hành Android (GPS thời gian thực, ẩn danh, lộ trình...).
  - **Định Vị iOS**: Các gói định vị tối ưu cho iPhone/iPad (iCloud GPS, chống phát hiện, cảnh báo ra khỏi vùng an toàn...).
  - **Định Vị Free**: Gói trải nghiệm miễn phí 0 đồng hoặc dùng thử 7 ngày.
- **Mua hàng tự động 100%**: Trừ tiền trong ví ngay lập tức, bàn giao mã bản quyền / key kích hoạt / tài khoản trực tiếp lên màn hình và lưu vào mục **Kho Đơn Hàng**.
- **Hiệu ứng mua bán trực tiếp (Social Proof)**: Thông báo pop-up nổi góc dưới màn hình khi có khách nạp tiền hoặc mua sản phẩm thành công.

### 2. 💳 Cổng Nạp Tiền VietQR Tự Động
- Tự động sinh mã VietQR QuickLink chuẩn ngân hàng Việt Nam (MBBank, Vietcombank, Techcombank, VPBank, ACB, BIDV...).
- Tự sinh mã giao dịch duy nhất cho từng lượt nạp tiền (`NAP NGHIAZ <USERNAME> <MÃ>`).
- Tính năng tính trước khuyến mãi nạp (VD: +20% giá trị nạp).
- Nút tiện ích: **Sao chép Số Tài Khoản**, **Sao chép Số Tiền**, **Sao chép Nội Dung Chuyển Khoản**.
- **Chế độ Auto-Approve (Duyệt Tự Động)**: Khi khách hàng quét QR và ấn "Tôi đã chuyển tiền", hệ thống tự động xác nhận và cộng tiền vào tài khoản ngay lập tức với pháo hoa ăn mừng!

### 3. 👑 Quản Trị Viên (Admin) Thời Gian Thực (Real-Time Sync)
Hệ thống trang bị 2 tài khoản Quản trị viên toàn quyền:
- **Admin 1**: `hqk` / `khanh2k9`
- **Admin 2**: `nghiaz` / `nghiaz123`

Khi Admin đăng nhập:
- **Quyền Xoá Sản Phẩm Trực Tiếp**:
  - Nút **"Xoá"** xuất hiện ngay trên từng thẻ sản phẩm ở trang chủ shop.
  - Nút **"Xoá sản phẩm này"** xuất hiện bên trong modal xem chi tiết sản phẩm.
  - Nút **"Xoá"** xuất hiện trong bảng Quản Lý Sản Phẩm ở Admin Panel.
  - Khi Admin xác nhận xoá, sản phẩm biến mất tức thì trên tất cả màn hình người dùng đang truy cập mà **không cần reload**.
- **Cấu hình trực tiếp toàn bộ website**:
  - Đổi tên shop (`shopnghiaz`), Slogan, Tiêu đề banner, Phụ đề banner.
  - Thay đổi chữ chạy thông báo khẩn cấp / sự kiện trên cùng (Marquee Ticker).
  - Đổi số hotline, liên kết **Zalo**, liên kết kênh **TikTok**.
  - Đổi % khuyến mãi nạp tiền.
- **⚡ CẬP NHẬT TỨC THÌ TỚI TOÀN BỘ THIẾT BỊ KHÁC**:
  - Khi Admin bấm Lưu hoặc thêm/sửa/xoá sản phẩm, Server sẽ phát sóng sự kiện qua **Socket.io**.
  - **Mọi điện thoại, máy tính của tất cả khách hàng đang mở web sẽ lập tức cập nhật giao diện mới mà KHÔNG CẦN F5 hay tải lại trang!**
- **Cấu hình Ngân hàng VietQR**: Thay đổi số tài khoản, tên chủ tài khoản, ngân hàng nhận tiền.
- **Phát thông báo khẩn cấp (Live Broadcast)**: Gửi popup thông báo trực tiếp nhảy lên màn hình của mọi user đang trực tuyến.
- **Duyệt nạp tiền thủ công**: Xem lịch sử các đơn nạp VietQR và duyệt nạp 1-click.
- **Báo cáo thống kê**: Doanh thu bán, tổng tiền nạp VietQR, số thành viên, số đơn đã bán.

---

## 🔑 TÀI KHOẢN TRẢI NGHIỆM

| Vai trò | Tên đăng nhập | Mật khẩu | Số dư mặc định | Quyền hạn |
|---|---|---|---|---|
| **Admin 1** | `hqk` | `khanh2k9` | 10.000.000 VNĐ | Toàn quyền Live Edit, xoá sản phẩm trực tiếp, quản lý VietQR, phát thông báo |
| **Admin 2** | `nghiaz` | `nghiaz123` | 10.000.000 VNĐ | Toàn quyền Live Edit, xoá sản phẩm trực tiếp, quản lý VietQR, phát thông báo |
| **Khách hàng (User)** | `gamer_pro` | `123456` | 500.000 VNĐ | Dùng để test mua sản phẩm, nạp tiền |

*(Người dùng cũng có thể bấm nút **Đăng Ký** để tạo thêm tài khoản mới bất kỳ)*

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY TRÊN MÁY TÍNH

Server đang chạy sẵn tại địa chỉ:
👉 **[http://localhost:3000](http://localhost:3000)**

### Lệnh chạy thủ công khi cần:
1. Mở Terminal trong thư mục dự án:
   ```powershell
   cd C:\Users\Admin\.gemini\antigravity\scratch\shopnghiaz
   ```
2. Khởi động server:
   ```powershell
   node server.js
   ```
3. Mở trình duyệt web truy cập `http://localhost:3000`.

### Thử nghiệm tính năng Đồng Bộ & Xoá Sản Phẩm Trực Tiếp (Real-Time):
1. Mở 2 cửa sổ trình duyệt song song (hoặc 1 máy tính, 1 điện thoại).
2. Ở cửa sổ 1: Đăng nhập với tư cách Admin (`hqk` / `khanh2k9` hoặc `nghiaz` / `nghiaz123`).
3. Ở cửa sổ 2: Xem như khách hàng bình thường chưa đăng nhập hoặc đăng nhập `gamer_pro`.
4. Ở cửa sổ 1: Bấm nút **Xoá** ở bất kỳ sản phẩm nào trên trang chủ hoặc trong bảng admin.
5. Quan sát cửa sổ 2: Sản phẩm lập tức biến mất trên màn hình khách hàng theo thời gian thực!
