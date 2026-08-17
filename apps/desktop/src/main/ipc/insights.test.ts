import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InsightsBackend } from "../backend/insights.js";
import { insightsHandlers } from "./insights.js";

describe("insightsHandlers", () => {
  let backend: InsightsBackend;
  let handlers: ReturnType<typeof insightsHandlers>;

  beforeEach(() => {
    backend = new InsightsBackend();
    handlers = insightsHandlers(backend);
  });

  afterEach(() => {
    backend.dispose();
  });

  it("insights.progress delegates to backend.getProgress", async () => {
    const result = await handlers["insights.progress"]({ projectId: "seed-equipment-inspections" });
    expect(result).toEqual(backend.getProgress("seed-equipment-inspections"));
  });

  it("insights.quality delegates to backend.getQuality", async () => {
    const result = await handlers["insights.quality"]({ projectId: "seed-field-sync-api" });
    expect(result).toEqual(backend.getQuality("seed-field-sync-api"));
  });

  it("insights.workload delegates to backend.getWorkload", async () => {
    const result = await handlers["insights.workload"]({ projectId: "seed-equipment-inspections" });
    expect(result).toEqual(backend.getWorkload("seed-equipment-inspections"));
  });

  it("insights.adoption delegates to backend.getAdoptionProgress", async () => {
    const result = await handlers["insights.adoption"]({ projectId: "seed-field-sync-api" });
    expect(result).toEqual(backend.getAdoptionProgress("seed-field-sync-api"));
  });

  it("insights.my-queue delegates to backend.getMyQueue", async () => {
    const result = await handlers["insights.my-queue"]({ projectId: "seed-field-sync-api" });
    expect(result).toEqual(backend.getMyQueue("seed-field-sync-api"));
  });

  it("insights.team-notes delegates to backend.getTeamNotes", async () => {
    const result = await handlers["insights.team-notes"]({ projectId: "seed-release-notes-site" });
    expect(result).toEqual(backend.getTeamNotes("seed-release-notes-site"));
  });

  it("every handler passes an unseen projectId straight through without throwing", async () => {
    const projectId = "brand-new-project";
    expect(await handlers["insights.progress"]({ projectId })).toMatchObject({ projectId });
    expect(await handlers["insights.quality"]({ projectId })).toMatchObject({ projectId });
    expect(await handlers["insights.workload"]({ projectId })).toMatchObject({ projectId });
    expect(await handlers["insights.adoption"]({ projectId })).toMatchObject({ projectId });
    expect(await handlers["insights.my-queue"]({ projectId })).toMatchObject({ projectId });
    expect(await handlers["insights.team-notes"]({ projectId })).toMatchObject({ projectId });
  });
});
