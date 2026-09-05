import { afterEach, describe, expect, test } from "vitest";
import { getMagicLinkRedirectTo, getSiteUrl } from "@/lib/admin/site-url";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalVercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
  if (originalVercelUrl === undefined) {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  } else {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercelUrl;
  }
});

describe("getSiteUrl", () => {
  test("uses NEXT_PUBLIC_SITE_URL and strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://dialitin.ai/";
    expect(getSiteUrl()).toBe("https://dialitin.ai");
  });

  test("defaults to the apex host, not www", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(getSiteUrl()).toBe("https://dialitin.ai");
  });

  test("rewrites a www SITE_URL to the apex so PKCE stays on one host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.dialitin.ai";
    expect(getSiteUrl()).toBe("https://dialitin.ai");
    expect(getMagicLinkRedirectTo()).toBe(
      "https://dialitin.ai/admin/auth/callback",
    );
  });

  test("does not take a request host argument", () => {
    expect(getSiteUrl.length).toBe(0);
  });
});

describe("getMagicLinkRedirectTo", () => {
  test("builds emailRedirectTo from NEXT_PUBLIC_SITE_URL, never a request host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://dialitin.ai";
    expect(getMagicLinkRedirectTo()).toBe(
      "https://dialitin.ai/admin/auth/callback",
    );
    expect(getMagicLinkRedirectTo.length).toBe(0);
  });
});
