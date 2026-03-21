import { Request, Response } from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ─── Logger helper ────────────────────────────────────────────────
const log = {
  step:  (msg: string)         => console.log(`\n🔵 [STEP]   ${msg}`),
  ok:    (msg: string)         => console.log(`✅ [OK]     ${msg}`),
  warn:  (msg: string)         => console.warn(`⚠️  [WARN]   ${msg}`),
  err:   (msg: string)         => console.error(`❌ [ERROR]  ${msg}`),
  data:  (label: string, v: any) => console.log(`📦 [DATA]   ${label}:`, v),
  sep:   ()                    => console.log("─".repeat(60)),
};

// ─── Controller ───────────────────────────────────────────────────
export const scrapeGoogleMaps = async (req: Request, res: Response) => {
  const start = Date.now();

  log.sep();
  log.step("scrapeGoogleMaps → request received");
  log.data("body", req.body);
  log.data("query", req.query);

  const query: string = req.body?.q || req.query?.q as string || "jewellery shop near me";
  const maxResults: number = Number(req.body?.limit || req.query?.limit || 20);

  log.data("search query", query);
  log.data("max results", maxResults);
  log.sep();

  let browser: any;

  try {
    // ── 1. Launch browser ───────────────────────────────────────
    log.step("Launching Puppeteer (stealth mode)…");
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    log.ok("Browser launched");

    const page = await browser.newPage();

    // Set a realistic user-agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // ── 2. Navigate to Google Maps ──────────────────────────────
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    log.step(`Navigating to → ${url}`);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    log.ok("Page loaded");

    // ── 3. Wait for listings feed ───────────────────────────────
    log.step("Waiting for listings feed (div[role='feed'])…");
    await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
    log.ok("Feed found");

    // ── 4. Auto-scroll to load all results ─────────────────────
    log.step("Auto-scrolling feed to load all results…");
    const scrolledCount = await autoScroll(page);
    log.ok(`Scroll complete — triggered ~${scrolledCount} scroll iterations`);

    // ── 5. Collect listing elements ─────────────────────────────
    log.step("Collecting article elements from feed…");
  const listings = await page.$$('div[role="article"]');
    log.ok(`Found ${listings.length} listing elements`);

    if (listings.length === 0) {
      log.warn("No listings found — check selector or page load");
    }

   

    // ── 6. Scrape each listing ──────────────────────────────────
    const businesses: any[] = [];

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      log.step(`[${i + 1}/${listings.length}] Clicking listing…`);

      try {
        // Scroll listing into view before clicking
        await listing.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
        await new Promise(r => setTimeout(r, 400));

        await listing.click();
        log.ok(`[${i + 1}] Clicked`);

        // Wait for detail panel
        log.step(`[${i + 1}] Waiting for detail panel (h1)…`);
        await page.waitForSelector("h1", { timeout: 12000 });
        await new Promise(r => setTimeout(r, 800)); // let extra fields load
        log.ok(`[${i + 1}] Detail panel ready`);

        // Extract data from detail panel
        const data = await page.evaluate(() => {
          // Name
          const storeName = (document.querySelector("h1") as HTMLElement)?.innerText?.trim() || "";

          // Phone
          let phone = "";
          const phoneBtn = document.querySelector('button[data-item-id^="phone"]');
          if (phoneBtn) {
            const aria = phoneBtn.getAttribute("aria-label") || "";
            phone = aria.replace(/^Phone:\s*/i, "").trim();
          }

          // Website
          const websiteAnchor = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement;
          const website = websiteAnchor?.href || "";

          // Rating + reviews — try multiple selectors
          let stars: number | null = null;
          let numberOfReviews: number | null = null;

          const ratingEl =
            document.querySelector('div.F7nice span[aria-hidden="true"]') ||
            document.querySelector('span.ceNzKf');

          if (ratingEl) {
            const ratingText = (ratingEl as HTMLElement).innerText?.trim();
            const starMatch = ratingText?.match(/([\d.]+)/);
            if (starMatch) stars = parseFloat(starMatch[1]);
          }

          const reviewEl =
            document.querySelector('div.F7nice span[aria-label*="review"]') ||
            document.querySelector('button[jsaction*="pane.reviewChart"]');

          if (reviewEl) {
            const rvText = (reviewEl as HTMLElement).innerText || reviewEl.getAttribute("aria-label") || "";
            const rvMatch = rvText.match(/([\d,]+)/);
            if (rvMatch) numberOfReviews = parseInt(rvMatch[1].replace(/,/g, ""), 10);
          }

          // Address
          const addrBtn = document.querySelector('button[data-item-id="address"]');
          const address = addrBtn?.getAttribute("aria-label")?.replace(/^Address:\s*/i, "").trim() || "";

          // Category
          const category = (document.querySelector('button.DkEaL') as HTMLElement)?.innerText?.trim() || "";

          return { storeName, phone, website, stars, numberOfReviews, address, category };
        });

        log.ok(`[${i + 1}] Data extracted`);
        log.data(`[${i + 1}] ${data.storeName}`, {
          phone:   data.phone   || "(none)",
          stars:   data.stars   ?? "(none)",
          reviews: data.numberOfReviews ?? "(none)",
          address: data.address || "(none)",
          website: data.website ? "✓" : "(none)",
        });

        businesses.push(data);

      } catch (err: any) {
        log.err(`[${i + 1}] Failed to scrape listing → ${err.message}`);
      }

      log.sep();

      // Small delay between listings to avoid rate-limit
      await new Promise(r => setTimeout(r, 1200));
    }

    // ── 7. Close & respond ──────────────────────────────────────
    await browser.close();
    log.ok("Browser closed");

    const elapsed = Math.floor((Date.now() - start) / 1000);

    log.sep();
    log.ok(`Scrape complete — ${businesses.length} results in ${elapsed}s`);
    log.sep();

    return res.json({
      success: true,
      total:   businesses.length,
      time:    `${elapsed} sec`,
      query,
      data:    businesses,
    });

  } catch (error: any) {
    log.err(`Unhandled error → ${error.message}`);
    console.error(error);

    if (browser) {
      await browser.close().catch(() => {});
    }

    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Auto-scroll helper ───────────────────────────────────────────
async function autoScroll(page: any): Promise<number> {
  return page.evaluate((): Promise<number> => {
    return new Promise<number>((resolve) => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) { resolve(0); return; }

      let iterations   = 0;
      const distance   = 800;
      const interval   = 250;   // ms between scrolls
      const idleWait   = 3000;  // ms to wait after hitting bottom before giving up

      const timer = setInterval(async () => {
        const before = feed.scrollHeight;
        feed.scrollBy(0, distance);
        iterations++;

        // Check if we've reached the bottom
        if (feed.scrollTop + (feed as HTMLElement).offsetHeight >= before - 10) {
          // Wait for lazy-loaded content
          await new Promise(r => setTimeout(r, idleWait));
          const after = feed.scrollHeight;

          if (after <= before) {
            // No new content loaded — we're done
            clearInterval(timer);
            resolve(iterations);
          }
          // else: new content appeared, keep scrolling
        }
      }, interval);
    });
  });
}