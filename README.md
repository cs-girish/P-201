# P-201 · Pickup shop

A static storefront on GitHub Pages with products and pickup orders stored in Supabase. Customers browse products, keep a basket and submit an order; the shopkeeper signs in to manage products and order statuses. Customers pay in store.

## Finish connecting Supabase

The project URL and publishable key are already in `docs/config.js`. These are public browser values. Never put a database password, secret key or service role key in the repository.

1. In your Supabase project, open **SQL Editor → New query**. Copy and run all of [`supabase/schema.sql`](supabase/schema.sql) **once**. It creates products, orders and access policies. Running it again may fail because the policies already exist.
2. Open **Authentication → Users → Add user** and create the shopkeeper's email and password. Keep the password private. Copy that user's UUID from the users list.
3. In **SQL Editor**, run this statement with the actual UUID from step 2:

   ```sql
   insert into public.shop_admins (user_id)
   values ('PASTE_SHOPKEEPER_USER_UUID_HERE');
   ```

4. In GitHub, open **P-201 → Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select **main** and **/docs**, then save. The site will be `https://cs-girish.github.io/P-201/`; the shopkeeper page is `https://cs-girish.github.io/P-201/admin.html`.
5. Sign in to the shopkeeper page and add your real products and prices. Test a customer order with another browser window, then confirm it appears in the dashboard. Do not accept real orders while the sample branding and pickup details are unfinished.

## How it works

`docs/` contains the browser app. It calls Supabase directly with a **publishable key**. Row Level Security lets anyone read available products, but only users explicitly listed in `shop_admins` can edit products or read customer details. Customers cannot write directly to the order tables. They call `place_order`, a database function that validates the cart, calculates prices from the products table and creates the order and item snapshots together. No Node server or persistent disk is needed.

The cart stays in the customer's browser between visits. The dashboard uses **Refresh orders** to check for new orders. For a first pilot, monitor abuse and set up database backups; the public order endpoint can still receive unwanted submissions. Product images, pickup hours, confirmation messages and notifications can be added later.

## Local preview

Open a terminal in this repository and run `python -m http.server 8000 --directory docs`. Then visit `http://localhost:8000/` and `http://localhost:8000/admin.html`. The database setup above is required for the pages to load products and accept orders.

## Updating the site

Change files inside `docs/`, commit and push them to the `main` branch. GitHub Pages publishes the new version. If your computer has the earlier ZIP download, clone the current repository again first; that ZIP contains the previous Node server version.
