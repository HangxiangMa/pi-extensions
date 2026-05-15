# pi-statusline

A public [pi](https://pi.dev) extension package that replaces Pi's footer with a beautiful, information-rich statusline.

The extension is display-only: it does not intercept prompts or register customization commands.

## Install

```bash
pi install npm:@narumitw/pi-statusline
```

Try without installing:

```bash
pi -e npm:@narumitw/pi-statusline
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-statusline
```

## What it shows

The default statusline includes:

- `π` brand marker
- current model
- thinking level
- git branch
- current project directory
- active or last tool
- statuses from other extensions, such as goal mode
- context usage percentage
- token totals
- estimated cost
- clock

The layout adapts to terminal width and truncates safely.

## Package layout

```txt
extensions/pi-statusline/
├── src/
│   └── statusline.ts
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

The package exposes its extension through `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/statusline.ts"]
  }
}
```
