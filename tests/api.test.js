import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { createApp } from "../server/index.js";

test("end-to-end API: authentication, ownership, review, rankings, files and restore", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "samplio-test-"));
  const { app, db } = await createApp({ dataDir: dir });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (
    path,
    { cookie = "", method = "GET", body, headers = {} } = {},
  ) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        Cookie: cookie,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    return r;
  };
  const login = async (username) => {
    const r = await request("/login", {
      method: "POST",
      body: { username, password: "Samplio2026!" },
      headers: { Origin: base },
    });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie").split(";")[0];
  };
  try {
    let admin, chen, lin, id, backup;
    await t.test("login and origin validation", async () => {
      assert.equal((await request("/samples")).status, 401);
      assert.equal(
        (
          await request("/login", {
            method: "POST",
            body: { username: "admin", password: "wrong" },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/login", {
            method: "POST",
            body: { username: "admin", password: "Samplio2026!" },
            headers: { Origin: "https://untrusted.example" },
          })
        ).status,
        403,
      );
      admin = await login("admin");
      chen = await login("chen");
      lin = await login("lin");
      const r = await request("/login", {
        method: "POST",
        body: { username: "admin", password: "Samplio2026!" },
        headers: { Origin: "http://127.0.0.1:5173" },
      });
      assert.equal(r.status, 200);
    });
    await t.test(
      "private drafts and admin routes enforce permissions",
      async () => {
        assert.equal(
          (await request("/samples/demo-4", { cookie: chen })).status,
          404,
        );
        assert.equal(
          (await request("/admin/users", { cookie: chen })).status,
          403,
        );
        const r = await request("/samples/demo-1", {
          cookie: chen,
          method: "PUT",
          body: { name: "x" },
        });
        assert.equal(r.status, 403);
      },
    );
    await t.test(
      "upload, create, similarity and authenticated image delivery",
      async () => {
        const form = new FormData();
        form.append(
          "image",
          new Blob(
            [await readFile(new URL("../public/demo/4.webp", import.meta.url))],
            { type: "image/webp" },
          ),
          "vase.webp",
        );
        const r = await request("/uploads", {
          cookie: chen,
          method: "POST",
          body: form,
        });
        assert.equal(r.status, 200);
        const upload = await r.json();
        const data = {
          name: "测试陶瓷花器",
          category: "家居饰品",
          color: upload.color,
          length: 12,
          width: 8,
          height: 20,
          image: upload.image,
          notes: "API integration test",
        };
        const saved = await request("/samples", {
          cookie: chen,
          method: "POST",
          body: data,
        });
        assert.equal(saved.status, 201);
        const sample = await saved.json();
        id = sample.id;
        assert.match(sample.code, /^\d{8}-SP-\d{6}$/);
        assert.equal(
          (await request("/samples/" + id, { cookie: lin })).status,
          404,
        );
        assert.equal((await fetch(base + sample.image)).status, 401);
        assert.equal(
          (await fetch(base + sample.image, { headers: { Cookie: lin } }))
            .status,
          404,
        );
        assert.equal(
          (await fetch(base + sample.image, { headers: { Cookie: chen } }))
            .status,
          200,
        );
        const search = new FormData();
        search.append(
          "image",
          new Blob([
            await readFile(new URL("../public/demo/4.webp", import.meta.url)),
          ]),
          "q.webp",
        );
        search.append("threshold", "80");
        const results = await (
          await request("/search/image", {
            cookie: chen,
            method: "POST",
            body: search,
          })
        ).json();
        assert.ok(results.some((s) => s.id === id && s.similarity >= 95));
      },
    );
    await t.test(
      "edits invalidate QR versions and preserve unique codes",
      async () => {
        const s = await (
          await request("/samples/" + id, { cookie: chen })
        ).json();
        const r = await request("/samples/" + id, {
          cookie: chen,
          method: "PUT",
          body: { ...s, name: "测试陶瓷花器 · 修订" },
        });
        assert.equal(r.status, 200);
        const updated = await r.json();
        assert.equal(updated.code, s.code);
        assert.equal(updated.revision, s.revision + 1);
        assert.equal(
          (await request("/samples/" + id + "?rev=1", { cookie: chen })).status,
          410,
        );
        const qr = await request("/samples/" + id + "/qr", { cookie: chen });
        assert.equal(qr.status, 200);
        assert.match(qr.headers.get("content-type"), /image\/png/);
      },
    );
    await t.test(
      "publish, toggle reactions, comments and weighted rankings",
      async () => {
        assert.equal(
          (
            await request("/samples/" + id + "/reactions", {
              cookie: chen,
              method: "POST",
              body: { kind: "like" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/samples/" + id + "/publish", {
              cookie: chen,
              method: "POST",
              body: { deadline: new Date(Date.now() + 86400000).toISOString() },
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/samples/" + id, { cookie: lin })).status,
          200,
        );
        for (const kind of ["like", "favorite"])
          assert.equal(
            (
              await request("/samples/" + id + "/reactions", {
                cookie: lin,
                method: "POST",
                body: { kind },
              })
            ).status,
            200,
          );
        const commented = await request("/samples/" + id + "/comments", {
          cookie: lin,
          method: "POST",
          body: { body: "建议补充釉面耐磨性测试结果。" },
        });
        assert.equal(commented.status, 201);
        assert.equal((await commented.json()).score, 6);
        assert.equal(
          (
            await request("/samples/" + id + "/comments", {
              cookie: lin,
              method: "POST",
              body: { body: "哈哈哈哈哈哈" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/samples/" + id + "/comments", {
              cookie: lin,
              method: "POST",
              body: { body: "建议补充釉面耐磨性测试结果。" },
            })
          ).status,
          400,
        );
        const result = await (
          await request("/samples/" + id + "/reactions", {
            cookie: lin,
            method: "POST",
            body: { kind: "like" },
          })
        ).json();
        assert.equal(result.likes, 0);
        assert.equal(result.score, 5);
        const scores = await (
          await request("/rankings?period=today", { cookie: chen })
        ).json();
        assert.equal(scores.find((s) => s.id === id).score, 5);
      },
    );
    await t.test(
      "xlsx export has valid workbook and period-specific score",
      async () => {
        const r = await request("/export", {
          cookie: chen,
          method: "POST",
          body: { ids: [id], period: "today" },
        });
        assert.equal(r.status, 200);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
        assert.equal(wb.worksheets[0].getRow(2).getCell(13).value, 5);
        assert.match(wb.worksheets[0].getRow(1).getCell(13).value, /今日/);
      },
    );
    await t.test(
      "atomic bulk deletion, recovery and snapshot round trip",
      async () => {
        const backupR = await request("/admin/backup", { cookie: admin });
        backup = await backupR.json();
        assert.ok(!JSON.stringify(backup).includes("Samplio2026!"));
        const mixed = await request("/samples/delete", {
          cookie: chen,
          method: "POST",
          body: { ids: [id, "demo-1"] },
        });
        assert.equal(mixed.status, 403);
        assert.equal(
          (await request("/samples/" + id, { cookie: chen })).status,
          200,
        );
        assert.equal(
          (
            await request("/samples/delete", {
              cookie: chen,
              method: "POST",
              body: { ids: [id] },
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/samples/" + id, { cookie: admin })).status,
          404,
        );
        assert.equal(
          (
            await request("/admin/restore/" + id, {
              cookie: admin,
              method: "POST",
              body: {},
            })
          ).status,
          200,
        );
        const r = await request("/admin/backup/restore", {
          cookie: admin,
          method: "POST",
          body: backup,
        });
        assert.equal(r.status, 200, await r.text());
        assert.equal(
          (await request("/samples/" + id, { cookie: chen })).status,
          200,
        );
        const logs = await (
          await request("/admin/logs", { cookie: admin })
        ).json();
        assert.ok(logs.some((l) => l.action === "删除"));
        assert.ok(logs.some((l) => l.action === "恢复备份"));
      },
    );
    await t.test(
      "expired review rejects new interactions; settings reject invalid weights",
      async () => {
        db.prepare("UPDATE samples SET deadline=? WHERE id=?").run(
          "2020-01-01T00:00:00.000Z",
          id,
        );
        assert.equal(
          (
            await request("/samples/" + id + "/reactions", {
              cookie: lin,
              method: "POST",
              body: { kind: "like" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/settings", {
              cookie: admin,
              method: "PUT",
              body: {
                prefix: "SP",
                threshold: 80,
                like: -1,
                favorite: 3,
                comment: 2,
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (await request("/logout", { cookie: lin, method: "POST", body: {} }))
            .status,
          200,
        );
        assert.equal((await request("/me", { cookie: lin })).status, 401);
      },
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
