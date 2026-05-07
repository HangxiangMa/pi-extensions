# pi-retry

A public [pi](https://pi.dev) extension package that treats provider responses containing `Unknown error (no error details in response)` as retryable.

## Install

```bash
pi install npm:@narumitw/pi-retry
```

Try without installing:

```bash
pi -e npm:@narumitw/pi-retry
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-retry
```

## What it does

When an assistant message ends with `stopReason: "error"` and the error message matches `Unknown error (no error details in response)`, the extension appends pi's retryable-provider-error hint so pi's built-in retry path can continue the turn.

## Package layout

```txt
extensions/pi-retry/
├── src/
│   └── unknown-error-retry.ts
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

The package exposes its extension through `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/unknown-error-retry.ts"]
  }
}
```

This package is separate from `@narumitw/pi-skillforge`, so you can install either package independently:

```bash
pi install npm:@narumitw/pi-skillforge
pi install npm:@narumitw/pi-retry
```
