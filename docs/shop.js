import { db } from './config.js';

const $ = selector => document.querySelector(selector);
const format = amount => `₹${amount.toLocaleString('en-IN')}`;
let savedCart = [];
try { savedCart = JSON.parse(localStorage.getItem('pickupBasket') || '[]'); } catch { /* Ignore damaged browser data. */ }
const basket = new Map(Array.isArray(savedCart) ? savedCart.filter(item => Array.isArray(item) && typeof item[0] === 'string' && Number.isInteger(item[1]) && item[1] > 0 && item[1] <= 99) : []);
let products = [];
let selectedCategory = 'All';
const grid = $('#product-grid');
const categoryBox = $('#categories');
const panel = $('#cart-panel');

async function loadProducts() {
  try {
    const { data, error } = await db.from('products').select('id,name,category,unit,price,emoji,description,available').eq('available', true).order('name');
    if (error) throw error;
    products = data;
    renderCategories(); renderProducts(); renderBasket();
  } catch { grid.textContent = 'Products could not be loaded. Please refresh the page.'; }
}
function renderCategories() {
  categoryBox.replaceChildren();
  for (const category of ['All', ...new Set(products.map(p => p.category))]) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `category ${category === selectedCategory ? 'active' : ''}`;
    button.textContent = category;
    button.addEventListener('click', () => { selectedCategory = category; renderCategories(); renderProducts(); });
    categoryBox.append(button);
  }
}
function renderProducts() {
  const query = $('#search').value.trim().toLowerCase();
  const shown = products.filter(p => (selectedCategory === 'All' || p.category === selectedCategory) && `${p.name} ${p.description}`.toLowerCase().includes(query));
  grid.replaceChildren();
  if (!shown.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No products found. Try another search.'; grid.append(empty); return; }
  for (const product of shown) {
    const card = document.createElement('article'); card.className = 'product-card';
    const image = document.createElement('div'); image.className = 'product-image'; image.textContent = product.emoji;
    const type = document.createElement('span'); type.className = 'product-type'; type.textContent = product.category.toUpperCase(); image.append(type);
    const details = document.createElement('div'); details.className = 'product-details';
    const title = document.createElement('h3'); title.textContent = product.name;
    const description = document.createElement('p'); description.textContent = product.description;
    const bottom = document.createElement('div'); bottom.className = 'product-bottom';
    const price = document.createElement('span'); price.className = 'price'; price.textContent = `${format(product.price)} `;
    const unit = document.createElement('small'); unit.textContent = `/ ${product.unit}`; price.append(unit);
    const add = document.createElement('button'); add.type = 'button'; add.className = 'add-button'; add.textContent = '+'; add.setAttribute('aria-label', `Add ${product.name} to basket`);
    add.addEventListener('click', () => { basket.set(product.id, Math.min((basket.get(product.id) || 0) + 1, 99)); renderBasket(); add.textContent = '✓'; setTimeout(() => { add.textContent = '+'; }, 700); });
    bottom.append(price, add); details.append(title, description, bottom); card.append(image, details); grid.append(card);
  }
}
function renderBasket() {
  const lines = $('#cart-lines'); lines.replaceChildren();
  let count = 0, total = 0;
  for (const [id, quantity] of basket) {
    const p = products.find(item => item.id === id);
    if (!p) { basket.delete(id); continue; }
    count += quantity; total += quantity * p.price;
    const row = document.createElement('div'); row.className = 'basket-row';
    const icon = document.createElement('span'); icon.className = 'basket-icon'; icon.textContent = p.emoji;
    const info = document.createElement('div'); info.className = 'basket-info';
    const name = document.createElement('strong'); name.textContent = p.name;
    const unit = document.createElement('small'); unit.textContent = `${format(p.price)} / ${p.unit}`;
    info.append(name, unit);
    const control = document.createElement('div'); control.className = 'quantity';
    const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `Remove one ${p.name}`);
    const amount = document.createElement('span'); amount.textContent = quantity;
    const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', `Add one ${p.name}`);
    minus.addEventListener('click', () => { if (quantity === 1) basket.delete(id); else basket.set(id, quantity - 1); renderBasket(); });
    plus.addEventListener('click', () => { basket.set(id, Math.min(quantity + 1, 99)); renderBasket(); });
    control.append(minus, amount, plus); row.append(icon, info, control); lines.append(row);
  }
  if (!count) { const empty = document.createElement('div'); empty.className = 'basket-empty'; empty.textContent = 'Your basket is waiting for something good. ✳'; lines.append(empty); }
  $('#cart-count').textContent = count; $('#cart-total').textContent = format(total);
  try { localStorage.setItem('pickupBasket', JSON.stringify([...basket])); } catch { /* Cart still works for this visit. */ }
  $('#checkout').hidden = !count;
}
function openCart() { panel.hidden = false; $('#overlay').hidden = false; document.body.classList.add('no-scroll'); $('#close-cart').focus(); }
function closeCart() { panel.hidden = true; $('#overlay').hidden = true; document.body.classList.remove('no-scroll'); $('#cart-button').focus(); }
$('#cart-button').addEventListener('click', openCart);
$('#bottom-cart').addEventListener('click', openCart);
$('#close-cart').addEventListener('click', closeCart);
$('#overlay').addEventListener('click', closeCart);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) closeCart(); });
$('#search').addEventListener('input', renderProducts);
$('#checkout').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
  const data = new FormData(form), message = $('#checkout-message');
  message.textContent = ''; button.disabled = true; button.textContent = 'Sending…';
  try {
    const { data: result, error } = await db.rpc('place_order', { p_name: data.get('name'), p_phone: data.get('phone'), p_note: data.get('note'), p_cart: [...basket].map(([id, quantity]) => ({ id, quantity })) });
    if (error) throw new Error(error.message || 'Could not send order.');
    basket.clear(); form.reset(); renderBasket();
    message.className = 'success'; message.textContent = `Order ${result.code} received! Your total is ${format(result.total)}. Keep this number and collect in store.`;
  } catch (error) { message.className = 'error'; message.textContent = error.message; }
  finally { button.disabled = false; button.innerHTML = 'Send pickup order <span>↗</span>'; }
});
loadProducts();
