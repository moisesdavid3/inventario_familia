---
name: Vite build environment
description: Environment requirement for manually building Vite artifacts in this workspace.
---

Manual Vite builds in this workspace require the runtime-provided `PORT` and `BASE_PATH` variables because the artifact's Vite configuration validates them during startup.

**Why:** The managed workflow supplies these values automatically, while a shell build does not.

**How to apply:** For a direct verification build, provide the artifact's assigned port and its preview path explicitly; otherwise use the managed workflow.