set shell := ["bash", "-euo", "pipefail", "-c"]

# Show available commands
default:
    @just --list

# Run formatter, linter, and typechecks for all packages
check:
    npm run check

# Format all files with Biome
format:
    npm run format

_require-pinned-npm:
    @package_manager="$(node -p 'require("./package.json").packageManager')"; [[ "$package_manager" == npm@* ]] || { printf 'unsupported packageManager: %s\n' "$package_manager" >&2; exit 2; }; expected="${package_manager#npm@}"; actual="$(npm --version)"; [[ "$actual" == "$expected" ]] || { printf 'npm %s is required, but npm %s is active; switch to a supported Node runtime and install %s\n' "$expected" "$actual" "$package_manager" >&2; exit 2; }

_require-clean-worktree:
    @[[ -z "$(git status --porcelain)" ]] || { printf 'dependency updates require a clean worktree; commit or stash changes first\n' >&2; exit 2; }

# Update dependency manifests and regenerate the lockfile without trusting the current install
update-lock: _require-pinned-npm _require-clean-worktree
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    paths=(package.json package-lock.json packages/*/package.json)
    backup="$(mktemp -d "${TMPDIR:-/tmp}/pi-extensions-update-lock.XXXXXX")"
    trap 'status=$?; trap - EXIT HUP INT TERM; rm -rf -- "$backup"; exit "$status"' EXIT HUP INT TERM
    for path in "${paths[@]}"; do
        mkdir -p -- "$backup/$(dirname "$path")"
        cp -p -- "$path" "$backup/$path"
    done
    rollback() {
        status=$?
        trap - EXIT HUP INT TERM
        for path in "${paths[@]}"; do
            cp -p -- "$backup/$path" "$path"
        done
        rm -rf -- "$backup"
        printf 'dependency update failed; restored package manifests and lockfile\n' >&2
        exit "$status"
    }
    trap rollback EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    npm exec -- npm-check-updates --workspaces --root -u
    npm install --package-lock-only --ignore-scripts
    trap - EXIT HUP INT TERM
    rm -rf -- "$backup"

# Verify dependency updates from the exact clean lockfile installation
verify-update: _require-pinned-npm
    npm ci
    # Rebuild generated web assets only in workspaces that provide build:web
    npm --workspaces --if-present run build:web
    npm run check
    npm pack --workspaces --dry-run

# Update, clean-install, rebuild, test, and pack all npm workspaces
update:
    just update-lock
    just verify-update

# Install Husky Git hooks
hooks:
    npm run prepare

# Run the pre-commit checks
pre-commit:
    npm run precommit

# Show npm account/registry/package visibility information for one package
# Usage: just doctor @narumitw/pi-chrome-devtools
doctor package="@narumitw/pi-chrome-devtools":
    @printf 'package: %s\n' {{quote(package)}}
    npm whoami || true
    npm config get registry
    npm access get status {{quote(package)}} || true
    npm dist-tag ls {{quote(package)}} || true
    npm view {{quote(package)}} version || true

# Show npm visibility/version information for all publishable packages
doctor-all:
    shopt -s nullglob; for package_json in packages/*/package.json; do package="$(node -p "require('./$package_json').name")"; just doctor "$package"; done

# Make an already-published scoped npm package public if npm view returns 404
# This does not create a package. For a brand-new package, first run:
#   npm publish --workspace @narumitw/pi-subagents --access public
# Usage for existing packages: just npm-public @narumitw/pi-goal
npm-public package="@narumitw/pi-goal":
    npm access set status=public {{quote(package)}}
    npm view {{quote(package)}} version

_validate-package-name name:
    @[[ {{quote(name)}} =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { printf 'invalid package name: %s\n' {{quote(name)}} >&2; exit 2; }

# Preview the package that npm would publish
# Usage: just pack subagents
pack name: (_validate-package-name name)
    name={{quote(name)}}; package_json="./packages/pi-$name/package.json"; [[ -f "$package_json" ]] || { echo "package not found for: $name" >&2; exit 2; }; package="$(node -p "require(process.argv[1]).name" "$package_json")"; npm --workspace "$package" pack --dry-run

# Try an extension package from this working tree as a temporary pi package
# Usage: just try subagents
try name: (_validate-package-name name)
    name={{quote(name)}}; extension_dir="./packages/pi-$name"; [[ -d "$extension_dir" ]] || { echo "extension package not found for: $name" >&2; exit 2; }; package_json="$extension_dir/package.json"; package="$(node -p "require(process.argv[1]).name" "$package_json")"; npm --workspace "$package" run build --if-present; pi -e "$extension_dir"

# Start Pi with the commonly used extensions loaded from this working tree
# PI_TIMING reports startup timing for local extension development
dev:
    PI_TIMING=1 pi -ns -ne \
        -e ./packages/pi-accounts \
        -e ./packages/pi-btw \
        -e ./packages/pi-caffeinate \
        -e ./packages/pi-chrome-devtools \
        -e ./packages/pi-github-pr \
        -e ./packages/pi-goal \
        -e ./packages/pi-plan-mode \
        -e ./packages/pi-firecrawl \
        -e ./packages/pi-sync \
        -e ./packages/pi-usage \
        -e ./packages/pi-worktree \
        -e ./packages/pi-stamp \
        -e ./packages/pi-starship \
        -e ./packages/pi-codex-compact

# Start a fresh Pi session with every local extension package loaded
try-all:
    shopt -s nullglob; args=(); for package_json in ./packages/pi-*/package.json; do if node -e 'const p = require(process.argv[1]); process.exit(p.pi?.extensions ? 0 : 1)' "$package_json"; then args+=(-e "$(dirname "$package_json")"); fi; done; pi -ne "${args[@]}"

# Install a package through pi, falling back to the local workspace if unpublished
# Usage: just install subagents
install name: (_validate-package-name name)
    name={{quote(name)}}; extension_dir="./packages/pi-$name"; package_json="$extension_dir/package.json"; [[ -f "$package_json" ]] || { echo "extension package not found for: $name" >&2; exit 2; }; package="$(node -p "require(process.argv[1]).name" "$package_json")"; if npm view "$package" version >/dev/null 2>&1; then pi install "npm:$package"; else echo "$package is not published; installing local workspace package instead."; pi install "$extension_dir"; fi

# Add release intent for independently versioned packages
changeset:
    npm run changeset

# Show the pending independent release plan
changeset-status:
    npm run changeset:status
