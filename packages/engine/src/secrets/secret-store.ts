// T-007's boundary: packages/engine has zero Electron imports, but the
// contract runner (AC-013/TP-008 env injection) and the ACP permission
// broker (AC-013 secret-request routing) both need a way to resolve a named
// secret's value without knowing whether that's Electron `safeStorage`
// (the real, desktop-side implementation — see apps/desktop's secrets
// module), a CI env var, or a test double. This interface is that seam.

export interface SecretStore {
  /** The current value for a named secret, or undefined if not set. */
  get(name: string): Promise<string | undefined>;
  /**
   * Ask the store to obtain a value for a named secret it doesn't have yet
   * (AC-013: the user supplies it directly into the keychain, never through
   * chat/cards/prompt turns). Resolves once a value is available, or throws
   * if the request is declined.
   */
  request(name: string, reason?: string): Promise<string>;
}

/** In-memory test double — never persists anything, never touches the OS
 * keychain. `request()` resolves immediately from a pre-seeded map, or
 * throws if the name isn't seeded (simulating a declined request). */
export class FakeSecretStore implements SecretStore {
  constructor(private readonly seed: Record<string, string> = {}) {}

  async get(name: string): Promise<string | undefined> {
    return this.seed[name];
  }

  async request(name: string, reason?: string): Promise<string> {
    const value = this.seed[name];
    if (value === undefined) {
      throw new Error(
        `FakeSecretStore: no seeded value for "${name}"${reason ? ` (${reason})` : ""}`,
      );
    }
    return value;
  }
}

/** Where a project's machine-local state lives, keyed by the project's
 * stable ULID (PS-014) — never a repo-relative path, so it survives folder
 * moves/renames/fresh clones. The desktop app resolves this against its own
 * app-data directory; this signature is the shared contract. */
export type MachineLocalDirResolver = (projectId: string) => string;
