#!/bin/bash
set -e
echo "=== EAS Pre-install: Stripping platform overrides from pnpm-workspace.yaml ==="

WORKSPACE_YAML="../../pnpm-workspace.yaml"

if [ ! -f "$WORKSPACE_YAML" ]; then
  echo "Warning: $WORKSPACE_YAML not found, trying from monorepo root"
  WORKSPACE_YAML="pnpm-workspace.yaml"
fi

if [ ! -f "$WORKSPACE_YAML" ]; then
  echo "Error: Cannot find pnpm-workspace.yaml"
  exit 1
fi

python3 << 'PYTHON'
import re, sys

with open("../../pnpm-workspace.yaml", "r") as f:
    content = f.read()

# Remove onlyBuiltDependencies section
content = re.sub(r'\nonlyBuiltDependencies:.*?(?=\n[a-z]|\Z)', '', content, flags=re.DOTALL)

# Remove overrides section
content = re.sub(r'\noverrides:.*?(?=\n[a-z]|\Z)', '', content, flags=re.DOTALL)

with open("../../pnpm-workspace.yaml", "w") as f:
    f.write(content)

print("Successfully stripped overrides and onlyBuiltDependencies")
print("Remaining content preview:")
print(content[:500])
PYTHON

echo "=== Done ==="
