import express from "express";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCommunityRepository } from "../backend/src/repositories/communityRepository";
import { adultProfileFavorites, installAdultLibraryRoutes } from "../backend/src/routes/adultLibraryRoutes";
import type { Session, StoredUser } from "../backend/src/services/authService";
import type { AdultVideo } from "../shared/adultLibrary";

it("limits profile favorites to three catalog videos and restricts catalog editing to administrators", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "badehaus-video-library-"));
  const previousCatalog = process.env.ADULT_CATALOG_DIR;
  const category = "sample-abcdef1234";
  fs.mkdirSync(path.join(directory, category));
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify([{ name: "Sample", slug: category, pages: 1 }]));
  fs.writeFileSync(path.join(directory, category, "1.json"), JSON.stringify([{ watchUrl: "https://example.com/watch", thumbnailUrl: "" }]));
  process.env.ADULT_CATALOG_DIR = directory;
  const repository = await createCommunityRepository(null, path.join(directory, "community.json"));
  const app = express();
  app.use(express.json());
  let favorites: string[] = [];
  installAdultLibraryRoutes(app, {
    repository,
    member(req, res) {
      const identity = req.get("x-fixture-member");
      if (identity !== "member" && identity !== "admin") {
        res.status(403).end();
        return null;
      }
      return {
        user: { id: identity, plusData: { adultVideoFavorites: favorites } } as StoredUser,
        session: { role: identity === "admin" ? "admin" : "user" } as Session
      };
    },
    async changeFavorite(userId, update) {
      expect(userId).toBe("member");
      favorites = update(favorites);
      return favorites;
    },
    async saveFavorites(userId, ids) {
      expect(userId).toBe("member");
      favorites = ids;
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  function request(route: string, member = "member", method = "GET", body?: unknown) {
    return fetch(origin + route, {
      method, headers: { "x-fixture-member": member, "content-type": "application/json", connection: "close" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  try {
    const catalogRoute = `/adult-library/catalog?category=${category}&page=1`;
    expect((await request(catalogRoute, "guest")).status).toBe(403);
    expect((await request(catalogRoute.replace("page=1", "page=2"))).status).toBe(404);
    const catalogResponse = await request(catalogRoute);
    expect(catalogResponse.headers.get("cache-control")).toBe("private, no-store");
    const catalog = await catalogResponse.json();
    expect(catalog).toMatchObject({ page: 1, videos: [{ thumbnailUrl: "" }] });
    const bulkId = catalog.videos[0].id;
    const draft = { title: "Sample video", creator: "Fixture studio", category: "solo",
      watchUrl: "https://example.com/watch", thumbnailUrl: "https://example.com/preview.jpg" };
    expect((await request("/adult-library", "guest")).status).toBe(403);
    expect((await request("/admin/adult-library", "member", "PUT", draft)).status).toBe(403);
    expect((await request("/admin/adult-library", "admin", "PUT", { ...draft, thumbnailUrl: "data:image/png," })).status).toBe(400);
    const videos: AdultVideo[] = [];
    for (let index = 0; index < 4; index++) {
      const response = await request("/admin/adult-library", "admin", "PUT", { ...draft, title: `Sample ${index + 1}` });
      expect(response.status).toBe(200);
      videos.push((await response.json()).video);
    }
    expect((await request("/adult-library/previews", "guest")).status).toBe(403);
    const previewResponse = await request("/adult-library/previews");
    expect(previewResponse.headers.get("cache-control")).toBe("private, no-store");
    const previews: AdultVideo[] = (await previewResponse.json()).videos;
    expect(new Set(previews.map(video => video.id)).size).toBe(3);
    expect(previews.every(video => videos.some(entry => entry.id === video.id))).toBe(true);
    const ids = videos.map(video => video.id);
    for (const invalid of [ids, [ids[0], ids[0]], ["unknown"]]) {
      expect((await request("/adult-library/favorites", "member", "PUT", { ids: invalid })).status).toBe(400);
    }
    const selected = [ids[2], ids[0], ids[1]];
    expect((await request("/adult-library/favorites", "member", "PUT", { ids: selected })).status).toBe(200);
    const response = await request("/adult-library");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ videos, favorites: selected });
    expect((await adultProfileFavorites(repository, favorites)).map(video => video.id)).toEqual(selected);
    expect((await request(`/admin/adult-library/${ids[0]}`, "admin", "DELETE")).status).toBe(200);
    const remaining = await adultProfileFavorites(repository, favorites);
    expect(remaining.map(video => video.id)).toEqual([ids[2], ids[1]]);
    expect(remaining[0]).not.toHaveProperty("thumbnailUrl");
    const setSaved = (id: string, saved: boolean, member = "member") =>
      request("/adult-library/favorite", member, "PUT", { id, saved });
    expect((await setSaved(bulkId, true, "guest")).status).toBe(403);
    expect((await setSaved("unknown", true)).status).toBe(404);
    expect(await (await setSaved(bulkId, true)).json()).toMatchObject({ favorites: [ids[2], ids[1], bulkId] });
    expect((await setSaved(ids[3], true)).status).toBe(409);
    expect((await adultProfileFavorites(repository, favorites))[2]).toMatchObject({ id: bulkId, watchUrl: "https://example.com/watch" });
    expect(await (await setSaved(bulkId, false)).json()).toMatchObject({ favorites: [ids[2], ids[1]] });

  } finally {
    if (previousCatalog === undefined) delete process.env.ADULT_CATALOG_DIR;
    else process.env.ADULT_CATALOG_DIR = previousCatalog;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
