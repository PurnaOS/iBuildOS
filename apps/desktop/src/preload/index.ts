import { contextBridge, ipcRenderer } from "electron";
import {
  REQUEST_CHANNEL,
  SUBSCRIBE_CHANNEL,
  UNSUBSCRIBE_CHANNEL,
  SUBSCRIPTION_EVENT_PREFIX,
} from "../shared/ipc/channel-names.js";
import type { RequestName, ChannelName, RouterResult } from "../shared/ipc/contract.js";
import type { IbuildosApi } from "../shared/ipc/client-types.js";

// T-008/T-003: the only door from the renderer to main. contextIsolation is on
// and nodeIntegration is off (see src/main/index.ts's webPreferences) — this
// is the entire trust boundary, so it does nothing but forward typed calls
// through the shared contract; no bespoke per-feature IPC gets added outside
// this shape.

async function call<T>(name: RequestName, input: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(REQUEST_CHANNEL, name, input)) as RouterResult<T>;
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

let nextSubscriptionId = 0;

function subscribe<T>(
  name: ChannelName,
  params: unknown,
  onEvent: (event: T) => void,
): () => void {
  const subscriptionId = `sub-${++nextSubscriptionId}`;
  const eventChannel = `${SUBSCRIPTION_EVENT_PREFIX}${subscriptionId}`;
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => onEvent(payload);

  ipcRenderer.on(eventChannel, listener);
  ipcRenderer.send(SUBSCRIBE_CHANNEL, name, subscriptionId, params);

  return () => {
    ipcRenderer.send(UNSUBSCRIBE_CHANNEL, subscriptionId);
    ipcRenderer.removeListener(eventChannel, listener);
  };
}

const api: IbuildosApi = {
  projects: {
    list: () => call("projects.list", undefined),
    get: (input) => call("projects.get", input),
    create: (input) => call("projects.create", input),
    open: (input) => call("projects.open", input),
  },
  templates: {
    list: () => call("templates.list", undefined),
  },
  attention: {
    list: (input) => call("attention.list", input),
  },
  activity: {
    subscribe: (params, onEvent) => subscribe("activity.events", params, onEvent),
  },
  insights: {
    progress: (input) => call("insights.progress", input),
    quality: (input) => call("insights.quality", input),
    workload: (input) => call("insights.workload", input),
    adoption: (input) => call("insights.adoption", input),
    myQueue: (input) => call("insights.my-queue", input),
    teamNotes: (input) => call("insights.team-notes", input),
  },
};

contextBridge.exposeInMainWorld("ibuildos", api);
