---
name: pdfkit @swc/helpers runtime dependency
description: pdfkit 0.18 / fontkit crash fix — @swc/helpers must be installed explicitly
---

pdfkit@0.18 depends on fontkit@2.x which is compiled with SWC. At runtime,
fontkit attempts to `require('@swc/helpers/cjs/_define_property.cjs')` which
is NOT automatically installed as a transitive dependency by pnpm.

**Symptom:** `Error: Cannot find module '@swc/helpers/cjs/_define_property.cjs'`
— crashes on startup even though pdfkit appears installed.

**Fix:** `pnpm --filter @workspace/api-server add @swc/helpers`

**Why:** pnpm's strict hoisting doesn't pull peer/optional dependencies of
compiled CJS bundles unless explicitly declared. @swc/helpers is a runtime dep
of fontkit but only listed as a devDep in fontkit's package.json.

**How to apply:** Any time pdfkit is used in the api-server and the server
crashes at startup with MODULE_NOT_FOUND on @swc/helpers, run the above install.
