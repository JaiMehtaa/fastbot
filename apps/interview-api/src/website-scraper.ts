import { lookup } from "node:dns/promises";

export type LookupFn = (hostname: string) => Promise<{ address: string }>;

export interface ScrapedSite {
  url: string;
  text: string;
  pagesFetched: readonly string[];
}

export type ScrapeResult = { status: "ok"; site: ScrapedSite } | { status: "unreachable"; reason: string };

export type ScrapeWebsiteFn = (url: string) => Promise<ScrapeResult>;

const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 20_000;
const MAX_ADDITIONAL_PAGES = 2;
const USER_AGENT = "WhatsAppBotPlatformInterview/1.0";

const PRODUCT_LINK_KEYWORDS = ["product", "shop", "store", "catalog", "catalogue", "menu"];
const FAQ_LINK_KEYWORDS = ["faq", "help", "support", "contact"];

/**
 * Blocks the obvious SSRF targets (loopback, RFC1918 private ranges,
 * link-local — including the 169.254.169.254 cloud-metadata address —
 * and IPv6 equivalents) by resolving the hostname and checking the actual
 * IP, not just pattern-matching the hostname string.
 *
 * Known limitation, not fully closed here: this checks the IP at lookup
 * time, then fetch() resolves DNS again to actually connect — a
 * DNS-rebinding attacker could serve a public IP on the first lookup and a
 * private one moments later. Properly closing that gap means pinning the
 * validated IP and connecting to it directly (a custom fetch dispatcher),
 * which is real additional work left for a follow-up hardening pass; this
 * is a reasonable, honest mitigation for an interview-time convenience
 * feature, not a claim of airtight SSRF protection.
 */
async function isPrivateTarget(hostname: string, lookupFn: LookupFn): Promise<boolean> {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;

  let address: string;
  try {
    address = (await lookupFn(hostname)).address;
  } catch {
    return true; // can't resolve -> treat as untrusted, refuse rather than guess
  }

  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("::ffff:127.") // IPv4-mapped loopback
    );
  }

  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 127 || // loopback
    a === 10 || // RFC1918
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    a === 0
  );
}

async function validatedUrl(raw: string, lookupFn: LookupFn): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (await isPrivateTarget(url.hostname, lookupFn)) return null;
  return url;
}

async function readBounded(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function htmlToText(html: string): string {
  const withoutNonContent = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const withoutTags = withoutNonContent.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags.replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ENTITIES[e] ?? " ");
  return decoded.replace(/\s+/g, " ").trim();
}

interface DiscoveredLink {
  href: string;
  text: string;
}

function discoverLinks(html: string, base: URL): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];
  const pattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>(.*?)<\/a>/gis;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    try {
      const resolved = new URL(match[1]!, base);
      if (resolved.hostname !== base.hostname) continue;
      links.push({ href: resolved.toString(), text: htmlToText(match[2] ?? "") });
    } catch {
      continue;
    }
  }
  return links;
}

function pickBestLink(links: readonly DiscoveredLink[], keywords: readonly string[], exclude: Set<string>): string | null {
  for (const link of links) {
    if (exclude.has(link.href)) continue;
    const haystack = `${link.href} ${link.text}`.toLowerCase();
    if (keywords.some((keyword) => haystack.includes(keyword))) return link.href;
  }
  return null;
}

async function fetchPage(
  url: URL,
  fetchImpl: typeof fetch,
  lookupFn: LookupFn,
): Promise<{ html: string } | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop <= 1; hop++) {
      const response = await fetchImpl(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop === 1) return { error: "too many redirects" };
        const next = await validatedUrl(new URL(location, current).toString(), lookupFn);
        if (!next) return { error: "redirected to a disallowed target" };
        current = next;
        continue;
      }

      if (!response.ok) return { error: `received HTTP ${response.status}` };
      const text = await readBounded(response);
      if (text === null) return { error: "response too large" };
      return { html: text };
    }
    return { error: "too many redirects" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "fetch failed" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches a business's homepage plus, if discoverable, one product/shop-like
 * page and one FAQ/support-like page (same origin only), strips each down
 * to plain text, and combines them into one document — fed straight into
 * the existing field-extractor.ts/extractFields() machinery as `freeText`
 * against a locked draft's missingRequiredFields, exactly like a
 * conversational turn's answer. No meaningful "heuristic" substitute
 * exists for this the way heuristic-extractor.ts approximates the LLM
 * extractor — either the real internet gets fetched or it doesn't — so
 * this is what createServer()'s zero-config default uses too.
 */
export function createFetchScraper(fetchImpl: typeof fetch = fetch, lookupFn: LookupFn = lookup): ScrapeWebsiteFn {
  return async function scrapeWebsite(rawUrl): Promise<ScrapeResult> {
    const homepage = await validatedUrl(rawUrl, lookupFn);
    if (!homepage) return { status: "unreachable", reason: "not a valid, publicly-reachable http(s) URL" };

    const homeResult = await fetchPage(homepage, fetchImpl, lookupFn);
    if ("error" in homeResult) return { status: "unreachable", reason: homeResult.error };

    const pagesFetched = [homepage.toString()];
    const sections = [`=== ${homepage.pathname || "/"} ===\n${htmlToText(homeResult.html)}`];

    const links = discoverLinks(homeResult.html, homepage);
    const chosen = new Set<string>();
    const productLink = pickBestLink(links, PRODUCT_LINK_KEYWORDS, chosen);
    if (productLink) chosen.add(productLink);
    const faqLink = pickBestLink(links, FAQ_LINK_KEYWORDS, chosen);
    if (faqLink) chosen.add(faqLink);

    for (const link of [...chosen].slice(0, MAX_ADDITIONAL_PAGES)) {
      const validated = await validatedUrl(link, lookupFn);
      if (!validated) continue;
      const result = await fetchPage(validated, fetchImpl, lookupFn);
      if ("html" in result) {
        pagesFetched.push(validated.toString());
        sections.push(`=== ${validated.pathname || "/"} ===\n${htmlToText(result.html)}`);
      }
    }

    const text = sections.join("\n\n").slice(0, MAX_TEXT_CHARS);
    return { status: "ok", site: { url: homepage.toString(), text, pagesFetched } };
  };
}
