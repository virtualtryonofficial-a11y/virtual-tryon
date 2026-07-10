# Development Plan — AI Virtual Try-On (2–3 Day Sprint)

> Full-focus mode. AI agents (Antigravity) handle implementation. You direct, review, and unblock.
> No Docker. No OpenAI. All services are managed cloud or local Node processes.

---

## Before you start — provision these in 30 minutes

Do this before Day 1 so agents are never blocked waiting on credentials.

| Service | Action | Time | Cost |
|---|---|---|---|
| **Neon** | Create project → copy `DATABASE_URL` | 3 min | Free |
| **Upstash** | Create Redis DB → copy `REDIS_URL` | 3 min | Free |
| **Cloudflare R2** | Create bucket `tryon-assets` → create API token → copy keys | 5 min | Free |
| **Cloudflare Pages** | Connect widget repo (placeholder branch is fine for now) | 5 min | Free |
| **Railway** | Create project → link GitHub repo | 5 min | $5/mo |
| **Google AI Studio** | Go to aistudio.google.com → "Get API key" → copy `GEMINI_API_KEY` | 2 min | Free |
| **Segmind** | Sign up → copy `SEGMIND_API_KEY` | 3 min | Pay-per-call |
| **Shopify Partners** | Create app → copy API key + secret | 10 min | Free |

Put all keys into `.env` at repo root. Agents read from it.

**Do not set up OpenAI.** Gemini Flash replaces it at zero cost.

---

## Day 1 — Infrastructure + core API (8–10 hours)

Goal: API live on Railway, database migrated, a try-on job can be queued and processed end-to-end (stubbed Segmind is fine for Day 1).

---

### Block 1 — Repo + monorepo setup (1 hour)

**You do:**
- Create GitHub repo `tryon-saas`
- Init pnpm workspaces

**Agent task — `AGENT_TASK_001`:**
```
Set up a pnpm monorepo with workspaces:
  apps/api      (NestJS)
  apps/worker   (standalone Node, no framework)
  apps/widget   (Vite + React)
  libs/db       (Prisma)
  libs/queue    (BullMQ definitions)
  libs/ai       (Segmind + Gemini clients + image utils)
  libs/storage  (Cloudflare R2 wrapper using @aws-sdk/client-s3)
  libs/config   (typed env var reader)

Root package.json scripts:
  dev:api    → nest start --watch
  dev:worker → tsx watch apps/worker/src/main.ts
  dev        → concurrently "pnpm dev:api" "pnpm dev:worker"

TypeScript strict mode everywhere.

Install these packages at root:
  sharp          (image compression)
  @google/generative-ai  (Gemini SDK — do NOT install openai)
  axios
  pino
  zod
  bullmq
  @aws-sdk/client-s3
  @aws-sdk/s3-request-presigner
```

**Checkpoint:** `pnpm install` succeeds, workspace links resolve, `tsc --noEmit` passes.

---

### Block 2 — Typed config + database (1 hour)

**Agent task — `AGENT_TASK_002`:**
```
libs/config/src/index.ts:
  Export typed config object. Use requireEnv(key) helper that throws on missing key.
  Fields:
    database.url
    redis.url
    r2.accountId, r2.accessKeyId, r2.secretAccessKey, r2.bucketName, r2.publicUrl
    segmind.apiKey
    gemini.apiKey          ← NOT openai
    shopify.apiKey, shopify.apiSecret
    jwt.secret
    admin.apiKey

libs/db — Prisma:
  1. Write prisma/schema.prisma exactly as in architecture.md
  2. Generate Prisma client
  3. Export singleton PrismaClient from libs/db/src/index.ts
  4. Run: npx prisma migrate dev --name init  (against Neon DATABASE_URL)

Export typed repository functions:
  createTenant(data)
  getTenantById(id)
  getTenantByDomain(domain)
  getTenantConfig(tenantId)
  createTryonRequest(data)
  updateTryonRequest(id, data)
  getTryonRequest(id)
  getTryonRequestsForCleanup(userImageOlderThanMs, generatedImageOlderThanMs)
  createAuditLog(data)
```

**Checkpoint:** `npx prisma studio` shows all tables. `getTenantConfig('nonexistent')` returns null (not throws).

---

### Block 3 — AI clients + image compression (1 hour)

**Agent task — `AGENT_TASK_003`:**
```
libs/ai/src/gemini.client.ts:
  Use @google/generative-ai SDK.
  Model: gemini-2.0-flash
  
  export async function generateCompliment(params: {
    tone: 'friendly' | 'luxury' | 'playful'
  }): Promise<{ compliment: string; score: number }>
  
  System prompt (exact):
    "You are a fashion stylist AI.
     Only compliment the clothing, outfit, and styling choices.
     Never mention body shape, weight, skin tone, attractiveness, race, or age.
     Keep the compliment under 20 words.
     Return ONLY valid JSON. No markdown. No explanation."
  
  Prompt suffix: 'Return exactly: {"compliment": "...", "score": 8.5} Score range: 6.0 to 9.9'
  max_output_tokens: 80
  timeout: 10s
  
  On JSON parse failure → return fallback { compliment: '✨ This outfit looks amazing on you!', score: 8.0 }
  NEVER throw — a bad compliment must not fail the job.

libs/ai/src/segmind.client.ts:
  export async function generateTryOn(payload: {
    userImageUrl: string
    garmentImageUrl: string
    model: string
  }): Promise<{ imageBuffer: Buffer }>
  
  Use axios, 60s timeout.
  Validate response with zod before returning.
  Throw SegmindError on non-200 or unexpected response shape.

libs/ai/src/image.utils.ts:
  export async function compressForTryOn(inputBuffer: Buffer): Promise<Buffer>
  
  Use sharp:
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
  
  Log original size vs compressed size at debug level.

libs/queue/src/index.ts:
  Export typed BullMQ Queue and Worker factory.
  
  export interface TryonJobPayload {
    requestId: string
    tenantId: string
    productImageUrl: string
    userImageKey: string
    config: {
      segmindModel: string
      complimentTone: 'friendly' | 'luxury' | 'playful'
    }
  }
  
  export const QUEUE_NAMES = { TRYON: 'tryon-queue', CLEANUP: 'cleanup-queue' }
  
  export const JOB_OPTIONS = {
    TRYON: { attempts: 3, backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: 100, removeOnFail: 200 }
  }
```

**Checkpoint:** Write a small test script that calls `generateCompliment({ tone: 'friendly' })` with a real Gemini key. It should return `{ compliment: string, score: number }` in under 3 seconds.

---

### Block 4 — NestJS API (3 hours)

**Agent task — `AGENT_TASK_004`:**
```
apps/api modules:

1. TenantsModule
   TenantGuard: reads tenantId from body/param, fetches from DB, caches Redis 5min, attaches to req
   GET /v1/tenant/:tenantId/config → { primaryColor, complimentTone, logoUrl, features }

2. TryonModule
   POST /v1/tryon
     Body: { tenantId, productId, userImage: base64 }
     Steps:
       a. Decode base64 → Buffer
       b. Magic byte validation (jpg/png/webp only)
       c. Size check (<5MB)
       d. compress via compressForTryOn() — compress BEFORE uploading
       e. Resolve tenant via TenantGuard
       f. Resolve product (must belong to tenant)
       g. Create TryonRequest (status=queued)
       h. Upload compressed buffer → R2: {tenantId}/uploads/{requestId}
       i. Enqueue to tryon-queue
       j. Return { jobId: requestId }

   GET /v1/tryon/:jobId?tenantId=xxx
     a. Check Redis tryon:{jobId}:status first
     b. If miss: fetch TryonRequest from DB (must belong to tenant)
     c. If completed: generate signed URL for generatedImageKey (1hr expiry)
     d. Return { status, imageUrl?, compliment?, styleScore?, complimentCached? }

3. ShopifyModule — OAuth + ScriptTag (see Block 9)

4. Global config:
   - Helmet, CORS (origin: * for MVP)
   - ThrottlerModule: 10 req/min per IP on /v1/tryon (NestJS @nestjs/throttler)
   - Pino logger (nestjs-pino)
   - Global exception filter → { error: string, requestId: string }
   - Request ID middleware (uuid per request, in response header X-Request-Id)
   - Bull Board at /admin/queues (check ADMIN_API_KEY header)
   - GET /health → { status: 'ok', db: 'ok', queue: 'ok' }
```

**Checkpoint:** `curl -X POST /v1/tryon` with a valid base64 JPEG returns `{ jobId }`. `GET /v1/tryon/:jobId` returns `{ status: "queued" }`.

---

### Block 5 — AI Worker (2 hours)

**Agent task — `AGENT_TASK_005`:**
```
apps/worker/src/main.ts — standalone Node process:

Processor for tryon-queue:

async function processTryOn(job: Job<TryonJobPayload>) {
  const start = Date.now()
  const { requestId, tenantId, productImageUrl, userImageKey, config } = job.data

  // 1. Mark processing
  await updateTryonRequest(requestId, { status: 'processing' })

  // 2. Get user image (already compressed — uploaded compressed in API)
  const userImageUrl = await r2.getSignedUrl(userImageKey)

  // 3. Check compliment cache BEFORE calling Segmind
  //    Key: compliment:{tenantId}:{productId from job payload}:{tone}
  //    Note: add productId to TryonJobPayload for this
  const cacheKey = `compliment:${tenantId}:${job.data.productId}:${config.complimentTone}`
  const cachedCompliment = await redis.get(cacheKey)
  let complimentResult: { compliment: string; score: number } | null = null
  let complimentCached = false
  if (cachedCompliment) {
    complimentResult = JSON.parse(cachedCompliment)
    complimentCached = true
  }

  // 4. Call Segmind
  const { imageBuffer } = await segmind.generateTryOn({
    userImageUrl,
    garmentImageUrl: productImageUrl,
    model: config.segmindModel,
  })

  // 5. Upload generated image
  const generatedKey = `${tenantId}/generated/${requestId}`
  await r2.upload(generatedKey, imageBuffer, 'image/jpeg')

  // 6. Call Gemini (only if not cached)
  if (!complimentResult) {
    complimentResult = await gemini.generateCompliment({ tone: config.complimentTone })
    await redis.set(cacheKey, JSON.stringify(complimentResult), 'EX', 86400)
  }

  // 7. Save results
  const elapsed = Date.now() - start
  await updateTryonRequest(requestId, {
    status: 'completed',
    generatedImageKey: generatedKey,
    compliment: complimentResult.compliment,
    styleScore: complimentResult.score,
    processingTimeMs: elapsed,
    complimentCached,
  })

  // 8. Cache job status (reduces DB reads during widget polling)
  await redis.set(`tryon:${requestId}:status`, 'completed', 'EX', 180)

  logger.info({ requestId, tenantId, elapsed, complimentCached }, 'tryon_completed')
}

Cleanup processor (BullMQ repeat job, every day at 02:00):
  const records = await getTryonRequestsForCleanup(24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000)
  for each record:
    if userImageKey and older than 24h → r2.delete(userImageKey), db.update(userImageKey=null)
    if generatedImageKey and older than 7d → r2.delete(generatedImageKey), db.update(generatedImageKey=null)

Add productId to TryonJobPayload in libs/queue/src/index.ts (needed for compliment cache key).
```

**Checkpoint:** Manually enqueue a job via Bull Board → worker processes it → DB shows `status=completed`, `complimentCached=false`. Enqueue same product again → `complimentCached=true`.

---

### Block 6 — Deploy to Railway (1 hour)

**You do:**
1. Push to GitHub
2. Railway: create two services from the same repo
   - `api`: build command `pnpm --filter api build`, start `pnpm --filter api start:prod`
   - `worker`: start `pnpm --filter worker start`
3. Add all env vars from `.env` to both services in Railway dashboard
4. Note the generated `.up.railway.app` URL

**Checkpoint:** `curl https://your-api.up.railway.app/health` returns `{ status: "ok" }`.

---

## Day 2 — Widget + Shopify + end-to-end (8–10 hours)

Goal: A real Shopify product page shows the Try-On button, customer can upload a photo and get a result.

---

### Block 7 — Widget (3 hours)

**Agent task — `AGENT_TASK_006`:**
```
apps/widget — Vite + React + TypeScript, IIFE bundle output

Entry main.tsx:
  window.TryOnWidget = {
    init({ tenantId, productId }) {
      // 1. fetch GET /v1/tenant/:tenantId/config
      // 2. inject "Try it on" button into page
      // 3. mount React app into isolated div
    }
  }

Build target: single widget.js, IIFE format, <60kb gzip

State machine (Zustand):
  idle → uploading → queued → polling → completed | failed | timeout

Components:
  TryOnButton   pill button, uses tenant primaryColor from config
  Modal         fullscreen on mobile (<768px), 480px centered on desktop
  UploadTab     drag-drop + file input + thumbnail preview
  CameraTab     getUserMedia facingMode:'user', capture, retake
  ProcessingView spinner + step messages: "Uploading..." → "Generating..." → "Adding finishing touches..."
  ResultView    generated image (full width) + compliment text + score badge (e.g. "Style Score: 8.5")
                + download button + close button

Polling (usePolling.ts):
  interval: 3000ms  ← NOT 2000, saves Upstash commands
  max attempts: 40  (2 minutes)
  stop immediately on status=completed or status=failed
  on timeout: show "This is taking longer than usual. Please try again."

On error states:
  failed   → "Something went wrong. Please try again." + retry button
  timeout  → "This is taking longer than usual. Please try again."
  upload failed → show specific validation message from API

Widget must not:
  - Change document.body styles
  - Intercept global scroll/click events
  - Expose tenantId or any key in JS globals
```

**Checkpoint:** `pnpm --filter widget dev` → open test.html calling `TryOnWidget.init()` → click button → modal opens → upload photo → polling starts → result shows.

---

### Block 8 — Widget CDN deploy (30 min)

**You do:**
1. `pnpm --filter widget build` → produces `dist/widget.js`
2. Push to GitHub
3. Cloudflare Pages auto-deploys from `apps/widget/dist`
4. Note URL: `https://tryon.pages.dev/widget.js`

---

### Block 9 — Shopify app + ScriptTag (2 hours)

**Agent task — `AGENT_TASK_007`:**
```
Complete ShopifyModule in apps/api:

GET /shopify/install?shop=store.myshopify.com
  → build Shopify OAuth URL with scopes, redirect

GET /shopify/callback?code=...&shop=...&hmac=...
  → verify hmac (HMAC-SHA256 of query string minus hmac, using SHOPIFY_API_SECRET)
  → exchange code: POST https://{shop}/admin/oauth/access_token
  → upsert Tenant { name: shop, shopifyDomain: shop, features: ['tryon'] }
  → upsert TenantConfig (defaults)
  → store access token in Redis: shopify:{shop}:token TTL 86400
  → inject ScriptTag:
      POST https://{shop}/admin/api/2024-01/script_tags.json
      { "script_tag": { "event": "onload", "src": "https://tryon.pages.dev/widget.js" } }
  → save tenantId as shop metafield:
      POST https://{shop}/admin/api/2024-01/metafields.json
      { "metafield": { "namespace": "tryon", "key": "tenant_id", "value": tenant.id, "type": "single_line_text_field" } }
  → redirect to success page

POST /shopify/webhooks
  → verify X-Shopify-Hmac-SHA256 header
  → handle app/uninstalled: mark tenant inactive
  → handle products/delete: soft-delete product record
```

**You do:**
1. Shopify Partners dashboard → App URL: `https://your-api.up.railway.app/shopify/install`
2. Redirect URL: `https://your-api.up.railway.app/shopify/callback`
3. Install on a dev store

**Checkpoint:** Install app on dev store → visit product page → "Try it on" button appears → full flow works end-to-end with real Segmind + Gemini calls.

---

### Block 10 — End-to-end testing (2–3 hours)

**You run these tests manually:**

| Test case | Expected result |
|---|---|
| Upload valid JPG | jobId returned, polling starts |
| Upload PNG > 5MB | 400 with "Image must be under 5MB" |
| Upload PDF file | 400 with "Image must be JPG, PNG, or WebP" |
| Upload JPG, wait for result | Generated image + compliment + score appears |
| Same product, second try-on | `complimentCached: true` in DB (no Gemini call) |
| Segmind timeout (mock by setting API key to wrong value) | After 3 retries: failed status, widget shows retry message |
| Two different tenants | Completely separate data, separate brand config |
| Mobile at 375px | Modal fills screen, camera tab works |
| 11th try-on from same IP in one minute | 429 response |
| Click X during processing | Modal closes cleanly, no memory leak |

Fix bugs with agent help. Keep tasks specific.

---

## Day 3 — Polish + hardening (4–6 hours)

Goal: Stable enough to demo to a brand. Every error state handled gracefully.

---

### Block 11 — Error handling + UX polish (2 hours)

**Agent task — `AGENT_TASK_008`:**
```
Worker improvements:
  - Log per-step timing: segmind_ms, gemini_ms (0 if cached), upload_ms, total_ms
  - If Segmind returns non-image data: throw SegmindError immediately, don't retry
  - If sharp compression fails: upload original buffer (don't fail the job)

Widget improvements:
  - Progress steps during processing with animated transitions:
      step 1: "Uploading your photo..."
      step 2: "Generating your look..."  (after 5s)
      step 3: "Adding finishing touches..."  (after 15s)
  - Download button in ResultView: fetch signed URL → trigger browser download
  - Result view: show "Powered by AI" badge (small, subtle)
  - Score display: show as e.g. "✨ 8.5 / 10" not just a number

API improvements:
  - All error responses include { error: string, requestId: string }
  - Log every error with requestId so Sentry → Railway logs are traceable
  - GET /health checks: DB connection (SELECT 1), Redis ping, queue count
```

---

### Block 12 — Tenant onboarding API (1 hour)

**Agent task — `AGENT_TASK_009`:**
```
POST /admin/tenants
  Header: x-admin-key must match ADMIN_API_KEY
  Body: { name, shopifyDomain, features: ["tryon"] }
  Returns: { tenantId, apiKey }

POST /admin/tenants/:id/config
  Header: x-admin-key
  Body: { primaryColor?, complimentTone?, segmindModel?, logoUrl? }
  Partial update — only provided fields are changed

GET /admin/tenants/:id/analytics
  Returns:
    { totalTryons, completedTryons, failedTryons, avgProcessingTimeMs,
      complimentCacheHitRate, last7Days: [{ date, count }] }

This lets you onboard any brand in 2 API calls with no DB access.
```

---

### Block 13 — Monitoring setup (1 hour)

**You do:**
1. Add `SENTRY_DSN` to env vars → `npm install @sentry/node` → init in both API `main.ts` and worker `main.ts`
2. Railway: enable health check on `/health`, set restart policy to "Always" for worker
3. Upstash: enable email alert when daily command count > 8,000 (warn before hitting 10k limit)

**Agent task — `AGENT_TASK_010`:**
```
Add Bull Board to apps/api:
  npm install @bull-board/nestjs @bull-board/api @bull-board/express

  Mount at /admin/queues
  Protect with middleware: check x-admin-key header against ADMIN_API_KEY
  Register: tryon-queue, cleanup-queue

Add /admin/cost-estimate endpoint:
  GET /admin/cost-estimate?tenantId=xxx&days=30
  Returns:
    { totalTryons, estimatedSegmindCost, geminiCallsMade, geminiCallsSaved,
      complimentCacheHitRate, r2StorageObjects }
  
  This helps you show brand clients what they spent and what caching saved.
```

---

### Block 14 — Feature flag for Size Intelligence (30 min)

**Agent task — `AGENT_TASK_011`:**
```
In GET /v1/tenant/:tenantId/config response, include:
  { ..., features: string[] }   e.g. ["tryon"] or ["tryon", "size_intelligence"]

In widget main.tsx TryOnWidget.init():
  if (config.features.includes('tryon')) renderTryOnButton()
  if (config.features.includes('size_intelligence')) renderSizeButton()
  // renderSizeButton is a stub for now — just logs "Size Intelligence not yet implemented"

Both buttons will coexist on the same product page when a tenant has both features.
The Size Intelligence pipeline is a separate module — this task only adds the flag check.
```

---

## Daily rhythm

Start each day:
1. Check Railway logs for overnight errors
2. Check Bull Board for failed jobs
3. Assign agent tasks with `AGENT_TASK_XXX` labels

End each task:
1. Agent outputs checkpoint steps
2. You run the checkpoint
3. Only move on when it passes

---

## Risk log

| Risk | Mitigation |
|---|---|
| Segmind slow (>30s) | 60s timeout + BullMQ retry + widget shows step messages |
| Gemini rate limit (>1500 req/day on free tier) | Compliment cache hit rate should be >80% in practice — same garment across many customers |
| R2 CORS blocking widget image display | Set R2 bucket CORS: allow GET from `*` |
| Neon connection pooling on Railway | Add `?pgbouncer=true&connection_limit=1` to DATABASE_URL |
| Upstash 10k command limit | 3s polling (not 2s) + immediate stop on result keeps it well within limit |
| Widget bundle too large | `pnpm --filter widget build -- --report` → remove unused Tailwind classes |
| Shopify redirect URL mismatch | Copy the Railway URL character-for-character into Partners dashboard |

---

## Definition of done (end of Day 3)

- [ ] Widget loads on a real Shopify product page
- [ ] Customer can upload photo or use camera
- [ ] AI generates try-on image in under 30 seconds (p50)
- [ ] Compliment and style score appear on result
- [ ] Second try-on of same product uses cached compliment (no Gemini call)
- [ ] Two tenants work independently with different brand configs
- [ ] Failed jobs show friendly error in widget
- [ ] `/health` returns green
- [ ] Sentry capturing errors
- [ ] Cleanup processor deletes old R2 objects
- [ ] `/admin/cost-estimate` shows cache hit rate
- [ ] Size Intelligence feature flag wired (stub)
- [ ] No OpenAI dependency anywhere in codebase

---

## Block 15 — Lead Capture & AI Remarketing Platform

**Agent task — `AGENT_TASK_021`:**
```
Lead Capture & AI Remarketing Platform

Goal:
Transform Virtual-Trail from an AI Virtual Try-On tool into a Lead Generation & Remarketing Platform.

Every successful AI Try-On should become a qualified marketing lead that merchants can use for WhatsApp campaigns, abandoned cart recovery, personalized promotions, and future customer engagement.

The generated image must remain locked until the customer submits their contact information.
The feature must integrate with the existing Try-On pipeline without modifying the AI generation workflow.

Objectives:
Implement a complete Lead Capture module that:
- Collects customer details before revealing the generated image.
- Stores customer information securely.
- Associates every lead with its generated Try-On.
- Supports future WhatsApp marketing campaigns.
- Supports multi-tenant architecture.
- Requires no AI regeneration for future campaigns.

Existing Flow:
Customer Uploads Selfie
        │
        ▼
AI Generation
        │
        ▼
Generated Image
        │
        ▼
Customer Leaves
(Merchant loses the customer forever)

New Flow:
Customer Uploads Selfie
        │
        ▼
AI Generation
        │
        ▼
Generated Image Stored
        │
        ▼
Blurred Preview
        │
        ▼
Lead Capture (Name + Phone)
        │
        ▼
Lead Saved
        │
        ▼
Unlock Image
        │
        ▼
Customer Downloads
        │
        ▼
Merchant Can Reuse Same Image For WhatsApp Marketing
```

---

### AGENT_TASK_021A — Database

```
Create a new Lead entity.

Required fields:
- id
- tenantId
- tryonRequestId
- customerName
- phoneNumber
- countryCode
- marketingConsent
- consentTimestamp
- generatedImageKey
- originalImageKey
- productId
- productTitle
- status
- createdAt
- updatedAt

Requirements:
- Every Lead belongs to exactly one TryOnRequest.
- Every TryOnRequest may have only one Lead.
- No duplicate leads.
- Multi-tenant isolation must be enforced.

Checkpoint:
- Prisma migration succeeds.
- Relations verified.
```

---

### AGENT_TASK_021B — API

```
Extend existing APIs.

GET /v1/tryon/:jobId
When generation completes, return:
- status
- previewImage
- requiresLeadCapture
- unlockToken
(Do NOT return the original generated image)

Create POST /v1/leads
Body:
- tryonRequestId
- customerName
- phoneNumber
- countryCode
- marketingConsent

Validation:
- Tenant exists.
- Try-On exists.
- Try-On completed.
- Lead not already created.
- Phone number valid.

Store:
- Lead
- Generated image reference
- Original image reference

Return:
- unlockToken

Create POST /v1/tryon/unlock
Input:
- unlockToken

Return:
- Signed image URL
- Compliment
- Download URL

Checkpoint:
- Image cannot be accessed without creating a lead.
```

---

### AGENT_TASK_021C — Widget

```
Modify widget flow.

Current:
Upload → Processing → Result

New:
Upload → Processing → Blur Preview → Lead Capture → Unlock → Result

Lead Form Fields:
- Name
- Phone Number
- Country Code
- Checkbox: "I agree to receive WhatsApp updates and promotional messages."

Validation:
- Required fields.
- Phone format.
- Prevent duplicate submission.

Checkpoint:
- User cannot bypass the lead form.
```

---

### AGENT_TASK_021D — Merchant Dashboard

```
Create new module: Leads

Dashboard:
- Total Leads
- Today's Leads
- Leads by Product
- Marketing Ready Leads

Lead Details Display:
- Customer Name
- Phone
- Product
- Generated Image
- Original Selfie
- Try-On Date
- Marketing Consent

Checkpoint:
- Merchant can search and filter leads.
```

---

### AGENT_TASK_021E — WhatsApp Remarketing Foundation

```
Prepare the platform for future campaign automation.
Every Lead must contain enough information to reuse the original AI-generated image.

Future supported campaigns:
- Welcome Campaign
- Cart Recovery
- Festival Offers
- Price Drop
- Back In Stock
- New Collection
- Personalized Recommendations

The system must never regenerate AI images. Always reuse the previously generated image stored in Cloudflare R2.

Checkpoint:
- Generated image can be retrieved using the associated Lead record.
```

---

### AGENT_TASK_021F — Analytics

```
Track:
- Try-On Started
- Try-On Completed
- Lead Captured
- Image Unlocked
- Download Clicked
- Share Clicked

Merchant Analytics:
- Lead Conversion Rate
- Try-On Conversion Rate
- Leads Per Product
- Marketing Ready Leads

Checkpoint:
- Dashboard metrics update correctly.
```

---

### AGENT_TASK_021G — Security

```
Validate:
- Tenant ownership
- Try-On ownership
- Lead ownership
- Unlock token
- Signed image URLs
- Duplicate submissions

Never expose:
- Raw R2 paths
- Another tenant's images
- Another tenant's leads

Checkpoint:
- Tenant isolation verified.
```

---

### AGENT_TASK_021H — Production Readiness

```
Verify:
- Existing AI pipeline remains unchanged.
- Worker does not perform additional AI work.
- No increase in AI generation cost.
- Lead capture completes in under 300 ms.
- Unlock API uses existing generated assets only.
- All existing Try-On functionality continues to work.

Definition of Done:
- Customer details are captured before image unlock.
- Lead is linked to the TryOnRequest.
- Generated image remains protected until lead capture succeeds.
- Merchant can view all captured leads.
- Generated image can later be reused for WhatsApp marketing.
- Multi-tenant security is preserved.
- Existing AI generation pipeline remains unchanged.
- Ready for future WhatsApp automation.
```




