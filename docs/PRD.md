# Samplio — Requirements summary (reconstructed)

> **Read this first.** This is **not** the original requirements document. It was
> reconstructed on 2026-09-27 from the request submitted on
> [ChatPOC](https://020idea.com) (task `T8UZRJ75K`, submitted in Chinese on
> 2026-08-03), rewritten in English and condensed. The request was already a
> detailed PRD written by the requester; ChatPOC did not generate it.
> What was actually built, and what was cut, is recorded in
> [SCOPE.md](SCOPE.md) and [VERIFICATION.md](VERIFICATION.md) — those documents
> take precedence over this one.

## Problem

Companies that handle physical product samples track them in spreadsheets and
photo albums. Intake is slow and error-prone, records are scattered, samples are
hard to find again, and there is no structured way for a team to review new
samples or turn opinions into data when choosing which ones to pursue.

## Users

| Role | Can do |
|---|---|
| Employee | Register samples, edit/delete own samples, search, review (like / favourite / comment), view rankings |
| Administrator | Everything above, plus all-data management, publishing oversight, system settings, audit log, restore, role assignment |

## Core flow

Photograph or upload a sample → fields suggested automatically → unique code and
QR code generated → saved, then corrected by hand if needed → published to a
review area → colleagues like, favourite and comment → a weighted score updates
the rankings → the business picks samples from the ranking.

## Key requirements (as requested)

1. **Intake** — camera capture or upload; automatic suggestion of dimensions,
   main colour and a standard name; configurable unique code
   (default `date-category-serial`); QR code tied to the record that is
   regenerated on edit, invalidating the old code; every AI-filled field
   editable by hand.
2. **Search** — combined field filters including size ranges; photo match for
   the same sample; image-similarity search with a configurable threshold
   (default 80%); search history; export results to a spreadsheet.
3. **Review and ranking** — publish a sample with a review deadline; one like
   per person per sample; favourites; threaded comments with spam filtering;
   weighted score (default like 1, favourite 3, valid comment 2, configurable);
   daily / weekly / monthly / all-time rankings with charts and export.
4. **Governance** — audit trail of every create / edit / delete / publish /
   interaction; delete confirmation with admin restore; users may not edit
   other people's samples.
5. **Non-functional targets (as requested)** — recognition ≤ 2 s, similarity
   search ≤ 3 s, field search ≤ 1 s, 1,000 concurrent users, encrypted storage,
   daily automatic backup, immutable logs; responsive on desktop and mobile.

## Scope decision for the POC

The request describes a production system with a three-release roadmap. The POC
kept the whole review-and-ranking loop working end to end and **explicitly cut**
the capabilities it could not honestly deliver in a prototype:

- No vision model or semantic embedding: colour extraction and RGB distance are
  real calculations, but they are not object recognition.
- Dimensions are entered by the user; a single uncalibrated photo cannot measure
  real size.
- No encrypted storage, daily off-site backup, tamper-proof audit log, SSO or
  SMS password reset.
- The 1,000-user load and the response-time targets were not verified.
- Shared data refreshes every 30 seconds instead of real-time collaboration.
- Publishing is done directly by the owner or an admin, with no separate
  approval queue.

Full details: [SCOPE.md](SCOPE.md). Test results and what remains unverified:
[VERIFICATION.md](VERIFICATION.md).
