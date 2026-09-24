import http from 'node:http';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const dataFile = process.env.DATA_FILE || join(root, 'data', 'shop.json');
const adminKey = process.env.ADMIN_KEY;
if (!adminKey || adminKey === 'replace-with-a-long-random-secret' || adminKey.length < 16) {
  console.error('Set ADMIN_KEY to a unique secret of at least 16 characters. See .env.example.');
  process.exit(1);
}

const seed = [
  { id: 'rice', name: 'Matta Rice', category: 'Grains', unit: '1 kg', price: 58, emoji: '🌾', description: 'Everyday Kerala red rice', available: true },
  { id: 'flour', name: 'Wheat Flour', category: 'Grains', unit: '1 kg', price: 52, emoji: '🫓', description: 'Freshly packed atta', available: true },
  { id: 'oil', name: 'Coconut Oil', category: 'Pantry', unit: '1 L', price: 240, emoji: '🥥', description: 'For cooking and everyday use', available: true },
  { id: 'tea', name: 'Tea Powder', category: 'Pantry', unit: '250 g', price: 125, emoji: '🍵', description: 'A strong, familiar cup', available: true },
  { id: 'banana', name: 'Bananas', category: 'Fresh', unit: '1 kg', price: 65, emoji: '🍌', description: 'Fresh fruit for the week', available: true },
  { id: 'milk', name: 'Milk', category: 'Dairy', unit: '500 ml', price: 30, emoji: '🥛', description: 'Fresh daily milk', available: true }
];

let state;
let writeQueue = Promise.resolve();
async function load() {
  try { state = JSON.parse(await readFile(dataFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { products: seed, orders: [] };
    await save();
  }
}
function save() {
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.${process.pid}.tmp`;
    await writeFile(temporary, snapshot);
    await rename(temporary, dataFile);
  });
  return writeQueue;
}
function send(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function authorized(req) {
  const supplied = req.headers['x-admin-key'];
  if (typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied), b = Buffer.from(adminKey);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function body(req) {
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 20_000) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try { return JSON.parse(input); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
const clean = (value, max = 100) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const statuses = ['new', 'preparing', 'ready', 'collected', 'cancelled'];
async function api(req, res, pathname) {
  if (pathname === '/api/products' && req.method === 'GET') {
    return send(res, 200, state.products.filter(p => p.available));
  }
  if (pathname === '/api/orders' && req.method === 'POST') {
    const input = await body(req);
    const name = clean(input.name, 80), phone = clean(input.phone, 20);
    if (!name || !/^[+\d][\d\s-]{8,17}$/.test(phone) || !Array.isArray(input.items) || !input.items.length || input.items.length > 50) {
      return send(res, 400, { error: 'Enter a name, valid phone number and at least one item.' });
    }
    const quantities = new Map();
    for (const item of input.items) {
      if (typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        return send(res, 400, { error: 'Invalid item or quantity.' });
      }
      quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
    }
    const items = [];
    for (const [id, quantity] of quantities) {
      const product = state.products.find(p => p.id === id && p.available);
      if (!product || quantity > 99) return send(res, 400, { error: 'An item is unavailable or exceeds the quantity limit.' });
      items.push({ id, name: product.name, unit: product.unit, price: product.price, quantity, subtotal: product.price * quantity });
    }
    const order = {
      id: randomBytes(5).toString('hex').toUpperCase(), createdAt: new Date().toISOString(),
      name, phone, note: clean(input.note, 300), status: 'new', items,
      total: items.reduce((sum, item) => sum + item.subtotal, 0)
    };
    state.orders.unshift(order);
    await save();
    return send(res, 201, { id: order.id, total: order.total, status: order.status });
  }
  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    if (!authorized(req)) return send(res, 401, { error: 'Incorrect shopkeeper key.' });
    return send(res, 200, state.orders);
  }
  const statusMatch = pathname.match(/^\/api\/admin\/orders\/([A-F0-9]+)$/);
  if (statusMatch && req.method === 'PATCH') {
    if (!authorized(req)) return send(res, 401, { error: 'Incorrect shopkeeper key.' });
    const input = await body(req);
    const order = state.orders.find(o => o.id === statusMatch[1]);
    if (!order) return send(res, 404, { error: 'Order not found.' });
    if (!statuses.includes(input.status)) return send(res, 400, { error: 'Invalid status.' });
    order.status = input.status;
    await save();
    return send(res, 200, { id: order.id, status: order.status });
  }
  if (pathname === '/api/admin/products' && req.method === 'GET') {
    if (!authorized(req)) return send(res, 401, { error: 'Incorrect shopkeeper key.' });
    return send(res, 200, state.products);
  }
  if (pathname === '/api/admin/products' && req.method === 'POST') {
    if (!authorized(req)) return send(res, 401, { error: 'Incorrect shopkeeper key.' });
    const input = await body(req);
    const name = clean(input.name, 80), unit = clean(input.unit, 30);
    const price = Number(input.price);
    if (!name || !unit || !Number.isInteger(price) || price < 1 || price > 100000) return send(res, 400, { error: 'Enter a name, unit and whole rupee price.' });
    const product = { id: randomBytes(6).toString('hex'), name, category: clean(input.category, 40) || 'Other', unit, price, emoji: clean(input.emoji, 8) || '🛍️', description: clean(input.description, 160), available: true };
    state.products.push(product);
    await save();
    return send(res, 201, product);
  }
  const productMatch = pathname.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)$/);
  if (productMatch && req.method === 'PATCH') {
    if (!authorized(req)) return send(res, 401, { error: 'Incorrect shopkeeper key.' });
    const product = state.products.find(p => p.id === productMatch[1]);
    if (!product) return send(res, 404, { error: 'Product not found.' });
    const input = await body(req);
    if (typeof input.available === 'boolean') product.available = input.available;
    if (input.price !== undefined) {
      if (!Number.isInteger(input.price) || input.price < 1 || input.price > 100000) return send(res, 400, { error: 'Invalid price.' });
      product.price = input.price;
    }
    await save();
    return send(res, 200, product);
  }
  return send(res, 404, { error: 'Not found.' });
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const pages = new Map([['/', 'index.html'], ['/admin', 'admin.html']]);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
    const filename = pages.get(pathname) || pathname.slice(1);
    if (!/^(?:[a-zA-Z0-9_-]+\.(?:html|css|js|svg))$/.test(filename)) return send(res, 404, { error: 'Not found.' });
    const file = resolve(publicDir, filename);
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': contentTypes[filename.slice(filename.lastIndexOf('.'))], 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error.code === 'ENOENT') return send(res, 404, { error: 'Not found.' });
    if (error.status) return send(res, error.status, { error: error.message });
    console.error(error);
    return send(res, 500, { error: 'Server error. Please try again.' });
  }
});
await load();
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Shop running at http://localhost:${server.address().port}`));
