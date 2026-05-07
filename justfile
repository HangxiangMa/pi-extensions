set shell := ["bash", "-euo", "pipefail", "-c"]

skillforge := "@narumitw/pi-skillforge"
retry := "@narumitw/pi-retry"

# Show available commands
default:
    @just --list

# Run formatter, linter, and typechecks for all packages
check:
    npm run check

# Format all files with Biome
format:
    npm run format

# Install pre-commit hooks
hooks:
    pre-commit install

# Run pre-commit hooks against all files
pre-commit:
    pre-commit run --all-files

# Show npm account/registry/package visibility information for one package
# Usage: just doctor @narumitw/pi-retry
doctor package="@narumitw/pi-skillforge":
    @echo "package: {{package}}"
    npm whoami
    npm config get registry
    npm access get status {{package}} || true
    npm dist-tag ls {{package}} || true
    npm view {{package}} version || true

# Preview the skillforge package that npm would publish
pack-skillforge:
    npm run pack:skillforge

# Preview the retry package that npm would publish
pack-retry:
    npm run pack:retry

# Try skillforge from this working tree as a temporary pi package
try-skillforge:
    pi -e ./extensions/pi-skillforge

# Try retry from this working tree as a temporary pi package
try-retry:
    pi -e ./extensions/pi-retry

# Install the published skillforge package through pi
install-skillforge:
    pi install npm:{{skillforge}}

# Install the published retry package through pi
install-retry:
    pi install npm:{{retry}}

# Publish skillforge to npm
publish-skillforge:
    npm --workspace {{skillforge}} pack --dry-run
    npm --workspace {{skillforge}} publish --access public

# Publish retry to npm
publish-retry:
    npm --workspace {{retry}} pack --dry-run
    npm --workspace {{retry}} publish --access public

# Bump one workspace package without creating a git tag
# Usage: just bump @narumitw/pi-retry patch
bump package part="patch":
    npm --workspace {{package}} version {{part}} --no-git-tag-version
