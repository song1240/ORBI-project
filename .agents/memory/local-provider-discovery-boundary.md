---
name: Local provider discovery boundary
description: Security and product limits for detecting installed AI coding CLIs.
---

Provider installation and sign-in probes may run only when Model Pilot is in local desktop mode and both the API and dashboard are bound to loopback. Hosted mode must return discovery unavailable without executing commands.

**Why:** CLI presence and authentication state are sensitive machine metadata, and a hosted endpoint that launches probes would expose local process execution to remote callers. Subscription tiers are not inferred from this status.

**How to apply:** Keep provider commands and arguments fixed, resolve executables before probing, never return raw command output, and distinguish detection from an active task/session adapter. Do not advertise automatic provider execution until adapters and explicit user approval are implemented.