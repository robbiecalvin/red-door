import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createCommunityRepository } from "../backend/src/repositories/communityRepository";
import { installPrivateInboxRoutes } from "../backend/src/routes/privateInboxRoutes";
import type { Session } from "../backend/src/services/authService";

it("isolates private inbox requests, drafts, and replies between members", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "badehaus-inbox-"));
  const repository = await createCommunityRepository(null, path.join(dir, "state.json"));
  const app = express();
  app.use(express.json());
  let blocked = false;
  installPrivateInboxRoutes(app, {
    repository,
    session(req, res) {
      const userId = req.get("x-test-user");
      if (!userId || userId === "guest") { res.sendStatus(403); return null; }
      return { userId } as Session;
    },
    canContact: (left, right) => !(blocked && new Set([left, right]).size === 2 && [left, right].includes("bob")),
    findName: async id => id,
    restricted: () => false,
    report: async () => "report"
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/private-inbox`;
  const request = (user: string, route: string, method = "GET", body?: unknown) => fetch(origin + route, {
    method, headers: { "x-test-user": user, "content-type": "application/json", connection: "close" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  try {
    const draftId = randomUUID();
    const draft = { recipient: "bob", subject: "Weekend plans", body: "Would you like to meet?", revision: 0 };
    expect((await request("guest", "/threads")).status).toBe(403);
    expect((await request("alice", "/drafts/" + draftId, "PUT", draft)).status).toBe(200);
    expect((await request("alice", "/drafts/" + draftId, "PUT", draft)).status).toBe(409);
    expect(await (await request("bob", "/drafts")).json()).toEqual({ drafts: [] });
    await request("bob", "/preferences", "PUT", { incoming: "nobody" });
    const start = () => request("alice", "/threads", "POST", { ...draft, requestId: draftId });
    expect((await start()).status).toBe(403);
    await request("bob", "/preferences", "PUT", { incoming: "requests" });
    const { id } = await (await start()).json();
    expect(await (await start()).json()).toEqual({ id });
    expect(await (await request("alice", "/drafts")).json()).toEqual({ drafts: [] });
    const route = "/threads/" + id;
    expect((await request("carol", route)).status).toBe(404);
    expect(await (await request("bob", "/threads?folder=inbox")).json()).toMatchObject({ threads: [] });
    expect(await (await request("bob", "/threads?folder=requests")).json()).toMatchObject({
      threads: [{ id, status: "pending", unread: true }]
    });
    const reply = { body: "Yes, let’s set a time.", requestId: randomUUID() };
    expect((await request("bob", route + "/messages", "POST", reply)).status).toBe(409);
    expect((await request("alice", route, "PATCH", { action: "accept" })).status).toBe(400);
    expect((await request("bob", route, "PATCH", { action: "accept" })).status).toBe(200);
    const sent = await (await request("bob", route + "/messages", "POST", reply)).json();
    expect(await (await request("bob", route + "/messages", "POST", reply)).json()).toEqual(sent);
    expect(await (await request("alice", route)).json()).toMatchObject({
      thread: { unread: true }, messages: [{ body: draft.body }, { body: reply.body }]
    });
    await request("alice", route, "PATCH", { action: "read", through: sent.message.at });
    expect(await (await request("alice", route)).json()).toMatchObject({ thread: { unread: false } });
    blocked = true;
    expect((await request("bob", route + "/messages", "POST", { ...reply, requestId: randomUUID() })).status).toBe(404);
    blocked = false;
    await request("alice", route, "PATCH", { action: "hide" });
    expect((await request("alice", route)).status).toBe(404);
    expect((await request("bob", route)).status).toBe(200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
