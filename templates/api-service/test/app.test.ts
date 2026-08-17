import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";

// Hono's own testing helper (app.request()) — no supertest/live-port needed;
// the app is a fetch handler, so calling it directly returns a real Response.
// Each test file gets a fresh in-memory SQLite database, migrated the same
// way dev/seed are.
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp(createDb("file::memory:"));
});

describe("GET /health", () => {
  it("returns 200 with a status payload", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("items", () => {
  it("creates an item and lists it back", async () => {
    const createRes = await app.request("/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "First widget" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { item: { id: number; name: string } };
    expect(created.item.name).toBe("First widget");
    expect(created.item.id).toEqual(expect.any(Number));

    const listRes = await app.request("/items");
    expect(listRes.status).toBe(200);
    const { items } = (await listRes.json()) as { items: Array<{ name: string }> };
    expect(items.some((item) => item.name === "First widget")).toBe(true);
  });

  it("fetches a single item by id", async () => {
    const createRes = await app.request("/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Second widget" }),
    });
    const created = (await createRes.json()) as { item: { id: number } };

    const getRes = await app.request(`/items/${created.item.id}`);
    expect(getRes.status).toBe(200);
    const { item } = (await getRes.json()) as { item: { name: string } };
    expect(item.name).toBe("Second widget");
  });

  it("404s for a missing item", async () => {
    const res = await app.request("/items/999999");
    expect(res.status).toBe(404);
  });

  it("400s when name is missing", async () => {
    const res = await app.request("/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
