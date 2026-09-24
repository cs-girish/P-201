import { db } from './config.js';

const $ = s => document.querySelector(s);
const money = n => `₹${Number(n).toLocaleString('en-IN')}`;
function el(tag, cls, content) { const node = document.createElement(tag); if (cls) node.className = cls; if (content !== undefined) node.textContent = content; return node; }
function showDashboard(yes) { $('#login-section').hidden = yes; $('#dashboard').hidden = !yes; $('#refresh').hidden = !yes; }
async function isAdmin(user) {
  if (!user) return false;
  const { data, error } = await db.from('shop_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
async function refresh() {
  const [o, p] = await Promise.all([
    db.from('orders').select('id,code,created_at,name,phone,note,status,total,order_items(name,unit,price,quantity,subtotal)').order('created_at', { ascending: false }),
    db.from('products').select('id,name,category,unit,price,emoji,description,available').order('name')
  ]);
  if (o.error) throw o.error;
  if (p.error) throw p.error;
  $('#order-count').textContent = `${o.data.length} order${o.data.length === 1 ? '' : 's'}`;
  $('#product-count').textContent = `${p.data.length} products`;
  renderOrders(o.data); renderProducts(p.data);
}
function renderOrders(orders) {
  const list = $('#orders-list'); list.replaceChildren();
  if (!orders.length) { list.append(el('div', 'empty-card', 'No pickup orders yet. New orders will appear here.')); return; }
  for (const order of orders) {
    const card = el('article', 'order-card'), top = el('div', 'order-top'), meta = el('div');
    meta.append(el('span', 'order-id', `ORDER #${order.code}`), el('h3', '', order.name), el('p', '', `${new Date(order.created_at).toLocaleString('en-IN')} · ${order.phone}`));
    top.append(meta, el('span', `status status-${order.status}`, order.status)); card.append(top);
    const items = el('div', 'order-items');
    for (const item of order.order_items || []) {
      const row = el('div', 'order-item');
      row.append(el('span', '', `${item.quantity} × ${item.name} (${item.unit})`), el('strong', '', money(item.subtotal)));
      items.append(row);
    }
    card.append(items);
    if (order.note) card.append(el('p', 'order-note', `Note: ${order.note}`));
    const bottom = el('div', 'order-footer'); bottom.append(el('strong', '', `Total ${money(order.total)}`));
    const select = el('select'); select.setAttribute('aria-label', `Status for order ${order.code}`);
    for (const status of ['new', 'preparing', 'ready', 'collected', 'cancelled']) { const option = el('option', '', status[0].toUpperCase() + status.slice(1)); option.value = status; select.append(option); }
    select.value = order.status;
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        const { error } = await db.from('orders').update({ status: select.value }).eq('id', order.id);
        if (error) throw error;
        await refresh();
      } catch (error) { alert(error.message); select.value = order.status; select.disabled = false; }
    });
    bottom.append(select); card.append(bottom); list.append(card);
  }
}
function renderProducts(products) {
  const list = $('#admin-products'); list.replaceChildren();
  for (const product of products) {
    const row = el('div', `admin-product ${product.available ? '' : 'unavailable'}`);
    const icon = el('span', 'admin-product-icon', product.emoji);
    const info = el('div', 'admin-product-info'); info.append(el('strong', '', product.name), el('small', '', `${product.unit} · ${product.category}`));
    const price = el('strong', 'admin-price', money(product.price));
    const edit = el('button', 'small-button', 'Edit price'); edit.type = 'button';
    edit.addEventListener('click', async () => {
      const value = prompt(`New price for ${product.name} in whole rupees:`, product.price);
      if (value === null) return;
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1 || number > 100000) { alert('Enter a whole rupee amount between 1 and 100000.'); return; }
      const { error } = await db.from('products').update({ price: number }).eq('id', product.id);
      if (error) alert(error.message); else await refresh();
    });
    const toggle = el('button', 'small-button', product.available ? 'Hide' : 'Show'); toggle.type = 'button';
    toggle.addEventListener('click', async () => {
      const { error } = await db.from('products').update({ available: !product.available }).eq('id', product.id);
      if (error) alert(error.message); else await refresh();
    });
    row.append(icon, info, price, edit, toggle); list.append(row);
  }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#login-error').textContent = '';
  const { data, error } = await db.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
  if (error) { $('#login-error').textContent = error.message; return; }
  try {
    if (!await isAdmin(data.user)) { await db.auth.signOut(); throw new Error('This account has not been added as a shopkeeper.'); }
    $('#password').value = '';
    await refresh(); showDashboard(true);
  } catch (error) { $('#login-error').textContent = error.message; }
});
$('#refresh').addEventListener('click', () => refresh().catch(error => alert(error.message)));
$('#lock').addEventListener('click', async () => { await db.auth.signOut(); showDashboard(false); });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
  $('#orders-section').hidden = button.dataset.tab !== 'orders'; $('#products-section').hidden = button.dataset.tab !== 'products';
}));
$('#product-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form));
  input.price = Number(input.price);
  input.category = input.category.trim() || 'Other';
  input.emoji = input.emoji.trim() || '🛍️';
  const { error } = await db.from('products').insert(input);
  if (error) { $('#product-message').textContent = error.message; return; }
  form.reset(); $('#product-message').textContent = 'Product added.'; await refresh();
});
(async () => {
  const { data: { user } } = await db.auth.getUser();
  try { if (await isAdmin(user)) { await refresh(); showDashboard(true); } }
  catch (error) { $('#login-error').textContent = error.message; }
})();
