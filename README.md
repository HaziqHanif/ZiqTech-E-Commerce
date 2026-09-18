# ZiqTech — Full-Stack E-Commerce Platform

ZiqTech is a full-stack technology e-commerce portfolio project with customer shopping flows, product variants, checkout, orders, invoices, user accounts, and an admin dashboard.

## Live Demo

https://ziqtech-e-commerce.onrender.com

## Features

- User registration and login
- Persistent PostgreSQL-backed sessions
- Product catalogue and search
- Product variants and stock management
- Cart and wishlist
- Customer profile
- Malaysian postcode support
- Checkout and DEMO payment flow
- Orders and invoices
- Admin dashboard
- Product, order, user, and admin management

## Tech Stack

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express.js
- Database: PostgreSQL
- Security: scrypt password hashing, Helmet, rate limiting, parameterized SQL
- Deployment: Render + GitHub

## Run Locally

1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file with `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, and `PAYMENT_MODE=DEMO`.
4. Run `npm start`.
5. Open `http://localhost:3001`.

Never commit real secrets or your `.env` file.

## Main Pages

- `/` — Store
- `/product.html` — Product details
- `/cart.html` — Cart
- `/checkout.html` — Checkout
- `/order.html` — Orders
- `/invoice.html` — Invoice
- `/wishlist.html` — Wishlist
- `/profile.html` — Profile
- `/admin-login.html` — Admin login
- `/admin.html` — Admin dashboard

## Demo Notice

The deployed version currently uses DEMO payment mode and does not process real payments.

---

Built by Muhammad Haziq Hanif.
