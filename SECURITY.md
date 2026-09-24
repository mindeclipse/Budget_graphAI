# 🛡️ Security Policy

BudgetGraph OS is engineered with a **Zero-Trust & Privacy-First** philosophy. Financial data and wealth records represent sensitive personal information, and our security architecture is designed to protect user confidentiality, data integrity, and authentication resilience both online and offline.

---

## 📌 Supported Versions

We provide security patches, dependency vulnerability remediation, and architectural hardening for the following releases:

| Version / Branch | Supported          | Security Status                   |
| ---------------- | ------------------ | --------------------------------- |
| `0.6.x` / `main` | :white_check_mark: | Active Security Updates & Patches |
| `< 0.6.0`        | :x:                | Deprecated / Upgrade Recommended  |

---

## 🔐 Architectural Security Highlights

1. **Hardware-Bound Biometrics (WebAuthn / FIDO2 Passkeys)**:
   - Passwordless authentication leveraging user-presence verification via Touch ID, Face ID, Windows Hello, or hardware security keys (YubiKey).
   - Private keys never leave the secure enclave of the user's physical device.
   - Stateless HMAC-SHA256 sealed challenge cookies eliminate database round-trips during handshakes with zero server-side state leakage.
   - Resistant to credential stuffing, brute force, and phishing attacks.

2. **Offline-First Cryptography (PBKDF2 + SHA-256)**:
   - Offline authentication verifies PIN codes locally inside Web Crypto API.
   - Key derivation utilizes **PBKDF2 with HMAC-SHA256 (100,000 iterations)** with a cryptographically secure 16-byte random salt.
   - Exponential rate limiting and progressive lockout mechanisms prevent offline brute-force attempts.

3. **Hardened Content Security Policy & Perimeter Defense**:
   - Strict Content Security Policy (`connect-src 'self'`, `frame-ancestors 'none'`) with zero `'unsafe-eval'` dynamic script execution.
   - Origin verification and CSRF blocking on state-modifying requests (`POST`, `PATCH`, `DELETE`).
   - Constant-time string comparisons (`crypto.timingSafeEqual`) across all API tokens, session cookies, and authentication payloads to defend against timing attacks.

4. **Spreadsheet & Formula Injection Protection**:
   - Universal sanitization of dangerous formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) in bank statements (Monobank, PrivatBank) and REIT investment reports (Inzhur).

5. **Database Isolation & Row Level Security (RLS)**:
   - All financial ledgers, recurring contracts, investments, and audit logs are isolated per user via Supabase PostgreSQL Row Level Security.
   - Direct anonymous access is completely blocked (`lockdown_rls.sql`) with default-deny policies.

6. **Zero PII Exposure in Demo Mode**:
   - The interactive demo environment (`/?demo=true`) operates strictly on synthetic, deterministic mock datasets with an in-memory repository layer.
   - No production database, user credentials, or real banking transactions are ever exposed or queried in demo mode.

7. **Telegram Bot Full-Duplex Webhook Security**:
   - Webhook ingress validates `X-Telegram-Bot-Api-Secret-Token` on every incoming request using constant-time comparison.
   - Strict `chat_id` authorization rejects any unauthorized message or callback dispatch.

8. **Automated Static & Dynamic Quality Assurance**:
   - 517 automated unit and integration tests across 52 test suites run in isolated Vitest worker threads.
   - Continuous verification of cryptographic verification hooks, rollback safety, cascade soft-deletes, and transaction parsing algorithms.

---

## 🚨 Reporting a Vulnerability

We deeply appreciate the efforts of security researchers and community members who practice **Responsible & Coordinated Vulnerability Disclosure**.

If you discover a security vulnerability or potential exposure in BudgetGraph OS, **please do not disclose it publicly** (e.g., via public GitHub Issues, discussions, or social media).

### How to Report:

1. **GitHub Security Advisory (Recommended)**:
   - Navigate to the **[Security tab](https://github.com/mindeclipse/Budget_graphAI/security)** in this repository.
   - Click **"Report a vulnerability"** to initiate a private security advisory report.

2. **Direct Email Contact**:
   - Send an encrypted or direct email to: **[yukhval@gmail.com](mailto:yukhval@gmail.com)**
   - Subject line: `[SECURITY] Vulnerability Report: BudgetGraph OS`

### What to Include in Your Report:

To help us investigate and patch the issue as quickly as possible, please provide:

- A clear description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Affected endpoints, components, or client-side hooks.
- Suggested remediations or fixes, if known.

---

## ⏱️ Response & Disclosure Timeline

We take security reports with high urgency and follow this response framework:

- **Initial Acknowledgment**: Within **24–48 hours** of report receipt.
- **Triage & Impact Assessment**: Within **3–5 business days**.
- **Remediation & Patching**: High/Critical vulnerabilities are prioritized for immediate remediation in `main`.
- **Public Disclosure**: Coordinated after the fix is merged and deployed, crediting the reporter (unless anonymity is requested).

---

## 🛠️ Security Best Practices for Self-Hosting

When deploying your own instance of BudgetGraph OS:

- **Environment Variables**: Never commit `.env.local` or push secret keys to version control.
- **Enforce HTTPS**: WebAuthn Passkeys and Service Worker Progressive Web App (PWA) capabilities strictly require a secure HTTPS context.
- **Rotate Secrets**: Ensure `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_WEBHOOK_SECRET` are generated using cryptographically random high-entropy strings.
- **Supabase Policies**: Verify all database migration scripts in `supabase/migrations/` have been executed with RLS enabled on all public tables.

---

<div align="center">
  <sub>BudgetGraph OS — Built on transparency, privacy, and mathematical rigor.</sub>
</div>
