<div align="center">
  <img src="public/assets/icons/nox-icon.svg" alt="Nox Logo" width="120" height="120">

  # Nox

  A lightweight browser extension to dim the web.
</div>

## Features

- **Per-domain control**: Add domains individually with custom invert values
- **Adjustable invert value**: Control darkness from 0 to 1 (default: 0.88)
- **Subdomain matching**: Optional catch-all for subdomains

## Installation

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build the extension:
   ```bash
   pnpm build
   ```

3. Load in Browser (e.g. Chrome):
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## Development

- **Dev mode (HMR)**: `pnpm dev` - Auto-reloads on file changes
- **Build**: `pnpm build` - Production build with Vite
- **Type check**: `pnpm typecheck` - Validate TypeScript types

### Project Structure

```
.
├── public/              # Static assets and manifest
│   ├── manifest.json    # Extension manifest (V3)
│   ├── popup.html       # Popup UI
│   ├── assets/          # Icons and images
│   └── styles/          # CSS files
├── src/                 # TypeScript source
│   ├── content.ts       # Content script (injected into pages)
│   ├── background.ts    # Service worker
│   ├── popup.ts         # Popup UI logic
│   ├── types.ts         # Shared interfaces
│   ├── constants.ts     # Configuration constants
│   └── utils/           # Utility modules
├── docs/                # Architecture documentation
└── dist/                # Build output (git-ignored)
```

## Usage

1. Click the extension icon to open the popup
2. Enter a domain or click "Use Current" to add the active tab's domain
3. Adjust the invert value (0-1) using the slider or number input
4. Toggle "Include subdomains" if needed
5. Click "Add Domain" to activate dark mode
6. Manage domains: toggle on/off, adjust settings, or delete

## Technical Details

- **Manifest Version**: V3
- **Storage**: chrome.storage.sync (persists across devices)
- **Filter Method**: CSS `filter: invert()` with `hue-rotate(180deg)`
- **Exclusions**: Images, videos, SVGs, canvas, background-images auto-inverted back

## License

MIT