import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('customer order is priced by server and appears in shopkeeper dashboard', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pickup-shop-'));
  const key = 'local-testing-key-long-enough';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, ADMIN_KEY: key, PORT: '0', DATA_FILE: join(directory, 'shop.json') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    let output = '';
    const port = await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
      setTimeout(() => reject(new Error('Server did not start')), 5000);
    });
    const base = `http://127.0.0.1:${port}`;
    const products = await (await fetch(`${base}/api/products`)).json();
    assert.ok(products.length > 0);
    const response = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Customer', phone: '9876543210', items: [{ id: products[0].id, quantity: 2, price: 1 }] }) });
    assert.equal(response.status, 201);
    const order = await response.json();
    assert.equal(order.total, products[0].price * 2);
    assert.equal((await fetch(`${base}/api/admin/orders`)).status, 401);
    const headers = { 'x-admin-key': key, 'content-type': 'application/json' };
    const orders = await (await fetch(`${base}/api/admin/orders`, { headers })).json();
    assert.equal(orders[0].id, order.id);
    assert.equal(orders[0].items[0].quantity, 2);
    const update = await fetch(`${base}/api/admin/orders/${order.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'ready' }) });
    assert.equal((await update.json()).status, 'ready');
    const product = await (await fetch(`${base}/api/admin/products`, { method: 'POST', headers, body: JSON.stringify({ name: 'Soap', unit: '1 bar', price: 25 }) })).json();
    assert.equal(product.name, 'Soap');
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
