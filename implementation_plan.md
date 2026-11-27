# LedgerPOS — Business Management & Point of Sale Software

LedgerPOS is a unified retail and small-business operations platform combining a fast Point-of-Sale (POS) checkout register, real-time inventory tracking, customer directory, and sales ledger backed by persistent cloud database storage and authenticated user accounts.

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the confirmed choices below and confirm the recommended visual style and database setup before we begin building.

- **Confirmed Software Scope**: Business management and Point-of-Sale (POS) software covering live checkout, product inventory, sales invoices, customer tracking, and revenue analytics.
- **Confirmed Persistence & Accounts**: Persistent cloud database storage with user accounts via Firebase Authentication (Google Sign-In) and Cloud Firestore. When you approve this plan, the next step will prompt you to confirm Firebase provisioning in the setup dialog so your live database is created.
- **Recommended Visual Style (Skipped in Q&A)**: **Clean Modern Light Ledger & POS Dashboard** — high-contrast crisp white surfaces on a cool neutral slate canvas with deep emerald primary actions, tabular monospace figures for all prices and quantities, and optional dark-mode toggle support.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces disconnected spreadsheets and paper ledgers with a single browser-based workspace where business owners and staff can ring up customer sales at a POS register, automatically deduct stock levels, issue itemized digital receipts, manage product catalogs and low-stock alerts, and review daily revenue performance.
- **Target Audience / Persona**: Retail shop owners, boutique managers, cafe/counter operators, and small-business proprietors who need reliable, real-time stock and sales tracking across sessions and devices.
- **Key Value**: Every completed checkout atomically records the itemized invoice and updates inventory counts in the cloud database, eliminating manual reconciliation errors and giving instant visibility into cashflow and restock priorities.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Authenticated Onboarding & Store Setup**:
   - Unauthenticated visitors see a focused sign-in screen explaining the workspace with a single **Sign in with Google** action.
   - First-time users complete a quick store profile setup (Business Name, Currency symbol, default Tax Rate %) and land directly on the **POS Register** or **Overview Dashboard**.
   - Empty states provide a one-click **Seed Sample Catalog** helper alongside **Add First Product** so you can test checkout immediately or start fresh.

2. **Point of Sale (POS) Checkout Flow**:
   - Left/center catalog grid displays searchable products (by name or SKU) with segmented category filter tabs.
   - Clicking a product card adds it to the active **Order Cart** rail on the right; stock limits are enforced inline so items cannot be oversold.
   - Inside the Order Cart, the operator adjusts quantities, applies an optional discount, optionally links a customer profile, chooses a payment method (`Cash`, `Card`, `Mobile Pay`), enters cash tendered (with live change calculation), and clicks **Complete Sale**.
   - Completing a sale writes the order and updates product stock simultaneously, then opens a clean **Receipt Preview** with print support and a one-click **New Sale** reset.

3. **Inventory, Sales Ledger & Customer Management**:
   - **Inventory View**: High-density sortable table (`36px–44px` rows) with live search, stock status filter (`All`, `Low Stock`, `Out of Stock`), and inline **Add Product** / **Edit** / **Restock** drawers.
   - **Sales Ledger**: Searchable invoice history filtered by date window or payment type; clicking any invoice opens its full itemized receipt and allows authorized voiding (which restores stock).
   - **Customers & Overview**: Customer directory tracking contact details, order count, and lifetime spend, paired with an Overview dashboard showing 4 core KPIs, daily revenue trends, and top-selling items.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian precision inspired by modern retail POS terminals and accounting ledgers—calm, high-legibility surfaces with zero decorative clutter.
- **Color Palette & Mood (60-30-10 Rule)**:
  - *60% Dominant Neutral Canvas*: Cool slate off-white (`#F8FAFC`) workspace background with crisp `#FFFFFF` structural panels.
  - *30% Structural Surfaces*: `1px` hairline borders (`#E2E8F0`), muted slate secondary text (`#475569`), and subtle row hover states (`#F1F5F9`).
  - *10% Accent & Semantic Budget*: Deep Emerald (`#059669`) reserved strictly for primary CTAs (`Complete Sale`, `Add Product`) and active navigation states; Amber (`#D97706`) paired with explicit `"Low Stock"` text labels; Crimson (`#DC2626`) paired with explicit `"Out of Stock"` / `"Voided"` labels.
- **Typography & Tabular Discipline**:
  - *Display & Navigation*: `Plus Jakarta Sans` (SemiBold 600 / Bold 700) for crisp workspace headers and section titles.
  - *Body & Tables*: `Public Sans` (Regular 400 / Medium 500) at `13px–15px` for dense scannability.
  - *Financials & Quantities*: `JetBrains Mono` with `font-variant-numeric: tabular-nums` on every price, tax figure, SKU, invoice ID, and stock count so columns align vertically without layout jitter.
- **Layout & Component Structure**:
  - Fixed `256px` left sidebar navigation (`POS Register`, `Overview`, `Inventory`, `Sales Ledger`, `Customers`, `Store Settings`) + single-row breadcrumb top bar with contextual primary action + spacious main viewport.
  - Flat single-elevation containers bounded by `1px` hairline borders (no nested card-within-card boxes, no pill badge clutter on table metadata).
  - Full state completeness across every table and view: populated rows, helpful empty states with direct CTAs, skeleton row placeholders during initial cloud sync, and live client-side filtering.

### Interactive Feedback & Motion

- Fast `150ms` cubic-bezier transitions on cart item additions, tab switches, and slide-over receipt/form drawers (`transform` and `opacity` only).
- Non-blocking toast confirmations for completed sales, restocks, and profile updates, plus clear inline validation errors on forms.

---

## 3. Key Product Decisions & Trade-Offs

- **Database & Auth Strategy (Cloud Firestore + Firebase Auth)**
  - *Chosen Approach*: Client-side Firebase SDK with Google Authentication, strict owner-scoped Firestore Security Rules, and atomic batched writes during checkout.
  - *Why*: Meets your requirement for persistent multi-session database storage and user accounts while giving real-time UI updates across POS, inventory, and ledger views without maintaining a custom database server.
  - *Alternatives Considered*: Browser `localStorage` (rejected because data is lost across devices/browsers) and custom SQL backend (unnecessary overhead since no relational SQL engine was requested).

- **Atomic Checkout & Stock Deduction**
  - *Chosen Approach*: Execute order creation, customer spend increment, and product stock decrements together inside a Firestore `writeBatch` / transaction.
  - *Why*: Prevents inconsistent state where an invoice is recorded without deducting stock (or vice versa) if a network hiccup occurs mid-sale.
  - *Alternatives Considered*: Sequential individual writes (rejected due to partial-failure risk).

- **Order Line Items Modeling**
  - *Chosen Approach*: Snapshot product name, SKU, and unit price onto each sale's line items at the moment of purchase, rather than referencing live product prices.
  - *Why*: Historical invoices and tax totals remain accurate even if you later change a product's price or archive the product from your catalog.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                      Firebase Cloud Backend                           │
│  ┌──────────────────────┐       ┌──────────────────────────────────┐  │
│  │ Firebase Auth        │       │ Cloud Firestore (Owner-Scoped)   │  │
│  │ (Google Sign-In)     │       │ • stores/{uid} (settings/meta)   │  │
│  └──────────┬───────────┘       │ • stores/{uid}/products/{id}     │  │
│             │                   │ • stores/{uid}/sales/{id}        │  │
│             │                   │ • stores/{uid}/customers/{id}    │  │
│             │                   └────────────────▲─────────────────┘  │
└─────────────┼────────────────────────────────────┼────────────────────┘
              │ Auth State & ID Token              │ Real-time Listeners
              ▼                                    │ & Atomic Batches
┌──────────────────────────────────────────────────┴────────────────────┐
│                   React Workspace Shell & Providers                   │
│  ┌───────────────────┐   ┌─────────────────────────────────────────┐  │
│  │ FirebaseProvider  │   │ App Navigation Shell                    │  │
│  │ • Auth Gate       ├──►│ • 256px Sidebar + Breadcrumb Top Bar    │  │
│  │ • ErrorBoundary   │   │ • Store Context (Currency, Tax, Profile)│  │
│  └───────────────────┘   └────────────────────┬────────────────────┘  │
└───────────────────────────────────────────────┼───────────────────────┘
                                                │
       ┌────────────────┬───────────────────────┼───────────────┬────────────────┐
       ▼                ▼                       ▼               ▼                ▼
┌──────────────┐ ┌──────────────┐      ┌───────────────┐ ┌─────────────┐ ┌──────────────┐
│ POS Register │ │   Overview   │      │   Inventory   │ │Sales Ledger │ │  Customers   │
│ • Search/Cat │ │ • 4 KPIs     │      │ • Stock Table │ │• Order List │ │• Directory   │
│ • Cart Rail  │ │ • Daily Chart│      │ • Add/Edit    │ │• Receipt    │ │• Spend Stats │
│ • Checkout   │ │ • Top Items  │      │ • Restock     │ │• Void Order │ │• Quick Link  │
└──────────────┘ └──────────────┘      └───────────────┘ └─────────────┘ └──────────────┘
```

### Data Model & State

- **Store Profile (`stores/{storeId}`)**: Business name, currency symbol/code, default tax rate percentage, receipt footer note, owner UID, and timestamps.
- **Products (`stores/{storeId}/products/{productId}`)**: SKU, product name, category, unit price, cost price, current stock count, low-stock threshold, active/archived flag, and timestamps.
- **Sales / Invoices (`stores/{storeId}/sales/{saleId}`)**: Human-readable invoice number, bounded array of snapped line items (`productId`, `name`, `sku`, `qty`, `unitPrice`, `lineTotal`), subtotal, discount amount, tax amount, grand total, payment method (`cash` | `card` | `mobile`), cash tendered, change due, optional linked customer ID/name, status (`completed` | `voided`), and server timestamp.
- **Customers (`stores/{storeId}/customers/{customerId}`)**: Full name, phone, email, optional notes, total orders count, total lifetime spend, and timestamps.

### Interactive Component & State Mapping

- **POS Register**: Real-time `onSnapshot` subscription to active products and customers; client-side cart state validates `qty <= product.stock` before submission; checkout triggers a single atomic Firestore batch creating the sale document, decrementing each item's `stock`, and updating customer totals if selected.
- **Inventory Table**: Real-time filtered view by search query and stock state (`All`, `Low Stock`, `Out of Stock`); product modal enforces schema bounds (`maxLength`, non-negative prices/stock) before Firestore writes; quick restock action increments stock cleanly.
- **Sales Ledger**: Real-time ordered query of invoices; clicking an invoice opens a receipt modal with `window.print()` styling; voiding an active sale updates status to `voided` (terminal state locked in security rules) and atomically restores item stock.
- **Security & Error Boundary**: Every collection is protected by hardened owner-scoped Firestore Security Rules (`request.auth.uid == storeId`, verified user checks, strict field allowlists, and `request.time` timestamp enforcement) paired with structured `handleFirestoreError` logging and a top-level React `ErrorBoundary`.
