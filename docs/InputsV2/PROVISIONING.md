---
type: Checklist
title: "iBuildOS — Provisioning Pack: The Human Half-Day (Build-Ready Kit #6)"
description: >-
  Everything only Srini can provide, gathered into one pass so the builder never has to ask
  mid-build. Each item: what to create, where the credential lands, and what it unblocks.
  Until complete, the builder proceeds to release-candidate (unsigned, stub-verified) per the
  Builder Charter rule 4/5.
status: pending
version: 1.0.0
date: 2026-08-14
owner: srini
tags: [ibuildos, provisioning, build-ready-kit]
---

# Provisioning Pack

**Convention:** credentials land as GitHub Actions secrets (names below) in the org created in
§1, and locally in the app keychain where noted. Nothing here goes in any repo.

## 1. Code hosting & CI — unblocks distribution, cross-OS CI, forge tests
- [ ] Create GitHub **org** (suggest: `ibuildos`) + repos: `ibuildos` (monorepo), `template-web-app`, `template-api-service`, `template-static-site`, and a private `fixtures-forge` repo (GH-005/007 tests).
- [ ] Enable Actions with **macOS + Windows runner billing**; set spend cap.
- [ ] Create a fine-grained **PAT / GitHub App** for forge-integration tests → secret `IBOS_FORGE_TOKEN`.

## 2. npm — unblocks CLI + Action distribution
- [ ] npm account (2FA) · register org scope **`@ibuildos`** (verified free) → automation token secret `NPM_TOKEN`. Bin name is `ibuildos` (DEFAULTS #13); do not contest the stale `ibuild` package.

## 3. Signing — unblocks the entire macOS/Windows release channel (the PS-001 persona wall)
- [ ] **Apple Developer Program** ($99/yr) → Developer ID Application cert + app-specific password / API key for notarization → secrets `MAC_CERT_P12`, `MAC_CERT_PASSWORD`, `APPLE_API_KEY_*`.
- [ ] **Windows code signing** — recommended: **Azure Trusted Signing** (subscription-based, no hardware token) → secrets `AZURE_SIGNING_*`. (Alternative: OV cert from a CA.)

## 4. Agent accounts — unblocks S-1/S-2 live legs, live matrix, pre-release smoke
- [ ] Anthropic account with **Claude Code** access (dedicated low-cost tier for CI) → API/OAuth per adapter docs → secret `IBOS_CLAUDE_AUTH`.
- [ ] OpenAI account with **Codex CLI** access → secret `IBOS_CODEX_AUTH`.
- [ ] **pi** setup per pi-acp adapter needs (provider key it wraps) → secret `IBOS_PI_AUTH`.
- [ ] Set a **monthly spend cap** for the live matrix (suggest: modest; the matrix is nightly + non-blocking).

## 5. Deploy providers — unblocks TP-003 full guarantee, DR-003/008 live verification
- [ ] **Vercel** account + token → `VERCEL_TOKEN` (web + static templates).
- [ ] **Fly.io** account + token → `FLY_API_TOKEN` (API template).
- [ ] (Optional) **Netlify** token → `NETLIFY_TOKEN` (static alternative).

## 6. Identity & legal
- [ ] **License execution (D-114, decided: Apache-2.0):** confirm and the builder adds `LICENSE` (Apache-2.0) + headers to `packages/engine|cli|schemas|acp|bridge|stub-agent|action` and the template repos; desktop app package marked proprietary/source-available (state which) → one line from you: desktop license wording.
- [ ] **App icon / minimal brand mark** — commission or approve the builder generating one for v1 (say which).
- [ ] (Optional) Domain (`ibuildos.dev`?) for docs — not blocking.

## 7. One ruling
- [ ] **Pre-release manual smoke** (TECH-STACK T-013): keep as your manual step per release, or authorize recorded-live-session replay as the substitute for patch releases (majors stay manual). → your call, one sentence.

**Done =** every box checked, secrets in place, two sentences delivered (§6 desktop wording,
§7 ruling). From that moment the builder's M8 gate is executable and the answer to "zero
questions to shipped" is yes.
