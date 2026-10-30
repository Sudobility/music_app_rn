#!/bin/bash
#
# Xcode Cloud runs this after cloning and before `xcodebuild`. A fresh clone
# has no `node_modules`, no `.env` and no `macos/Pods` (all ignored), and the
# workspace's base configuration is `Pods/Target Support Files/...xcconfig` —
# so without this the build stops at "Unable to open base configuration
# reference file". It must live beside the workspace (`macos/ci_scripts/`) and
# be executable, or Xcode Cloud never finds it. `ios/ci_scripts/` is the
# same script for the iOS app.

set -euo pipefail

echo "=== Xcode Cloud: macOS post-clone setup ==="

cd "${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"

export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_AUTO_UPDATE=1

# --- Install tooling ---
# Node runs the Podfile's `require.resolve`, codegen and the Metro bundle
# phase; CocoaPods installs the pods. Neither is on the runner by default.
echo "Installing Node.js and CocoaPods..."
brew install node cocoapods

# Bun from Homebrew rather than the bun.sh installer, which downloads from a
# host the Xcode Cloud runner cannot always resolve (sudojo_app_rn's script
# records the "Could not resolve host" failure).
echo "Installing Bun..."
brew install bun || {
  echo "brew install bun failed; falling back to bun.sh installer..."
  for i in 1 2 3; do
    curl -fsSL https://bun.sh/install | bash && break
    echo "bun.sh install attempt $i failed; retrying in 5s..."
    sleep 5
  done
}
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$(brew --prefix)/bin:$PATH"
echo "Bun version: $(bun --version)"

# --- npm registry for @sudobility packages (GitHub Packages) ---
# @sudobility/* moved off npmjs to GitHub Packages (npm.pkg.github.com); the
# committed .npmrc routes the scope there, so CI must supply a read:packages
# token or every @sudobility download 401s. Set GITHUB_PACKAGE_TOKEN (a GitHub
# PAT with read:packages) as a Secret environment variable in the Xcode Cloud
# workflow; NPM_TOKEN is still accepted as a fallback name for the same value.
GH_PKG_TOKEN="${GITHUB_PACKAGE_TOKEN:-${NPM_TOKEN:-}}"
if [ -n "$GH_PKG_TOKEN" ]; then
  echo "Configuring GitHub Packages registry for @sudobility..."
  cat > "$HOME/.npmrc" << EOF
@sudobility:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}
EOF
else
  echo "WARNING: no GITHUB_PACKAGE_TOKEN/NPM_TOKEN set; @sudobility installs will 401" >&2
fi

# --- Install JS dependencies ---
echo "Installing JS dependencies..."
bun install --frozen-lockfile

# --- Write environment variables ---
# Every variable .env.example declares, valued from the workflow's Environment
# Variables (Xcode Cloud > Workflow > Environment; mark sensitive ones Secret)
# so babel.config.js inlines them. The names are read from .env.example rather
# than listed here, so this file cannot fall behind what the app reads. A name
# the workflow does not set is written blank, which the app reads as "not
# configured" — a supported state that offers nothing server-backed.
: > .env
for name in $(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env.example); do
  printf '%s=%s\n' "$name" "$(printenv "$name" || true)" >> .env
done
echo "Wrote .env with $(wc -l < .env | tr -d ' ') variables."

# --- Point the build phases at this runner's node ---
# The tracked `.xcode.env.local` names this Mac's `/opt/homebrew/bin/node`.
echo "export NODE_BINARY=$(command -v node)" > macos/.xcode.env.local

# --- Install CocoaPods dependencies ---
echo "Installing CocoaPods dependencies..."
cd macos
pod install

echo "=== macOS post-clone setup complete ==="
