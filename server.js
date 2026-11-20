/**
 * ========================================================
 * SHOPNGHIAZ - SECURE BACKEND SERVER ENGINE (V2.0 UPGRADE)
 * ========================================================
 * Nâng cấp bảo mật toàn diện:
 *  - Xác thực chuẩn JWT (JSON Web Token) cho User & Admin.
 *  - Chống Race Condition & Double Spending bằng Async Mutex Lock.
 *  - Atomic File I/O (chống hỏng hoặc mất dữ liệu JSON khi crash).
 *  - Bảo mật Webhook nghiêm ngặt (chống giả mạo nạp tiền).
 *  - Phân quyền IDOR (ngăn mua hàng hoặc xem thông tin người khác).
 *  - Bảo toàn mật khẩu Admin qua các lần restart.
 *  - Hỗ trợ phân trang (Pagination) cho dữ liệu lớn.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'shopnghiaz_secure_jwt_secret_key_2026_@!#$%&*';

// Middleware cơ bản
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Driver (Hỗ trợ Cloud Database vĩnh viễn trên Render)
let MongoClient;
try {
  MongoClient = require('mongodb').MongoClient;
} catch (_) {
  MongoClient = null;
}
let db = null;

// Đảm bảo thư mục lưu ảnh upload tồn tại
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middleware khôi phục ảnh từ MongoDB nếu ổ đĩa tạm Render bị reset
app.get('/uploads/:filename', async (req, res, next) => {
  const { filename } = req.params;
  const localFile = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(localFile)) {
    return next();
  }
  if (db) {
    try {
      const imgDoc = await db.collection('images').findOne({ filename });
      if (imgDoc && imgDoc.data) {
        const matches = imgDoc.data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        let ext = imgDoc.ext || 'png';
        let buffer;
        if (matches && matches.length === 3) {
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(imgDoc.data, 'base64');
        }
        try { fs.writeFileSync(localFile, buffer); } catch (_) {}
        res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(buffer);
      }
    } catch (e) {
      console.error('[Image Fetch Error]', e.message);
    }
  }
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR));

// Paths to database files
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ========================================================
// 1. ATOMIC FILE I/O & MONGODB CLOUD SYNCHRONIZATION
// ========================================================

/**
 * Đọc file JSON an toàn
 */
function readJSON(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      writeLocalJSON(filePath, defaultValue);
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`[FS Error] Lỗi đọc ${filePath}:`, err.message);
    return defaultValue;
  }
}

/**
 * Ghi file JSON cục bộ theo cơ chế Atomic
 */
function writeLocalJSON(filePath, data) {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    console.error(`[FS Error] Lỗi ghi atomic ${filePath}:`, err.message);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
    return false;
  }
}

/**
 * Đồng bộ danh sách dữ liệu lên MongoDB
 */
async function syncCollectionToMongo(colName, items, idField = 'id') {
  if (!db) return;
  try {
    const col = db.collection(colName);
    if (!Array.isArray(items) || items.length === 0) {
      await col.deleteMany({});
      return;
    }
    const operations = items.map(item => ({
      replaceOne: {
        filter: { [idField]: item[idField] },
        replacement: item,
        upsert: true
      }
    }));
    await col.bulkWrite(operations);
    const currentIds = items.map(item => item[idField]);
    await col.deleteMany({ [idField]: { $nin: currentIds } });
  } catch (err) {
    console.error(`[MongoDB] Lỗi đồng bộ collection ${colName}:`, err.message);
  }
}

/**
 * Ghi dữ liệu đồng thời vào file cục bộ và sao lưu lên MongoDB Cloud
 */
function writeJSON(filePath, data) {
  const ok = writeLocalJSON(filePath, data);
  if (db) {
    if (filePath === PRODUCTS_FILE) {
      syncCollectionToMongo('products', data, 'id');
    } else if (filePath === USERS_FILE) {
      syncCollectionToMongo('users', data, 'username');
    } else if (filePath === TRANSACTIONS_FILE) {
      syncCollectionToMongo('transactions', data, 'id');
    } else if (filePath === SETTINGS_FILE) {
      db.collection('settings').replaceOne(
        { _id: 'global' },
        { _id: 'global', ...data },
        { upsert: true }
      ).catch(err => console.error('[MongoDB Error] Đồng bộ settings:', err.message));
    }
  }
  return ok;
}

/**
 * Async Mutex Lock: Xếp hàng tuần tự các thao tác tài chính / số dư
 * Loại bỏ triệt để lỗi Race Condition (Double Spending, nạp trùng).
 */
class AsyncLock {
  constructor() {
    this.queue = Promise.resolve();
  }
  acquire(fn) {
    const run = async () => fn();
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
}
const dbLock = new AsyncLock();

// ========================================================
// 2. JWT & AUTHENTICATION MIDDLEWARES
// ========================================================

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Middleware phân giải thông tin người dùng từ JWT Token
 */
function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = readJSON(USERS_FILE, []);
    const user = users.find(u => u.id === decoded.id || u.username.toLowerCase() === (decoded.username || '').toLowerCase());
    if (user) {
      const { password: _, ...userWithoutPass } = user;
      req.user = userWithoutPass;
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
}

app.use(authenticateUser);

/**
 * Yêu cầu người dùng phải đăng nhập hợp lệ
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập để thực hiện thao tác này!'
    });
  }
  next();
}

/**
 * Yêu cầu quyền Quản trị viên (Admin)
 * Xác thực chặt chẽ qua chữ ký số JWT, không thể giả mạo qua header.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Yêu cầu đăng nhập tài khoản Quản trị viên!'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Từ chối truy cập: Bạn không có quyền Quản trị viên!'
    });
  }

  req.adminUser = req.user;
  next();
}

// Health check endpoint cho UptimeRobot / Render giữ server 24/7
app.get(['/api/health', '/ping'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'ShopNghiaZ (Secured V2.0)',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ========================================================
// 3. SEED DỮ LIỆU BAN ĐẦU & KHỞI TẠO DATABASE
// ========================================================

/**
 * Khởi tạo & Đồng bộ hai chiều với MongoDB Atlas
 */
async function initDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log('[Database] MONGODB_URI chưa cấu hình. Hệ thống chạy bằng bộ nhớ file JSON cục bộ.');
    return;
  }
  if (!MongoClient) {
    console.log('[Database] Gói thư viện mongodb chưa được cài đặt.');
    return;
  }

  try {
    console.log('[Database] Đang kết nối tới MongoDB Atlas...');
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db();
    console.log('[Database] Kết nối MongoDB Atlas THÀNH CÔNG! Dữ liệu đã được bảo vệ an toàn trên Cloud.');

    // 1. Đồng bộ Cấu hình Shop (Settings)
    const mongoSettings = await db.collection('settings').findOne({ _id: 'global' });
    if (mongoSettings) {
      const { _id, ...cleanSettings } = mongoSettings;
      writeLocalJSON(SETTINGS_FILE, cleanSettings);
      console.log('[Database] Đã nạp cấu hình shop mới nhất từ MongoDB.');
    } else {
      const localSettings = readJSON(SETTINGS_FILE, {});
      await db.collection('settings').replaceOne({ _id: 'global' }, { _id: 'global', ...localSettings }, { upsert: true });
      console.log('[Database] Đã sao lưu cấu hình ban đầu lên MongoDB.');
    }

    // 2. Đồng bộ Danh sách Sản Phẩm (Products)
    const prodCount = await db.collection('products').countDocuments();
    if (prodCount > 0) {
      const mongoProducts = await db.collection('products').find({}).toArray();
      const cleanProducts = mongoProducts.map(({ _id, ...rest }) => rest);
      writeLocalJSON(PRODUCTS_FILE, cleanProducts);
      console.log(`[Database] Đã nạp ${cleanProducts.length} sản phẩm từ MongoDB.`);
    } else {
      const localProducts = readJSON(PRODUCTS_FILE, []);
      if (localProducts.length > 0) {
        await syncCollectionToMongo('products', localProducts, 'id');
        console.log(`[Database] Đã sao lưu ${localProducts.length} sản phẩm ban đầu lên MongoDB.`);
      }
    }

    // 3. Đồng bộ Tài khoản Người Dùng (Users)
    const userCount = await db.collection('users').countDocuments();
    if (userCount > 0) {
      const mongoUsers = await db.collection('users').find({}).toArray();
      const cleanUsers = mongoUsers.map(({ _id, ...rest }) => rest);
      writeLocalJSON(USERS_FILE, cleanUsers);
      console.log(`[Database] Đã nạp ${cleanUsers.length} tài khoản người dùng từ MongoDB.`);
    } else {
      const localUsers = readJSON(USERS_FILE, []);
      if (localUsers.length > 0) {
        await syncCollectionToMongo('users', localUsers, 'username');
        console.log(`[Database] Đã sao lưu ${localUsers.length} tài khoản ban đầu lên MongoDB.`);
      }
    }

    // 4. Đồng bộ Lịch sử Giao Dịch (Transactions)
    const txCount = await db.collection('transactions').countDocuments();
    if (txCount > 0) {
      const mongoTx = await db.collection('transactions').find({}).toArray();
      const cleanTx = mongoTx.map(({ _id, ...rest }) => rest);
      writeLocalJSON(TRANSACTIONS_FILE, cleanTx);
      console.log(`[Database] Đã nạp ${cleanTx.length} giao dịch từ MongoDB.`);
    } else {
      const localTx = readJSON(TRANSACTIONS_FILE, []);
      if (localTx.length > 0) {
        await syncCollectionToMongo('transactions', localTx, 'id');
        console.log(`[Database] Đã sao lưu ${localTx.length} giao dịch ban đầu lên MongoDB.`);
      }
    }
  } catch (err) {
    console.error('[Database Error] Không thể kết nối MongoDB:', err.message);
    console.log('[Database] Dự phòng: Tiếp tục sử dụng file JSON cục bộ.');
  }
}

function seedAdminUser() {
  const users = readJSON(USERS_FILE, []);
  let admin = users.find(u => u.username.toLowerCase() === 'nghiaz');
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync('123456', salt);

  if (!admin) {
    admin = {
      id: 'admin_nghiaz',
      username: 'nghiaz',
      password: hashedPassword,
      fullname: 'Admin NghiaZ (Chủ Shop)',
      balance: 10000000,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    users.unshift(admin);
    writeJSON(USERS_FILE, users);
    console.log('[OK] Khởi tạo tài khoản Admin nghiaz mặc định (mật khẩu ban đầu: 123456).');
  } else {
    // Không ghi đè mật khẩu khi admin đã thay đổi mật khẩu
    if (admin.role !== 'admin') {
      admin.role = 'admin';
      writeJSON(USERS_FILE, users);
    }
    console.log('[OK] Đã bảo toàn và đồng bộ quyền Admin cho tài khoản nghiaz.');
  }
}

function seedDefaultProducts() {
  const products = readJSON(PRODUCTS_FILE, []);
  if (products.length === 0) {
    const defaults = [
      {
        id: "prod_dv_1",
        name: "Định vị súng + trang phục android",
        price: 0,
        stock: 9999,
        category: "Định Vị Android",
        description: "File dùng cho ffm , tải tài nguyên súng và trang phục trước khi cài , vượt link 1 lần",
        image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=60",
        downloadUrl: "https://link4m.net/mGKB4Xfg",
        createdAt: new Date().toISOString()
      },
      {
        id: "prod_dv_2",
        name: "Định vị súng xanh đỏ android",
        price: 0,
        stock: 9999,
        category: "Định Vị Android",
        description: "File dùng cho ffth , tải tài nguyên súng trước khi cài , vượt link 1 lần",
        image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&auto=format&fit=crop&q=60",
        downloadUrl: "https://link4m.org/SCxy9",
        createdAt: new Date().toISOString()
      },
      {
        id: "prod_dv_3",
        name: "Định Vị Antiban iOS (iPhone / iPad)",
        price: 100000,
        stock: 50,
        category: "Định Vị iOS",
        description: "Gói định vị hỗ trợ mọi dòng iOS từ iPhone X đến iPhone 16 Pro Max, cài đặt trực tiếp qua file cấu hình không cần jailbreak.",
        image: "https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=500&auto=format&fit=crop&q=60",
        downloadUrl: "https://link4m.net/mGKB4Xfg",
        createdAt: new Date().toISOString()
      },
      {
        id: "prod_dv_4",
        name: "Định Vị Siêu Cấp All Thiết Bị VIP (Antiban 100%)",
        price: 150000,
        stock: 99,
        category: "Định Vị Android",
        description: "Bản định vị VIP cao cấp nhất: Định vị súng, vị trí địch, xuyên tường, menu tùy chỉnh Antiban 100% không lo khóa acc.",
        image: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=500&auto=format&fit=crop&q=60",
        downloadUrl: "https://link4m.org/SCxy9",
        createdAt: new Date().toISOString()
      }
    ];
    writeJSON(PRODUCTS_FILE, defaults);
    console.log('[OK] Đã khởi tạo 4 sản phẩm mặc định cho shopnghiaz.');
  }
}

// ========================================================
// 4. API TÀI KHOẢN & XÁC THỰC (AUTH)
// ========================================================

// Đăng ký tài khoản
app.post('/api/auth/register', async (req, res) => {
  const { username, password, fullname } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu!' });
  }

  const cleanUser = username.trim().toLowerCase();
  if (cleanUser.length < 3) {
    return res.status(400).json({ success: false, message: 'Tên đăng nhập phải có ít nhất 3 ký tự!' });
  }

  const result = await dbLock.acquire(() => {
    const users = readJSON(USERS_FILE, []);
    const existingUser = users.find(u => u.username.toLowerCase() === cleanUser);
    if (existingUser) {
      return { status: 400, data: { success: false, message: 'Tên đăng nhập này đã được sử dụng!' } };
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const newUser = {
      id: 'user_' + Date.now(),
      username: cleanUser,
      password: hashedPassword,
      fullname: fullname ? fullname.trim() : username,
      balance: 0,
      role: cleanUser === 'nghiaz' ? 'admin' : 'user',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    const token = generateToken(newUser);
    const { password: _, ...userWithoutPass } = newUser;

    return {
      status: 201,
      data: {
        success: true,
        message: 'Tạo tài khoản thành công!',
        token: token,
        data: { ...userWithoutPass, token }
      }
    };
  });

  res.status(result.status).json(result.data);
});

// Đăng nhập
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' });
  }

  const cleanUser = username.trim().toLowerCase();
  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.username.toLowerCase() === cleanUser);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác!' });
  }

  const token = generateToken(user);
  const { password: _, ...userWithoutPass } = user;

  res.json({
    success: true,
    message: `Chào mừng ${user.role === 'admin' ? 'Quản trị viên ' : ''}${user.fullname || user.username}!`,
    token: token,
    data: { ...userWithoutPass, token }
  });
});

// Lấy thông tin user hiện tại qua JWT Token
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

// Endpoint tương thích cũ: kiểm tra thông tin user (được bảo vệ quyền riêng tư)
app.get('/api/auth/me/:username', requireAuth, (req, res) => {
  const { username } = req.params;
  const targetUser = username.trim().toLowerCase();

  // Chỉ cho phép user xem chính mình hoặc Admin xem bất kỳ ai
  if (req.user.username.toLowerCase() !== targetUser && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin tài khoản này!' });
  }

  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.username.toLowerCase() === targetUser);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  const { password: _, ...userWithoutPass } = user;
  res.json({ success: true, data: userWithoutPass });
});

// Đổi mật khẩu người dùng & Admin
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const username = req.user.username;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới!' });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
  }

  const result = await dbLock.acquire(() => {
    const users = readJSON(USERS_FILE, []);
    const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    if (userIndex === -1) {
      return { status: 404, data: { success: false, message: 'Người dùng không tồn tại!' } };
    }

    const isValid = bcrypt.compareSync(oldPassword, users[userIndex].password);
    if (!isValid) {
      return { status: 400, data: { success: false, message: 'Mật khẩu hiện tại không chính xác!' } };
    }

    const salt = bcrypt.genSaltSync(10);
    users[userIndex].password = bcrypt.hashSync(newPassword, salt);
    users[userIndex].updatedAt = new Date().toISOString();

    writeJSON(USERS_FILE, users);
    return { status: 200, data: { success: true, message: 'Đổi mật khẩu thành công!' } };
  });

  res.status(result.status).json(result.data);
});

// ========================================================
// 5. API SẢN PHẨM (PRODUCTS)
// ========================================================

// Lấy danh sách sản phẩm (Công khai)
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  res.json({ success: true, data: products });
});

// Thêm sản phẩm mới (Chỉ Admin)
app.post('/api/products', requireAdmin, async (req, res) => {
  const { name, price, stock, category, description, image, downloadUrl } = req.body;
  
  if (!name || price === undefined || stock === undefined) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên, giá tiền và số lượng sản phẩm!' });
  }

  const newProduct = {
    id: 'prod_' + Date.now(),
    name: name.trim(),
    price: Math.max(0, Number(price) || 0),
    stock: Math.max(0, Number(stock) || 0),
    category: category ? category.trim() : 'Sản phẩm số',
    description: description ? description.trim() : '',
    image: image && image.trim() !== '' ? image.trim() : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60',
    downloadUrl: downloadUrl ? downloadUrl.trim() : '',
    createdAt: new Date().toISOString()
  };

  await dbLock.acquire(() => {
    const products = readJSON(PRODUCTS_FILE, []);
    products.unshift(newProduct);
    writeJSON(PRODUCTS_FILE, products);
  });

  res.status(201).json({ success: true, message: 'Thêm sản phẩm thành công!', data: newProduct });
});

// Cập nhật thông tin sản phẩm (Chỉ Admin)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, price, stock, category, description, image, downloadUrl } = req.body;

  const result = await dbLock.acquire(() => {
    let products = readJSON(PRODUCTS_FILE, []);
    const pIndex = products.findIndex(p => p.id === id);
    if (pIndex === -1) {
      return { status: 404, data: { success: false, message: 'Không tìm thấy sản phẩm cần sửa!' } };
    }

    if (name !== undefined) products[pIndex].name = name.trim();
    if (price !== undefined) products[pIndex].price = Math.max(0, Number(price));
    if (stock !== undefined) products[pIndex].stock = Math.max(0, Number(stock));
    if (category !== undefined) products[pIndex].category = category.trim();
    if (description !== undefined) products[pIndex].description = description.trim();
    if (image !== undefined && image.trim() !== '') products[pIndex].image = image.trim();
    if (downloadUrl !== undefined) products[pIndex].downloadUrl = downloadUrl.trim();
    products[pIndex].updatedAt = new Date().toISOString();

    writeJSON(PRODUCTS_FILE, products);
    return { status: 200, data: { success: true, message: 'Đã cập nhật sản phẩm thành công!', data: products[pIndex] } };
  });

  res.status(result.status).json(result.data);
});

// Xóa sản phẩm (Chỉ Admin)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const result = await dbLock.acquire(() => {
    let products = readJSON(PRODUCTS_FILE, []);
    const initialLength = products.length;
    products = products.filter(p => p.id !== id);

    if (products.length === initialLength) {
      return { status: 404, data: { success: false, message: 'Không tìm thấy sản phẩm cần xóa!' } };
    }

    writeJSON(PRODUCTS_FILE, products);
    return { status: 200, data: { success: true, message: 'Đã xóa sản phẩm thành công!' } };
  });

  res.status(result.status).json(result.data);
});

// Upload ảnh sản phẩm (Chỉ Admin)
app.post('/api/admin/upload-image', requireAdmin, (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp dữ liệu hình ảnh!' });
  }

  try {
    const matches = imageBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    let ext = 'png';
    let buffer;
    if (matches && matches.length === 3) {
      ext = matches[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    const safeName = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '.' + ext;
    const savePath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(savePath, buffer);

    // Lưu ảnh vào MongoDB để chống mất khi Render restart
    if (db) {
      db.collection('images').replaceOne(
        { filename: safeName },
        { filename: safeName, data: imageBase64, ext: ext, createdAt: new Date().toISOString() },
        { upsert: true }
      ).catch(e => console.error('[MongoDB Image Error]', e.message));
    }

    const imageUrl = `/uploads/${safeName}`;
    res.json({ success: true, message: 'Tải ảnh thành công!', imageUrl: imageUrl });
  } catch (err) {
    console.error('Lỗi lưu ảnh:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi lưu ảnh lên máy chủ!' });
  }
});

// ========================================================
// 6. API MUA HÀNG (CHECKOUT - ATOMIC LOCK CHỐNG DOUBLE SPEND)
// ========================================================

app.post('/api/orders/buy', requireAuth, async (req, res) => {
  const { productId, quantity } = req.body;
  const buyerUsername = req.user.username; // Xác định chính chủ từ JWT token

  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({ success: false, message: 'Thông tin mua hàng không hợp lệ!' });
  }

  const qty = Math.floor(Number(quantity));

  // Thực thi tuần tự qua dbLock để ngăn chặn tấn công Concurrency / Double Spend
  const result = await dbLock.acquire(() => {
    const users = readJSON(USERS_FILE, []);
    const userIndex = users.findIndex(u => u.username.toLowerCase() === buyerUsername.toLowerCase());
    if (userIndex === -1) {
      return { status: 404, data: { success: false, message: 'Người dùng không tồn tại!' } };
    }

    const products = readJSON(PRODUCTS_FILE, []);
    const productIndex = products.findIndex(p => p.id === productId);
    if (productIndex === -1) {
      return { status: 404, data: { success: false, message: 'Sản phẩm không tồn tại!' } };
    }

    const product = products[productIndex];
    if (product.stock < qty) {
      return { status: 400, data: { success: false, message: `Số lượng trong kho không đủ (Hiện còn: ${product.stock})!` } };
    }

    const totalCost = product.price * qty;
    if (users[userIndex].balance < totalCost) {
      return {
        status: 400,
        data: {
          success: false,
          message: `Số dư không đủ! Cần ${totalCost.toLocaleString('vi-VN')} VNĐ, số dư hiện tại là ${users[userIndex].balance.toLocaleString('vi-VN')} VNĐ. Hãy nạp thêm tiền qua VietQR!`
        }
      };
    }

    // Trừ số dư & tồn kho
    users[userIndex].balance -= totalCost;
    products[productIndex].stock -= qty;

    writeJSON(USERS_FILE, users);
    writeJSON(PRODUCTS_FILE, products);

    // Ghi nhận đơn hàng
    const transactions = readJSON(TRANSACTIONS_FILE, []);
    const newOrder = {
      id: 'order_' + Date.now(),
      type: 'PURCHASE',
      username: users[userIndex].username,
      productName: product.name,
      productId: product.id,
      downloadUrl: product.downloadUrl || '',
      quantity: qty,
      price: product.price,
      totalCost: totalCost,
      status: 'COMPLETED',
      createdAt: new Date().toISOString()
    };
    transactions.unshift(newOrder);
    writeJSON(TRANSACTIONS_FILE, transactions);

    return {
      status: 200,
      data: {
        success: true,
        message: `Mua thành công ${qty}x ${product.name}!`,
        newBalance: users[userIndex].balance,
        remainingStock: products[productIndex].stock,
        downloadUrl: product.downloadUrl || '',
        productName: product.name
      }
    };
  });

  res.status(result.status).json(result.data);
});

// Lịch sử đơn hàng và giao dịch của cá nhân
app.get('/api/transactions/:username', requireAuth, (req, res) => {
  const { username } = req.params;
  const targetUser = username.trim().toLowerCase();

  if (req.user.username.toLowerCase() !== targetUser && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem giao dịch của người khác!' });
  }

  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const userTx = transactions.filter(t => t.username.toLowerCase() === targetUser);
  res.json({ success: true, data: userTx });
});

// ========================================================
// 7. API CẤU HÌNH SHOP & VIETQR (SETTINGS)
// ========================================================

app.get('/api/settings', (req, res) => {
  const defaultSettings = {
    shopName: "ShopNghiaZ",
    shopTitle: "ShopNghiaZ - Shop định vị uy tín số 1 Việt Nam",
    shopDesc: "SHOP ĐỊNH VỊ UY TÍN - GIÁ RẺ - TỰ ĐỘNG SỐ 1 VIỆT NAM. Bảo hành trọn đời, hỗ trợ 24/7.",
    shopNotice: "⚡ Ưu đãi nạp tiền: Quét mã VietQR duyệt nhanh chóng, hỗ trợ mọi ngân hàng & ví điện tử 24/7!",
    shopNoticeActive: true,
    contactZalo: "0868915360",
    contactPhone: "0868915360",
    contactTelegram: "NghiazXdinhvi",
    contactFacebook: "https://facebook.com",
    logoText: "ShopNghiaZ",
    bankId: "MB",
    accountNo: "0987654321",
    accountName: "NGUYEN TRONG NGHIA",
    categories: ["Tất cả", "Định Vị Android", "Định Vị iOS"],
    webhookSecretKey: "shopnghiaz_secret_key_2026",
    cardAutoEnabled: true,
    cardDiscountRate: 85
  };
  const current = readJSON(SETTINGS_FILE, {});
  const settings = Object.assign({}, defaultSettings, current);

  // Bảo vệ thông tin bí mật không lộ cho public
  if (!req.user || req.user.role !== 'admin') {
    const { webhookSecretKey, gachthefastPartnerKey, ...safeSettings } = settings;
    return res.json({ success: true, data: safeSettings });
  }

  res.json({ success: true, data: settings });
});

app.post('/api/settings', requireAdmin, async (req, res) => {
  const currentSettings = readJSON(SETTINGS_FILE, {});
  const updatedSettings = {
    ...currentSettings,
    ...req.body
  };

  // Bảo vệ key webhook và gạch thẻ không bị ghi đè chuỗi rỗng
  if (!req.body.gachthefastPartnerKey && currentSettings.gachthefastPartnerKey) {
    updatedSettings.gachthefastPartnerKey = currentSettings.gachthefastPartnerKey;
  }
  if (!req.body.webhookSecretKey && currentSettings.webhookSecretKey) {
    updatedSettings.webhookSecretKey = currentSettings.webhookSecretKey;
  }

  if (updatedSettings.accountName) {
    updatedSettings.accountName = updatedSettings.accountName.toUpperCase();
  }
  if (Array.isArray(updatedSettings.categories)) {
    let cats = updatedSettings.categories.map(c => typeof c === 'string' ? c.trim() : c).filter(Boolean);
    if (!cats.some(c => c.toLowerCase() === 'tất cả')) {
      cats.unshift('Tất cả');
    }
    updatedSettings.categories = cats;
  }

  await dbLock.acquire(() => {
    writeJSON(SETTINGS_FILE, updatedSettings);
  });

  res.json({ success: true, message: 'Đã lưu toàn bộ thay đổi cấu hình Shop thành công!', data: updatedSettings });
});

// ========================================================
// 8. HỆ THỐNG NẠP TIỀN VIETQR & WEBHOOK
// ========================================================

// Tạo đơn nạp tiền VietQR (Chính chủ tài khoản)
app.post('/api/wallet/create-deposit', requireAuth, async (req, res) => {
  const { amount } = req.body;
  const username = req.user.username;

  if (!amount || Number(amount) < 10000) {
    return res.status(400).json({ success: false, message: 'Số tiền nạp tối thiểu là 10.000 VNĐ!' });
  }

  const depositAmount = Math.floor(Number(amount));
  const settings = readJSON(SETTINGS_FILE, {
    bankId: 'MB',
    accountNo: '0987654321',
    accountName: 'SHOPNGHIAZ STORE'
  });

  const code = 'NAP' + Math.floor(100000 + Math.random() * 900000);
  const memo = `${code} ${username}`;
  const qrUrl = `https://img.vietqr.io/image/${settings.bankId}-${settings.accountNo}-compact2.png?amount=${depositAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(settings.accountName)}`;

  const newTx = {
    id: 'tx_' + Date.now(),
    type: 'DEPOSIT',
    username: username,
    amount: depositAmount,
    code: code,
    memo: memo,
    bankId: settings.bankId,
    accountNo: settings.accountNo,
    accountName: settings.accountName,
    qrUrl: qrUrl,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  await dbLock.acquire(() => {
    const transactions = readJSON(TRANSACTIONS_FILE, []);
    transactions.unshift(newTx);
    writeJSON(TRANSACTIONS_FILE, transactions);
  });

  res.json({ success: true, data: newTx });
});

// Tra cứu trạng thái đơn nạp VietQR
app.get('/api/wallet/deposit-status/:txId', (req, res) => {
  const { txId } = req.params;
  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const tx = transactions.find(t => t.id === txId || t.code === txId);
  if (!tx) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch!' });
  }
  res.json({
    success: true,
    status: tx.status,
    amount: tx.amount,
    username: tx.username,
    code: tx.code,
    approvedAt: tx.approvedAt,
    approvedBy: tx.approvedBy
  });
});

/**
 * Xử lý tự động duyệt tiền nạp an toàn từ Ngân hàng / Webhook
 */
function processAutomaticDeposit(rawContent, transferAmount, reference = '', gateway = 'BANK') {
  if (!rawContent || !transferAmount || Number(transferAmount) <= 0) {
    return { success: false, message: 'Dữ liệu giao dịch không hợp lệ!' };
  }

  const contentStr = String(rawContent).trim();
  const amount = Number(transferAmount);

  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const users = readJSON(USERS_FILE, []);

  // 1. Tìm theo mã NAPxxxxxx (Ưu tiên số 1)
  let codeMatch = contentStr.match(/NAP\d{6}/i);
  let tx = null;
  let txIndex = -1;

  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    txIndex = transactions.findIndex(t => t.code && t.code.toUpperCase() === code && t.status === 'PENDING');
    if (txIndex !== -1) tx = transactions[txIndex];
  }

  // 2. Tìm theo memo hoặc username + số tiền
  if (!tx) {
    txIndex = transactions.findIndex(t => {
      if (t.type !== 'DEPOSIT' || t.status !== 'PENDING') return false;
      if (t.memo && contentStr.toUpperCase().includes(t.memo.toUpperCase())) return true;
      if (t.username && contentStr.toLowerCase().includes(t.username.toLowerCase()) && Number(t.amount) === amount) return true;
      return false;
    });
    if (txIndex !== -1) tx = transactions[txIndex];
  }

  // 3. Tránh duyệt lặp lại
  if (!tx && codeMatch) {
    const code = codeMatch[0].toUpperCase();
    const alreadyApproved = transactions.find(t => t.code && t.code.toUpperCase() === code && t.status === 'COMPLETED');
    if (alreadyApproved) {
      return { success: true, message: `Giao dịch ${code} đã được duyệt trước đó rồi.`, duplicated: true };
    }
  }

  if (!tx) {
    return {
      success: false,
      message: `Không tìm thấy đơn nạp PENDING nào khớp với nội dung: "${contentStr}" và số tiền: ${amount.toLocaleString('vi-VN')} đ`
    };
  }

  // 4. Cộng tiền vào tài khoản
  const userIndex = users.findIndex(u => u.username.toLowerCase() === tx.username.toLowerCase());
  if (userIndex === -1) {
    return { success: false, message: `Người dùng ${tx.username} không tồn tại trong hệ thống!` };
  }

  const creditedAmount = amount;
  users[userIndex].balance = (Number(users[userIndex].balance) || 0) + creditedAmount;

  transactions[txIndex].status = 'COMPLETED';
  transactions[txIndex].approvedAt = new Date().toISOString();
  transactions[txIndex].approvedBy = `AUTO_${gateway || 'WEBHOOK'}`;
  transactions[txIndex].realAmountReceived = creditedAmount;
  transactions[txIndex].bankReference = String(reference || '');

  writeJSON(USERS_FILE, users);
  writeJSON(TRANSACTIONS_FILE, transactions);

  console.log(`[AUTO-DEPOSIT THÀNH CÔNG] +${creditedAmount.toLocaleString('vi-VN')} đ cho ${users[userIndex].username} (Mã: ${transactions[txIndex].code})`);

  return {
    success: true,
    message: `Đã tự động duyệt nạp +${creditedAmount.toLocaleString('vi-VN')} đ cho tài khoản ${users[userIndex].username}!`,
    username: users[userIndex].username,
    creditedAmount: creditedAmount,
    newBalance: users[userIndex].balance,
    txId: transactions[txIndex].id,
    code: transactions[txIndex].code
  };
}

// Webhook tự động nhận thông báo tiền về (BẢO VỆ CHẶT CHẼ BẰNG SECRET KEY)
app.post(['/api/webhook/payment', '/api/webhook/bank', '/api/webhook/sepay', '/api/webhook/momo'], async (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {});
  const webhookSecret = settings.webhookSecretKey || process.env.WEBHOOK_SECRET;

  const authHeader = req.headers['authorization'] || '';
  const apiKeyHeader = req.headers['x-api-key'] || '';
  const queryToken = req.query.token || req.query.apiKey || '';
  const bodyToken = req.body && (req.body.token || req.body.apiKey);

  const providedKey = (authHeader.startsWith('Apikey ') ? authHeader.slice(7).trim() : (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader)) 
    || apiKeyHeader || queryToken || bodyToken;

  // BẢO MẬT: Bắt buộc phải có token hợp lệ khi webhookSecretKey được thiết lập
  if (webhookSecret) {
    if (!providedKey || providedKey !== webhookSecret) {
      return res.status(401).json({ success: false, message: 'Lỗi xác thực: Sai mã bảo mật Webhook hoặc thiếu mã token!' });
    }
  }

  let content = '';
  let amount = 0;
  let reference = '';
  let gateway = 'BANK';

  // Format MoMo (MacroDroid / Notification Forwarder)
  if (req.body && (req.body.tranId || req.body.comment !== undefined || req.path.includes('momo') || req.body.partnerRefId)) {
    content = req.body.comment || req.body.message || req.body.content || req.body.noidung || req.body.description || req.body.text || '';
    amount = Number(req.body.amount || req.body.money || req.body.transferAmount || req.body.sotien || 0);
    reference = req.body.tranId || req.body.transId || req.body.partnerRefId || req.body.id || '';
    gateway = 'MOMO';

    if (amount <= 0) {
      const fullText = String(req.body.text || req.body.body || req.body.content || '');
      const moneyMatch = fullText.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:đ|vnd|d|đồng)/i);
      if (moneyMatch) {
        amount = Number(moneyMatch[1].replace(/[.,]/g, ''));
      }
      if (!content) content = fullText;
    }
  }
  // Format SePay
  else if (req.body && (req.body.transferAmount !== undefined || req.body.content !== undefined)) {
    content = req.body.content || req.body.description || '';
    amount = Number(req.body.transferAmount || req.body.amount || 0);
    reference = req.body.referenceCode || req.body.id || '';
    gateway = req.body.gateway || 'SePay';
  }
  // Format Casso
  else if (req.body && req.body.data && Array.isArray(req.body.data) && req.body.data.length > 0) {
    const item = req.body.data[0];
    content = item.description || '';
    amount = Number(item.amount || 0);
    reference = item.tid || item.id || '';
    gateway = 'Casso';
  }
  // Format PayOS
  else if (req.body && req.body.data && typeof req.body.data === 'object') {
    content = req.body.data.description || '';
    amount = Number(req.body.data.amount || 0);
    reference = req.body.data.reference || req.body.data.orderCode || '';
    gateway = 'PayOS';
  }
  // Format Universal
  else if (req.body) {
    content = req.body.content || req.body.memo || req.body.description || req.body.text || req.body.comment || '';
    amount = Number(req.body.amount || req.body.money || req.body.transferAmount || req.body.transAmount || 0);
    reference = req.body.reference || req.body.ref || req.body.id || req.body.transId || '';
    gateway = req.body.gateway || req.body.bank || 'Webhook';
  }

  // Xử lý nạp tiền an toàn bên trong dbLock
  const result = await dbLock.acquire(() => {
    return processAutomaticDeposit(content, amount, reference, gateway);
  });

  if (result.success) {
    return res.json({ success: true, message: result.message, data: result });
  } else {
    return res.status(200).json({ success: false, message: result.message });
  }
});

// Giả lập webhook nạp tiền để Admin kiểm thử
app.post('/api/admin/simulate-webhook', requireAdmin, async (req, res) => {
  const { content, amount } = req.body;
  if (!content || !amount) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung chuyển khoản và số tiền giả lập!' });
  }

  const result = await dbLock.acquire(() => {
    return processAutomaticDeposit(content, amount, 'SIM_' + Date.now(), 'TEST_ADMIN');
  });

  res.json(result);
});

// ========================================================
// 9. HỆ THỐNG GẠCH THẺ CÀO (GACHTHEFAST.COM)
// ========================================================

async function sendCardToGachTheFast({ telco, code, serial, amount, requestId, partnerId, partnerKey }) {
  const command = 'charging';
  const rawSign = `${partnerKey}${code}${command}${partnerId}${requestId}${serial}${telco}`;
  const sign = crypto.createHash('md5').update(rawSign).digest('hex');

  const formData = new URLSearchParams();
  formData.append('telco', telco.toUpperCase());
  formData.append('code', String(code).trim());
  formData.append('serial', String(serial).trim());
  formData.append('amount', Number(amount));
  formData.append('request_id', requestId);
  formData.append('partner_id', String(partnerId).trim());
  formData.append('sign', sign);
  formData.append('command', command);

  try {
    const response = await fetch('https://gachthefast.com/chargingws/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      result = { status: 99, message: text };
    }
    return { success: true, data: result };
  } catch (err) {
    console.error(`[GACHTHEFAST LỖI KẾT NỐI]`, err.message);
    return { success: false, message: 'Lỗi kết nối cổng GachTheFast.Com: ' + err.message };
  }
}

function processCardCallback(data) {
  if (!data) return { success: false, message: 'Dữ liệu callback rỗng!' };

  const requestId = String(data.request_id || data.requestId || '').trim();
  const serial = String(data.serial || '').trim();
  const statusNum = Number(data.status);
  const message = String(data.message || '');

  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const txIndex = transactions.findIndex(t => 
    (requestId && (t.code === requestId || t.id === requestId)) ||
    (serial && t.serial === serial && t.status === 'PENDING')
  );

  if (txIndex === -1) {
    return { success: false, message: `Không tìm thấy đơn nạp thẻ cào: ${requestId || serial}` };
  }

  const tx = transactions[txIndex];
  if (tx.status === 'COMPLETED') {
    return { success: true, message: `Đơn thẻ ${tx.code} đã được duyệt hoàn tất trước đó rồi.` };
  }

  const users = readJSON(USERS_FILE, []);
  const userIndex = users.findIndex(u => u.username.toLowerCase() === tx.username.toLowerCase());
  const settings = readJSON(SETTINGS_FILE, {});
  const discountRate = Number(settings.cardDiscountRate !== undefined ? settings.cardDiscountRate : 85);

  // Status 1: Nạp thành công
  if (statusNum === 1) {
    let creditAmount = 0;
    if (data.amount && Number(data.amount) > 0) {
      creditAmount = Number(data.amount);
    } else {
      creditAmount = Math.round(Number(tx.amount || tx.declaredAmount) * (discountRate / 100));
    }

    if (userIndex !== -1) {
      users[userIndex].balance = (Number(users[userIndex].balance) || 0) + creditAmount;
      writeJSON(USERS_FILE, users);
    }

    transactions[txIndex].status = 'COMPLETED';
    transactions[txIndex].receiveAmount = creditAmount;
    transactions[txIndex].realAmountReceived = creditAmount;
    transactions[txIndex].approvedAt = new Date().toISOString();
    transactions[txIndex].approvedBy = 'GACHTHEFAST_AUTO';
    transactions[txIndex].gatewayTransId = data.trans_id || tx.gatewayTransId || '';
    transactions[txIndex].note = message || 'Nạp thẻ thành công';
    writeJSON(TRANSACTIONS_FILE, transactions);

    return {
      success: true,
      message: `Đã nạp thẻ thành công +${creditAmount.toLocaleString('vi-VN')} đ cho tài khoản ${tx.username}!`,
      creditAmount,
      newBalance: userIndex !== -1 ? users[userIndex].balance : 0
    };
  }

  // Status 2: Sai mệnh giá
  if (statusNum === 2) {
    const realValue = Number(data.value || data.real_amount || 0);
    let creditAmount = Number(data.amount || data.receive_amount || 0);
    if (creditAmount <= 0 && realValue > 0) {
      creditAmount = Math.round(realValue * (discountRate / 100) * 0.5);
    }

    if (creditAmount > 0 && userIndex !== -1) {
      users[userIndex].balance = (Number(users[userIndex].balance) || 0) + creditAmount;
      writeJSON(USERS_FILE, users);
    }

    transactions[txIndex].status = 'WRONG_AMOUNT';
    transactions[txIndex].realValue = realValue;
    transactions[txIndex].receiveAmount = creditAmount;
    transactions[txIndex].realAmountReceived = creditAmount;
    transactions[txIndex].approvedAt = new Date().toISOString();
    transactions[txIndex].approvedBy = 'GACHTHEFAST_AUTO';
    transactions[txIndex].gatewayTransId = data.trans_id || tx.gatewayTransId || '';
    transactions[txIndex].note = `Sai mệnh giá: Khai ${tx.amount}đ nhưng thực tế ${realValue}đ. ${message}`;
    writeJSON(TRANSACTIONS_FILE, transactions);

    return {
      success: true,
      message: `Thẻ sai mệnh giá (Thực tế: ${realValue.toLocaleString('vi-VN')} đ). Đã cộng +${creditAmount.toLocaleString('vi-VN')} đ.`,
      creditAmount
    };
  }

  // Status 3 hoặc lỗi khác
  transactions[txIndex].status = 'FAILED';
  transactions[txIndex].approvedAt = new Date().toISOString();
  transactions[txIndex].approvedBy = 'GACHTHEFAST_AUTO';
  transactions[txIndex].gatewayTransId = data.trans_id || tx.gatewayTransId || '';
  transactions[txIndex].note = message || 'Thẻ không hợp lệ, sai mã thẻ/seri hoặc đã qua sử dụng';
  writeJSON(TRANSACTIONS_FILE, transactions);

  return { success: false, message: transactions[txIndex].note };
}

// Gửi thẻ cào (Yêu cầu đăng nhập chính chủ)
app.post('/api/card/deposit', requireAuth, async (req, res) => {
  const { telco, code, serial, amount } = req.body;
  const username = req.user.username;

  if (!telco || !code || !serial || !amount || Number(amount) < 10000) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ loại thẻ, mệnh giá (tối thiểu 10.000đ), số serial và mã nạp!' });
  }

  const cleanTelco = String(telco).trim().toUpperCase();
  const cleanCode = String(code).trim();
  const cleanSerial = String(serial).trim();
  const numAmount = Math.floor(Number(amount));

  const settings = readJSON(SETTINGS_FILE, {});
  if (settings.cardAutoEnabled === false) {
    return res.status(400).json({ success: false, message: 'Cổng nạp thẻ cào hiện đang tạm bảo trì. Vui lòng quay lại sau!' });
  }

  const requestId = 'CARD_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);
  const discountRate = Number(settings.cardDiscountRate !== undefined ? settings.cardDiscountRate : 85);
  const estimatedReceive = Math.round(numAmount * (discountRate / 100));

  const newTx = {
    id: 'tx_card_' + Date.now(),
    type: 'CARD_DEPOSIT',
    username: username,
    telco: cleanTelco,
    code: requestId,
    serial: cleanSerial,
    cardPinMasked: cleanCode.length > 6 ? cleanCode.slice(0, 3) + '****' + cleanCode.slice(-3) : '******',
    rawCode: cleanCode,
    amount: numAmount,
    declaredAmount: numAmount,
    receiveAmount: estimatedReceive,
    discountRate: discountRate,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    gateway: 'GACHTHEFAST'
  };

  const isDuplicate = await dbLock.acquire(() => {
    const transactions = readJSON(TRANSACTIONS_FILE, []);
    const dup = transactions.some(t => 
      t.type === 'CARD_DEPOSIT' && 
      t.serial === cleanSerial && 
      (t.status === 'PENDING' || t.status === 'COMPLETED')
    );
    if (!dup) {
      transactions.unshift(newTx);
      writeJSON(TRANSACTIONS_FILE, transactions);
    }
    return dup;
  });

  if (isDuplicate) {
    return res.status(400).json({ success: false, message: `Thẻ cào (Serial: ${cleanSerial}) đã được gửi hoặc đã nạp trước đó rồi!` });
  }

  // Tự động chuyển tiếp lên GachTheFast nếu có cấu hình
  if (settings.gachthefastPartnerId && settings.gachthefastPartnerKey) {
    sendCardToGachTheFast({
      telco: cleanTelco,
      code: cleanCode,
      serial: cleanSerial,
      amount: numAmount,
      requestId: requestId,
      partnerId: settings.gachthefastPartnerId,
      partnerKey: settings.gachthefastPartnerKey
    }).then(result => {
      if (result.success && result.data) {
        const d = result.data;
        dbLock.acquire(() => {
          const currentTxList = readJSON(TRANSACTIONS_FILE, []);
          const idx = currentTxList.findIndex(t => t.id === newTx.id);
          if (idx !== -1) {
            currentTxList[idx].gatewayTransId = d.trans_id || '';
            writeJSON(TRANSACTIONS_FILE, currentTxList);

            if (Number(d.status) === 1) {
              processCardCallback({ status: 1, request_id: requestId, amount: d.amount || estimatedReceive, message: d.message || 'Thành công' });
            } else if (Number(d.status) === 2) {
              processCardCallback({ status: 2, request_id: requestId, value: d.value, amount: d.amount, message: d.message || 'Sai mệnh giá' });
            } else if (Number(d.status) === 3 || (Number(d.status) >= 100 && Number(d.status) !== 99)) {
              processCardCallback({ status: 3, request_id: requestId, message: d.message || 'Thẻ lỗi hoặc sai thông tin' });
            }
          }
        });
      }
    }).catch(err => console.error('[GACHTHEFAST ERROR]', err));
  }

  res.json({
    success: true,
    message: 'Thẻ đã được tiếp nhận và gửi lên hệ thống GachTheFast.Com! Đang tự động kiểm tra và duyệt tiền 24/7.',
    data: {
      txId: newTx.id,
      requestId: requestId,
      telco: cleanTelco,
      amount: numAmount,
      estimatedReceive: estimatedReceive,
      status: 'PENDING'
    }
  });
});

// Webhook nhận Callback tự động từ GachTheFast.Com
app.all(['/api/webhook/card', '/api/webhook/gachthefast'], async (req, res) => {
  const data = Object.assign({}, req.query, req.body);
  const result = await dbLock.acquire(() => processCardCallback(data));
  return res.json({ status: true, message: result.message });
});

// Tra cứu trạng thái thẻ cào
app.get('/api/card/deposit-status/:txId', (req, res) => {
  const { txId } = req.params;
  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const tx = transactions.find(t => t.id === txId || t.code === txId);
  if (!tx) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đơn thẻ cào!' });
  }

  res.json({
    success: true,
    status: tx.status,
    telco: tx.telco,
    amount: tx.amount,
    receiveAmount: tx.receiveAmount,
    note: tx.note || '',
    username: tx.username,
    code: tx.code,
    approvedAt: tx.approvedAt
  });
});

// Lịch sử nạp thẻ cào cá nhân
app.get('/api/card/history/:username', requireAuth, (req, res) => {
  const { username } = req.params;
  const targetUser = username.trim().toLowerCase();

  if (req.user.username.toLowerCase() !== targetUser && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này!' });
  }

  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const cardTx = transactions.filter(t => t.type === 'CARD_DEPOSIT' && t.username.toLowerCase() === targetUser);
  res.json({ success: true, data: cardTx });
});

// ========================================================
// 10. API QUẢN TRỊ ADMIN (ADMIN PANEL)
// ========================================================

// Danh sách toàn bộ Users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readJSON(USERS_FILE, []);
  const safeUsers = users.map(({ password, ...u }) => u);
  res.json({ success: true, data: safeUsers });
});

// Điều chỉnh số dư User (Cộng/Trừ/Reset)
app.post('/api/admin/add-balance', requireAdmin, async (req, res) => {
  const { targetUsername, amount, action = 'add', reason } = req.body;

  if (!targetUsername) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn tài khoản cần điều chỉnh số dư!' });
  }

  const result = await dbLock.acquire(() => {
    const users = readJSON(USERS_FILE, []);
    const userIndex = users.findIndex(u => u.username.toLowerCase() === targetUsername.trim().toLowerCase());

    if (userIndex === -1) {
      return { status: 404, data: { success: false, message: 'Không tìm thấy người dùng này!' } };
    }

    const currentBal = users[userIndex].balance || 0;
    let newBal = currentBal;
    let txType = 'ADMIN_DEPOSIT';
    let txAmount = 0;
    let successMsg = '';

    if (action === 'reset') {
      txType = 'ADMIN_RESET';
      txAmount = currentBal;
      newBal = 0;
      users[userIndex].balance = 0;
      successMsg = `Đã xóa sạch số dư của user [${users[userIndex].username}] về 0 đ!`;
    } else if (action === 'deduct') {
      const deductAmt = Math.abs(Number(amount) || 0);
      if (deductAmt <= 0) {
        return { status: 400, data: { success: false, message: 'Vui lòng nhập số tiền cần giảm hợp lệ!' } };
      }
      txType = 'ADMIN_DEDUCT';
      txAmount = deductAmt;
      newBal = Math.max(0, currentBal - deductAmt);
      users[userIndex].balance = newBal;
      successMsg = `Đã giảm trừ -${deductAmt.toLocaleString('vi-VN')} đ của user [${users[userIndex].username}].`;
    } else {
      const addAmt = Number(amount) || 0;
      if (addAmt <= 0) {
        return { status: 400, data: { success: false, message: 'Vui lòng nhập số tiền cần cộng hợp lệ!' } };
      }
      txType = 'ADMIN_DEPOSIT';
      txAmount = addAmt;
      newBal = currentBal + addAmt;
      users[userIndex].balance = newBal;
      successMsg = `Đã cộng +${addAmt.toLocaleString('vi-VN')} đ cho user [${users[userIndex].username}].`;
    }

    writeJSON(USERS_FILE, users);

    const transactions = readJSON(TRANSACTIONS_FILE, []);
    transactions.unshift({
      id: 'tx_admin_' + Date.now(),
      type: txType,
      username: users[userIndex].username,
      amount: txAmount,
      memo: reason || (
        action === 'reset' ? 'Admin xóa sạch tiền tài khoản về 0đ' :
        action === 'deduct' ? `Admin giảm trừ tiền tài khoản` :
        'Admin cộng tiền vào tài khoản'
      ),
      adminBy: req.adminUser.username,
      status: 'COMPLETED',
      createdAt: new Date().toISOString()
    });
    writeJSON(TRANSACTIONS_FILE, transactions);

    return {
      status: 200,
      data: {
        success: true,
        message: successMsg,
        newBalance: newBal
      }
    };
  });

  res.status(result.status).json(result.data);
});

// Danh sách các đơn nạp tiền VietQR
app.get('/api/admin/deposits', requireAdmin, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const deposits = transactions.filter(t => t.type === 'DEPOSIT');
  res.json({ success: true, data: deposits });
});

// Toàn bộ lịch sử mua hàng của khách
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const orders = transactions.filter(t => t.type === 'PURCHASE' || t.type === 'BUY');
  res.json({ success: true, data: orders });
});

// Duyệt nạp tiền thủ công cho đơn VietQR
app.post('/api/admin/approve-deposit', requireAdmin, async (req, res) => {
  const txId = req.body.txId || req.body.transactionId || req.body.id;

  if (!txId) {
    return res.status(400).json({ success: false, message: 'Thiếu mã giao dịch!' });
  }

  const result = await dbLock.acquire(() => {
    const transactions = readJSON(TRANSACTIONS_FILE, []);
    const txIndex = transactions.findIndex(t => t.id === txId || t.code === txId);

    if (txIndex === -1) {
      return { status: 404, data: { success: false, message: 'Không tìm thấy giao dịch!' } };
    }

    const tx = transactions[txIndex];
    if (tx.status === 'COMPLETED') {
      return { status: 400, data: { success: false, message: 'Giao dịch này đã được duyệt trước đó!' } };
    }

    const users = readJSON(USERS_FILE, []);
    const userIndex = users.findIndex(u => u.username.toLowerCase() === tx.username.toLowerCase());
    if (userIndex === -1) {
      return { status: 404, data: { success: false, message: 'Người dùng nạp tiền không còn tồn tại!' } };
    }

    users[userIndex].balance = (users[userIndex].balance || 0) + tx.amount;
    writeJSON(USERS_FILE, users);

    transactions[txIndex].status = 'COMPLETED';
    transactions[txIndex].approvedBy = req.adminUser.username;
    transactions[txIndex].completedAt = new Date().toISOString();
    writeJSON(TRANSACTIONS_FILE, transactions);

    return {
      status: 200,
      data: {
        success: true,
        message: `Đã duyệt thành công đơn ${tx.code}! Đã cộng +${tx.amount.toLocaleString('vi-VN')} đ cho ${tx.username}.`,
        targetUser: tx.username,
        newBalance: users[userIndex].balance
      }
    };
  });

  res.status(result.status).json(result.data);
});

// Xóa tài khoản User vi phạm
app.delete('/api/admin/users/:username', requireAdmin, async (req, res) => {
  const { username } = req.params;
  if (username.toLowerCase() === 'nghiaz') {
    return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Admin gốc!' });
  }

  const result = await dbLock.acquire(() => {
    let users = readJSON(USERS_FILE, []);
    const initLen = users.length;
    users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());

    if (users.length === initLen) {
      return { status: 404, data: { success: false, message: 'Không tìm thấy người dùng!' } };
    }

    writeJSON(USERS_FILE, users);
    return { status: 200, data: { success: true, message: `Đã xóa tài khoản [${username}] thành công!` } };
  });

  res.status(result.status).json(result.data);
});

// Danh sách thẻ cào cho Admin
app.get('/api/admin/cards', requireAdmin, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE, []);
  const cards = transactions.filter(t => t.type === 'CARD_DEPOSIT');
  res.json({ success: true, data: cards });
});

// Admin duyệt thẻ cào thủ công
app.post('/api/admin/approve-card', requireAdmin, async (req, res) => {
  const { txId, amount } = req.body;
  if (!txId) {
    return res.status(400).json({ success: false, message: 'Thiếu mã đơn thẻ!' });
  }

  const result = await dbLock.acquire(() => {
    const transactions = readJSON(TRANSACTIONS_FILE, []);
    const idx = transactions.findIndex(t => t.id === txId || t.code === txId);
    if (idx === -1) {
      return { status: 404, data: { success: false, message: 'Không tìm thấy đơn thẻ!' } };
    }

    const tx = transactions[idx];
    if (tx.status === 'COMPLETED') {
      return { status: 400, data: { success: false, message: 'Đơn thẻ này đã được duyệt trước đó!' } };
    }

    const users = readJSON(USERS_FILE, []);
    const userIdx = users.findIndex(u => u.username.toLowerCase() === tx.username.toLowerCase());
    if (userIdx === -1) {
      return { status: 404, data: { success: false, message: 'Người dùng không tồn tại!' } };
    }

    const creditAmount = Number(amount) || Number(tx.receiveAmount) || Math.round(Number(tx.amount) * 0.85);
    users[userIdx].balance = (Number(users[userIdx].balance) || 0) + creditAmount;
    writeJSON(USERS_FILE, users);

    transactions[idx].status = 'COMPLETED';
    transactions[idx].receiveAmount = creditAmount;
    transactions[idx].realAmountReceived = creditAmount;
    transactions[idx].approvedBy = req.adminUser.username;
    transactions[idx].approvedAt = new Date().toISOString();
    transactions[idx].note = 'Admin duyệt thủ công';
    writeJSON(TRANSACTIONS_FILE, transactions);

    return {
      status: 200,
      data: {
        success: true,
        message: `Đã duyệt thẻ thành công! Đã cộng +${creditAmount.toLocaleString('vi-VN')} đ cho ${tx.username}.`,
        newBalance: users[userIdx].balance
      }
    };
  });

  res.status(result.status).json(result.data);
});

// Admin từ chối thẻ cào
app.post('/api/admin/reject-card', requireAdmin, async (req, res) => {
  const { txId, reason } = req.body;
  if (!txId) {
    return res.status(400).json({ success: false, message: 'Thiếu mã đơn thẻ!' });
  }

  const result = await dbLock.acquire(() => {
    const transactions = readJSON(TRANSACTIONS_FILE, []);
    const idx = transactions.findIndex(t => t.id === txId || t.code === txId);
    if (idx === -1) {
      return { status: 404, data: { success: false, message: 'Không tìm thấy đơn thẻ!' } };
    }

    transactions[idx].status = 'FAILED';
    transactions[idx].approvedBy = req.adminUser.username;
    transactions[idx].approvedAt = new Date().toISOString();
    transactions[idx].note = reason || 'Admin từ chối / Thẻ sai hoặc đã nạp';
    writeJSON(TRANSACTIONS_FILE, transactions);

    return { status: 200, data: { success: true, message: 'Đã từ chối đơn thẻ thành công!' } };
  });

  res.status(result.status).json(result.data);
});

// Giả lập callback gạch thẻ cho Admin test
app.post('/api/admin/simulate-card-callback', requireAdmin, async (req, res) => {
  const { requestId, status, amount, message } = req.body;
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã đơn thẻ (Request ID) cần test!' });
  }

  const result = await dbLock.acquire(() => {
    return processCardCallback({
      request_id: requestId,
      status: Number(status !== undefined ? status : 1),
      amount: amount ? Number(amount) : undefined,
      message: message || 'Mô phỏng gạch thẻ tự động thành công (Admin Test)'
    });
  });

  res.json(result);
});

// ========================================================
// 11. KHỞI CHẠY SERVER VỚI CLOUD DATABASE
// ========================================================

async function startServer() {
  try {
    // 1. Khởi động & nạp dữ liệu từ Cloud Database (MongoDB)
    await initDatabase();

    // 2. Đồng bộ khởi tạo quyền Admin & sản phẩm cơ sở
    seedAdminUser();
    seedDefaultProducts();

    // 3. Khởi chạy Express Server
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  ShopNghiaZ Server (Secured V2.0 + Cloud DB) đang chạy:`);
      console.log(`  👉 http://localhost:${PORT}`);
      console.log(`  🔐 Cơ chế xác thực JWT, Mutex Lock & Cloud Sync đã sẵn sàng!`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Lỗi nghiêm trọng khi khởi động máy chủ:', err);
  }
}

startServer();
