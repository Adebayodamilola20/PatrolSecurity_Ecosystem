#!/bin/sh
# First-time setup for a fresh clone. Safe to re-run.
#
#     ./scripts/setup.sh
#
set -e

cd "$(dirname "$0")/.."

echo "==> Enabling the shared git hooks"
# git does not pick up hooks/ on its own — every clone must opt in once, or the
# pre-commit secret guard protects nobody.
git config core.hooksPath hooks
chmod +x hooks/* 2>/dev/null || true
echo "    core.hooksPath = $(git config --get core.hooksPath)"

echo "==> Installing dependencies"
for d in . mobile/patrol_app web web-client; do
  if [ -f "$d/package.json" ]; then
    echo "    $d"
    (cd "$d" && npm install --silent)
  fi
done

if command -v flutter >/dev/null 2>&1; then
  echo "==> flutter pub get"
  (cd mobile/patrol_app && flutter pub get)
else
  echo "==> Skipping flutter pub get (flutter not on PATH)"
fi

cat <<'EOS'

Setup complete.

Environment files are not in git. Copy .env.example and fill in the values:
  cp .env.example .env.local        # then set VITE_API_URL, VITE_GOOGLE_MAPS_API_KEY, ...

Do not keep this repo inside iCloud Drive (~/Desktop or ~/Documents with
"Desktop & Documents Folders" enabled). iCloud corrupts .git and node_modules:
it has produced missing git objects and duplicated "node_modules 2" trees here.
EOS
