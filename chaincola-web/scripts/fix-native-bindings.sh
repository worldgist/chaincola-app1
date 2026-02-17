#!/bin/bash
# Re-sign native .node binaries to fix "code signature not valid" / "library load disallowed by system policy" on macOS
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Re-signing native binaries in $ROOT/node_modules..."
find "$ROOT/node_modules" -name "*.node" 2>/dev/null | while read -r f; do
  if [ -f "$f" ]; then
    codesign --force --sign - "$f" 2>/dev/null && echo "  Signed: $f" || true
  fi
done
echo "Done."
