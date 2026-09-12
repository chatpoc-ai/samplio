import { t, getLocale, getLanguage, changeLanguage } from "./i18n.js";
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  LayoutDashboard,
  Package,
  ScanLine,
  Search,
  MessagesSquare,
  Trophy,
  UserRound,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Heart,
  Bookmark,
  MessageCircle,
  SlidersHorizontal,
  Download,
  Upload,
  Camera,
  X,
  Check,
  LogOut,
  Trash2,
  Pencil,
  Eye,
  ShieldCheck,
  MoreHorizontal,
  RefreshCw,
  FileText,
  Clock,
  CheckCircle2,
  Image as ImageIcon,
  Menu,
  Printer,
  Copy,
  Reply,
} from "lucide-react";
import "./styles.css";
async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers:
      options.body instanceof FormData
        ? {}
        : {
            "Content-Type": "application/json",
            ...options.headers,
          },
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b.error || "网络请求失败");
  }
  return r.json();
}
const post = (path, body) =>
  api(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
const navs = [
  ["dashboard", "工作台", LayoutDashboard],
  ["samples", "样品库", Package],
  ["intake", "智能入库", ScanLine],
  ["search", "智能检索", Search],
  ["review", "评审广场", MessagesSquare],
  ["ranking", "喜欢度榜单", Trophy],
  ["personal", "个人中心", UserRound],
  ["admin", "系统管理", Settings],
];
const date = (v) =>
  v
    ? new Date(v).toLocaleDateString(getLocale(), {
        month: "2-digit",
        day: "2-digit",
      })
    : "—";
const dims = (s) =>
  [s.length, s.width, s.height].map((v) => t(v ?? "待测")).join(" × ");
function LanguageSwitch() {
  return (
    <div className="language-switch" role="group" aria-label="Language / 语言">
      <button
        type="button"
        className={getLanguage() === "en" ? "active" : ""}
        onClick={() => changeLanguage("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={getLanguage() === "zh" ? "active" : ""}
        onClick={() => changeLanguage("zh")}
      >
        中文
      </button>
    </div>
  );
}
function App() {
  const [, setLanguageVersion] = useState(0);
  useEffect(() => {
    const update = () => {
      setLanguageVersion((v) => v + 1);
      document.documentElement.lang = getLocale();
      document.title =
        getLanguage() === "en"
          ? "Samplio · Sample workspace"
          : "Samplio · 样品工作台";
    };
    update();
    window.addEventListener("samplio-language", update);
    return () => window.removeEventListener("samplio-language", update);
  }, []);
  const [user, setUser] = useState(null),
    [boot, setBoot] = useState(true),
    [page, setPage] = useState("dashboard"),
    [samples, setSamples] = useState([]),
    [config, setConfig] = useState(null),
    [toast, setToast] = useState(null),
    [detail, setDetail] = useState(null),
    [editing, setEditing] = useState(null),
    [confirm, setConfirm] = useState(null),
    [publishing, setPublishing] = useState(null),
    [preview, setPreview] = useState(null),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false);
  const flash = (message, error = false) =>
    setToast({
      message,
      error,
    });
  const run = async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => {
    const [s, c] = await Promise.all([api("/samples"), api("/settings")]);
    setSamples(s);
    setConfig(c);
    return s;
  };
  useEffect(() => {
    api("/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    run(async () => {
      await reload();
      const params = new URLSearchParams(location.search);
      if (params.has("sample"))
        setDetail(
          await api(
            `/samples/${encodeURIComponent(params.get("sample"))}?rev=${encodeURIComponent(params.get("rev") || "")}`,
          ),
        );
    });
    const timer = setInterval(() => reload().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [user]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!user || !document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const context = document.modelContext;
    const tools = [
      {
        name: "search_samples",
        title: "搜索样品",
        description:
          "Read sample records visible to the signed-in user. Does not modify records.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
            },
          },
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
          untrustedContentHint: true,
        },
        execute: async (input) => {
          if (
            !input ||
            typeof input !== "object" ||
            Object.keys(input).some((k) => k !== "query") ||
            (input.query !== undefined && typeof input.query !== "string")
          )
            throw new Error("query must be a string");
          const q = (input.query || "").toLowerCase();
          const rows = await api("/samples");
          return rows
            .filter((s) =>
              (s.name + t(s.name) + s.code).toLowerCase().includes(q),
            )
            .map(({ id, name, code, published, score }) => ({
              id,
              name,
              code,
              published,
              score,
            }));
        },
      },
      {
        name: "open_sample_details",
        title: "打开样品详情",
        description:
          "Open the visible detail panel for a sample without modifying its data.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
          untrustedContentHint: true,
        },
        execute: async (input) => {
          if (
            !input ||
            typeof input.id !== "string" ||
            !input.id ||
            Object.keys(input).some((k) => k !== "id")
          )
            throw new Error("id is required");
          const s = await api("/samples/" + encodeURIComponent(input.id));
          setDetail(s);
          return {
            id: s.id,
            name: s.name,
            opened: true,
          };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, {
            signal: lifecycle.signal,
          }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [user]);
  const go = (p) => {
    setPage(p);
    setMobile(false);
    if (p !== "intake") setEditing(null);
  };
  const open = (s) => run(async () => setDetail(await api("/samples/" + s.id)));
  const refreshDetail = async (id) => {
    await reload();
    if (detail?.id === id) setDetail(await api("/samples/" + id));
  };
  const react = (s, kind) =>
    run(async () => {
      await post(`/samples/${s.id}/reactions`, {
        kind,
      });
      await refreshDetail(s.id);
    });
  const remove = (ids) =>
    setConfirm({
      title: `删除 ${ids.length} 个样品？`,
      text: "档案将移至回收站，管理员可以恢复。",
      action: () =>
        run(async () => {
          await post("/samples/delete", {
            ids,
          });
          setDetail(null);
          await reload();
          flash("样品已移至回收站");
        }),
    });
  const edit = (s) => {
    setDetail(null);
    setEditing(s);
    go("intake");
  };
  const exportRows = async (rows, period) =>
    run(async () => {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: rows.map((s) => s.id),
          period,
          lang: getLanguage(),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      download(await r.blob(), "samplio.xlsx");
      flash("表格已导出");
    });
  if (boot)
    return (
      <div className="boot">
        <Box size={40} />
        <p>{t("正在打开样品工作台…")}</p>
      </div>
    );
  if (!user)
    return (
      <>
        <Login onLogin={setUser} />
        {t(toast && <Toast {...toast} />)}
      </>
    );
  const common = {
    samples,
    config,
    user,
    open,
    react,
    edit,
    remove,
    exportRows,
    flash,
    run,
    reload,
    setPublishing,
    busy,
  };
  return (
    <div className="app">
      <aside className={mobile ? "sidebar is-open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          <span className="brand-icon">
            <Box size={25} />
          </span>
          <span>
            Samplio<small>{t("企业样品管理")}</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            {t("设计研发中心")}
            <small>{t("团队工作空间")}</small>
          </div>
          <ChevronRight size={16} />
        </div>
        <div className="nav-label">{t("工作空间")}</div>
        <nav>
          {t(
            navs
              .filter(([p]) => p !== "admin" || user.role === "admin")
              .map(([p, label, Icon], i) => (
                <React.Fragment key={p}>
                  {t(i === 6 && <div className="nav-divider" />)}
                  <button
                    className={page === p ? "nav-item active" : "nav-item"}
                    onClick={() => go(p)}
                  >
                    <Icon size={19} />
                    <span>{t(label)}</span>
                    {t(
                      p === "review" && (
                        <b>{t(samples.filter((s) => s.published).length)}</b>
                      ),
                    )}
                  </button>
                </React.Fragment>
              )),
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="poc-tag">{t("POC \xB7 本地体验版")}</span>
          <p>
            {t("让每一件好样品")}
            <br />
            {t("都有被发现的机会。")}
          </p>
          <div className="profile">
            <span className="avatar">{t(user.name.slice(-2))}</span>
            <div>
              <strong>{t(user.name)}</strong>
              <small>{t(user.role === "admin" ? "管理员" : "普通员工")}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t("退出登录")}
              onClick={() =>
                setConfirm({
                  title: "退出当前账号？",
                  action: () =>
                    run(async () => {
                      await post("/logout", {});
                      setUser(null);
                      setDetail(null);
                      setSamples([]);
                      setPage("dashboard");
                    }),
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label={t("展开导航")}
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            {t("工作空间")}
            <ChevronRight size={14} />
            <strong>{t(navs.find((n) => n[0] === page)?.[1])}</strong>
          </div>
          <div className="top-actions">
            <LanguageSwitch />
            <span className="today">
              {t(
                new Date().toLocaleDateString(getLocale(), {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
              )}
            </span>
            <span className="separator" />
            <span className="avatar small">{t(user.name.slice(-2))}</span>
          </div>
        </header>
        <main className="content">
          {t(page === "dashboard" && <Dashboard {...common} go={go} />)}
          {t(page === "samples" && <Samples {...common} go={go} />)}
          {t(
            page === "intake" && (
              <Intake
                {...common}
                editing={editing}
                done={() => {
                  setEditing(null);
                  go("samples");
                }}
              />
            ),
          )}
          {t(page === "search" && <SearchPage {...common} />)}
          {t(page === "review" && <Review {...common} />)}
          {t(page === "ranking" && <Ranking {...common} />)}
          {t(page === "personal" && <Personal {...common} />)}
          {t(
            page === "admin" && user.role === "admin" && (
              <Admin {...common} setConfig={setConfig} />
            ),
          )}
          <footer className="footer">
            Samplio <span>{t("从灵感入库，到共识落地。")}</span>
            <span>{t("POC / 数据保存在本机服务端")}</span>
          </footer>
        </main>
      </div>
      {t(
        detail && (
          <Modal
            title={t("样品档案")}
            wide
            close={() => {
              setDetail(null);
              history.replaceState(null, "", location.pathname);
            }}
          >
            <Detail
              {...common}
              sample={detail}
              close={() => setDetail(null)}
              setDetail={setDetail}
              refreshDetail={refreshDetail}
              setPreview={setPreview}
            />
          </Modal>
        ),
      )}
      {t(
        publishing && (
          <Publish
            sample={publishing}
            close={() => setPublishing(null)}
            submit={(data) =>
              run(async () => {
                await post(`/samples/${publishing.id}/publish`, data);
                await refreshDetail(publishing.id);
                setPublishing(null);
                flash("已发布至评审广场");
              })
            }
          />
        ),
      )}
      {t(
        confirm && (
          <Modal title={t(confirm.title)} close={() => setConfirm(null)}>
            <p className="muted">{t(confirm.text || "确认后将执行此操作。")}</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setConfirm(null)}>
                {t("取消")}
              </button>
              <button
                className="button primary"
                onClick={() => {
                  const fn = confirm.action;
                  setConfirm(null);
                  fn();
                }}
              >
                {t("确认")}
              </button>
            </div>
          </Modal>
        ),
      )}
      {t(
        preview && (
          <ImagePreview src={preview} close={() => setPreview(null)} />
        ),
      )}
      {t(toast && <Toast {...toast} />)}
    </div>
  );
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Toast({ message, error }) {
  return (
    <div className={`toast ${error ? "error" : ""}`} role="status">
      {t(error ? <X size={18} /> : <CheckCircle2 size={18} />)} {t(message)}
    </div>
  );
}
function Modal({ title, children, close, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{t(title)}</h2>
        <button className="icon-button" onClick={close} aria-label={t("关闭")}>
          <X />
        </button>
      </div>
      {t(children)}
    </dialog>
  );
}
function Login({ onLogin }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [show, setShow] = useState(false),
    [forgot, setForgot] = useState(false);
  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand">
          <Box size={35} /> Samplio
        </div>
        <div>
          <span className="eyebrow">YOUR NEXT GREAT PRODUCT STARTS HERE</span>
          <h1>
            {t("好样品，")}
            <br />
            {t("值得被看见。")}
          </h1>
          <p>
            {t("把零散的样品与灵感，")}
            <br />
            {t("变成团队共同的产品判断。")}
          </p>
          <div className="login-pills">
            <span>{t("智能入库")}</span>
            <span>{t("协同评审")}</span>
            <span>{t("数据决策")}</span>
          </div>
        </div>
        <small>{t("企业样品全生命周期管理 \xB7 POC")}</small>
      </section>
      <section className="login-form">
        <div className="login-card">
          <div className="login-language">
            <LanguageSwitch />
          </div>
          <span className="eyebrow">{t("欢迎回到工作空间")}</span>
          <h2>{t("登录 Samplio")}</h2>
          <p className="muted">{t("从一件样品，开始下一次产品创新。")}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError("");
              try {
                onLogin(
                  await post("/login", {
                    username,
                    password,
                  }),
                );
              } catch (e) {
                setError(e.message);
                setPassword("");
              } finally {
                setLoading(false);
              }
            }}
          >
            <label>
              {t("账号")}
              <input
                required
                maxLength={20}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              {t("密码")}
              <div className="password">
                <input
                  required
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("切换密码显隐")}
                  onClick={() => setShow(!show)}
                >
                  <Eye size={18} />
                </button>
              </div>
            </label>
            <button
              type="button"
              className="text-button forgot"
              onClick={() => setForgot(true)}
            >
              {t("忘记密码？")}
            </button>
            {t(
              error && (
                <p role="alert" className="error-text">
                  {t(error)}
                </p>
              ),
            )}
            <button className="button primary full" disabled={loading}>
              {t(loading ? "正在登录…" : "进入工作台")}
              <ArrowUpRight size={18} />
            </button>
          </form>
        </div>
      </section>
      {t(
        forgot && (
          <Modal title={t("账号协助")} close={() => setForgot(false)}>
            <p>
              {t("请联系企业管理员协助重置密码。本版本暂未接入短信找回服务。")}
            </p>
          </Modal>
        ),
      )}
    </div>
  );
}
function Heading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {t(eyebrow && <span className="eyebrow">{t(eyebrow)}</span>)}
        <h1>{t(title)}</h1>
        {t(description && <p>{t(description)}</p>)}
      </div>
      <div className="heading-actions">{t(children)}</div>
    </div>
  );
}
function Status({ s }) {
  return (
    <span className={`status ${s.published ? "published" : "draft"}`}>
      <span />
      {t(
        s.published
          ? s.deadline && new Date(s.deadline) < new Date()
            ? "评审已结束"
            : "评审中"
          : "待发布",
      )}
    </span>
  );
}
function Card({ s, open, react }) {
  return (
    <article className="sample-card">
      <button className="sample-image" onClick={() => open(s)}>
        <img src={s.image} alt={t(s.name)} />
        <span className="image-category">{t(s.category)}</span>
        {t(
          s.similarity != null && (
            <b className="similarity">
              {t(s.similarity)}
              {t("% 相似")}
            </b>
          ),
        )}
      </button>
      <div className="sample-card-body">
        <div className="card-code">{t(s.code)}</div>
        <button className="card-title" onClick={() => open(s)}>
          {t(s.name)}
          <ArrowUpRight size={17} />
        </button>
        <div className="card-meta">
          <span>
            {t(s.color)} · {t(dims(s))} cm
          </span>
        </div>
        <div className="card-bottom">
          <Status s={s} />
          <div className="card-reactions">
            <button
              disabled={!s.published}
              className={s.liked ? "selected" : ""}
              onClick={() => react(s, "like")}
              aria-label={t(`点赞 ${s.name}`)}
            >
              <Heart size={16} fill={s.liked ? "currentColor" : "none"} />
              {t(s.likes)}
            </button>
            <button
              disabled={!s.published}
              className={s.favorited ? "selected" : ""}
              onClick={() => react(s, "favorite")}
              aria-label={t(`收藏 ${s.name}`)}
            >
              <Bookmark
                size={16}
                fill={s.favorited ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
function Dashboard({ samples, user, go, open, react }) {
  const published = samples.filter((s) => s.published),
    top = [...published].sort((a, b) => b.score - a.score).slice(0, 3),
    month = samples.filter(
      (s) => s.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7),
    ).length;
  return (
    <>
      <Heading
        eyebrow="OVERVIEW"
        title={t(
          `${new Date().getHours() < 12 ? "上午好" : "你好"}，${user.name}`,
        )}
        description="让样品流动起来，让好的设计获得共识。"
      >
        <button className="button primary" onClick={() => go("intake")}>
          <Plus size={18} />
          {t("新建样品")}
        </button>
      </Heading>
      <section className="stats-grid">
        {t(
          [
            [Package, "样品总数", samples.length, "已建立完整样品档案"],
            [ScanLine, "本月新入库", month, "本月进入样品库"],
            [
              MessagesSquare,
              "已发布评审",
              published.length,
              "汇聚团队的真实反馈",
            ],
            [
              Heart,
              "累计互动",
              samples.reduce(
                (n, s) => n + s.likes + s.favorites + s.commentCount,
                0,
              ),
              "点赞、收藏与有效建议",
            ],
          ].map(([Icon, label, value, hint], i) => (
            <button
              className={`stat-card stat-${i}`}
              key={label}
              onClick={() =>
                go(i === 2 ? "review" : i === 3 ? "ranking" : "samples")
              }
            >
              <div>
                <span>{t(label)}</span>
                <Icon size={19} />
              </div>
              <strong>{t(String(value).padStart(2, "0"))}</strong>
              <small>
                {t(hint)}
                <ArrowUpRight size={14} />
              </small>
            </button>
          )),
        )}
      </section>
      <section className="dashboard-grid">
        <div className="quick-panel">
          <div className="section-title">
            <h2>{t("从一张照片，开始建档")}</h2>
            <span className="mini-label">SMART INTAKE</span>
          </div>
          <p>
            {t("上传样品图片，提取颜色并完善档案。")}
            <br />
            {t("让团队更快找到下一件好产品。")}
          </p>
          <div className="intake-steps">
            <span>
              <ImageIcon size={18} />
              {t("上传图片")}
            </span>
            <ChevronRight size={14} />
            <span>
              <ScanLine size={18} />
              {t("辅助识别")}
            </span>
            <ChevronRight size={14} />
            <span>
              <CheckCircle2 size={18} />
              {t("确认入库")}
            </span>
          </div>
          <button className="button dark" onClick={() => go("intake")}>
            {t("开始样品入库")}
            <ArrowUpRight size={17} />
          </button>
          <div className="quick-links">
            <button onClick={() => go("search")}>
              <Search size={17} />
              {t("以图找样品")}
              <ArrowUpRight size={14} />
            </button>
            <button onClick={() => go("review")}>
              <MessagesSquare size={17} />
              {t("参与团队评审")}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
        <div className="top-panel">
          <div className="section-title">
            <h2>{t("团队偏好 TOP 3")}</h2>
            <button className="text-button" onClick={() => go("ranking")}>
              {t("完整榜单")}
              <ChevronRight size={15} />
            </button>
          </div>
          <p className="section-subtitle">
            {t("每一次互动，都在帮助好设计脱颖而出")}
          </p>
          {t(
            top.map((s, i) => (
              <button className="top-row" key={s.id} onClick={() => open(s)}>
                <span className={`rank-number rank-${i}`}>0{t(i + 1)}</span>
                <img src={s.image} alt="" />
                <div>
                  <strong>{t(s.name)}</strong>
                  <small>
                    {t(s.category)} ·{" "}
                    {t(s.likes + s.favorites + s.commentCount)}
                    {t("次互动")}
                  </small>
                </div>
                <b>
                  {t(s.score)}
                  <small>{t("喜欢度")}</small>
                </b>
              </button>
            )),
          )}
          {t(!top.length && <Empty text="发布样品后，团队偏好将在这里呈现" />)}
        </div>
      </section>
      <section>
        <div className="section-title spaced">
          <div>
            <h2>{t("最近入库")}</h2>
            <p className="section-subtitle">{t("新灵感已就位，等你发现")}</p>
          </div>
          <button className="text-button" onClick={() => go("samples")}>
            {t("查看全部样品")}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="cards-grid">
          {t(
            samples
              .slice(0, 4)
              .map((s) => <Card key={s.id} s={s} open={open} react={react} />),
          )}
        </div>
      </section>
    </>
  );
}
function Empty({ text = "暂无符合条件的样品" }) {
  return (
    <div className="empty">
      <Package size={32} />
      <h3>{t(text)}</h3>
      <p>{t("尝试调整筛选条件，或添加一件新样品。")}</p>
    </div>
  );
}
function Pager({ page, setPage, total }) {
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="pagination">
      <span>
        {t("共")}
        {t(total)}
        {t("条 \xB7 每页 10 条")}
      </span>
      <div>
        <button
          className="icon-button"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label={t("上一页")}
        >
          <ChevronLeft size={18} />
        </button>
        <label>
          {t("第")}
          {t(" ")}
          <select
            value={Math.min(page, pages)}
            onChange={(e) => setPage(+e.target.value)}
          >
            {t(
              Array.from(
                {
                  length: pages,
                },
                (_, i) => <option key={i}>{t(i + 1)}</option>,
              ),
            )}
          </select>
          {t(" ")}/ {t(pages)}
          {t("页")}
        </label>
        <button
          className="icon-button"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
          aria-label={t("下一页")}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
function Samples({
  samples,
  go,
  open,
  edit,
  remove,
  exportRows,
  setPublishing,
  busy,
}) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState([]),
    [page, setPage] = useState(1);
  const rows = samples.filter(
    (s) =>
      (s.name + t(s.name) + s.code + s.color + t(s.color))
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (status === "all" || !!s.published === (status === "published")),
  );
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [q, status, samples.length]);
  const onPage = rows.slice((page - 1) * 10, page * 10);
  return (
    <>
      <Heading
        eyebrow="SAMPLE LIBRARY"
        title={t("样品库")}
        description="统一管理每一件样品，让资料井然有序。"
      >
        <button
          className="button"
          onClick={() =>
            exportRows(
              selected.length
                ? rows.filter((s) => selected.includes(s.id))
                : rows,
            )
          }
        >
          <Download size={17} />
          {t("导出表格")}
        </button>
        <button className="button primary" onClick={() => go("intake")}>
          <Plus size={18} />
          {t("新建样品")}
        </button>
      </Heading>
      <div className="panel">
        <div className="filter-bar">
          <div className="search-input">
            <Search size={18} />
            <input
              aria-label={t("搜索样品")}
              placeholder={t("搜索名称、编号或颜色…")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            aria-label={t("发布状态")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">{t("全部发布状态")}</option>
            <option value="published">{t("已发布")}</option>
            <option value="draft">{t("未发布")}</option>
          </select>
          <span className="grow" />
          {t(
            selected.length > 0 && (
              <button
                className="button danger"
                onClick={() => remove(selected)}
              >
                {t("删除选中 (")}
                {t(selected.length)})
              </button>
            ),
          )}
          <span className="muted">
            {t(rows.length)}
            {t("件样品")}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label={t("选择本页可编辑样品")}
                    type="checkbox"
                    checked={
                      onPage.some((s) => s.canEdit) &&
                      onPage
                        .filter((s) => s.canEdit)
                        .every((s) => selected.includes(s.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? onPage.filter((s) => s.canEdit).map((s) => s.id)
                          : [],
                      )
                    }
                  />
                </th>
                <th>{t("样品")}</th>
                <th>{t("尺寸 / cm")}</th>
                <th>{t("入库人")}</th>
                <th>{t("状态")}</th>
                <th>{t("入库日期")}</th>
                <th>{t("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {t(
                onPage.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t(`选择 ${s.name}`)}
                        disabled={!s.canEdit}
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, s.id]
                              : selected.filter((id) => id !== s.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button className="table-sample" onClick={() => open(s)}>
                        <img src={s.image} alt="" />
                        <span>
                          <strong>{t(s.name)}</strong>
                          <small>{t(s.code)}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {t(dims(s))}
                      <small className="cell-sub">
                        {t(s.color)} · {t(s.category)}
                      </small>
                    </td>
                    <td>{t(s.owner)}</td>
                    <td>
                      <Status s={s} />
                    </td>
                    <td>{t(date(s.created_at))}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          title={t("查看详情")}
                          onClick={() => open(s)}
                        >
                          <Eye size={17} />
                        </button>
                        {t(
                          s.canEdit && (
                            <>
                              <button
                                className="icon-button"
                                title={t("编辑")}
                                onClick={() => edit(s)}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="icon-button danger-text"
                                title={t("删除")}
                                onClick={() => remove([s.id])}
                              >
                                <Trash2 size={16} />
                              </button>
                              {t(
                                !s.published && (
                                  <button
                                    className="text-button"
                                    onClick={() => setPublishing(s)}
                                  >
                                    {t("发布")}
                                  </button>
                                ),
                              )}
                            </>
                          ),
                        )}
                      </div>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {t(!rows.length && <Empty />)}
        <Pager page={page} setPage={setPage} total={rows.length} />
      </div>
    </>
  );
}
function Intake({ editing, done, run, flash, reload, busy }) {
  const blank = {
    name: "",
    category: "家居饰品",
    color: "",
    length: "",
    width: "",
    height: "",
    notes: "",
    image: "",
  };
  const [form, setForm] = useState(editing || blank),
    [uploading, setUploading] = useState(false),
    [reset, setReset] = useState(false),
    [camera, setCamera] = useState(false);
  const fileRef = useRef(),
    cameraRef = useRef();
  useEffect(() => {
    setForm(editing || blank);
  }, [editing]);
  const change = (k, v) =>
    setForm((f) => ({
      ...f,
      [k]: v,
    }));
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    await run(async () => {
      const body = new FormData();
      body.append("image", file);
      const data = await api("/uploads", {
        method: "POST",
        body,
      });
      setForm((f) => ({
        ...f,
        image: data.image,
        color: t(data.color),
        name: f.name || t(data.suggestedName),
      }));
      flash("图片已处理，请确认名称并填写实测尺寸");
    });
    setUploading(false);
  };
  const save = async (e) => {
    e.preventDefault();
    await run(async () => {
      if (!form.image) throw new Error("请先上传样品图片");
      await api(editing ? "/samples/" + editing.id : "/samples", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      await reload();
      flash(editing ? "样品已更新，旧二维码已失效" : "样品入库成功");
      done();
    });
  };
  return (
    <>
      <Heading
        eyebrow="SMART INTAKE"
        title={t(editing ? "编辑样品档案" : "新建样品")}
        description="上传一张图片，完善信息，把新灵感收入样品库。"
      >
        <button className="button" onClick={() => setReset(true)}>
          <RefreshCw size={16} />
          {t("重置表单")}
        </button>
        <button
          className="button primary"
          form="intake-form"
          disabled={busy || uploading}
        >
          <Check size={18} />
          {t(busy ? "保存中…" : "保存样品")}
        </button>
      </Heading>
      <form id="intake-form" onSubmit={save} className="intake-grid">
        <section className="panel intake-picture">
          <div className="panel-heading">
            <h2>{t("样品图片")}</h2>
            <span>01</span>
          </div>
          <div
            className={`upload-area ${uploading ? "loading" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files[0]);
            }}
          >
            {t(
              uploading ? (
                <>
                  <div className="spinner" />
                  <p>{t("正在提取图片颜色…")}</p>
                </>
              ) : form.image ? (
                <img src={form.image} alt={t("样品预览")} />
              ) : (
                <>
                  <div className="upload-icon">
                    <ImageIcon size={35} />
                  </div>
                  <h3>{t("将样品照片拖到这里")}</h3>
                  <p>
                    {t("支持 JPG、PNG、WebP")}
                    <br />
                    {t("最大 8 MB，清晰背景效果更好")}
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => fileRef.current.click()}
                  >
                    <Upload size={17} />
                    {t("选择图片")}
                  </button>
                </>
              ),
            )}
          </div>
          <div className="image-actions">
            <button
              type="button"
              className="button"
              onClick={() => fileRef.current.click()}
            >
              <Upload size={17} />
              {t(form.image ? "替换图片" : "上传图片")}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setCamera(true)}
            >
              <Camera size={17} />
              {t("实时拍照")}
            </button>
          </div>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/*"
            onChange={(e) => {
              upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <div className="info-note">
            <ScanLine size={19} />
            <span>
              {t("自动提取颜色并建议名称。真实长宽高需使用标尺测量后填写。")}
            </span>
          </div>
        </section>
        <section className="panel intake-fields">
          <div className="panel-heading">
            <h2>{t("档案信息")}</h2>
            <span>02</span>
          </div>
          <div className="form-grid">
            <label className="span-2">
              {t("样品名称")}
              <em>*</em>
              <input
                required
                maxLength={100}
                placeholder={t("为样品起一个清晰的名字")}
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
              />
            </label>
            <label>
              {t("品类")}
              <select
                aria-label={t("品类")}
                value={form.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {t(
                  ["家居饰品", "家具", "灯具", "纺织品", "其他"].map((c) => (
                    <option key={c} value={c}>
                      {t(c)}
                    </option>
                  )),
                )}
              </select>
            </label>
            <label>
              {t("主体颜色")}
              <input
                placeholder={t("如：原木、云白")}
                value={form.color}
                onChange={(e) => change("color", e.target.value)}
              />
            </label>
            <div className="span-2 dimension-fields">
              {t(
                [
                  ["length", "长度"],
                  ["width", "宽度"],
                  ["height", "高度"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {t(label)} / cm
                    <input
                      type="number"
                      min="0.01"
                      max="100000"
                      step="any"
                      placeholder={t("待测量")}
                      value={form[key] ?? ""}
                      onChange={(e) => change(key, e.target.value)}
                    />
                  </label>
                )),
              )}
            </div>
            <label className="span-2">
              {t("样品编号")}
              <input
                disabled
                value={editing?.code || t("保存时自动分配唯一编号")}
              />
            </label>
            <label className="span-2">
              {t("样品备注")}
              <textarea
                maxLength={4000}
                rows={4}
                placeholder={t("记录材质、工艺、供应商或设计灵感…")}
                value={form.notes}
                onChange={(e) => change("notes", e.target.value)}
              />
            </label>
          </div>
          <div className="info-note">
            <ShieldCheck size={18} />
            <span>
              {t("所有识别信息都可以手动修改。保存后即可下载专属二维码。")}
            </span>
          </div>
          {t(
            editing && (
              <a
                className="button"
                href={`/api/samples/${editing.id}/qr`}
                download={`${editing.code}.png`}
              >
                <Download size={16} />
                {t("下载当前版本二维码")}
              </a>
            ),
          )}
        </section>
      </form>
      {t(
        reset && (
          <Modal title={t("重置当前表单？")} close={() => setReset(false)}>
            <p>{t("尚未保存的修改将被清空。")}</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setReset(false)}>
                {t("取消")}
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setForm(editing || blank);
                  setReset(false);
                }}
              >
                {t("确认重置")}
              </button>
            </div>
          </Modal>
        ),
      )}
      {t(
        camera && (
          <CameraCapture
            close={() => setCamera(false)}
            onCapture={(file) => {
              setCamera(false);
              upload(file);
            }}
          />
        ),
      )}
    </>
  );
}
function CameraCapture({ close, onCapture }) {
  const video = useRef(),
    stream = useRef(),
    fallback = useRef(),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: false,
      })
      .then((s) => {
        if (disposed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        video.current.srcObject = s;
      })
      .catch(() => setError("无法打开摄像头，请授权或使用手机拍照上传。"));
    if (!navigator.mediaDevices)
      setError("此浏览器无法打开摄像头，可使用手机拍照上传。");
    return () => {
      disposed = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <Modal title={t("拍摄样品")} close={close}>
      <video
        ref={video}
        className="camera-video"
        autoPlay
        playsInline
        muted
        onLoadedData={() => setReady(true)}
      />
      {t(error && <p className="error-text">{t(error)}</p>)}
      <input
        hidden
        ref={fallback}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files[0] && onCapture(e.target.files[0])}
      />
      <div className="modal-actions">
        <button className="button" onClick={() => fallback.current.click()}>
          {t("手机拍照 / 选择图片")}
        </button>
        <button
          className="button primary"
          disabled={!ready}
          onClick={() => {
            const c = document.createElement("canvas");
            c.width = video.current.videoWidth;
            c.height = video.current.videoHeight;
            c.getContext("2d").drawImage(video.current, 0, 0);
            c.toBlob(
              (b) =>
                b &&
                onCapture(
                  new File([b], "camera.jpg", {
                    type: "image/jpeg",
                  }),
                ),
              "image/jpeg",
              0.9,
            );
          }}
        >
          <Camera size={17} />
          {t("拍摄")}
        </button>
      </div>
    </Modal>
  );
}
function SearchPage({
  samples,
  open,
  react,
  run,
  flash,
  config,
  exportRows,
  user,
}) {
  const [tab, setTab] = useState("fields"),
    [filters, setFilters] = useState({
      q: "",
      color: "",
      min: "",
      max: "",
      minHeight: "",
      maxHeight: "",
      from: "",
    }),
    [applied, setApplied] = useState({}),
    [threshold, setThreshold] = useState(config?.threshold ?? 80),
    [file, setFile] = useState(null),
    [imageUrl, setImageUrl] = useState(""),
    [results, setResults] = useState(null),
    [loading, setLoading] = useState(false),
    [camera, setCamera] = useState(false),
    [historyItems, setHistoryItems] = useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem("samplio-history-" + user.id) || "[]",
        );
      } catch {
        return [];
      }
    }),
    [page, setPage] = useState(1),
    [sort, setSort] = useState("new");
  useEffect(() => {
    if (!file) {
      setImageUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const change = (k, v) =>
    setFilters({
      ...filters,
      [k]: v,
    });
  const remember = (f) => {
    const h = [
      f,
      ...historyItems.filter((x) => JSON.stringify(x) !== JSON.stringify(f)),
    ].slice(0, 6);
    setHistoryItems(h);
    localStorage.setItem("samplio-history-" + user.id, JSON.stringify(h));
  };
  let rows =
    tab === "fields"
      ? samples.filter(
          (s) =>
            (!applied.q ||
              (s.name + t(s.name) + s.code)
                .toLowerCase()
                .includes(applied.q.toLowerCase())) &&
            (!applied.color ||
              (s.color + t(s.color))
                .toLowerCase()
                .includes(applied.color.toLowerCase())) &&
            (!applied.min || (s.length != null && s.length >= +applied.min)) &&
            (!applied.max || (s.length != null && s.length <= +applied.max)) &&
            (!applied.minHeight ||
              (s.height != null && s.height >= +applied.minHeight)) &&
            (!applied.maxHeight ||
              (s.height != null && s.height <= +applied.maxHeight)) &&
            (!applied.from || s.created_at >= applied.from),
        )
      : results || [];
  if (tab === "fields")
    rows = [...rows].sort((a, b) =>
      sort === "score"
        ? b.score - a.score
        : sort === "name"
          ? a.name.localeCompare(b.name, "zh")
          : b.created_at.localeCompare(a.created_at),
    );
  const searchImage = () =>
    run(async () => {
      if (!file) throw new Error("请先选择图片");
      setLoading(true);
      try {
        const body = new FormData();
        body.append("image", file);
        body.append("threshold", tab === "camera" ? 95 : threshold);
        setResults(
          await api("/search/image", {
            method: "POST",
            body,
          }),
        );
        setPage(1);
      } finally {
        setLoading(false);
      }
    });
  return (
    <>
      <Heading
        eyebrow="DISCOVER"
        title={t("智能检索")}
        description="用文字筛选，或从一张相似的图片找到灵感。"
      />
      <div className="panel search-panel">
        <div className="tabs">
          {t(
            [
              ["fields", "结构化查询", SlidersHorizontal],
              ["camera", "拍照比对", Camera],
              ["similar", "图片相似检索", ScanLine],
            ].map(([key, label, Icon]) => (
              <button
                className={tab === key ? "active" : ""}
                key={key}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                  setResults(null);
                }}
              >
                <Icon size={17} />
                {t(label)}
              </button>
            )),
          )}
        </div>
        {t(
          tab === "fields" ? (
            <form
              className="search-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  (filters.min && filters.max && +filters.min > +filters.max) ||
                  (filters.minHeight &&
                    filters.maxHeight &&
                    +filters.minHeight > +filters.maxHeight)
                ) {
                  flash("尺寸下限不能大于上限", true);
                  return;
                }
                setApplied({
                  ...filters,
                });
                setPage(1);
                remember({
                  ...filters,
                });
              }}
            >
              <div className="form-grid search-fields">
                <label>
                  {t("名称或编号")}
                  <input
                    value={filters.q}
                    placeholder={t("输入关键词")}
                    onChange={(e) => change("q", e.target.value)}
                  />
                </label>
                <label>
                  {t("颜色")}
                  <input
                    value={filters.color}
                    placeholder={t("如：原木")}
                    onChange={(e) => change("color", e.target.value)}
                  />
                </label>
                <label>
                  {t("长度范围 / cm")}
                  <div className="range-fields">
                    <input
                      aria-label={t("最小长度")}
                      type="number"
                      min="0"
                      value={filters.min}
                      placeholder={t("最小")}
                      onChange={(e) => change("min", e.target.value)}
                    />
                    <span>—</span>
                    <input
                      aria-label={t("最大长度")}
                      type="number"
                      min="0"
                      value={filters.max}
                      placeholder={t("最大")}
                      onChange={(e) => change("max", e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  {t("高度范围 / cm")}
                  <div className="range-fields">
                    <input
                      aria-label={t("最小高度")}
                      type="number"
                      min="0"
                      value={filters.minHeight}
                      placeholder={t("最小")}
                      onChange={(e) => change("minHeight", e.target.value)}
                    />
                    <span>—</span>
                    <input
                      aria-label={t("最大高度")}
                      type="number"
                      min="0"
                      value={filters.maxHeight}
                      placeholder={t("最大")}
                      onChange={(e) => change("maxHeight", e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  {t("入库日期起")}
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => change("from", e.target.value)}
                  />
                </label>
              </div>
              <div className="search-actions">
                <button className="button primary">
                  <Search size={17} />
                  {t("搜索样品")}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    const f = {
                      q: "",
                      color: "",
                      min: "",
                      max: "",
                      minHeight: "",
                      maxHeight: "",
                      from: "",
                    };
                    setFilters(f);
                    setApplied(f);
                    setPage(1);
                  }}
                >
                  {t("重置条件")}
                </button>
              </div>
            </form>
          ) : (
            <div className="visual-search">
              <div className="search-photo">
                {t(
                  imageUrl ? (
                    <img src={imageUrl} alt={t("检索图片")} />
                  ) : (
                    <ImageIcon size={35} />
                  ),
                )}
                <label className="button">
                  <Upload size={17} />
                  {t("选择图片")}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setFile(e.target.files[0]);
                      setResults(null);
                    }}
                  />
                </label>
                {t(
                  tab === "camera" && (
                    <button className="button" onClick={() => setCamera(true)}>
                      <Camera size={17} />
                      {t("拍摄样品")}
                    </button>
                  ),
                )}
              </div>
              <div>
                <h3>
                  {t(
                    tab === "camera"
                      ? "寻找外观高度接近的样品"
                      : "以图寻找相似样品",
                  )}
                </h3>
                <p className="muted">
                  {t("基于颜色与低分辨率像素特征进行本地比对。")}
                  <br />
                  {t("结果仅供筛选参考，不代表同款确认或语义识别。")}
                </p>
                {t(
                  tab === "similar" && (
                    <label>
                      {t("相似度阈值")}
                      <strong>{t(threshold)}%</strong>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={threshold}
                        onChange={(e) => setThreshold(+e.target.value)}
                      />
                    </label>
                  ),
                )}
                <button
                  className="button primary"
                  disabled={loading}
                  onClick={searchImage}
                >
                  <ScanLine size={17} />
                  {t(loading ? "正在检索…" : "开始图片检索")}
                </button>
              </div>
            </div>
          ),
        )}
      </div>
      <div className="section-title spaced search-result-title">
        <h2>
          {t("检索结果")}
          <span className="count">{t(rows.length)}</span>
        </h2>
        <div className="heading-actions">
          {t(
            tab === "fields" && (
              <select
                aria-label={t("结果排序")}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="new">{t("最新入库")}</option>
                <option value="score">{t("喜欢度优先")}</option>
                <option value="name">{t("名称排序")}</option>
              </select>
            ),
          )}
          <button className="text-button" onClick={() => exportRows(rows)}>
            <Download size={16} />
            {t("导出结果")}
          </button>
        </div>
      </div>
      {t(
        loading ? (
          <div className="skeleton-grid">
            {t([1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />))}
          </div>
        ) : (
          <div className="cards-grid">
            {t(
              rows
                .slice((page - 1) * 10, page * 10)
                .map((s) => (
                  <Card key={s.id} s={s} open={open} react={react} />
                )),
            )}
            {t(
              !rows.length && (
                <Empty
                  text={
                    tab !== "fields" && results === null
                      ? "上传图片开始检索"
                      : "未找到匹配样品"
                  }
                />
              ),
            )}
          </div>
        ),
      )}
      <Pager page={page} setPage={setPage} total={rows.length} />
      {t(
        tab === "fields" && historyItems.length > 0 && (
          <div className="history">
            <Clock size={16} />
            <span>{t("最近搜索")}</span>
            {t(
              historyItems.map((f, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setFilters(f);
                    setApplied(f);
                    setPage(1);
                  }}
                >
                  {t(f.q || f.color || "组合条件")}
                  {t(f.min ? ` · ≥${f.min}cm` : "")}
                </button>
              )),
            )}
          </div>
        ),
      )}
      {t(
        camera && (
          <CameraCapture
            close={() => setCamera(false)}
            onCapture={(file) => {
              setFile(file);
              setCamera(false);
            }}
          />
        ),
      )}
    </>
  );
}
function Review({ samples, open, react }) {
  const [sort, setSort] = useState("score"),
    [period, setPeriod] = useState("all"),
    [limit, setLimit] = useState(10);
  const sentinel = useRef();
  const days = period === "week" ? 7 : period === "month" ? 30 : Infinity;
  const rows = samples
    .filter(
      (s) =>
        s.published && Date.now() - new Date(s.created_at) < days * 86400000,
    )
    .sort((a, b) =>
      sort === "score"
        ? b.score - a.score
        : b.created_at.localeCompare(a.created_at),
    );
  useEffect(() => {
    setLimit(10);
  }, [sort, period]);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((n) => n + 10);
    });
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <Heading
        eyebrow="TEAM REVIEW"
        title={t("评审广场")}
        description="说出你的专业意见，让好产品成为团队共识。"
      />
      <div className="review-intro">
        <span className="review-icon">
          <MessagesSquare size={28} />
        </span>
        <div>
          <h2>{t("你的眼光，是下一件好产品的起点")}</h2>
          <p>{t("为喜欢的样品点赞，收藏灵感，留下具体的改进建议。")}</p>
        </div>
        <span className="large-count">
          {t(rows.length)}
          <small>{t("件样品等待发现")}</small>
        </span>
      </div>
      <div className="filter-bar standalone">
        <div className="tabs compact">
          <button
            className={sort === "score" ? "active" : ""}
            onClick={() => setSort("score")}
          >
            {t("大家喜欢")}
          </button>
          <button
            className={sort === "new" ? "active" : ""}
            onClick={() => setSort("new")}
          >
            {t("最新发布")}
          </button>
        </div>
        <select
          aria-label={t("评审时间筛选")}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="all">{t("全部时间")}</option>
          <option value="week">{t("最近 7 天入库")}</option>
          <option value="month">{t("最近 30 天入库")}</option>
        </select>
      </div>
      <div className="cards-grid">
        {t(
          rows
            .slice(0, limit)
            .map((s) => <Card key={s.id} s={s} open={open} react={react} />),
        )}
        {t(!rows.length && <Empty text="暂时没有公开评审的样品" />)}
      </div>
      <div ref={sentinel} className="list-end">
        {t(limit >= rows.length ? "已展示全部样品" : "继续向下浏览更多样品")}
      </div>
    </>
  );
}
function Detail({
  sample: s,
  open,
  react,
  edit,
  remove,
  setPublishing,
  user,
  run,
  refreshDetail,
  setPreview,
  busy,
}) {
  const [body, setBody] = useState(""),
    [reply, setReply] = useState(null),
    [deleting, setDeleting] = useState(null);
  const expired = s.deadline && new Date(s.deadline) < new Date();
  const qr = `/api/samples/${s.id}/qr?revision=${s.revision}`;
  return (
    <div className="detail-grid">
      <div>
        <button className="detail-image" onClick={() => setPreview(s.image)}>
          <img src={s.image} alt={t(s.name)} />
          <span>
            <Eye size={16} />
            {t("点击放大")}
          </span>
        </button>
        <div className="detail-name">
          <div>
            <span className="card-code">{t(s.code)}</span>
            <h1>{t(s.name)}</h1>
          </div>
          <Status s={s} />
        </div>
        <div className="detail-specs">
          {t(
            [
              ["品类", s.category],
              ["颜色", s.color],
              ["尺寸 / cm", dims(s)],
              ["入库人", s.owner],
              ["入库时间", date(s.created_at)],
              ["累计喜欢度", s.score + " 分"],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{t(k)}</small>
                <strong>{t(v)}</strong>
              </div>
            )),
          )}
        </div>
        <p className="detail-notes">{t(s.notes || "暂无补充说明")}</p>
        <div className="detail-toolbar">
          {t(
            s.canEdit && (
              <>
                <button className="button" onClick={() => edit(s)}>
                  <Pencil size={16} />
                  {t("编辑")}
                </button>
                {t(
                  !s.published && (
                    <button
                      className="button primary"
                      onClick={() => setPublishing(s)}
                    >
                      {t("发布评审")}
                    </button>
                  ),
                )}
                <button
                  className="icon-button danger-text"
                  title={t("删除样品")}
                  onClick={() => remove([s.id])}
                >
                  <Trash2 size={18} />
                </button>
              </>
            ),
          )}
        </div>
        <div className="qr-panel">
          <img src={qr} alt={t("样品档案二维码")} />
          <div>
            <strong>{t("样品专属二维码")}</strong>
            <p>
              {t(`第 ${s.revision} 版 · 更新档案后旧码失效`)}
              <br />
              {t("扫码后需登录有权限的账号")}
            </p>
            <div className="row-actions">
              <a className="text-button" href={qr} download={`${s.code}.png`}>
                <Download size={15} />
                {t("下载")}
              </a>
              <button
                className="text-button"
                onClick={() => {
                  const w = window.open("", "_blank");
                  if (!w) return;
                  const img = w.document.createElement("img");
                  img.src = qr;
                  img.alt = s.name;
                  img.onload = () => w.print();
                  w.document.body.append(img);
                }}
              >
                <Printer size={15} />
                {t("打印")}
              </button>
            </div>
          </div>
        </div>
      </div>
      <section className="discussion">
        <div className="section-title">
          <h2>{t("团队评审")}</h2>
          <span className="count">
            {getLanguage() === "en" ? `${s.commentCount} ${s.commentCount === 1 ? "suggestion" : "suggestions"}` : `${s.commentCount} 条建议`}
          </span>
        </div>
        <p className="section-subtitle">
          {t(
            s.published
              ? expired
                ? "本轮评审已结束"
                : `评审截止 ${new Date(s.deadline).toLocaleString(getLocale())}`
              : "未公开，仅本人和管理员可见",
          )}
        </p>
        <div className="interaction-buttons">
          <button
            disabled={!s.published || expired || busy}
            className={s.liked ? "selected" : ""}
            onClick={() => react(s, "like")}
          >
            <Heart size={21} fill={s.liked ? "currentColor" : "none"} />
            <strong>{t(s.likes)}</strong>
            {t("点赞")}
          </button>
          <button
            disabled={!s.published || expired || busy}
            className={s.favorited ? "selected" : ""}
            onClick={() => react(s, "favorite")}
          >
            <Bookmark size={21} fill={s.favorited ? "currentColor" : "none"} />
            <strong>{t(s.favorites)}</strong>
            {t("收藏")}
          </button>
          <div>
            <MessageCircle size={21} />
            <strong>{t(s.commentCount)}</strong>
            {t("建议")}
          </div>
        </div>
        <div className="comments">
          {t(
            s.comments.map((c) => (
              <article
                className={`comment ${c.parent_id ? "reply-comment" : ""}`}
                key={c.id}
              >
                <div className="comment-top">
                  <span className="avatar small">{t(c.author.slice(-2))}</span>
                  <strong>{t(c.author)}</strong>
                  <small>{t(date(c.created_at))}</small>
                </div>
                {t(
                  c.parent_id && (
                    <small className="reply-hint">
                      {t("回复")}
                      {t(" ")}
                      {t(
                        s.comments.find((x) => x.id === c.parent_id)?.author ||
                          "评论",
                      )}
                    </small>
                  ),
                )}
                <p>{t(c.body)}</p>
                <div className="comment-actions">
                  <button
                    className="text-button"
                    disabled={!s.published || expired}
                    onClick={() => setReply(c)}
                  >
                    <Reply size={14} />
                    {t("回复")}
                  </button>
                  {t(
                    (c.user_id === user.id || user.role === "admin") && (
                      <button
                        className="text-button danger-text"
                        onClick={() => setDeleting(c)}
                      >
                        {t("删除")}
                      </button>
                    ),
                  )}
                </div>
              </article>
            )),
          )}
          {t(
            !s.comments.length && (
              <div className="no-comments">
                <MessageCircle size={30} />
                <p>{t("还没有建议，期待你的专业眼光。")}</p>
              </div>
            ),
          )}
        </div>
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post(`/samples/${s.id}/comments`, {
                body,
                parent_id: reply?.id,
              });
              setBody("");
              setReply(null);
              await refreshDetail(s.id);
            });
          }}
        >
          {t(
            reply && (
              <div className="reply-banner">
                {t("回复")}
                {t(reply.author)}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setReply(null)}
                >
                  <X size={14} />
                </button>
              </div>
            ),
          )}
          <textarea
            aria-label={t("评审建议")}
            required
            minLength={5}
            maxLength={1000}
            disabled={!s.published || expired}
            placeholder={t(
              s.published
                ? "从材质、工艺、成本或使用体验，留下具体建议…"
                : "发布后即可参与评审",
            )}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <small>{t("具体的建议，会让讨论更有价值。")}</small>
            <button
              className="button primary"
              disabled={!s.published || expired || busy}
            >
              {t("提交建议")}
            </button>
          </div>
        </form>
      </section>
      {t(
        deleting && (
          <Modal title={t("删除这条评论？")} close={() => setDeleting(null)}>
            <p>{t("删除后该评论不再计入喜欢度。")}</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setDeleting(null)}>
                {t("取消")}
              </button>
              <button
                className="button primary"
                onClick={() =>
                  run(async () => {
                    await api("/comments/" + deleting.id, {
                      method: "DELETE",
                    });
                    setDeleting(null);
                    await refreshDetail(s.id);
                  })
                }
              >
                {t("确认删除")}
              </button>
            </div>
          </Modal>
        ),
      )}
    </div>
  );
}
function Publish({ sample, close, submit }) {
  const [notes, setNotes] = useState(sample.notes || ""),
    [deadline, setDeadline] = useState(
      new Date(
        Date.now() + 7 * 86400000 - new Date().getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16),
    );
  return (
    <Modal title={t("发布至评审广场")} close={close}>
      <p className="muted">
        {t("发布后，团队成员可以查看「")}
        {t(sample.name)}
        {t("」并参与评审。")}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({
            notes,
            deadline: new Date(deadline).toISOString(),
          });
        }}
      >
        <label>
          {t("评审简介")}
          <textarea
            value={notes}
            maxLength={4000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="block-label">
          {t("评审截止时间")}
          <input
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            {t("取消")}
          </button>
          <button className="button primary">{t("确认发布")}</button>
        </div>
      </form>
    </Modal>
  );
}
function ImagePreview({ src, close }) {
  const [scale, setScale] = useState(1);
  return (
    <Modal title={t("图片预览 · 滚轮缩放")} wide close={close}>
      <div
        className="zoom-picture"
        onWheel={(e) =>
          setScale((s) =>
            Math.max(0.5, Math.min(4, s + (e.deltaY < 0 ? 0.15 : -0.15))),
          )
        }
      >
        <img
          style={{
            transform: `scale(${scale})`,
          }}
          src={src}
          alt={t("样品大图")}
        />
      </div>
      <div className="modal-actions">
        <button className="button" onClick={() => setScale(1)}>
          {t("重置缩放")}
        </button>
      </div>
    </Modal>
  );
}
function Ranking({ samples, open, run, config, exportRows }) {
  const [period, setPeriod] = useState("all"),
    [rows, setRows] = useState([]),
    [chart, setChart] = useState("bar");
  useEffect(() => {
    run(async () => setRows(await api("/rankings?period=" + period)));
  }, [period, samples, config]);
  const top = rows.slice(0, 5),
    max = Math.max(1, ...top.map((s) => s.score));
  return (
    <>
      <Heading
        eyebrow="TEAM FAVORITES"
        title={t("喜欢度榜单")}
        description="把团队的每一次认可，转化为可参考的产品选择。"
      >
        <button className="button" onClick={() => exportRows(rows, period)}>
          <Download size={17} />
          {t("导出榜单")}
        </button>
      </Heading>
      <div className="ranking-info">
        <Trophy size={20} />
        <span>
          {t("喜欢度 = 点赞 \xD7")}
          {t(config?.like)}
          {t("+ 收藏 \xD7")}
          {t(config?.favorite)}
          {t("+ 有效评论 \xD7")}
          {t(config?.comment)}
        </span>
        <small>{t("时间区间按 UTC 计算")}</small>
      </div>
      <div className="filter-bar standalone">
        <div className="tabs compact">
          {t(
            [
              ["today", "今日"],
              ["week", "本周"],
              ["month", "本月"],
              ["all", "累计总榜"],
            ].map(([p, label]) => (
              <button
                key={p}
                className={period === p ? "active" : ""}
                onClick={() => setPeriod(p)}
              >
                {t(label)}
              </button>
            )),
          )}
        </div>
        <span className="muted">
          {t(rows.length)}
          {t("件参评样品")}
        </span>
      </div>
      <div className="ranking-grid">
        <div className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("排名")}</th>
                  <th>{t("样品")}</th>
                  <th>{t("喜欢度")}</th>
                  <th>{t("点赞")}</th>
                  <th>{t("收藏")}</th>
                  <th>{t("评论")}</th>
                </tr>
              </thead>
              <tbody>
                {t(
                  rows.map((s, i) => (
                    <tr key={s.id}>
                      <td>
                        <span className={`rank-number rank-${i}`}>
                          {t(String(i + 1).padStart(2, "0"))}
                        </span>
                      </td>
                      <td>
                        <button
                          className="table-sample"
                          onClick={() => open(s)}
                        >
                          <img src={s.image} alt="" />
                          <span>
                            <strong>{t(s.name)}</strong>
                            <small>{t(s.code)}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <strong className="score">{t(s.score)}</strong>
                      </td>
                      <td>{t(s.likes)}</td>
                      <td>{t(s.favorites)}</td>
                      <td>{t(s.commentCount)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {t(!rows.length && <Empty />)}
        </div>
        <div className="panel chart-panel">
          <div className="section-title">
            <h2>{t("偏好对比")}</h2>
            <button
              className="text-button"
              onClick={() => setChart(chart === "bar" ? "line" : "bar")}
            >
              {t(chart === "bar" ? "趋势图" : "柱状图")}
            </button>
          </div>
          <p className="section-subtitle">
            {t(
              chart === "bar"
                ? "TOP 5 · 当前区间喜欢度"
                : "近 7 天 · 当前仍保留的评论加权分数",
            )}
          </p>
          {t(
            chart === "bar" ? (
              <div className="bar-chart">
                {t(
                  top.map((s, i) => (
                    <button
                      key={s.id}
                      title={t(`${s.name}：${s.score} 分`)}
                      onClick={() => open(s)}
                    >
                      <span>{t(s.name)}</span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max(2, (s.score / max) * 100)}%`,
                          }}
                        />
                        <b>{t(s.score)}</b>
                      </div>
                    </button>
                  )),
                )}
              </div>
            ) : (
              <Trend samples={samples} config={config} />
            ),
          )}
          <div className="chart-note">
            <FileText size={17} />
            <p>
              {t(
                "喜欢度提供团队偏好参考，建议结合成本、质量与交付能力共同决策。",
              )}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
function Trend({ samples, config }) {
  const values = Array.from(
    {
      length: 7,
    },
    (_, i) => {
      const day = new Date(Date.now() - (6 - i) * 86400000)
        .toISOString()
        .slice(0, 10);
      return {
        day,
        value: samples
          .filter((s) => s.published)
          .reduce(
            (sum, s) =>
              sum +
              s.comments.filter((c) => c.created_at.startsWith(day)).length *
                (config?.comment || 0),
            0,
          ),
      };
    },
  );
  return (
    <div className="trend">
      <p className="muted">{t("有效评论热度（评论数 \xD7 权重）")}</p>
      <svg
        viewBox="0 0 320 190"
        role="img"
        aria-label={t("最近七天评论加权趋势")}
      >
        <path d="M20 10 V155 H305" fill="none" stroke="#dde6df" />
        <polyline
          fill="none"
          stroke="#47785b"
          strokeWidth="3"
          points={values
            .map(
              (d, i) =>
                `${25 + i * 44},${150 - (d.value / Math.max(1, ...values.map((v) => v.value))) * 120}`,
            )
            .join(" ")}
        />
        {t(
          values.map((d, i) => (
            <g key={d.day}>
              <circle
                cx={25 + i * 44}
                cy={
                  150 -
                  (d.value / Math.max(1, ...values.map((v) => v.value))) * 120
                }
                r="5"
                fill="#94b45b"
              >
                <title>
                  {t(d.day)}：{t(d.value)}
                  {t("分")}
                </title>
              </circle>
              <text
                x={25 + i * 44}
                y="180"
                textAnchor="middle"
                fontSize="10"
                fill="#7a8c7d"
              >
                {t(d.day.slice(5))}
              </text>
            </g>
          )),
        )}
      </svg>
      <div className="trend-values">
        {t(
          values.map((d) => (
            <span key={d.day}>
              {t(d.day.slice(5))}
              <b>{t(d.value)}</b>
            </span>
          )),
        )}
      </div>
    </div>
  );
}
function Personal({ samples, user, open, react, run, reload }) {
  const [tab, setTab] = useState("mine"),
    [page, setPage] = useState(1),
    [deleting, setDeleting] = useState(null);
  const rows = samples.filter((s) =>
      tab === "mine" ? s.owner_id === user.id : s.favorited,
    ),
    comments = samples.flatMap((s) =>
      s.comments
        .filter((c) => c.user_id === user.id)
        .map((c) => ({
          ...c,
          sample: s,
        })),
    );
  return (
    <>
      <Heading
        eyebrow="MY WORKSPACE"
        title={t("个人中心")}
        description="你的入库记录、灵感收藏与评审足迹。"
      />
      <div className="personal-banner">
        <span className="avatar large">{t(user.name.slice(-2))}</span>
        <div>
          <h2>{t(user.name)}</h2>
          <p>
            {t(user.username)} ·{" "}
            {t(user.role === "admin" ? "管理员" : "普通员工")}
          </p>
        </div>
        <div className="personal-stats">
          <span>
            <strong>
              {t(samples.filter((s) => s.owner_id === user.id).length)}
            </strong>
            {t("我的入库")}
          </span>
          <span>
            <strong>{t(samples.filter((s) => s.favorited).length)}</strong>
            {t("我的收藏")}
          </span>
          <span>
            <strong>{t(comments.length)}</strong>
            {t("我的建议")}
          </span>
        </div>
      </div>
      <div className="tabs personal-tabs">
        {t(
          [
            ["mine", "我的入库样品"],
            ["favorites", "我的收藏"],
            ["comments", "我的评论"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={k === tab ? "active" : ""}
              onClick={() => {
                setTab(k);
                setPage(1);
              }}
            >
              {t(label)}
            </button>
          )),
        )}
      </div>
      {t(
        tab === "comments" ? (
          <div className="panel">
            {t(
              comments.map((c) => (
                <div className="personal-comment" key={c.id}>
                  <button
                    className="text-button"
                    onClick={() => open(c.sample)}
                  >
                    {t(c.sample.name)}
                    <ArrowUpRight size={15} />
                  </button>
                  <p>{t(c.body)}</p>
                  <div>
                    <span className="muted">{t(date(c.created_at))}</span>
                    <button
                      className="text-button danger-text"
                      onClick={() => setDeleting(c)}
                    >
                      {t("删除评论")}
                    </button>
                  </div>
                </div>
              )),
            )}
            {t(!comments.length && <Empty text="还没有发表过建议" />)}
          </div>
        ) : (
          <>
            <div className="cards-grid">
              {t(
                rows
                  .slice((page - 1) * 10, page * 10)
                  .map((s) => (
                    <Card key={s.id} s={s} open={open} react={react} />
                  )),
              )}
              {t(!rows.length && <Empty />)}
            </div>
            <Pager page={page} setPage={setPage} total={rows.length} />
          </>
        ),
      )}
      {t(
        deleting && (
          <Modal title={t("删除这条评论？")} close={() => setDeleting(null)}>
            <div className="modal-actions">
              <button className="button" onClick={() => setDeleting(null)}>
                {t("取消")}
              </button>
              <button
                className="button primary"
                onClick={() =>
                  run(async () => {
                    await api("/comments/" + deleting.id, {
                      method: "DELETE",
                    });
                    setDeleting(null);
                    await reload();
                  })
                }
              >
                {t("确认删除")}
              </button>
            </div>
          </Modal>
        ),
      )}
    </>
  );
}
function Admin({ config, setConfig, run, flash, reload, user }) {
  const [tab, setTab] = useState("settings"),
    [form, setForm] = useState(config),
    [users, setUsers] = useState([]),
    [logs, setLogs] = useState([]),
    [trash, setTrash] = useState([]),
    [logType, setLogType] = useState(""),
    [logDate, setLogDate] = useState(""),
    [restore, setRestore] = useState(null);
  const load = async () => {
    const [u, l, t] = await Promise.all([
      api("/admin/users"),
      api("/admin/logs"),
      api("/admin/trash"),
    ]);
    setUsers(u);
    setLogs(l);
    setTrash(t);
  };
  useEffect(() => {
    run(load);
  }, [tab]);
  useEffect(() => setForm(config), [config]);
  return (
    <>
      <Heading
        eyebrow="ADMINISTRATION"
        title={t("系统管理")}
        description="管理团队权限与评审规则，维护样品数据。"
      />
      <div className="panel">
        <div className="tabs">
          {t(
            [
              ["settings", "参数配置"],
              ["users", "用户权限"],
              ["logs", "操作日志"],
              ["backup", "备份与恢复"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={tab === k ? "active" : ""}
                onClick={() => setTab(k)}
              >
                {t(label)}
              </button>
            )),
          )}
        </div>
        {t(
          tab === "settings" && form && (
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  setConfig(
                    await api("/settings", {
                      method: "PUT",
                      body: JSON.stringify(form),
                    }),
                  );
                  await reload();
                  flash("配置已保存，全局生效");
                });
              }}
            >
              <h2>{t("编号与检索")}</h2>
              <div className="form-grid">
                <label>
                  {t("编号品类前缀")}
                  <input
                    required
                    pattern="[A-Z0-9]{1,8}"
                    maxLength={8}
                    value={form.prefix}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        prefix: e.target.value,
                      })
                    }
                  />
                  <small>{t("编号规则：年月日-前缀-6位流水号")}</small>
                </label>
                <label>
                  {t("默认相似度阈值：")}
                  {t(form.threshold)}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={form.threshold}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        threshold: +e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <h2>{t("喜欢度权重")}</h2>
              <div className="dimension-fields">
                {t(
                  [
                    ["like", "点赞"],
                    ["favorite", "收藏"],
                    ["comment", "有效评论"],
                  ].map(([k, label]) => (
                    <label key={k}>
                      {t(label)}
                      {t("分值")}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        required
                        value={form[k]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [k]: +e.target.value,
                          })
                        }
                      />
                    </label>
                  )),
                )}
              </div>
              <p className="muted">
                {t("修改权重后，所有榜单立即按新规则重新计算。")}
              </p>
              <button className="button primary">
                <Check size={17} />
                {t("保存配置")}
              </button>
            </form>
          ),
        )}
        {t(
          tab === "users" && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("团队成员")}</th>
                    <th>{t("账号")}</th>
                    <th>{t("权限角色")}</th>
                  </tr>
                </thead>
                <tbody>
                  {t(
                    users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          {t(u.name)}
                          {t(u.id === user.id ? "（当前账号）" : "")}
                        </td>
                        <td>{t(u.username)}</td>
                        <td>
                          <select
                            aria-label={t(`${u.name}的角色`)}
                            disabled={u.id === user.id}
                            value={u.role}
                            onChange={(e) =>
                              run(async () => {
                                await api("/admin/users/" + u.id, {
                                  method: "PUT",
                                  body: JSON.stringify({
                                    role: e.target.value,
                                  }),
                                });
                                await load();
                                flash("权限已更新");
                              })
                            }
                          >
                            <option value="employee">{t("普通员工")}</option>
                            <option value="admin">{t("管理员")}</option>
                          </select>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ),
        )}
        {t(
          tab === "logs" && (
            <>
              <div className="filter-bar">
                <select
                  aria-label={t("日志类型")}
                  value={logType}
                  onChange={(e) => setLogType(e.target.value)}
                >
                  <option value="">{t("全部操作")}</option>
                  {t(
                    [...new Set(logs.map((l) => l.action))].map((a) => (
                      <option key={a} value={a}>
                        {t(a)}
                      </option>
                    )),
                  )}
                </select>
                <input
                  aria-label={t("日志日期")}
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                />
                <span className="muted">{t("最近 500 条 \xB7 只读留痕")}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("时间")}</th>
                      <th>{t("操作人")}</th>
                      <th>{t("操作")}</th>
                      <th>{t("详情")}</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t(
                      logs
                        .filter(
                          (l) =>
                            (!logType || l.action === logType) &&
                            (!logDate || l.created_at.startsWith(logDate)),
                        )
                        .map((l) => (
                          <tr key={l.id}>
                            <td>
                              {t(
                                new Date(l.created_at).toLocaleString(
                                  getLocale(),
                                ),
                              )}
                            </td>
                            <td>{t(l.actor)}</td>
                            <td>{t(l.action)}</td>
                            <td className="log-detail">{t(l.detail)}</td>
                            <td>{t(l.ip || "—")}</td>
                          </tr>
                        )),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ),
        )}
        {t(
          tab === "backup" && (
            <div className="admin-form">
              <div className="backup-card">
                <div>
                  <h2>{t("业务数据快照")}</h2>
                  <p>
                    {t("导出档案与互动数据。恢复仅适用于同一安装实例；")}
                    <br />
                    {t("图片、账号、系统配置与历史日志保留现状。")}
                  </p>
                </div>
                <a className="button" href="/api/admin/backup" download>
                  <Download size={17} />
                  {t("立即备份")}
                </a>
                <label className="button">
                  <Upload size={17} />
                  {t("恢复快照")}
                  <input
                    hidden
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const f = e.target.files[0];
                      if (f)
                        run(async () => {
                          if (f.size > 15 * 1024 * 1024)
                            throw new Error("备份文件最大 15 MB");
                          setRestore(JSON.parse(await f.text()));
                        });
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="info-note">
                <ShieldCheck size={19} />
                <span>
                  {t(
                    "完整备份请停服后复制整个 data 目录。此 POC 未配置每日自动备份与加密存储。",
                  )}
                </span>
              </div>
              <div className="section-title spaced">
                <h2>{t("样品回收站")}</h2>
                <span className="muted">
                  {t(trash.length)}
                  {t("件已删除样品")}
                </span>
              </div>
              {t(
                trash.map((s) => (
                  <div className="trash-row" key={s.id}>
                    <img src={s.image} alt="" />
                    <div>
                      <strong>{t(s.name)}</strong>
                      <small>{t(s.code)}</small>
                    </div>
                    <button
                      className="button"
                      onClick={() =>
                        run(async () => {
                          await post("/admin/restore/" + s.id, {});
                          await load();
                          await reload();
                          flash("样品已恢复");
                        })
                      }
                    >
                      <RefreshCw size={16} />
                      {t("恢复样品")}
                    </button>
                  </div>
                )),
              )}
              {t(!trash.length && <p className="muted">{t("回收站为空。")}</p>)}
            </div>
          ),
        )}
      </div>
      {t(
        restore && (
          <Modal title={t("确认恢复业务快照？")} close={() => setRestore(null)}>
            <p>
              {t(
                "将恢复快照中的档案与互动；快照之外的现有样品将移至回收站。操作日志保留。建议先导出当前快照。",
              )}
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setRestore(null)}>
                {t("取消")}
              </button>
              <button
                className="button primary"
                onClick={() =>
                  run(async () => {
                    await post("/admin/backup/restore", restore);
                    setRestore(null);
                    await load();
                    await reload();
                    flash("业务快照已恢复");
                  })
                }
              >
                {t("确认恢复")}
              </button>
            </div>
          </Modal>
        ),
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
