set shell := ["bash", "-euo", "pipefail", "-c"]

# Show available commands
default:
    @just --list

# Run the CI-equivalent verification gate
check:
    npm run check

# Format all files with Biome
format:
    npm run format

_require-clean-worktree:
    @[[ -z "$(git status --porcelain)" ]] || { printf 'dependency updates require a clean worktree\n' >&2; exit 2; }

# Update dependency manifests and lockfile
update-lock: _require-clean-worktree
    npm exec -- npm-check-updates --workspaces --root -u
    npm install --package-lock-only --ignore-scripts

# Verify dependency updates from the exact clean lockfile installation
verify-update:
    npm ci
    # Rebuild generated web assets only in workspaces that provide build:web
    npm --workspaces --if-present run build:web
    npm run check
    npm pack --workspaces --dry-run

# Update, clean-install, rebuild, test, and pack all npm workspaces
update: update-lock verify-update

# Install Husky Git hooks
hooks:
    npm run prepare

# Run the pre-commit checks
pre-commit:
    npm run precommit

# Show npm account/registry/package visibility information for one package
# Usage: just doctor @narumitw/pi-chrome-devtools
doctor package="@narumitw/pi-chrome-devtools":
    @printf 'package: %s\n' {{ quote(package) }}
    npm whoami || true
    npm config get registry
    npm access get status {{ quote(package) }} || true
    npm dist-tag ls {{ quote(package) }} || true
    npm view {{ quote(package) }} version || true

# Show npm visibility/version information for all publishable packages
doctor-all:
    shopt -s nullglob; for package_json in packages/*/package.json; do package="$(node -p "require('./$package_json').name")"; just doctor "$package"; done

# Make an already-published scoped npm package public if npm view returns 404
# This does not create a package. For a brand-new package, first run:
#   npm publish --workspace @narumitw/pi-subagents --access public
# Usage for existing packages: just npm-public @narumitw/pi-goal
npm-public package="@narumitw/pi-goal":
    npm access set status=public {{ quote(package) }}
    npm view {{ quote(package) }} version

_validate-package-name name:
    @[[ {{ quote(name) }} =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { printf 'invalid package name: %s\n' {{ quote(name) }} >&2; exit 2; }

# Preview the package that npm would publish
# Usage: just pack subagents
pack name: (_validate-package-name name)
    npm --workspace {{ quote("@narumitw/pi-" + name) }} pack --dry-run

# Try an extension package from this working tree as a temporary pi package
# Usage: just try subagents
try name: (_validate-package-name name)
    npm --workspace {{ quote("@narumitw/pi-" + name) }} run build --if-present
    pi -e {{ quote("./packages/pi-" + name) }}

# Measure offline pi-subagents transport startup and retained-command overhead
benchmark-subagents samples="7":
    node scripts/benchmark-pi-subagents-transports.mjs --samples {{ quote(samples) }}

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
    name={{ quote(name) }}; package="@narumitw/pi-$name"; if npm view "$package" version >/dev/null 2>&1; then pi install "npm:$package"; else pi install "./packages/pi-$name"; fi

# Add release intent for independently versioned packages
changeset:
    npm run changeset

# Show the pending independent release plan
changeset-status:
    npm run changeset:status
