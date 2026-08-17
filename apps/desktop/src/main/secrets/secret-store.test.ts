import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ElectronSecretStore, type SafeStorageLike } from "./secret-store.js";

// Exercises ElectronSecretStore against an injected safeStorage-shaped fake
// — real Electron safeStorage only runs inside a launched Electron process,
// not plain Vitest, so this file never imports "electron" (see
// secret-store.ts's header comment; only ./index.ts does that). The fake's
// "encryption" is a reversible tag, not real crypto — good enough to prove
// this module's own logic (file layout, environment scoping, refusal
// policy) without needing real safeStorage's guarantees, which were instead
// verified against a real launched Electron process on this machine (see
// this task's final report for what that probe found).

function fakeSafeStorage(overrides: Partial<SafeStorageLike> = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText) => Buffer.from(`enc:${plainText}`, "utf-8"),
    decryptString: (encrypted) => encrypted.toString("utf-8").replace(/^enc:/, ""),
    ...overrides,
  };
}

describe("ElectronSecretStore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ibuildos-secrets-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeStore(
    options: {
      environment?: string;
      projectId?: string;
      safeStorage?: SafeStorageLike;
      allowInsecureStorage?: boolean;
      onWarning?: (message: string) => void;
    } = {},
  ): ElectronSecretStore {
    return new ElectronSecretStore({
      projectId: options.projectId ?? "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      environment: options.environment ?? "local",
      safeStorage: options.safeStorage ?? fakeSafeStorage(),
      machineLocalDir: (projectId) => join(tmpDir, "projects", projectId),
      ...(options.allowInsecureStorage !== undefined
        ? { allowInsecureStorage: options.allowInsecureStorage }
        : {}),
      ...(options.onWarning !== undefined ? { onWarning: options.onWarning } : {}),
    });
  }

  it("get() returns undefined for a name never stored", async () => {
    const store = makeStore();
    expect(await store.get("STRIPE_KEY")).toBeUndefined();
  });

  it("round-trips a value through encryptString/decryptString via set() then get()", async () => {
    const store = makeStore();
    await store.set("STRIPE_KEY", "sk_test_123");
    expect(await store.get("STRIPE_KEY")).toBe("sk_test_123");
  });

  it("persists across separate store instances pointed at the same project+environment", async () => {
    const writer = makeStore();
    await writer.set("STRIPE_KEY", "sk_test_123");

    // A fresh instance (as a new contract run would construct) must read
    // the same encrypted value back off disk — proves this is real
    // file-backed persistence, not just in-memory instance state.
    const reader = makeStore();
    expect(await reader.get("STRIPE_KEY")).toBe("sk_test_123");
  });

  it("keeps secrets isolated per environment for the same project", async () => {
    const staging = makeStore({ environment: "staging" });
    await staging.set("STRIPE_KEY", "sk_staging");

    const local = makeStore({ environment: "local" });
    expect(await local.get("STRIPE_KEY")).toBeUndefined();
    expect(await staging.get("STRIPE_KEY")).toBe("sk_staging");
  });

  it("keeps secrets isolated per project", async () => {
    const projectA = makeStore({ projectId: "project-a" });
    await projectA.set("STRIPE_KEY", "sk_a");

    const projectB = makeStore({ projectId: "project-b" });
    expect(await projectB.get("STRIPE_KEY")).toBeUndefined();
  });

  describe("request()", () => {
    it("succeeds immediately for an already-stored value, matching get()", async () => {
      const store = makeStore();
      await store.set("STRIPE_KEY", "sk_test_123");
      expect(await store.request("STRIPE_KEY")).toBe("sk_test_123");
    });

    it("throws for a missing value — the secret-request UI prompt isn't wired up yet", async () => {
      const store = makeStore();
      await expect(store.request("STRIPE_KEY", "needed for deploy")).rejects.toThrow(
        /no stored value for "STRIPE_KEY" \(needed for deploy\)/,
      );
    });

    it("throws without a parenthetical when no reason is given", async () => {
      const store = makeStore();
      await expect(store.request("STRIPE_KEY")).rejects.toThrow(
        /no stored value for "STRIPE_KEY"(?! \()/,
      );
    });
  });

  describe("Linux basic_text refusal (T-010)", () => {
    it("refuses to store when the backend is basic_text and allowInsecureStorage is unset", async () => {
      const warnings: string[] = [];
      const store = makeStore({
        safeStorage: fakeSafeStorage({ getSelectedStorageBackend: () => "basic_text" }),
        onWarning: (message) => warnings.push(message),
      });

      await expect(store.set("STRIPE_KEY", "sk_test_123")).rejects.toThrow(/basic_text/);
      // get() on an empty store is still a legitimate "not set" — refusal
      // only blocks writes, not reads of whatever (nothing, here) exists.
      expect(await store.get("STRIPE_KEY")).toBeUndefined();
      expect(warnings.some((w) => w.includes("basic_text"))).toBe(true);
    });

    it("stores anyway when allowInsecureStorage: true is passed", async () => {
      const store = makeStore({
        safeStorage: fakeSafeStorage({ getSelectedStorageBackend: () => "basic_text" }),
        allowInsecureStorage: true,
      });

      await store.set("STRIPE_KEY", "sk_test_123");
      expect(await store.get("STRIPE_KEY")).toBe("sk_test_123");
    });

    it("does not refuse for a real Linux keyring backend (gnome_libsecret)", async () => {
      const store = makeStore({
        safeStorage: fakeSafeStorage({ getSelectedStorageBackend: () => "gnome_libsecret" }),
      });

      await store.set("STRIPE_KEY", "sk_test_123");
      expect(await store.get("STRIPE_KEY")).toBe("sk_test_123");
    });

    it("does not refuse when getSelectedStorageBackend is absent entirely (the real macOS shape)", async () => {
      // Verified against a real launched Electron 43 process on macOS:
      // `typeof safeStorage.getSelectedStorageBackend === "undefined"`
      // there — fakeSafeStorage()'s default omits the method for exactly
      // this reason (see its definition above).
      const store = makeStore({ safeStorage: fakeSafeStorage() });

      await store.set("STRIPE_KEY", "sk_test_123");
      expect(await store.get("STRIPE_KEY")).toBe("sk_test_123");
    });

    it("allowInsecureStorage: true also bypasses the real keyring-less-Linux shape (isEncryptionAvailable: false too)", async () => {
      // On genuine keyring-less Linux, safeStorage.isEncryptionAvailable()
      // is *also* false, not just getSelectedStorageBackend() ===
      // "basic_text" — this is the shape allowInsecureStorage must actually
      // bypass, or the opt-in would be inert on the one platform it exists
      // for (see computeRefusal()'s comment).
      const store = makeStore({
        safeStorage: fakeSafeStorage({
          getSelectedStorageBackend: () => "basic_text",
          isEncryptionAvailable: () => false,
        }),
        allowInsecureStorage: true,
      });

      await store.set("STRIPE_KEY", "sk_test_123");
      expect(await store.get("STRIPE_KEY")).toBe("sk_test_123");
    });
  });

  it("refuses to store when safeStorage reports encryption unavailable, regardless of backend", async () => {
    const store = makeStore({
      safeStorage: fakeSafeStorage({ isEncryptionAvailable: () => false }),
    });

    await expect(store.set("STRIPE_KEY", "sk_test_123")).rejects.toThrow(
      /encryption is not available/,
    );
  });

  it("get() returns undefined (not a thrown SyntaxError) for a corrupt secrets.json", async () => {
    const projectId = "corrupt-file-project";
    const projectDir = join(tmpDir, "projects", projectId);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "secrets.json"), "{ this is not valid json", "utf-8");

    const store = makeStore({ projectId });
    await expect(store.get("STRIPE_KEY")).resolves.toBeUndefined();
  });
});
