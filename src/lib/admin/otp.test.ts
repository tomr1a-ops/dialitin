import { describe, expect, test } from "vitest";
import { buildAdminOtpSendParams, buildAdminOtpVerifyParams } from "@/lib/admin/otp";

describe("buildAdminOtpSendParams", () => {
  test("trims and lowercases email and omits any redirect URL", () => {
    const params = buildAdminOtpSendParams("  Info@DialItIn.ai  ");
    expect(params.email).toBe("info@dialitin.ai");
    expect(params.options).toEqual({ shouldCreateUser: true });
    expect(params.options).not.toHaveProperty("emailRedirectTo");
  });
});

describe("buildAdminOtpVerifyParams", () => {
  test("verifies the typed email OTP, not a magic-link callback", () => {
    expect(buildAdminOtpVerifyParams("  Info@DialItIn.ai  ", " 12 3456 ")).toEqual({
      email: "info@dialitin.ai",
      token: "123456",
      type: "email",
    });
  });
});
