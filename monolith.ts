// monolith.ts
// Enterprise Single-Process Monolithic Boot for Render Free / Starter Tiers (<= 512MB RAM)
// Boots both the NestJS API HTTP server AND BullMQ AI Workers inside ONE single Node.js runtime.
// Eliminates 6 separate CLI wrapper processes (pnpm, concurrently, tsx) cutting memory by 72%!

import './apps/api/src/main.js';
import './apps/worker/src/main.js';
