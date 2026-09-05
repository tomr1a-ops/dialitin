import { describe, expect, test } from "vitest";
import {
  PKCE_SAME_BROWSER_MESSAGE,
  renderPkceFailurePage,
  resolveAdminAuthCallback,
  sanitizePkceDetail,
} from "@/lib/admin/pkce-callback";

describe("sanitizePkceDetail", () => {
  test("redacts token-like query values", () => {
    const detail = sanitizePkceDetail(
      "exchange failed access_token=supersecret refresh_token=also-secret code=abc123",
    );
    expect(detail).not.toContain("supersecret");
    expect(detail).not.toContain("also-secret");
    expect(detail).not.toContain("abc123");
    expect(detail).toContain("[redacted]");
  });
});

describe("renderPkceFailurePage", () => {
  test("shows the same-browser message above a technical detail", () => {
    const html = renderPkceFailurePage(
      "Auth session missing: pkce code verifier not found",
    );
    expect(html).toContain(PKCE_SAME_BROWSER_MESSAGE);
    expect(html).toContain("pkce code verifier not found");
    expect(html).not.toMatch(/access_token|refresh_token/i);
  });
});

describe("resolveAdminAuthCallback", () => {
  test("returns a same-browser page instead of bouncing to login when exchange fails", async () => {
    const result = await resolveAdminAuthCallback({
      code: "pkce-code",
      nextParam: "/admin/content",
      exchangeCode: async () => ({
        error: { message: "invalid request: pkce code verifier not found" },
      }),
    });

    expect(result.kind).toBe("pkce-failure");
    if (result.kind !== "pkce-failure") {
      return;
    }
    expect(result.html).toContain(PKCE_SAME_BROWSER_MESSAGE);
    expect(result.html).toContain("pkce code verifier not found");
    expect(result.kind).not.toBe("redirect");
  });

  test("redirects to the configured site after a successful exchange", async () => {
    const result = await resolveAdminAuthCallback({
      code: "pkce-code",
      nextParam: "/admin/content",
      exchangeCode: async () => ({ error: null }),
    });

    expect(result).toEqual({
      kind: "redirect",
      path: "/admin/content",
    });
  });
});
