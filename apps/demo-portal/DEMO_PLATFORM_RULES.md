# DEMO_PLATFORM_RULES.md

# Demo Platform Development Rules

## Purpose

This project is **NOT** part of the production Virtual Try-On platform.

This is a completely independent demo application whose only purpose is allowing prospective clients to test the AI Virtual Try-On experience.

The production platform is already live.

Nothing in this task should negatively affect the production system.

---

The Demo Platform is a consumer of the Production Platform, not an extension of it.

The demo application must never require changes to the production application in order to support new demo brands. All demo-specific functionality, configuration, branding, assets, and routing must remain inside the demo application.


# Rule 1 — Production Safety (Highest Priority)

The production application is strictly protected.

The following must NEVER be modified.

* apps/api
* apps/worker
* apps/widget
* libs/*
* prisma/
* database schema
* BullMQ
* Redis
* Segmind integration
* Gemini integration
* authentication
* middleware
* production routes
* existing frontend
* deployment configuration

If any modification appears necessary:

STOP.

Explain why.

Do not continue.

---

# Rule 2 — Build a Completely Separate Project

Create an independent demo application.

Example:

demo-portal/

This project must have its own:

* package.json
* routing
* components
* assets
* styling
* configuration
* deployment

The demo application must not become part of the production application.

---

# Rule 3 — Existing Backend Only

The demo application MUST use the existing production backend.

Never create:

* new API
* new Worker
* new Queue
* new Redis
* new Database
* new Storage
* new AI pipeline

Architecture:

Demo Frontend

↓

Existing Production API

↓

Existing Worker

↓

Fitroom /segmind

↓

Result

---

# Rule 4 — Never Duplicate Business Logic

Reuse existing APIs.

Reuse existing processing.

Reuse existing polling.

Reuse existing upload flow.

Reuse existing response handling.

Do not rewrite backend functionality.

---

# Rule 5 — Brand Isolation

Each brand must have its own page.

Example

/effilo

/onhete

/october

Each page must display ONLY that brand.

Never show products from another brand.

Never leak another client's branding.

---

# Rule 6 — Configuration Driven

Never hardcode brands inside components.

Every brand must be loaded from configuration.

Adding a new client should require only:

* logo
* colors
* description
* product images
* product ids
* tenant id

No application code should change.

---

# Rule 7 — Future Scalability

The architecture must support:

10 brands

25 brands

50 brands

100+

without restructuring the project.

---

# Rule 8 — Folder Structure

The project must have a scalable structure.

Separate:

brand configs

brand assets

components

layouts

pages

services

routing

utilities

styles

shared UI

Never mix brand assets with shared assets.

---

# Rule 9 — Security

Never expose

API Keys

Tenant Secrets

Worker Secrets

Database Credentials

Redis Credentials

Segmind Keys

Fitroom keys

Gemini Keys

Everything sensitive remains inside the production backend.

---

# Rule 10 — Deployment

Deploy ONLY the demo frontend.

Recommended:

Cloudflare Pages

or

Vercel

Never deploy another backend.

---

# Rule 11 — Performance

Optimize for:

Fast loading

Lazy loading

Responsive images

Small bundle size

Minimal JavaScript

---

# Rule 12 — UI

Premium quality.

Responsive.

Professional.

Simple.

Brand focused.

No unnecessary animations.

---

# Rule 13 — Discovery First

Before implementation:

Analyze existing project.

Identify reusable API endpoints.

Identify reusable widget logic.

Identify reusable frontend utilities.

Produce a discovery report.

Only then begin implementation.

---

# Rule 14 — Deliverables

The agent must return

Discovery Report

Architecture

Folder Structure

Routing Strategy

Brand Configuration Strategy

Deployment Strategy

Validation Checklist

Implementation Plan

before writing production code.

---

# Rule 15 — Absolute Restriction

This task is ONLY about building the demo frontend.

It is NOT a refactor.

It is NOT a migration.

It is NOT a backend rewrite.

It is NOT a production improvement.

Any change outside the demo application is forbidden unless explicitly approved.

---

# Rule 16 — Demo Platform Ownership Rule

The Demo Platform owns **ONLY** presentation.

It never owns, alters, or duplicates:
* business logic
* authentication
* AI logic
* upload logic
* polling logic
* tenant validation
* queue handling
* image processing

Everything above belongs exclusively to the production platform. The Demo Platform is responsible only for:
* branding
* routing
* UI components
* assets
* presentation

---

# Rule 17 — Brand Deletion Rule

Every demo brand must be removable without affecting any other demo brand or requiring application code changes.

Deleting one brand must only require:
1. Deleting its asset folder (`public/assets/brands/[brandId]/`)
2. Removing its JSON entry from `brands.json`

No application code should require modification.

---

# Rule 18 — Brand Independence Rule

Every demo brand must be completely independent.

Removing one brand must require only:
* deleting its asset folder (`public/assets/brands/[brandId]/`)
* removing its configuration entry in `brands.json`

No other files should require modification. Adding a new brand must follow the same principle. The application architecture must remain configuration-driven at all times.

---

# Rule 19 — Production Compatibility Rule

The Demo Platform must always consume the current production APIs exactly as they exist.

The Demo Platform must never require production API changes solely to support demo functionality. If a new demo requirement would require changing production APIs, that requirement must be reviewed and approved separately.

---

# Rule 20 — Placeholder Asset Rule

Shared placeholder assets must exist in a single shared location (`public/assets/placeholders/`).

Brand folders should reference shared placeholders until official client assets are available. Once a client supplies official assets, only that client's configuration (`config.json` and directory assets) should be updated.

Placeholder assets should never be duplicated across multiple brand folders.

---

# Rule 21 — Asset Replacement Rule

Every client brand must initially reference the shared placeholder assets.

When official client assets become available, only that client's `config.json` should be updated to reference the new assets.

No application code, routing, components, layouts, services, or build configuration should require modification when replacing placeholder assets with official client assets. This guarantees that onboarding future brands remains a content update rather than a development task.





