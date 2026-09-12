import english from "../src/en.json" with { type: "json" };
import express from "express";
import multer from "multer";
import sharp from "sharp";
import QRCode from "qrcode";
import ExcelJS from "exceljs";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { seed } from "./seed.js";
import { imageFeatures, similarity } from "./images.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function createApp({
  dataDir = process.env.DATA_DIR || join(root, "data"),
} = {}) {
  const db = openDatabase(dataDir);
  await seed(db, root);
  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "15mb" }));
  const now = () => new Date().toISOString();
  const fail = (status, message) => {
    const e = new Error(message);
    e.status = status;
    throw e;
  };
  const settings = () =>
    JSON.parse(db.prepare("SELECT body FROM settings WHERE id=1").get().body);
  const log = (req, action, sampleId, detail) =>
    db
      .prepare(
        "INSERT INTO audit(user_id,action,sample_id,detail,ip,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        req.user?.id || null,
        action,
        sampleId || null,
        detail || "",
        req.ip,
        now(),
      );
  const safeUser = (u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
  });
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads"))
      res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    const permittedOrigins = new Set([
      `${req.protocol}://${req.get("host")}`,
      process.env.PUBLIC_ORIGIN,
      ...(process.env.NODE_ENV !== "production"
        ? ["http://127.0.0.1:5173", "http://localhost:5173"]
        : []),
    ]);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      !permittedOrigins.has(req.headers.origin)
    )
      return res.status(403).json({ error: "请求来源不匹配" });
    const token = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("samplio="))
      ?.slice("samplio=".length);
    if (token) {
      const u = db
        .prepare(
          "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
        )
        .get(token, Date.now());
      if (u) req.user = safeUser(u);
      req.sessionToken = token;
    }
    if (!req.user && !["/login", "/health"].includes(req.path))
      return res.status(401).json({ error: "请先登录" });
    next();
  });
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  const attempts = new Map();
  app.post("/api/login", (req, res) => {
    const old = attempts.get(req.ip);
    const bucket =
      old && old.until > Date.now()
        ? old
        : { count: 0, until: Date.now() + 60000 };
    attempts.set(req.ip, bucket);
    if (++bucket.count > 20) fail(429, "尝试次数过多，请一分钟后重试");
    const { username, password } = req.body;
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      password.length > 200
    )
      fail(400, "请填写账号和密码");
    const u = db.prepare("SELECT * FROM users WHERE username=?").get(username);
    const [salt, hash] = (u?.password || "none:" + "00".repeat(64)).split(":");
    const valid = timingSafeEqual(
      scryptSync(password, salt, 64),
      Buffer.from(hash, "hex"),
    );
    if (!u || !valid) fail(401, "账号或密码错误，请重新输入");
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      token,
      u.id,
      Date.now() + 86400000,
    );
    db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    res.cookie("samplio", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 86400000,
    });
    req.user = safeUser(u);
    log(req, "登录", null, "登录系统");
    res.json(req.user);
  });
  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.sessionToken);
    res.clearCookie("samplio");
    res.json({ ok: true });
  });
  app.get("/api/me", (req, res) => res.json(req.user));
  const admin = (req, res, next) => {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "仅管理员可操作" });
    next();
  };
  const rawSample = (id) =>
    db.prepare("SELECT * FROM samples WHERE id=?").get(id);
  const allowed = (s, u) =>
    s && (u.role === "admin" || s.owner_id === u.id || s.published);
  const getSample = (req, id, { edit = false, deleted = false } = {}) => {
    const s = rawSample(id);
    if (!s || (!deleted && s.deleted) || !allowed(s, req.user))
      fail(404, "样品不存在或无访问权限");
    if (edit && req.user.role !== "admin" && s.owner_id !== req.user.id)
      fail(403, "无权限编辑他人的样品");
    return s;
  };
  const enrich = (s, u, since = "") => {
    const reactions = db
        .prepare("SELECT * FROM reactions WHERE sample_id=?")
        .all(s.id),
      comments = db
        .prepare(
          "SELECT c.*,u.name AS author FROM comments c JOIN users u ON c.user_id=u.id WHERE sample_id=? ORDER BY c.created_at",
        )
        .all(s.id);
    const likes = reactions.filter(
        (r) => r.kind === "like" && r.created_at >= since,
      ).length,
      favorites = reactions.filter(
        (r) => r.kind === "favorite" && r.created_at >= since,
      ).length,
      commentCount = comments.filter((c) => c.created_at >= since).length,
      w = settings();
    const { descriptor, ...safe } = s;
    return {
      ...safe,
      owner: db.prepare("SELECT name FROM users WHERE id=?").get(s.owner_id)
        ?.name,
      likes,
      favorites,
      commentCount,
      score: likes * w.like + favorites * w.favorite + commentCount * w.comment,
      liked: reactions.some((r) => r.kind === "like" && r.user_id === u.id),
      favorited: reactions.some(
        (r) => r.kind === "favorite" && r.user_id === u.id,
      ),
      comments,
      canEdit: u.role === "admin" || s.owner_id === u.id,
    };
  };
  const visible = (req) =>
    db
      .prepare("SELECT * FROM samples ORDER BY created_at DESC")
      .all()
      .filter((s) => !s.deleted && allowed(s, req.user));
  app.get("/api/samples", (req, res) =>
    res.json(visible(req).map((s) => enrich(s, req.user))),
  );
  app.get("/api/samples/:id", (req, res) => {
    const s = getSample(req, req.params.id);
    if (req.query.rev && String(s.revision) !== req.query.rev)
      fail(410, "二维码已失效，请使用最新二维码");
    res.json(enrich(s, req.user));
  });
  const fields = (b) => {
    if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 100)
      fail(400, "请填写 1–100 字的样品名称");
    if (!["家居饰品", "家具", "灯具", "纺织品", "其他"].includes(b.category))
      fail(400, "请选择有效品类");
    const dims = ["length", "width", "height"].map((k) => {
      if (b[k] === "" || b[k] == null) return null;
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n <= 0 || n > 100000)
        fail(400, "尺寸须为 0–100000 cm 之间的正数");
      return n;
    });
    return [
      b.name.trim(),
      b.category,
      String(b.color || "").slice(0, 40),
      ...dims,
      String(b.notes || "").slice(0, 4000),
    ];
  };
  const imageFor = (req, path, current) => {
    if (path === current) return { image: path };
    if (typeof path !== "string") fail(400, "请先上传图片");
    const upload = db
      .prepare("SELECT * FROM uploads WHERE path=? AND user_id=?")
      .get(path, req.user.id);
    if (!upload) fail(400, "请使用本人上传的图片");
    return { image: path, descriptor: upload.descriptor };
  };
  app.post("/api/samples", (req, res) => {
    const [name, category, color, length, width, height, notes] = fields(
        req.body,
      ),
      image = imageFor(req, req.body.image),
      id = randomUUID(),
      date = now(),
      day = date.slice(0, 10).replaceAll("-", "");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "INSERT INTO counters VALUES (?,1) ON CONFLICT(day) DO UPDATE SET value=value+1",
      ).run(day);
      const n = db
        .prepare("SELECT value FROM counters WHERE day=?")
        .get(day).value;
      const code = `${day}-${settings().prefix}-${String(n).padStart(6, "0")}`;
      db.prepare(
        "INSERT INTO samples VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        code,
        name,
        category,
        color,
        length,
        width,
        height,
        image.image,
        image.descriptor,
        notes,
        req.user.id,
        date,
        date,
        0,
        null,
        0,
        1,
      );
      log(req, "入库", id, name);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.status(201).json(enrich(rawSample(id), req.user));
  });
  app.put("/api/samples/:id", (req, res) => {
    const s = getSample(req, req.params.id, { edit: true }),
      [name, category, color, length, width, height, notes] = fields(req.body),
      image = imageFor(req, req.body.image, s.image);
    db.prepare(
      "UPDATE samples SET name=?,category=?,color=?,length=?,width=?,height=?,notes=?,image=?,descriptor=?,updated_at=?,revision=revision+1 WHERE id=?",
    ).run(
      name,
      category,
      color,
      length,
      width,
      height,
      notes,
      image.image,
      image.descriptor || s.descriptor,
      now(),
      s.id,
    );
    log(req, "修改", s.id, name);
    res.json(enrich(rawSample(s.id), req.user));
  });
  app.post("/api/samples/delete", (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100)
      fail(400, "请选择 1–100 个样品");
    ids.forEach((id) => getSample(req, id, { edit: true }));
    db.exec("BEGIN");
    try {
      for (const id of ids) {
        db.prepare(
          "UPDATE samples SET deleted=1,revision=revision+1,updated_at=? WHERE id=?",
        ).run(now(), id);
        log(req, "删除", id, "移至回收站");
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  });
  app.post("/api/samples/:id/publish", (req, res) => {
    const s = getSample(req, req.params.id, { edit: true });
    const deadline = new Date(req.body.deadline);
    if (!Number.isFinite(+deadline) || deadline <= new Date())
      fail(400, "评审截止时间须晚于当前时间");
    db.prepare(
      "UPDATE samples SET published=1,deadline=?,notes=?,updated_at=?,revision=revision+1 WHERE id=?",
    ).run(
      deadline.toISOString(),
      String(req.body.notes ?? s.notes).slice(0, 4000),
      now(),
      s.id,
    );
    log(req, "发布", s.id, "发布至评审广场");
    res.json({ ok: true });
  });
  const reviewable = (req) => {
    const s = getSample(req, req.params.id);
    if (!s.published) fail(400, "该样品尚未发布评审");
    if (s.deadline && s.deadline < now()) fail(400, "评审已结束");
    return s;
  };
  app.post("/api/samples/:id/reactions", (req, res) => {
    const s = reviewable(req),
      kind = req.body.kind;
    if (!["like", "favorite"].includes(kind)) fail(400, "无效互动类型");
    const old = db
      .prepare(
        "SELECT 1 FROM reactions WHERE sample_id=? AND user_id=? AND kind=?",
      )
      .get(s.id, req.user.id, kind);
    if (old)
      db.prepare(
        "DELETE FROM reactions WHERE sample_id=? AND user_id=? AND kind=?",
      ).run(s.id, req.user.id, kind);
    else
      db.prepare("INSERT INTO reactions VALUES (?,?,?,?)").run(
        s.id,
        req.user.id,
        kind,
        now(),
      );
    log(
      req,
      "互动",
      s.id,
      `${old ? "取消" : ""}${kind === "like" ? "点赞" : "收藏"}`,
    );
    res.json(enrich(rawSample(s.id), req.user));
  });
  app.post("/api/samples/:id/comments", (req, res) => {
    const s = reviewable(req),
      body = String(req.body.body || "").trim();
    if (
      body.length < 5 ||
      body.length > 1000 ||
      new Set(body.replace(/\s/g, "")).size < 3
    )
      fail(400, "请输入 5–1000 字的具体建议，避免重复灌水");
    const parent = req.body.parent_id || null;
    if (
      parent &&
      !db
        .prepare("SELECT id FROM comments WHERE id=? AND sample_id=?")
        .get(parent, s.id)
    )
      fail(400, "回复目标不存在");
    if (
      db
        .prepare(
          "SELECT id FROM comments WHERE sample_id=? AND user_id=? AND body=?",
        )
        .get(s.id, req.user.id, body)
    )
      fail(400, "请勿重复提交相同评论");
    db.prepare("INSERT INTO comments VALUES (?,?,?,?,?,?)").run(
      randomUUID(),
      s.id,
      req.user.id,
      body,
      parent,
      now(),
    );
    log(req, "评论", s.id, body);
    res.status(201).json(enrich(rawSample(s.id), req.user));
  });
  app.delete("/api/comments/:id", (req, res) => {
    const c = db
      .prepare("SELECT * FROM comments WHERE id=?")
      .get(req.params.id);
    if (!c) fail(404, "评论不存在");
    getSample(req, c.sample_id);
    if (c.user_id !== req.user.id && req.user.role !== "admin")
      fail(403, "仅可删除自己的评论");
    db.prepare("UPDATE comments SET parent_id=NULL WHERE parent_id=?").run(
      c.id,
    );
    db.prepare("DELETE FROM comments WHERE id=?").run(c.id);
    log(req, "删除评论", c.sample_id, c.body);
    res.json({ ok: true });
  });
  app.get("/api/rankings", (req, res) => {
    const period = req.query.period || "all";
    if (!["today", "week", "month", "all"].includes(period))
      fail(400, "无效时间范围");
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    if (period === "week")
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    if (period === "month") d.setUTCDate(1);
    const since = period === "all" ? "" : d.toISOString();
    res.json(
      visible(req)
        .filter((s) => s.published)
        .map((s) => enrich(s, req.user, since))
        .sort((a, b) => b.score - a.score),
    );
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });
  app.post("/api/uploads", upload.single("image"), async (req, res) => {
    if (!req.file) fail(400, "请选择图片");
    let buffer;
    try {
      buffer = await sharp(req.file.buffer, { limitInputPixels: 25_000_000 })
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      fail(400, "图片无法解析，请上传 JPG、PNG 或 WebP 图片");
    }
    const filename = randomUUID() + ".webp";
    await sharp(buffer).toFile(join(dataDir, "uploads", filename));
    const f = await imageFeatures(buffer),
      path = "/uploads/" + filename;
    db.prepare("INSERT INTO uploads VALUES (?,?,?,?)").run(
      path,
      req.user.id,
      JSON.stringify(f.descriptor),
      f.color,
    );
    res.json({
      image: path,
      color: f.color,
      suggestedName: `${f.color}样品`,
      method: "本地颜色提取；尺寸需人工测量",
    });
  });
  app.post("/api/search/image", upload.single("image"), async (req, res) => {
    if (!req.file) fail(400, "请选择检索图片");
    let f;
    try {
      f = await imageFeatures(req.file.buffer);
    } catch {
      fail(400, "图片无法解析");
    }
    const threshold = Number(req.body.threshold ?? settings().threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
      fail(400, "阈值须在 0–100 之间");
    res.json(
      visible(req)
        .map((s) => ({
          ...enrich(s, req.user),
          similarity: similarity(
            f.descriptor,
            JSON.parse(s.descriptor || "null"),
          ),
        }))
        .filter((s) => s.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity),
    );
  });
  app.get("/uploads/:name", (req, res) => {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("samplio="))
      ?.slice("samplio=".length);
    const user = db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
      )
      .get(token || "", Date.now());
    if (!user) fail(401, "请先登录");
    const path = "/uploads/" + req.params.name;
    const own = db
      .prepare("SELECT * FROM uploads WHERE path=? AND user_id=?")
      .get(path, user.id);
    const samples = db
      .prepare("SELECT * FROM samples WHERE image=? AND deleted=0")
      .all(path);
    if (user.role !== "admin" && !own && !samples.some((s) => allowed(s, user)))
      fail(404, "图片不存在");
    res.sendFile(join(dataDir, "uploads", req.params.name));
  });
  app.get("/api/samples/:id/qr", async (req, res) => {
    const s = getSample(req, req.params.id);
    const origin = `${req.protocol}://${req.get("host")}`;
    const url = `${origin}/?sample=${encodeURIComponent(s.id)}&rev=${s.revision}`;
    res.type("png").send(
      await QRCode.toBuffer(url, {
        width: 480,
        margin: 2,
        color: { dark: "#173f39" },
      }),
    );
  });
  app.get("/api/settings", (req, res) => res.json(settings()));
  app.put("/api/settings", admin, (req, res) => {
    const b = req.body;
    if (!/^[A-Z0-9]{1,8}$/.test(b.prefix))
      fail(400, "编号前缀须为 1–8 位大写字母或数字");
    for (const k of ["threshold", "like", "favorite", "comment"])
      if (
        !Number.isFinite(Number(b[k])) ||
        Number(b[k]) < 0 ||
        Number(b[k]) > 100
      )
        fail(400, "阈值及权重须在 0–100 之间");
    const clean = {
      prefix: b.prefix,
      threshold: +b.threshold,
      like: +b.like,
      favorite: +b.favorite,
      comment: +b.comment,
    };
    db.prepare("UPDATE settings SET body=? WHERE id=1").run(
      JSON.stringify(clean),
    );
    log(req, "配置", null, JSON.stringify(clean));
    res.json(clean);
  });
  app.get("/api/admin/users", admin, (req, res) =>
    res.json(db.prepare("SELECT id,username,name,role FROM users").all()),
  );
  app.put("/api/admin/users/:id", admin, (req, res) => {
    const id = Number(req.params.id);
    if (!["admin", "employee"].includes(req.body.role)) fail(400, "无效角色");
    if (id === req.user.id) fail(400, "不能修改自己的角色");
    if (!db.prepare("SELECT id FROM users WHERE id=?").get(id))
      fail(404, "用户不存在");
    db.prepare("UPDATE users SET role=? WHERE id=?").run(req.body.role, id);
    log(req, "权限", null, `用户 ${id} → ${req.body.role}`);
    res.json({ ok: true });
  });
  app.get("/api/admin/logs", admin, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT a.*,u.name AS actor FROM audit a LEFT JOIN users u ON a.user_id=u.id ORDER BY a.id DESC LIMIT 500",
        )
        .all(),
    ),
  );
  app.get("/api/admin/trash", admin, (req, res) =>
    res.json(
      db
        .prepare("SELECT * FROM samples WHERE deleted=1")
        .all()
        .map((s) => enrich(s, req.user)),
    ),
  );
  app.post("/api/admin/restore/:id", admin, (req, res) => {
    const s = rawSample(req.params.id);
    if (!s || !s.deleted) fail(404, "回收站没有此样品");
    db.prepare(
      "UPDATE samples SET deleted=0,revision=revision+1,updated_at=? WHERE id=?",
    ).run(now(), s.id);
    log(req, "恢复", s.id, s.name);
    res.json({ ok: true });
  });
  app.get("/api/admin/backup", admin, (req, res) => {
    const data = {
      version: 1,
      created_at: now(),
      settings: settings(),
      samples: db.prepare("SELECT * FROM samples").all(),
      reactions: db.prepare("SELECT * FROM reactions").all(),
      comments: db.prepare("SELECT * FROM comments").all(),
    };
    log(req, "备份", null, "导出业务快照（图片文件需单独保留）");
    res.attachment("samplio-backup.json").json(data);
  });
  app.post("/api/admin/backup/restore", admin, (req, res) => {
    const b = req.body;
    if (
      b.version !== 1 ||
      !Array.isArray(b.samples) ||
      !Array.isArray(b.reactions) ||
      !Array.isArray(b.comments) ||
      b.samples.length > 10000
    )
      fail(400, "备份格式不正确");
    // Restore only into the same installation: accounts and upload files are not replaced.
    const ids = new Set(),
      codes = new Set();
    for (const s of b.samples) {
      fields(s);
      if (
        typeof s.id !== "string" ||
        typeof s.code !== "string" ||
        ids.has(s.id) ||
        codes.has(s.code) ||
        !db.prepare("SELECT id FROM users WHERE id=?").get(s.owner_id)
      )
        fail(400, "备份包含无效或重复档案");
      ids.add(s.id);
      codes.add(s.code);
      if (!/^\/(demo|uploads)\/[a-zA-Z0-9.-]+$/.test(s.image))
        fail(400, "备份图片路径不正确");
      if (
        s.image.startsWith("/uploads/") &&
        !existsSync(join(dataDir, s.image))
      )
        fail(400, "备份引用的本地图片不存在");
      if (s.descriptor) {
        const f = JSON.parse(s.descriptor);
        if (
          !Array.isArray(f) ||
          f.length !== 768 ||
          f.some((n) => !Number.isFinite(n) || n < 0 || n > 255)
        )
          fail(400, "图片描述数据不正确");
      }
    }
    const cols = [
      "id",
      "code",
      "name",
      "category",
      "color",
      "length",
      "width",
      "height",
      "image",
      "descriptor",
      "notes",
      "owner_id",
      "created_at",
      "updated_at",
      "published",
      "deadline",
      "deleted",
      "revision",
    ];
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM reactions;DELETE FROM comments;");
      for (const s of b.samples) {
        const previous = rawSample(s.id);
        const values = cols.map((k) =>
          k === "revision"
            ? Math.max(s.revision || 1, previous?.revision || 1) + 1
            : (s[k] ?? null),
        );
        db.prepare(
          `INSERT INTO samples (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${cols
            .slice(1)
            .map((k) => `${k}=excluded.${k}`)
            .join(",")}`,
        ).run(...values);
      }
      for (const s of db.prepare("SELECT id FROM samples").all())
        if (!ids.has(s.id))
          db.prepare(
            "UPDATE samples SET deleted=1,revision=revision+1 WHERE id=?",
          ).run(s.id);
      for (const r of b.reactions) {
        if (!ids.has(r.sample_id) || !["like", "favorite"].includes(r.kind))
          fail(400, "备份互动数据不正确");
        db.prepare("INSERT INTO reactions VALUES (?,?,?,?)").run(
          r.sample_id,
          r.user_id,
          r.kind,
          r.created_at,
        );
      }
      for (const c of b.comments) {
        if (!ids.has(c.sample_id) || typeof c.body !== "string")
          fail(400, "备份评论数据不正确");
        db.prepare("INSERT INTO comments VALUES (?,?,?,?,?,?)").run(
          c.id,
          c.sample_id,
          c.user_id,
          c.body,
          c.parent_id,
          c.created_at,
        );
      }
      log(
        req,
        "恢复备份",
        null,
        `恢复 ${ids.size} 个档案；保留账号、配置与操作日志`,
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      fail(400, "恢复失败，原数据未改变：" + e.message);
    }
    res.json({ ok: true });
  });
  app.post("/api/export", async (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length > 10000) fail(400, "导出参数不正确");
    const period = req.body.period || "all";
    if (!["today", "week", "month", "all"].includes(period))
      fail(400, "无效时间范围");
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    if (period === "week")
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    if (period === "month") d.setUTCDate(1);
    const since = period === "all" ? "" : d.toISOString();
    const rows = ids.map((id) => enrich(getSample(req, id), req.user, since));
    const translate = (value) =>
      req.body.lang === "en" ? (english[value] ?? value) : value;
    const wb = new ExcelJS.Workbook(),
      ws = wb.addWorksheet(translate("样品档案"));
    ws.columns = [
      ["编号", "code", 28],
      ["名称", "name", 24],
      ["品类", "category", 16],
      ["颜色", "color", 14],
      ["长 cm", "length", 12],
      ["宽 cm", "width", 12],
      ["高 cm", "height", 12],
      ["入库人", "owner", 16],
      ["图片路径", "image", 48],
      ["点赞", "likes", 10],
      ["收藏", "favorites", 10],
      ["评论", "commentCount", 10],
      [period === "all" ? "累计分数" : "区间分数", "score", 14],
    ].map(([header, key, width]) => ({
      header: translate(header),
      key,
      width,
    }));
    for (const row of rows)
      ws.addRow(
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            typeof v === "string" ? translate(v) : v,
          ]),
        ),
      );
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1C5148" },
    };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (req.body.period) {
      ws.getColumn("score").header =
        req.body.lang === "en"
          ? "Score (" +
            {
              today: "Today",
              week: "This week",
              month: "This month",
              all: "All time",
            }[period] +
            ")"
          : "喜欢度（" +
            { today: "今日", week: "本周", month: "本月", all: "累计" }[
              period
            ] +
            "）";
    }
    res.attachment("samplio.xlsx");
    res.type(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await wb.xlsx.write(res);
    res.end();
  });
  app.use("/demo", express.static(join(root, "public/demo")));
  app.use(express.static(join(root, "dist")));
  app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/api/"))
      return res.status(404).json({ error: "接口不存在" });
    res.sendFile(join(root, "dist/index.html"));
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status =
      err.status || (err instanceof multer.MulterError ? 400 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({
      error: status === 500 ? "服务器处理失败，请稍后重试" : err.message,
    });
  });
  return { app, db };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { app } = await createApp();
  const port = Number(process.env.PORT || 3001);
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Samplio: http://${process.env.HOST || "127.0.0.1"}:${port}`),
  );
}
