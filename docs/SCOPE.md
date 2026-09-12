# Scope / 功能范围

This POC demonstrates the full **capture → discover → review → rank** journey using real local persistence. It does not claim to meet every production requirement in the original brief.

本 POC 覆盖「入库 → 检索 → 评审 → 排名」闭环，采用真实本地持久化；不把演示能力等同于全部生产需求。

| Area / 模块 | Implemented / 已实现 | Boundary / 后续工作 |
| --- | --- | --- |
| Languages / 语言 | English default, Chinese toggle, persisted preference, translated fixture display names, localized exports | User-authored data is not machine translated; server API errors use Chinese strings localized by the client |
| Accounts / 账号 | Three local fixtures, scrypt password hashing, HTTP-only session cookie, 24-hour session expiry, basic login throttling | No registration, account provisioning UI, SSO, MFA or password reset service |
| Permissions / 权限 | API checks owner/admin writes and unpublished visibility; employees cannot change roles | No fine-grained departments, organizations or tenant boundaries |
| Intake / 入库 | Camera capture, upload, image decoding and re-encoding, local color extraction, editable fields | No object segmentation, calibrated dimensions or vision model integration |
| IDs / 编号 | SQLite unique constraint, atomic daily counter, configurable uppercase code prefix | Prefix is global; a full custom rule language or automatic category code mapping is not implemented |
| QR / 二维码 | Generated PNG, print, version check, authenticated detail link | Version changes on committed record changes; unsaved form edits do not produce a new permanent QR |
| Library / 样品库 | Read/edit, filters, ten-row pagination, bulk delete, Excel export | API currently loads visible samples in a batch; not optimized for very large datasets |
| Text search / 结构化检索 | Name/code/color, length and height ranges, date start, sort, device-local history | No full-text database index or advanced query language |
| Visual search / 图片检索 | Actual downsampled RGB comparison; configurable threshold; stricter camera mode | Not semantic embeddings, rotation invariant matching or guaranteed same-product identification |
| Reviews / 协同评审 | Publish with deadline, private drafts, likes/saves, comments/replies, authorized deletion, simple spam checks | No separate publish-approval queue, notifications or moderation workflow |
| Rankings / 榜单 | Configurable weighting; today/week/month/all; bar comparison; comment-activity trend; period-aware export | Uses retained interactions and current weight settings; no immutable historical score snapshots; no engagement fraud prevention |
| Personal / 个人中心 | Own sample list, saved samples, own comments with delete; details expose edit/delete where allowed | Not a full account-settings or profile-management module |
| Administration / 管理 | Roles, parameters, newest 500 audit events with filters, recycle bin, snapshots | Logs are read-only through the application, but not protected against OS/database administrators |
| Persistence / 持久化 | SQLite WAL and local uploads; survives restart | No encrypted storage, object store, offsite backup or retention policy |
| Recovery / 恢复 | Soft delete/restore; transaction-based business snapshot restore preserving audit history | Same installation only; JSON does not embed files/accounts. Settings are included for reference but not applied by restore |
| Collaboration / 协作 | Refresh shared records every 30 seconds; mutations refresh local state immediately | No WebSocket/SSE, offline sync or edit-conflict resolution |
| Performance / 性能 | Functional local acceptance checks | No claim of 1,000 concurrent users, 2-second AI latency or enterprise SLA |
| Agent access / Agent 接入 | Documented authenticated HTTP endpoints; optional page-scoped WebMCP search/open tools | Not wired to the separate ChatPOC contributor key API; WebMCP depends on browser support |

## Data and scoring semantics

- Each person has at most one active like and one active save per sample, enforced by the database key.
- Removing a reaction or comment removes its contribution to current scores. Re-adding a reaction gives it a new timestamp.
- Daily, weekly and monthly periods use UTC. Weeks begin on Monday.
- The trend chart shows currently retained **comment** activity over seven UTC dates. It is not a total engagement history.
- Review deadlines prevent new likes/saves/comments, including reaction toggles, once expired.
- Unpublished samples are visible only to their owner and administrators. Published records can be read by any signed-in member.
- QR versions increment on edit, publication, deletion, restore and snapshot restore. Old versions receive HTTP 410.

## Image matching method

Sharp applies orientation, flattens transparency onto white, resizes to a 16×16 RGB representation, and stores 768 channel values. Similarity is `100 × (1 − RMSE / 255)`, rounded to an integer. The score is a pixel-distance heuristic, not a calibrated probability. Backgrounds, framing and colors can dominate the result.

The color suggestion uses the mean RGB value and the nearest entry in a small named palette. Sample identification and dimensions remain editable by the user.

## Production follow-up

The next iteration would add tenant-aware identity, real image embeddings and calibrated measurement, deployment-grade storage and backups, stronger moderation/approval, immutable auditing and load testing. None of those are prerequisites for running this local demonstration.
