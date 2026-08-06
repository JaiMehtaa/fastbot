import { test } from "node:test";
import assert from "node:assert/strict";
import { createFetchScraper, type LookupFn } from "./website-scraper.js";

const PUBLIC_IP = { address: "93.184.216.34" };
const alwaysPublicLookup: LookupFn = async () => PUBLIC_IP;

function htmlResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(body, { status: init.status ?? 200, headers: init.headers });
}

function fakeFetch(byUrl: Record<string, Response | (() => Response)>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = input.toString();
    const entry = byUrl[url];
    if (!entry) throw new Error(`unexpected fetch to ${url}`);
    return typeof entry === "function" ? entry() : entry;
  }) as typeof fetch;
}

test("scrapes a homepage with no discoverable links into a single-page result", async () => {
  const fetchImpl = fakeFetch({
    "https://example.com/": htmlResponse("<html><body><h1>Welcome to Meadow Soaps</h1><p>We sell soap.</p></body></html>"),
  });
  const scrape = createFetchScraper(fetchImpl, alwaysPublicLookup);
  const result = await scrape("https://example.com");

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("unreachable");
  assert.equal(result.site.pagesFetched.length, 1);
  assert.match(result.site.text, /Meadow Soaps/);
  assert.match(result.site.text, /We sell soap/);
});

test("rejects a loopback/private target without ever calling fetch", async () => {
  const fetchImpl = (async () => {
    throw new Error("fetch should never be called for a private target");
  }) as typeof fetch;
  const loopbackLookup: LookupFn = async () => ({ address: "127.0.0.1" });
  const scrape = createFetchScraper(fetchImpl, loopbackLookup);

  const result = await scrape("http://internal-service.example");
  assert.equal(result.status, "unreachable");
});

test("rejects the AWS/GCP metadata link-local address", async () => {
  const fetchImpl = (async () => {
    throw new Error("fetch should never be called for a link-local target");
  }) as typeof fetch;
  const metadataLookup: LookupFn = async () => ({ address: "169.254.169.254" });
  const scrape = createFetchScraper(fetchImpl, metadataLookup);

  const result = await scrape("http://metadata.internal");
  assert.equal(result.status, "unreachable");
});

test("rejects non-http(s) protocols outright", async () => {
  const fetchImpl = (async () => {
    throw new Error("fetch should never be called for a disallowed protocol");
  }) as typeof fetch;
  const scrape = createFetchScraper(fetchImpl, alwaysPublicLookup);

  const result = await scrape("javascript:alert(1)");
  assert.equal(result.status, "unreachable");
});

test("discovers and fetches a product-like and FAQ-like same-origin link, skipping an external one", async () => {
  const homeHtml = `<html><body>
    <a href="/products">Shop Now</a>
    <a href="/faq">Questions?</a>
    <a href="https://evil-external.example/products">External products</a>
  </body></html>`;
  const fetchImpl = fakeFetch({
    "https://example.com/": htmlResponse(homeHtml),
    "https://example.com/products": htmlResponse("<html><body>Lavender Soap Bar - $9</body></html>"),
    "https://example.com/faq": htmlResponse("<html><body>Q: Vegan? A: Yes.</body></html>"),
  });
  const scrape = createFetchScraper(fetchImpl, alwaysPublicLookup);
  const result = await scrape("https://example.com");

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("unreachable");
  assert.equal(result.site.pagesFetched.length, 3);
  assert.match(result.site.text, /Lavender Soap Bar/);
  assert.match(result.site.text, /Vegan/);
  assert.ok(!result.site.pagesFetched.some((p) => p.includes("evil-external")));
});

test("follows exactly one same-origin redirect hop then gives up on a second", async () => {
  const fetchImpl = fakeFetch({
    "https://example.com/": htmlResponse("", { status: 301, headers: { location: "/home" } }),
    "https://example.com/home": htmlResponse("", { status: 301, headers: { location: "/home2" } }),
  });
  const scrape = createFetchScraper(fetchImpl, alwaysPublicLookup);
  const result = await scrape("https://example.com");
  assert.equal(result.status, "unreachable");
});

test("a redirect to a private target is refused, not silently followed", async () => {
  const privateThenPublicLookup: LookupFn = (async (hostname: string) =>
    hostname === "internal.example" ? { address: "10.0.0.5" } : PUBLIC_IP) as LookupFn;
  const fetchImpl = fakeFetch({
    "https://example.com/": htmlResponse("", { status: 302, headers: { location: "https://internal.example/" } }),
  });
  const scrape = createFetchScraper(fetchImpl, privateThenPublicLookup);
  const result = await scrape("https://example.com");
  assert.equal(result.status, "unreachable");
});

test("a non-2xx homepage response is reported as unreachable, not thrown", async () => {
  const fetchImpl = fakeFetch({ "https://example.com/": htmlResponse("nope", { status: 500 }) });
  const scrape = createFetchScraper(fetchImpl, alwaysPublicLookup);
  const result = await scrape("https://example.com");
  assert.equal(result.status, "unreachable");
});

test("an oversized response is rejected rather than buffered in full", async () => {
  const big = "x".repeat(2_000_000);
  const fetchImpl = fakeFetch({ "https://example.com/": htmlResponse(big) });
  const scrape = createFetchScraper(fetchImpl, alwaysPublicLookup);
  const result = await scrape("https://example.com");
  assert.equal(result.status, "unreachable");
});

test("strips scripts, styles, and tags down to readable text", async () => {
  const html = `<html><body><script>evil()</script><style>.a{color:red}</style><h1>Meadow&nbsp;Soaps</h1><p>Est. 2020 &amp; growing</p></body></html>`;
  const fetchImpl = fakeFetch({ "https://example.com/": htmlResponse(html) });
  const scrape = createFetchScraper(fetchImpl, alwaysPublicLookup);
  const result = await scrape("https://example.com");

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("unreachable");
  assert.ok(!result.site.text.includes("evil()"));
  assert.ok(!result.site.text.includes("color:red"));
  assert.match(result.site.text, /Meadow Soaps/);
  assert.match(result.site.text, /Est\. 2020 & growing/);
});
