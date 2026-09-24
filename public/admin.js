const $ = selector => document.querySelector(selector);
const money = amount => `₹${amount.toLocaleString('en-IN')}`;
let key = '';
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'x-admin-key': key, ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}
async function refresh() {
  const [orders, products] = await Promise.all([request('/api/admin/orders'), request('/api/admin/products')]);
  $('#order-count').textContent = `${orders.length} order${orders.length === 1 ? '' : 's'}`;
  $('#product-count').textContent = `${products.length} products`;
  renderOrders(orders); renderProducts(products);
}
function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
function renderOrders(orders) {
  const list = $('#orders-list'); list.replaceChildren();
  if (!orders.length) { list.append(el('div', 'empty-card', 'No pickup orders yet. New orders will appear here.')); return; }
  for (const order of orders) {
    const card = el('article', 'order-card');
    const top = el('div', 'order-top');
    const meta = el('div'); meta.append(el('span', 'order-id', `ORDER #${order.id}`), el('h3', '', order.name), el('p', '', `${new Date(order.createdAt).toLocaleString('en-IN')} · ${order.phone}`));
    const badge = el('span', `status status-${order.status}`, order.status); top.append(meta, badge); card.append(top);
    const items = el('div', 'order-items');
    for (const item of order.items) { const row = el('div', 'order-item'); row.append(el('span', '', `${item.quantity} × ${item.name} (${item.unit})`), el('strong', '', money(item.subtotal))); items.append(row); }
    card.append(items);
    if (order.note) card.append(el('p', 'order-note', `Note: ${order.note}`));
    const bottom = el('div', 'order-footer'); bottom.append(el('strong', '', `Total ${money(order.total)}`));
    const select = el('select'); select.setAttribute('aria-label', `Status for order ${order.id}`);
    for (const status of ['new', 'preparing', 'ready', 'collected', 'cancelled']) { const option = el('option', '', status[0].toUpperCase() + status.slice(1)); option.value = status; select.append(option); }
    select.value = order.status;
    select.addEventListener('change', async () => {
      select.disabled = true;
      try { await request(`/api/admin/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); await refresh(); }
      catch (error) { alert(error.message); select.value = order.status; select.disabled = false; }
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
      try { await request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ price: number }) }); await refresh(); }
      catch (error) { alert(error.message); }
    });
    const toggle = el('button', 'small-button', product.available ? 'Hide' : 'Show'); toggle.type = 'button';
    toggle.addEventListener('click', async () => {
      try { await request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ available: !product.available }) }); await refresh(); }
      catch (error) { alert(error.message); }
    });
    row.append(icon, info, price, edit, toggle); list.append(row);
  }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); key = $('#key').value;
  try { await refresh(); $('#login-section').hidden = true; $('#dashboard').hidden = false; $('#refresh').hidden = false; $('#key').value = ''; }
  catch (error) { $('#login-error').textContent = error.message; key = ''; }
});
$('#refresh').addEventListener('click', () => refresh().catch(error => alert(error.message)));
$('#lock').addEventListener('click', () => { key = ''; $('#dashboard').hidden = true; $('#login-section').hidden = false; $('#refresh').hidden = true; });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
  $('#orders-section').hidden = button.dataset.tab !== 'orders';
  $('#products-section').hidden = button.dataset.tab !== 'products';
}));
$('#product-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form)); input.price = Number(input.price);
  try { await request('/api/admin/products', { method: 'POST', body: JSON.stringify(input) }); form.reset(); $('#product-message').textContent = 'Product added.'; await refresh(); }
  catch (error) { $('#product-message').textContent = error.message; }
});
