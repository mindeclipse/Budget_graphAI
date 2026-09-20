# 🏛️ BudgetGraph OS

> **A high-performance, local-first personal finance and wealth management PWA featuring zero-trust biometric authentication, intelligent cashflow forecasting, and an agentic AI financial co-pilot.**

---

## 📱 Application Preview

<div align="center">
  <img src="docs/screenshots/desktop-hero.png" alt="BudgetGraph OS Desktop Dashboard" width="900" />
  <p><em>Real-Time Pacing Engine, Daily Burn-Rate Forecasting Curve & Cycle Health</em></p>
</div>

<br />

<div align="center">
  <img src="docs/screenshots/desktop-ai-radar.png" alt="AI Financial Co-Pilot & Subscription Radar" width="900" />
  <p><em>Agentic AI Financial Co-Pilot (Gemini), Expense Structure & Automated Subscription Radar</em></p>
</div>

<br />

<div align="center">
  <img src="docs/screenshots/desktop-history.png" alt="Transaction Intelligence & History" width="900" />
  <p><em>Fuzzy Search, Context Hashtags (#trip, #weekend), and Transaction Breakdown</em></p>
</div>

<br />

<div align="center">
  <table border="0">
    <tr>
      <td width="35%" align="center" valign="top">
        <p><b>📱 Mobile-First PWA</b></p>
        <img src="docs/screenshots/mobile-pwa.png" alt="BudgetGraph OS Mobile PWA" width="290" />
      </td>
      <td width="65%" align="center" valign="top">
        <p><b>💎 Wealth, Goals & Cost-per-Use</b></p>
        <img src="docs/screenshots/desktop-wealth.png" alt="Wealth Management & Goals" width="580" />
      </td>
    </tr>
  </table>
</div>

---

## 🎯 What Problem Does This Solve?

Most personal finance apps suffer from one or more structural problems:

1. **Rigid Monthly Calendars:** Most trackers enforce a strict 1st-to-31st monthly view. Real financial life revolves around **dynamic income/paycheck cycles**, making traditional monthly envelopes inaccurate.
2. **Online-Only Dependence:** Cloud-first financial apps fail on mobile when you're in a basement store, parking garage, or subway with poor connectivity. Entering a purchase right at the point of sale is critical to staying on budget.
3. **Privacy Concerns:** Uploading intimate spending habits, receipts, and bank statements to closed third-party SaaS servers poses significant data privacy and security risks.
4. **Passive Dashboards vs. Active Intelligence:** Traditional apps act as passive ledgers. They tell you what you _already_ spent, but lack forward-looking intelligence, actionable advice, or automated multi-currency portfolio tracking.

### The Solution: BudgetGraph OS

**BudgetGraph OS** addresses these pain points directly:

- **Flexible Cycle-First Budgeting:** Budgets and burn-rates align with customizable income cycles with weighted weekday/weekend spending targets.
- **True Offline-First Architecture:** Instant interactions and offline transaction recording via client-side IndexedDB (Dexie.js), background sync queue, and resilient service worker caching.
- **Bank-Grade Security (Zero-Trust):** FIDO2/WebAuthn hardware biometrics (Face ID/Touch ID) with cryptographic stateless challenge tokens, client-side PBKDF2 offline PIN encryption, and strict PostgreSQL Row Level Security (RLS).
- **Multi-Modal AI Financial Partner:** Deeply integrated with Google Gemini (2.5/3.5/3.7 Flash) to analyze full-cycle financial health, parse receipts directly from images/PDFs (via Web Share Target), and interact natively through a Telegram bot.
- **Holistic Wealth Tracking:** Real-time multi-currency (UAH, USD, EUR, PLN) asset valuation, Inzhur REIT & Ukrainian Treasury Bonds (OVDP) support, asset depreciation (Cost-per-Use), and wishlist cooling-off tracking.

---

## 🏗️ Architecture & How It Works

BudgetGraph OS follows a **modern Local-First, Edge-Assisted Architecture** designed for speed, security, and offline resilience.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (PWA)                              │
│                                                                        │
│   ┌─────────────────────┐                 ┌────────────────────────┐   │
│   │ React 19 / Next.js  │ ◄─(Optimistic)─►│    Dexie.js (Cache)    │   │
│   │   App & State       │                 │   Offline Sync Queue   │   │
│   └──────────┬──────────┘                 └───────────┬────────────┘   │
│              │                                        │                │
│              │ (Biometrics / FIDO2)                   │ (When Online)  │
│              ▼                                        │                │
│   ┌─────────────────────┐                             │                │
│   │   WebAuthn Engine   │                             │                │
│   └─────────────────────┘                             │                │
└──────────────┬────────────────────────────────────────┼────────────────┘
               │ HTTPS / JSON / Streaming               │ Background Sync
               ▼                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EDGE / BACKEND (Next.js)                        │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │              Proxy & Security Boundary                         │   │
│   │    - Constant-time HMAC Session Validation                     │   │
│   │    - Sliding-Window In-Memory Rate Limiting                    │   │
│   │    - CSV / Formula Injection Sanitizer                         │   │
│   │    - Strict CSP (connect-src 'self')                           │   │
│   └──────────────────────┬─────────────────────────────────────────┘   │
│                          │                                             │
│       ┌──────────────────┼──────────────────┐                          │
│       ▼                  ▼                  ▼                          │
│  ┌─────────┐      ┌─────────────┐     ┌───────────┐                    │
│  │   API   │      │ AI Analysis │     │ Webhooks  │                    │
│  │ Routes  │      │   Pipeline  │     │ Engine    │                    │
│  └────┬────┘      └──────┬──────┘     └─────┬─────┘                    │
└───────┼──────────────────┼──────────────────┼──────────────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│   Supabase   │   │Google Gemini │    │   Telegram   │
│  PostgreSQL  │   │ Flash Models │    │  Bot Webhook │
│  (with RLS)  │   │ (Cascade)    │    │ & Canvas Gen │
└──────────────┘   └──────────────┘    └──────────────┘
```

### Core Architectural Layers

1. **Client & Presentation Layer:**
   - **Framework:** Next.js 16 (App Router) with React 19.
   - **Styling & Design System:** Tailwind CSS v4 with custom dark mode, fluid mobile ergonomics, bottom sheets, and safe-area insets.
   - **State Management & Caching:** TanStack React Query v5 provides server-state caching, optimistic UI updates, and stale-while-revalidate data synchronization.
   - **Data Visualization:** Recharts for responsive, animated velocity and burn-rate curves; custom Canvas/HTML-to-Image engines for shareable financial cards.

2. **Offline & Edge Layer:**
   - **Service Worker (`public/sw.js`):** Custom 3-tier caching (Network-First for APIs, Stale-While-Revalidate for static assets, Network-Only for auth).
   - **Offline Mutation Queue:** Queues mutations when offline, auto-replays and syncs when connectivity is restored, backed by visual offline banners.
   - **Proxy Guard (`src/proxy.ts`):** Enforces origin verification, anti-tampering headers, and strict Content Security Policy (`connect-src 'self'`).

3. **Security & Authentication Layer:**
   - **WebAuthn / FIDO2:** Implemented using `@simplewebauthn`. Supports biometric authenticators (Face ID, Touch ID, Windows Hello) and YubiKeys.
   - **Stateless Sealed Tokens:** Zero-DB-overhead authentication verification using HMAC-SHA256 encrypted cookies.
   - **Offline Cryptographic PIN:** Client-side PBKDF2 key derivation with 100,000 iterations and salt, with lockout thresholds protecting against physical theft.

4. **Intelligence Layer (Google Gemini Integration):**
   - **Resilient AI Pipeline:** Automatic failover across `gemini-3.5-flash`, `gemini-3.5-flash-lite`, and `gemini-3.7-flash`.
   - **Multi-Modal Vision:** Processes receipt photographs and bank statement PDFs (extracting vendor, totals, date, currency, line items) directly via mobile camera or OS Share Target.
   - **Comprehensive Context Window:** Ingests entire spending history, cashflow velocity, budget limits, and financial goals for nuanced advisory.

5. **Data & Storage Layer:**
   - **Database:** Supabase PostgreSQL with 100% table isolation enforced through Row Level Security (RLS).
   - **Migrations:** Versioned schema migrations covering financial expansions, audit logs, performance B-tree indexes, and soft-delete retention policies.

---

## ✨ Key Capabilities & Modules

### 1. Budgeting & Pacing

- **Custom Cycle Periods:** Set custom start/end dates for each budget period (aligned with your salary).
- **Weighted Pacing:** Automatically assigns higher spend expectations to weekends versus weekdays so your daily allowance is realistic.
- **Overspend Protection:** Visual gauges and real-time warnings when burn rate surpasses projected velocity.

### 2. Wealth & Asset Management

- **Multi-Asset Portfolio:** Track Real Estate (Inzhur REITs), Government Bonds (OVDP), Stocks, Crypto, Cash, and Bank Accounts.
- **Automated Currency Conversion:** Dynamic NBU / Monobank / PrivatBank rate fetching with local caching and fallback safeguards.
- **Cost-Per-Use (CPU) Calculator:** Quantify return-on-investment for major purchases by tracking cost per usage over time.
- **Wishlist with Cooling-Off Timer:** Curb impulsive spending with configurable cooling periods (e.g. 14 or 30 days) and track saved amounts when desires fade.

### 3. Smart Import & Automation

- **Bank Statement Parsers:** Drag-and-drop or upload PDF/CSV statements from Ukrainian banks (Monobank, PrivatBank) with automated noise-cleaning and transaction reconciliation.
- **Inzhur Integration:** Import official investment reports, automatically matching bank debits with broker credits.
- **Apple Shortcuts Endpoint:** Dedicated `/api/classify` endpoint to capture Apple Pay notification events and categorize transactions instantly.
- **Web Share Target:** Share images or PDFs from any app directly into BudgetGraph on iOS and Android.

### 4. Telegram Bot Companion

- **Real-Time Logging:** Submit expenses via text (e.g., `Кава 85`) or voice message.
- **Dynamic Infographics:** Receive rendered graphical budget cards directly in chat.
- **Interactive Queries:** Run "What-If" simulations (e.g. `What if I spend 4000 on a weekend trip?`) to preview the effect on your end-of-cycle runway.
- **Scheduled Automated Digests:** Receive proactive Friday weekend alerts and Monday reset summaries via cron tasks.

---

## 💻 Tech Stack

```
Runtime & Framework:     Next.js 16.3.4 (App Router, Turbopack)
Language:                TypeScript 5.9.3 (Strict Mode)
Frontend:                React 19.2.8, Tailwind CSS v4, Lucide Icons
State & Cache:           TanStack React Query v5, Dexie.js (IndexedDB)
Visualization:           Recharts 3.10.1, HTML5 Canvas
Database & Auth:         Supabase (PostgreSQL 15+), SimpleWebAuthn v14
AI / LLM:                Google GenAI SDK (@google/genai) — Gemini 2.5/3.5/3.7
Testing:                 Vitest 5.0.0 (484 tests), JSDOM
CI/CD & DevOps:          GitHub Actions, Vercel
```

---

## 📁 Repository Structure

```text
├── src/
│   ├── app/                          # Next.js App Router (Pages, Layouts, APIs)
│   │   ├── api/                      # 34 Serverless Route Handlers
│   │   │   ├── ai/                   # AI analysis & chat endpoints
│   │   │   ├── analytics/            # Budget pacing & Personal CPI
│   │   │   ├── auth/                 # WebAuthn & PIN endpoints
│   │   │   ├── cron/                 # Recurring jobs & proactive digests
│   │   │   ├── transactions/         # CRUD, batch imports, splits, restore
│   │   │   └── webhooks/             # Monobank & Telegram webhooks
│   │   ├── share-target/             # PWA Web Share Target receiver
│   │   ├── layout.tsx                # App shell, PWA metadata, theme config
│   │   └── page.tsx                  # Primary Dashboard entry point
│   ├── components/                   # Modular UI Components
│   │   ├── ai-drawer/                # AI Financial Advisor chat interface
│   │   ├── auth/                     # Biometrics & PIN login interfaces
│   │   ├── bank-statement/           # File drag-and-drop & parsing previews
│   │   ├── dashboard/                # Analytics widgets, cards, tabs
│   │   │   ├── budget-summary/       # Top header, KPI numbers
│   │   │   ├── burn-rate/            # Pacing and velocity charts
│   │   │   ├── category-breakdown/   # Category bars & budget modals
│   │   │   ├── investments/          # Asset cards, yield calculations
│   │   │   ├── mom-comparison/       # Month-over-month & CPI metrics
│   │   │   ├── savings-goals/        # Goal cards & deposit dialogues
│   │   │   └── subscription-radar/   # Recurring payments detector
│   │   ├── merchant-rules/           # Custom merchant categorization rules
│   │   └── split-transaction/        # Sub-transaction splitting interface
│   ├── hooks/                        # Custom React Hooks
│   │   ├── auth/                     # usePinAuth, useWebAuthn
│   │   ├── finance-queries/          # TanStack query definitions & keys
│   │   ├── transaction-mutations/    # Optimistic mutation handlers
│   │   ├── useBudgetMetrics.ts       # Central financial math coordinator
│   │   └── useAiAdvisor.ts           # Streaming conversation state
│   ├── lib/                          # Core Business Logic & Infrastructure
│   │   ├── bank-statement/           # PDF/CSV tokenizers and cleaners
│   │   ├── bot/                      # Telegram bot logic, commands, and keyboards
│   │   ├── dashboard-image/          # Serverless SVG/Canvas image generation
│   │   ├── financial-ai-assistant/   # System prompts & Gemini orchestration
│   │   ├── inzhur/                   # Inzhur REIT statement parser
│   │   ├── pacing/                   # Weighted pacing algorithms
│   │   ├── demo-data.ts              # Rich mock dataset for demo & testing
│   │   ├── offline-pin.ts            # PBKDF2 key derivation & rate-limiting
│   │   ├── offline-queue.ts          # IndexedDB sync queue
│   │   ├── personal-cpi.ts           # CPI calculation engine
│   │   ├── rate-limiter.ts           # In-memory sliding-window limiter
│   │   ├── roundup-utils.ts          # Spare change / piggy bank calculator
│   │   ├── session.ts                # Web Crypto HMAC session tokens
│   │   └── validations.ts        # Zod validation schemas
│   └── types/                        # Core Domain Interfaces
├── supabase/                         # Database Migration Scripts
│   └── migrations/                   # 8 production SQL migrations with RLS
└── public/                           # Static assets & Service Worker
    ├── sw.js                         # Custom Service Worker implementation
    └── manifest.json                 # Web App Manifest
```

---

## 🧪 Testing & Quality Assurance

Quality and reliability are first-class citizens in this project. The entire test suite consists of **484 automated tests** across **47 test suites**, executing in under 10 seconds.

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:coverage

# Static type inspection
npx tsc --noEmit

# Code styling verification
npm run format:check
```

### Test Coverage Highlights:

- **Cryptographic Algorithms:** Validates PBKDF2 hashing, salt generation, constant-time comparisons, and progressive brute-force lockout timers.
- **Financial Calculus:** Unit-tested algorithms for weighted pace calculations, runway estimation, and floating-point penny-level accuracy during splits.
- **Parsers & Ingestion:** Edge cases in PDF/CSV layouts, encoding issues, corrupted records, and formula injection strings.
- **Telegram & Webhook Pipeline:** Mocked payload verifications for commands, callback queries, and security authorization headers.
- **Fuzzing Tests (`financial-fuzz.test.ts`):** Random boundary testing on monetary values, date overflows, and extreme inputs.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 22.0 or higher
- **npm** 10.0 or higher
- A **Supabase** account (Free tier works)
- A **Google AI Studio** API key (Gemini)

### 1. Clone & Install

```bash
git clone https://github.com/mindeclipse/Budget_graphAI.git
cd Budget_graphAI
npm ci --legacy-peer-deps
```

### 2. Configure Environment Variables

Copy `.env.example` or create a `.env.local` file in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Authentication & Encryption
APP_ACCESS_PIN=1234
APP_API_SECRET=your-secure-32-byte-hex-string

# AI Services
GEMINI_API_KEY=your-gemini-api-key

# Telegram Bot (Optional)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Automation Cron
CRON_SECRET=your-cron-secret-key
```

### 3. Apply Migrations

Run the SQL scripts located in `supabase/migrations/` inside your Supabase project's SQL Editor in chronological order.

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> [!TIP]
> **Try Demo Mode:** To preview the application with full mock data and no authentication required, navigate to `http://localhost:3000/?demo=true` or click the **"Спробувати Demo-режим"** link on the login screen.

---

## 📡 API Reference Overview

The backend is built as modular Next.js Route Handlers with unified error handling and security policies:

| Route                             |             Method             | Description                                       | Security                               |
| :-------------------------------- | :----------------------------: | :------------------------------------------------ | :------------------------------------- |
| `/api/auth`                       |             `POST`             | Authenticate using PIN                            | Rate-limited (5/min), Constant-time    |
| `/api/auth/webauthn/login`        |         `GET`, `POST`          | WebAuthn challenge & verification                 | Stateless sealed cookie, Counter check |
| `/api/auth/webauthn/register`     |         `GET`, `POST`          | FIDO2 device enrollment                           | Session cookie required                |
| `/api/classify`                   |             `POST`             | Fast transaction categorizer (Apple Shortcuts)    | Bearer secret, Gemini-Lite fallback    |
| `/api/ai/analyze`                 |             `POST`             | Comprehensive cycle financial health analysis     | Session auth, Gemini 3.5/3.7           |
| `/api/ai/chat`                    |             `POST`             | Interactive conversational financial assistant    | Streaming SSE, Rate-limited            |
| `/api/transactions`               | `GET`, `POST`, `PUT`, `DELETE` | Transaction management                            | Session auth, Zod validation           |
| `/api/transactions/split`         |             `POST`             | Split single transaction into multiple categories | Transactional, strict balance check    |
| `/api/transactions/restore`       |             `POST`             | Restore soft-deleted transaction from trash       | 10-day safety window                   |
| `/api/transactions/import-csv`    |             `POST`             | Parse and ingest Monobank / PrivatBank CSV        | CSV injection sanitizer                |
| `/api/transactions/import-inzhur` |             `POST`             | Parse Inzhur REIT statement and reconcile         | De-duplication against bank records    |
| `/api/webhooks/monobank`          |             `POST`             | Real-time Monobank transaction ingestion          | Webhook secret verification            |
| `/api/webhooks/telegram`          |             `POST`             | Full-duplex Telegram bot interaction              | Telegram secret token header           |
| `/api/cron/pacing-alerts`         |             `GET`              | Scheduled Friday radar & Monday reset alerts      | Vercel Cron header / Secret            |
| `/api/cron/digest`                |             `GET`              | Scheduled daily summary dispatch to Telegram      | Vercel Cron header / Secret            |

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Engineered with precision, security, and care by <b>Yurii Khval</b> (<a href="https://github.com/mindeclipse">@mindeclipse</a>).</sub>
</div>
