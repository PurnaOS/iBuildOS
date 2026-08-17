import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MachineLocalDirResolver, SecretStore } from "@ibuildos/engine";

// T-010: secret values are encrypted at rest via Electron's `safeStorage`
// (OS-keychain-backed: macOS Keychain, Windows DPAPI, Linux gnome-libsecret/
// kwallet — or, absent a keyring, a weak backend-derived key under Linux's
// `basic_text` fallback, which this module refuses to write under by
// default; see computeRefusal() below), keyed per stable project id
// (PS-014) plus named environment (PV-005: local, staging, ...). One
// `ElectronSecretStore` instance is scoped to a single (project,
// environment) pair — the `SecretStore` interface's `get`/`request` only
// take a variable `name`, no environment, so environment has to be fixed at
// construction; this also matches how a contract run resolves secrets for
// exactly one environment at a time (see packages/engine's secret-store.ts
// doc comment: the contract runner / ACP permission broker each resolve *a*
// SecretStore, not a multi-environment one).
//
// On-disk layout: one JSON file per project, at
// `<machineLocalDir(projectId)>/secrets.json`, holding every environment's
// secrets for that project:
//
//   { "version": 1,
//     "environments": {
//       "staging": { "STRIPE_KEY": "<base64 of safeStorage.encryptString()>" },
//       "local": { ... }
//     } }
//
// `machineLocalDir` is the shared PS-014 resolver type from
// packages/engine (`MachineLocalDirResolver`) — the same per-project
// directory that will also hold agent connections and transcripts (PS-014
// lists all three as machine-local state keyed to the project id), so
// secrets.json is one file among future siblings there, not the whole of a
// project's machine-local state. A single JSON object (rather than one file
// per secret or per environment) keeps the file count small and every write
// a single whole-file replace — atomic-enough for Electron's single main
// process (no concurrent writers within one process); multi-process file
// locking is not needed at this milestone and isn't implemented.
//
// Electron's `safeStorage` is received as a narrow structural type
// (SafeStorageLike below), never imported from "electron" in this file —
// that's what lets this module run under plain Vitest with an injected fake
// instead of a launched Electron process, the same approach
// src/main/ipc.ts takes for `ipcMain` (see that file's comment). Only
// ./index.ts imports the real `electron` module and wires the real
// `safeStorage`/`app.getPath`.

/**
 * The subset of Electron's `safeStorage` API this store depends on, verified
 * against the installed `electron` package's electron.d.ts (v43) and
 * against a real launched Electron process on this machine (macOS):
 *
 * - `getSelectedStorageBackend` is typed **optional** here because it is
 *   genuinely absent at runtime off Linux — `typeof safeStorage
 *   .getSelectedStorageBackend === "undefined"` on macOS, confirmed live,
 *   not just "present but returns something unhelpful." Electron's own
 *   .d.ts marks it `@platform linux` but still types it as always-present;
 *   the real object disagrees, so this module trusts the `typeof` check
 *   below over the .d.ts's non-optional signature.
 * - `isEncryptionAvailable`/`encryptString`/`decryptString` are present and
 *   behave as documented on every platform (verified encrypt→decrypt
 *   round-trips through the real backend on macOS).
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export interface ElectronSecretStoreOptions {
  /** Stable per-project ULID (PS-014) — never a repo-relative path, so
   * secrets survive folder moves/renames/fresh clones. */
  projectId: string;
  /** Named environment this store instance resolves secrets for (PV-005:
   * local, staging, ...). */
  environment: string;
  safeStorage: SafeStorageLike;
  /** Resolves this project's machine-local state directory (PS-014).
   * Production wiring is ./index.ts's `app.getPath("userData")`-based
   * resolver; tests pass one pointed at a temp directory. */
  machineLocalDir: MachineLocalDirResolver;
  /** Opt in to storing secrets even when the OS has no crypto-backed
   * keyring (Linux `basic_text` — T-010). Defaults to false: refuse to
   * persist and warn instead of encrypting under a weak, easily-recovered
   * key. */
  allowInsecureStorage?: boolean;
  /** Called once at construction if storage is refused (and again if a
   * caller tries `set()` anyway). Defaults to `console.warn`. */
  onWarning?: (message: string) => void;
}

interface SecretFile {
  version: 1;
  environments: Record<string, Record<string, string>>;
}

/** Real, Electron-`safeStorage`-backed implementation of `@ibuildos/engine`'s
 * `SecretStore` interface. See this file's header comment for the on-disk
 * layout and the keyring-less-Linux refusal policy (T-010). */
export class ElectronSecretStore implements SecretStore {
  private readonly environment: string;
  private readonly safeStorage: SafeStorageLike;
  private readonly filePath: string;
  private readonly allowInsecureStorage: boolean;
  private readonly warn: (message: string) => void;
  /** Set once at construction; non-undefined means `set()` will refuse. */
  private readonly refusal: string | undefined;

  constructor(options: ElectronSecretStoreOptions) {
    this.environment = options.environment;
    this.safeStorage = options.safeStorage;
    this.allowInsecureStorage = options.allowInsecureStorage ?? false;
    this.warn = options.onWarning ?? ((message) => console.warn(message));
    this.filePath = join(options.machineLocalDir(options.projectId), "secrets.json");

    this.refusal = this.computeRefusal();
    if (this.refusal) this.warn(`ElectronSecretStore: ${this.refusal}`);
  }

  private computeRefusal(): string | undefined {
    // Linux, no keyring: safeStorage falls back to a "basic_text" backend
    // (a static, non-OS-protected key) — refuse unless explicitly opted in.
    // The `typeof` guard is load-bearing, not defensive boilerplate: on
    // macOS/Windows this method doesn't exist at all (see SafeStorageLike's
    // doc comment), so calling it unconditionally would throw instead of
    // simply not matching.
    //
    // `allowInsecureStorage: true` bypasses both checks below, not just the
    // `basic_text` one — T-010 describes a single opt-in ("refuses to store
    // secrets unless the user explicitly opts in"), and on real keyring-less
    // Linux `isEncryptionAvailable()` is *also* false (see its second check's
    // comment), so gating only the first branch would make the opt-in inert
    // on the one platform it exists for. Note that opting in here does not
    // by itself make `safeStorage.encryptString()` succeed under
    // `basic_text` — the real API additionally needs
    // `safeStorage.setUsePlainTextEncryption(true)` called somewhere
    // upstream (Electron main-process setup, not this module's job); without
    // it, `set()` will pass our refusal check but the native call may still
    // throw its own error.
    if (this.allowInsecureStorage) return undefined;

    if (typeof this.safeStorage.getSelectedStorageBackend === "function") {
      const backend = this.safeStorage.getSelectedStorageBackend();
      if (backend === "basic_text") {
        return (
          "refusing to store secrets — no OS keyring was found (safeStorage backend is " +
          '"basic_text"), so values would be encrypted under a static, easily-recovered key. ' +
          "Install a keyring (gnome-keyring or kwallet) and restart, or construct with " +
          "{ allowInsecureStorage: true } to opt in anyway."
        );
      }
    }
    // Also catches constructing before Electron's `app` has emitted
    // 'ready': on Linux, getSelectedStorageBackend() reports "unknown"
    // pre-ready (not yet "basic_text", so the branch above won't fire), but
    // isEncryptionAvailable() is reliably false there too — see
    // ./index.ts's construction-order note.
    if (!this.safeStorage.isEncryptionAvailable()) {
      return "refusing to store secrets — safeStorage reports encryption is not available on this system.";
    }
    return undefined;
  }

  async get(name: string): Promise<string | undefined> {
    const file = this.readFile();
    const encoded = file.environments[this.environment]?.[name];
    if (encoded === undefined) return undefined;
    return this.safeStorage.decryptString(Buffer.from(encoded, "base64"));
  }

  async request(name: string, reason?: string): Promise<string> {
    const value = await this.get(name);
    if (value !== undefined) return value;
    throw new Error(
      `ElectronSecretStore: no stored value for "${name}"${reason ? ` (${reason})` : ""} — ` +
        "the secret-request UI prompt (AC-013) is not wired up yet (M6 scope); store the " +
        "value directly (ElectronSecretStore.set) in the meantime.",
    );
  }

  /** Encrypts and persists `value` for `name` in this store's environment.
   * Not part of the `SecretStore` interface — that interface is
   * deliberately read/request-only from the contract-runner and permission-
   * broker's point of view (see packages/engine's secret-store.ts). `set()`
   * is the write path a future secret-request UI (M6) or a settings screen
   * calls once it exists. Throws if this store refused storage at
   * construction (see computeRefusal()/T-010). */
  async set(name: string, value: string): Promise<void> {
    if (this.refusal) {
      throw new Error(`ElectronSecretStore: cannot store "${name}" — ${this.refusal}`);
    }
    const encrypted = this.safeStorage.encryptString(value);
    const file = this.readFile();
    const env = file.environments[this.environment] ?? {};
    env[name] = encrypted.toString("base64");
    file.environments[this.environment] = env;
    this.writeFile(file);
  }

  private readFile(): SecretFile {
    if (!existsSync(this.filePath)) return { version: 1, environments: {} };
    try {
      return JSON.parse(readFileSync(this.filePath, "utf-8")) as SecretFile;
    } catch {
      // A truncated/corrupt/hand-edited secrets.json must not turn `get()`
      // into a thrown error — the interface contract is "undefined means
      // not set," and a broken file is operationally indistinguishable from
      // an empty one to a caller. `set()` calls readFile() too, so a
      // corrupt file self-heals into a fresh, valid one on the next write.
      this.warn(
        `ElectronSecretStore: ${this.filePath} is not valid JSON — treating it as empty.`,
      );
      return { version: 1, environments: {} };
    }
  }

  private writeFile(file: SecretFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(file, null, 2), "utf-8");
  }
}
