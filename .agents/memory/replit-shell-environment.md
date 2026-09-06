---
name: Replit shell environment detection
description: Avoid inferring managed-workflow variables solely from REPL_ID.
---

Do not use `REPL_ID` alone to decide whether workflow-specific variables such as `PORT` and `BASE_PATH` must already exist.

**Why:** Ordinary workspace shell commands can have `REPL_ID` while lacking the service variables injected into a managed artifact workflow.

**How to apply:** Give standalone commands explicit defaults or use a dedicated opt-in variable; allow managed workflows to override those defaults.