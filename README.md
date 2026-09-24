# P-201 · Pickup shop

A small online catalogue and pickup ordering system. Customers add products to a basket, see the total, and send an order. The shopkeeper sees each order, prepares it, and marks it ready or collected. Payment happens in store.

## Run locally

Requires Node.js 22 or newer. No package installation is needed.

1. Copy `.env.example` to `.env`.
2. Replace `ADMIN_KEY` with a unique random secret of at least 16 characters.
3. Run `npm start` (or `npm run dev` for automatic restarts).
4. Open `http://localhost:3000` for customers and `http://localhost:3000/admin` for the shopkeeper.

The first run creates `data/shop.json` with **sample products and sample prices**. Replace these in the shopkeeper screen before taking real orders. The data directory and `.env` are ignored by Git.

## How it works

The frontend uses browser `fetch()` calls to the server's JSON API. `POST /api/orders` sends only product IDs and quantities; the server uses its own current product prices, stores a snapshot of the order, and returns the order number. Shopkeeper API routes require `x-admin-key`. The key stays in memory in the dashboard and clears when the page reloads or the dashboard is locked. No customer or administrator password is saved in browser storage.

## Deploying

Deploy the **Node server**, not just the `public/` folder. GitHub Pages alone cannot receive or store orders. Set `ADMIN_KEY` in your hosting provider's secret environment variables, use HTTPS, and set `DATA_FILE` to a **persistent writable volume**. A temporary filesystem will lose orders on redeploy. The JSON data store is for one server process and a small shop; use a database when handling substantial traffic or multiple server instances. Do not publish a live order link until you have set real products, contact and pickup details, and a backup process. Orders contain customer names and phone numbers, so restrict access to the data file.

The sample branding is generic. Update `public/index.html`, `public/admin.html` and `public/styles.css` with your shop's actual name and identity.
