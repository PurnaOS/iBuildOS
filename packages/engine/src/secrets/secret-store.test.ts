import { describe, expect, it } from "vitest";
import { FakeSecretStore } from "./secret-store.js";

describe("FakeSecretStore", () => {
  it("returns undefined for an unseeded name via get()", async () => {
    const store = new FakeSecretStore();
    expect(await store.get("STRIPE_KEY")).toBeUndefined();
  });

  it("returns a seeded value via get() and request()", async () => {
    const store = new FakeSecretStore({ STRIPE_KEY: "sk_test_123" });
    expect(await store.get("STRIPE_KEY")).toBe("sk_test_123");
    expect(await store.request("STRIPE_KEY")).toBe("sk_test_123");
  });

  it("rejects request() for an unseeded name (simulates a declined request)", async () => {
    const store = new FakeSecretStore();
    await expect(store.request("MISSING", "needed for deploy")).rejects.toThrow(
      /no seeded value for "MISSING" \(needed for deploy\)/,
    );
  });
});
