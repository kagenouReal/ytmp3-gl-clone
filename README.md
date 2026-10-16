# ytmp3-clone

A 1:1 clone of [ytmp3.gl](https://ytmp3.gl/) built with Node.js, Express, and vanilla frontend. Clean, fast, pure dark mode, and zero pop-up ads or redirects.

## What's inside

- **Exact UI**: Dark theme (`#161515`), fonts, layout, and original SVGs.
- **Real conversions**: Plugs directly into the upstream conversion endpoints for MP3 and MP4 downloads.
  - **Primary Endpoint**: Uses `https://ytmp3.gl/` powered by **Gamma Cloud** (`https://gamma.gammacloud.net`).
  - **Fallback Endpoint**: Automatic fallback to **Epsilon Cloud** (`https://epsilon.epsiloncloud.org`) if the primary provider fails.
- **All subpages included**:
  - `/` — Main converter
  - `/faq/` — Collapsible FAQ accordion
  - `/add-on/` — Browser extension links
  - `/bookmarklet/` — Quick bookmarklet tool
  - `/contact/` — Working contact form
  - `/copyright-claims/`, `/privacy-policy/`, `/terms-of-use/` — Legal & DMCA pages
- **No bloat**: No frontend frameworks, no pop-up malware scripts, no annoying ad redirects.

## Quick start

```bash
# install dependencies
npm install

# run dev server (port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

## Build for production

```bash
npm run build
npm start
```

## Disclaimer

For personal use and content you have rights to download.
