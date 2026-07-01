# Changelog — Brand Demo Platform

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-07-01

### Added
- Created a fully decoupled, dynamic React + TypeScript + Vite project inside `apps/demo-portal`.
- Implemented folder-based decentralized configuration architecture supporting 1,000+ brands with zero central registry bottlenecks.
- Implemented dynamic routing using React Router DOM supporting both dynamic hostname subdomains (e.g. `brand.demo.virtualtrail.ai`) and path route segments (e.g. `/brand`).
- Created a central Brand Directory selector landing page on the root domain `/` for clean client sandboxing selection.
- Created dynamic header navbar and UI page shells adapting brand-level colors, titles, logos, and banners from config files.
- Integrated the production `widget.js` script dynamically to launch modal, photo upload, and status polling flows with zero code duplication.
- Created `metaService` to dynamically switch favicon, page title, mobile browser theme color, and OpenGraph/Twitter SEO tags when swapping between brand pages.
- Created shared placeholder asset directory (`public/assets/placeholders/`) with generic logo, banner, and garment graphics.
- Added a sticky top warning banner for sandboxing mode.
- Created dynamic SPA routing redirects for Cloudflare Pages edge deploys.
- Documented onboarding checklists, asset dimensions, directories, and rules in the project README.md.
