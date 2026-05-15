# pi-statusline

A public [pi](https://pi.dev) extension package that replaces Pi's footer with a beautiful, information-rich statusline and lets you customize it in natural language.

No slash command is required: type a normal request such as “make the statusline minimal and blue, hide cost” and the extension applies it directly.

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

## Natural-language examples

Type these as normal prompts:

```text
make the statusline beautiful and compact
make the footer minimal, blue, and show git branch plus time
hide cost and tokens from the statusline
use a rainbow statusline with context, tools, and cwd
make the status bar monochrome with no separators
show current statusline configuration
reset the statusline to default
turn off the custom statusline
turn on the custom statusline
```

The extension only intercepts prompts that clearly mention the statusline/footer/status bar and ask for a change. Other prompts continue to the agent normally.

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

## Agent tool

The package also registers `statusline_customize`, so the agent can apply statusline changes when a statusline request is part of a broader natural-language conversation.

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
