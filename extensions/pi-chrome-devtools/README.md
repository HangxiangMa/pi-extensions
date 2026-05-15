# pi-chrome-devtools

A public [pi](https://pi.dev) extension package that exposes Chrome DevTools Protocol (CDP) tools to the agent.

It is inspired by [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp), but implemented as native pi tools instead of an MCP server.

## Install

```bash
pi install npm:@narumitw/pi-chrome-devtools
```

Try without installing:

```bash
pi -e npm:@narumitw/pi-chrome-devtools
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-chrome-devtools
```

## Start Chrome with CDP enabled

The extension connects to `127.0.0.1:9222` by default.

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/pi-chrome-devtools
```

On macOS:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/pi-chrome-devtools
```

Override the endpoint if needed:

```bash
PI_CHROME_DEVTOOLS_HOST=127.0.0.1 PI_CHROME_DEVTOOLS_PORT=9223 pi -e ./extensions/pi-chrome-devtools
```

## Tools

- `chrome_devtools_list_pages` — list inspectable Chrome tabs/pages.
- `chrome_devtools_select_page` — select the active page for later tool calls.
- `chrome_devtools_navigate` — navigate a page to a URL.
- `chrome_devtools_evaluate` — evaluate JavaScript in the selected page.
- `chrome_devtools_screenshot` — capture a PNG screenshot.

## Command

```text
/chrome-devtools
```

Shows the configured CDP endpoint and quick start hint.

## Package layout

```txt
extensions/pi-chrome-devtools/
├── src/
│   └── chrome-devtools.ts
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

The package exposes its extension through `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/chrome-devtools.ts"]
  }
}
```
