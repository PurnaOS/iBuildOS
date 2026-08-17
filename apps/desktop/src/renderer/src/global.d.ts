import type { IbuildosApi } from "../../shared/ipc/client-types.js";

// The preload-exposed API surface (src/preload/index.ts), typed for the
// renderer only — main and preload have their own tsconfig and never see
// `window`. See tsconfig.web.json's include list.
declare global {
  interface Window {
    ibuildos: IbuildosApi;
  }
}

export {};
