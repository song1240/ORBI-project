---
name: Local SQLite driver compatibility
description: Why Model Pilot pins the native SQLite driver below its newest major and explicitly allows its install script.
---

Model Pilot's local SQLite dependency must continue to support Node.js 20 and remain listed in pnpm's allowed build dependencies.

**Why:** The next major native driver requires Node.js 22, while Model Pilot promises Windows users Node.js 20 compatibility. pnpm also blocks unapproved native install scripts, which leaves the driver unusable even when dependency installation appears successful.

**How to apply:** Before upgrading the SQLite driver, check its Node engine range against the Windows installer minimum and confirm a clean install runs the native build/download step on every supported platform.