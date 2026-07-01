# Brand Demo Platform — AI Virtual Try-On

This is a completely independent, decentralized frontend portal built for presenting the AI Virtual Try-On product to prospective clients. It operates purely as a consumer of the live production NestJS API and widget scripts.

---

## 📖 Project Purpose
To allow sales and marketing teams to showcase custom AI virtual try-on storefronts directly to prospective retail brands (such as Effilo, Onhete, October, LYVN, Nappa Dori, and Farak) via private, dynamically custom-branded sandbox pages, requiring **zero code changes** or central routing edits to add new clients.

---

## 🏗️ Architecture Overview

The Demo Platform contains only presentation layer details. It loads the compiled production `widget.js` and communicates with the backend purely through the public API contract:

```
[Demo Page] ──(Dynamic fetch)──> [config.json]
     │
(Loads widget.js)
     │
     ▼
[Production Try-On Widget] ──(POST /v1/tryon)──> [NestJS Production API]
                                                         │
                                                  (Enqueues Job)
                                                         │
                                                         ▼
                                                [BullMQ Queue Worker]
                                                         │
                                                   (Runs Try-on)
                                                         │
                                                         ▼
                                                 [Segmind / Gemini]
```

---

## 📂 Folder Structure

```
apps/demo-portal/
├── public/                     # Static files (Vite output folder root)
│   ├── _redirects              # SPA redirection rule (Cloudflare Pages)
│   └── assets/
│       ├── placeholders/       # Shared placeholder assets
│       │   ├── logo.svg        # Generic logo placeholder
│       │   ├── banner.webp     # Generic banner placeholder
│       │   └── product.webp    # Generic garment placeholder
│       └── brands/             # Decentralized brand configurations
│           └── [brandId]/      # Self-contained brand workspace
│               ├── config.json # Naming, products array, colors, public widget key
│               └── products/   # Blank products directory (to replace placeholders later)
├── src/
│   ├── config/
│   │   └── demo-settings.json  # Global sandboxing settings
│   ├── components/
│   │   ├── DemoBanner.tsx      # Sticky warning header
│   │   ├── ProductCard.tsx     # Card layout with hover tryon action
│   │   └── BrandGrid.tsx       # Grid collection of products
│   ├── layouts/
│   │   └── BrandLayout.tsx     # Dynamic shell setting brand styles/fonts
│   ├── pages/
│   │   ├── BrandDirectoryPage.tsx # Root landing page with selector cards
│   │   ├── BrandDemoPage.tsx   # Dynamically resolves and loads brand pages
│   │   └── NotFoundPage.tsx    # Fallback page for unknown brands
│   ├── hooks/
│   │   └── useBrandResolver.ts # Subdomain/path resolver hook
│   ├── router/
│   │   └── AppRouter.tsx       # Dynamic path and subdomain router
│   ├── services/
│   │   ├── widgetLoader.ts     # Dynamic injection of widget.js
│   │   └── metaService.ts      # Runtime DOM update (Favicon, SEO headers, Theme color)
│   ├── styles/
│   │   └── index.css           # Global resets and scrollbar styles
│   ├── types/
│   │   └── index.ts            # Type definitions
│   └── main.tsx
```

---

## 🎨 Asset Specifications

To ensure high-quality presentation and accurate AI try-on fits:

| Asset Type | Dimension / Spec | File Format | Guidelines / Requirements |
|:---|:---|:---|:---|
| **Brand Logo** | Variable height | `.svg` (Vector preferred) | Transparent background, high contrast, clean vector curves. PNG fallback allowed. |
| **Hero Banner** | 1920px × 700px | `.webp` | Compressed under `300 KB` to load instantly. Minimal busy text. |
| **Garment Products** | 1024px+ Square (1:1) | `.webp` | **Must be Front View on a Solid White Background**. No hands, straps, or model body parts cutting off the neck/sleeves. |

---

## 🚀 How to Add a New Brand (Onboarding Checklist)

Adding a brand is 100% configuration-driven and requires editing no application code:

1. **Database Setup:**
   - Confirm the brand is onboarded as a Tenant in the production PostgreSQL database.
   - Retrieve their `apiKey` (which acts as the public client-side widget token).
   - Ensure the brand's garments are synced or seeded in the `Product` table with a `shopifyProductId` matching the garment file.
2. **Directory Creation:**
   - Create the directory: `public/assets/brands/[brandId]/`
   - Create the directory: `public/assets/brands/[brandId]/products/`
3. **Asset Collection (Initial Setup - Shared Placeholders):**
   - No brand assets are required initially. Point your `config.json` properties directly to the shared placeholder folder.
4. **Configuration Mapping:**
   - Create a `config.json` file inside `public/assets/brands/[brandId]/` with the following schema:
     ```json
     {
       "schemaVersion": 1,
       "lastUpdated": "2026-07-01",
       "name": "Brand Name",
       "tenantId": "brand-database-id",
       "publicWidgetKey": "tenant-apiKey-uuid-from-database",
       "welcomeTitle": "Brand Title Welcome",
       "description": "Short branding description tag line.",
       "logoUrl": "/assets/placeholders/logo.svg",
       "bannerUrl": "/assets/placeholders/banner.webp",
       "theme": {
         "primaryColor": "#HEXCODE",
         "accentColor": "#HEXCODE",
         "widgetTheme": "light"
       },
       "products": [
         {
           "id": "brand-p1",
           "shopifyProductId": "shopify-prod-database-id-1",
           "name": "Product 1",
           "price": "$--.--",
           "imageUrl": "/assets/placeholders/product.webp"
         }
       ]
     }
     ```
5. **Replacing Placeholders with Client Assets:**
   - Save the client's official logo as `logo.svg` (or `logo.png`) inside `public/assets/brands/[brandId]/`.
   - Save the banner as `banner.webp` inside `public/assets/brands/[brandId]/`.
   - Save the garment product WebP images inside `public/assets/brands/[brandId]/products/` (e.g. `shirt-green.webp`).
   - Update `config.json` to point to these new paths:
     * `"logoUrl": "/assets/brands/[brandId]/logo.svg"`
     * `"bannerUrl": "/assets/brands/[brandId]/banner.webp"`
     * Change each product's `"imageUrl"` to point to `/assets/brands/[brandId]/products/shirt-green.webp`.
6. **Validation:**
   - Run the app locally (`npm run dev`) and navigate to `http://localhost:5173/[brandId]`.
   - Verify favicon, title, theme colors, and product grid render correctly.
   - Click "Try On" and perform a full loop test.
7. **Deployment:**
   - Push your new asset folder to Git. Cloudflare Pages will build and deploy the update automatically.

---

## 🌐 Deployment Steps (Cloudflare Pages)

1. Open your **Cloudflare Pages Dashboard**.
2. Connect your Git repository.
3. Configure the build parameters:
   - **Framework Preset:** `Vite`
   - **Root directory:** `apps/demo-portal`
   - **Build command:** `pnpm build`
   - **Build output directory:** `dist`
4. Add **Environment Variables** in the Pages project settings:
   - `VITE_API_URL`: Points to your live NestJS production API.
   - `VITE_WIDGET_URL`: Points to your compiled production widget delivery URL.
5. Save and Deploy.

---

## 🛠️ Troubleshooting

* **Widget fails to load:**
  * Verify `VITE_WIDGET_URL` env variable points to a valid public URL.
  * Check the browser console to confirm there are no CORS or HTTPS mixed-content blocks.
* **API returns 401 Unauthorized:**
  * Double check that `publicWidgetKey` in the brand's `config.json` matches the database `apiKey` of that specific tenant exactly.
* **Garment fails to render in Try-On:**
  * Confirm that `shopifyProductId` in the products list matches the registered value in the database.
  * Ensure the garment image has been uploaded to R2 and is accessible by the worker.

---

## ⚖️ Demo Platform Rules

1. **Rule 16 — Demo Platform Ownership:** The Demo Platform owns **ONLY** presentation (branding, routing, UI layouts, static assets). It never owns or duplicates backend business logic, authentication, workers, upload validations, or image processing.
2. **Rule 17 — Brand Deletion:** Every demo brand must be removable without affecting any other demo brand or requiring application code changes. Deleting one brand must only require deleting its asset folder and removing its folder mapping.
3. **Rule 18 — Brand Independence:** Deleting/adding a brand only requires touching its asset folder and config mapping. No other files should require modification.
4. **Rule 19 — Production Compatibility:** The Demo Platform must always consume the current production APIs exactly as they exist. The Demo Platform must never require production API changes solely to support demo functionality.
5. **Rule 20 — Placeholder Asset Rule:** Shared placeholder assets must exist in a single shared location (`public/assets/placeholders/`). Brand folders should reference shared placeholders until official client assets are available. Placeholder assets should never be duplicated across multiple brand folders.
6. **Rule 21 — Asset Replacement Rule:** Every client brand must initially reference the shared placeholder assets. When official client assets become available, only that client's `config.json` should be updated to reference the new assets. No application code, routing, components, layouts, services, or build configuration should require modification when replacing placeholders.
