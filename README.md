# Ljupcho Shemov — 3D CV

Static, dependency-free CV site: a WebGL flight-network globe (three.js, vendored), Apple-style scroll typography, and full SEO (JSON-LD `Person`, Open Graph, sitemap, robots). Everything lives in `public/`.

## Before you publish

1. **Photo** — save your LinkedIn photo as `public/assets/photo.jpg` (portrait, ~800×1000). Until then the page shows an "LS" monogram.
2. **Facts** — check the experience, projects, skills and education text in `public/index.html` against your LinkedIn and correct anything that's off.
3. **Domain** — the site assumes `https://ljupcho-shemov.pages.dev/`. If you use your own domain, replace that URL everywhere:
   `grep -rl "ljupcho-shemov.pages.dev" public | xargs sed -i 's#ljupcho-shemov.pages.dev#yourdomain.com#g'`

## Deploy to Cloudflare Pages

**Option A — GitHub Action (automatic on every push)**
1. Cloudflare dashboard → *My Profile → API Tokens → Create Token* → template **"Edit Cloudflare Workers"** (includes Pages).
2. Copy your **Account ID** (dashboard right sidebar).
3. GitHub repo → *Settings → Secrets and variables → Actions*: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Create the project once: Cloudflare → *Workers & Pages → Create → Pages → Direct upload*, name it **ljupcho-shemov** (or run `npx wrangler pages project create ljupcho-shemov`).
5. Push, or run the workflow manually from the *Actions* tab.

**Option B — from your computer**
```bash
npx wrangler login
npx wrangler pages deploy public --project-name=ljupcho-shemov
```

## Get found on Google for "Ljupcho Shemov"

The page is built for this (name in title, H1, JSON-LD with all spellings, `rel="me"` link to LinkedIn), but Google only ranks what it has indexed:
1. Open [Google Search Console](https://search.google.com/search-console), add the site URL, verify (HTML-file or meta-tag method).
2. Submit `sitemap.xml`, then use *URL inspection → Request indexing*.
3. Add the site URL to your LinkedIn profile (*Contact info → Website*) and to the "Featured" section — that backlink is the strongest signal you control.

Local preview: `cd public && python3 -m http.server 8080`.
