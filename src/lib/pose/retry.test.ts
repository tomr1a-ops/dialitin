import { describe, expect, test } from "vitest";
import { retryWithBackoff } from "@/lib/pose/retry";

describe("retryWithBackoff", () => {
  test("retries a failing load three times with backoff, then succeeds", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const result = await retryWithBackoff(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("Failed to fetch");
        }
        return "ok";
      },
      {
        attempts: 3,
        delaysMs: [10, 20],
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(waits).toEqual([10, 20]);
  });

  test("declares failure after three unsuccessful attempts", async () => {
    let attempts = 0;
    await expect(
      retryWithBackoff(
        async () => {
          attempts += 1;
          throw new Error("network down");
        },
        { attempts: 3, delaysMs: [0, 0], sleep: async () => undefined },
      ),
    ).rejects.toThrow("network down");
    expect(attempts).toBe(3);
  });
});
