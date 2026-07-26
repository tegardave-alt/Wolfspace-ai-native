# Perbandingan Platform Deploy Web 2025

# Perbandingan Platform Deploy Web 2025

| Platform                      | Harga Mulai      | Free Tier            | Bandwidth               | Best For                                                | Next.js Support           |
| ----------------------------- | ---------------- | -------------------- | ----------------------- | ------------------------------------------------------- | ------------------------- |
| **Vercel**                    | $20/bln (Pro)    | ✅ Ada               | 1TB (Pro)               | Next.js native, edge functions, frontend                | ✅ Full (native)          |
| **Netlify**                   | $19/bln (Pro)    | ✅ Ada               | 100GB (Free), 1TB (Pro) | JAMstack, static sites, frontend                        | ⚠️ Sebagian (via adapter) |
| **Railway**                   | $5/bln + usage   | ✅ Terbatas          | Pay-per-use             | Full-stack apps, built-in DB (PostgreSQL, Redis, MySQL) | ✅ Full                   |
| **Render**                    | $7/bln (Starter) | ✅ Ada (750 jam/bln) | 100GB termasuk          | Simple deployments, predictable pricing                 | ✅ Full                   |
| **Fly.io**                    | ~$5/bln + usage  | ✅ Ada (3 VM gratis) | 160GB (Free)            | Edge deployment global, low latency                     | ✅ Full                   |
| **Cloudflare Pages**          | Gratis - $20/bln | ✅ Sangat generous   | ✅ Unlimited (Free)     | Static sites + edge functions, budget-conscious         | ⚠️ Sebagian (via adapter) |
| **DigitalOcean App Platform** | $12/bln (Basic)  | ❌ Tidak             | 100GB (Basic)           | Developer-friendly cloud, VPS + PaaS                    | ✅ Full                   |
| **Self-Hosted VPS**           | €4.49/bln        | ❌ Tidak             | Tergantung provider     | Full control, predictable costs, data sovereignty       | ✅ Full                   |

## Catatan Penting

- **Vercel** bisa membengkak drastis karena overage bandwidth ($40/100GB), function execution, dan image optimization.
- **Railway** menggunakan model _pay-per-resource_ — tagihan tipikal aplikasi kecil $10-30/bln.
- **Render** free tier akan _spin down_ setelah tidak ada aktivitas (cold start).
- **Cloudflare Pages** punya free tier paling generous: unlimited bandwidth, 500 build/bln, 100K Workers requests/hari.
- **Self-hosted VPS** memberikan penghematan hingga 90-95% dibanding Vercel untuk traffic menengah-besar.

## Saran Pemilihan

- **Frontend heavy + Next.js** → Vercel
- **Full-stack dengan database** → Railway
- **Budget ketat / traffic global** → Cloudflare Pages
- **Kontrol penuh + biaya tetap** → VPS (DigitalOcean, DanubeData, dll)
- **Sederhana dan predictable** → Render
