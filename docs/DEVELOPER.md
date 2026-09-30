# Job Hunter IA — Developer Guide

This document explains how the current MVP works technically.

It is intentionally focused on the architecture and implementation that exist today. Planned features should not be documented here as if they were already available.

## 1. System overview

The application follows a simple server-side architecture:

```text
Browser
  ↓
Next.js application on Vercel
  ↓
Server Components / Server Actions / server-only modules
  ↓
Supabase client using SUPABASE_SECRET_KEY
  ↓
PostgreSQL
```

The browser does not connect directly to privileged Supabase operations.

The MVP currently has no application-level user authentication subsystem.

Deployment protection is handled outside the application while the MVP remains personal and single-user.

## 2. Main technologies

- Next.js 16.3.6
- React 19.2.8
- TypeScript
- Tailwind CSS 4
- Supabase JS 2.x
- PostgreSQL
- Vercel
- Supabase CLI for migrations

## 3. Environment configuration

Server-side environment variables:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

They are read only from server-side code.

The Supabase client is created in:

```text
src/lib/supabase/server.ts
```

The module imports `server-only` to prevent accidental browser usage.

Never expose `SUPABASE_SECRET_KEY` through:

- `NEXT_PUBLIC_*` variables;
- client components;
- browser bundles;
- logs;
- documentation;
- committed files.

## 4. Database model

The initial MVP schema is defined by Supabase migrations under:

```text
supabase/migrations/
```

The initial schema contains four core tables.

### jobs

Stores source data and normalized job information.

Important responsibilities:

- identify the source and original source ID;
- preserve the source URL;
- store normalized fields used by matching;
- preserve the original raw payload;
- preserve normalization metadata;
- track active/inactive state;
- track first and last observation timestamps.

The pair:

```text
(source, source_job_id)
```

is unique and acts as the source-level deduplication key.

### job_matches

Stores the latest scoring result for one job.

There is one current match row per job.

Important fields include:

- `total_score`;
- `score_breakdown`;
- `axis_scores`;
- `strengths`;
- `gaps`;
- `risks`;
- `requirement_analysis`;
- `recommended_cv`;
- `summary`;
- `scoring_version`;
- `matched_at`.

Matching is stored separately from `jobs` so scores can be recalculated without modifying imported job data.

### applications

Stores the human application state.

Current statuses are:

- `reviewing`
- `discarded`
- `applied`
- `interview`
- `rejected`
- `offer`

Application state is intentionally separate from feed refreshes and matching.

### search_profiles

Stores candidate/search configuration.

The schema supports one active profile at a time.

The current scoring implementation still uses a versioned candidate profile in code. The table remains available for future configuration without changing the scoring schema.

## 5. Database security

RLS is enabled on:

- `jobs`;
- `job_matches`;
- `applications`;
- `search_profiles`.

The `anon` and `authenticated` roles do not have direct table privileges.

The server application accesses Supabase using the secret server credential.

This design avoids adding an application authentication layer before the MVP actually requires one.

## 6. Job ingestion architecture

Job sources should behave as adapters around the same internal model.

Expected architecture:

```text
External source
   ↓
source-specific fetch/import
   ↓
source-specific normalization
   ↓
common jobs table
   ↓
matching/scoring
```

The scoring engine should not care which source produced a job after normalization.

### Get on Board

`src/lib/jobs/getonbrd.ts` fetches the public API categories `programming`,
`sysadmin-devops-qa`, `technical-support`, `customer-support`, and
`innovation-agile`, including all pages. Imports are throttled to once per
hour outside preview QA. Published jobs from the last 60 days with relevant titles are upserted
in batches; previously stored jobs absent from the completed feed are marked
inactive without deleting application history. A failed API page aborts before
that deactivation step.

`src/lib/jobs/normalize-getonbrd.ts` expands company and allowed location
relations. Fully remote roles are eligible worldwide; locally remote roles
are active only when the allowed countries or regions include Uruguay or
South America. Uruguay on-site or hybrid roles are eligible. Ambiguous and
incompatible locations are preserved as inactive rows for audit. Raw source
data and the geographic decision are stored with normalization version
`getonbrd-v1`.

The home-page action imports and rescores active rows. Production's
`/api/cron/import-jobs` route imports both Jobicy and Get on Board daily at
12:00 UTC, then scores active jobs. It returns 401 unless the Authorization
header matches `Bearer ${CRON_SECRET}`. Preview deployments do not run the
Vercel schedule. Set `CRON_SECRET` before deploying the cron to production.

## 7. Jobicy integration

Current source implementation:

```text
src/lib/jobs/jobicy.ts
src/lib/jobs/normalize-jobicy.ts
src/lib/jobs/reprocess-jobicy-safe.ts
src/app/actions/import-jobicy.ts
```

### Fetching

Jobicy jobs are fetched from its remote-jobs API.

Current behavior:

- requests up to 200 jobs with Jobicy's `geo=latam` filter (which also returns worldwide listings);
- prevents repeated external imports within one hour;
- prefilters obviously irrelevant roles;
- normalizes accepted rows;
- upserts by `source, source_job_id`;
- updates `last_seen_at` after persistence.

### Normalization

The Jobicy normalizer converts provider-specific values into internal values.

Examples include:

- seniority;
- employment type;
- remote scope;
- salary values;
- plain-text description;
- source metadata.

The normalizer also preserves:

- `raw_payload`;
- `normalized_payload`;
- provider-specific metadata.

Current normalization version:

```text
jobicy-v2
```

### Reprocessing stored jobs

The UI uses:

```text
reprocessStoredJobicyJobsSafely()
```

This recalculates normalization from stored raw Jobicy payloads without calling Jobicy again.

Jobs that are no longer considered relevant are marked:

```text
is_active = false
```

rather than deleted.

This preserves auditability and makes filter behavior reversible.

### Known cleanup item

`src/lib/jobs/jobicy.ts` still contains an older exported `reprocessStoredJobicyJobs()` implementation that deletes filtered jobs.

It is not used by the current UI.

Do not wire that legacy function into application flows. It should be removed or consolidated in a future cleanup change so the codebase has only the non-destructive reprocessing path.

## 8. Matching and scoring v1

Scoring code lives under:

```text
src/lib/scoring/
```

Main files:

```text
profile.ts
score-job.ts
score-active-jobs.ts
```

The algorithm is deterministic and explainable.

It does not call an LLM.

### Candidate profile

`profile.ts` contains:

- scoring version;
- scoring weights;
- target role terms;
- directly matching skills;
- transferable skills;
- terms for the four candidate axes.

Current profile axes:

1. Development
2. Integrations / Implementation
3. Technical / Functional
4. Infrastructure / Support

The current rule identifier is `rules-v1.8-2026-09-29`. Changes to scoring
behavior require a new identifier before rescoring persisted matches.

### Scoring weights

Current weights:

```text
Technical stack and knowledge     35%
Experience and functions          25%
Seniority                         15%
Language                          10%
Location / modality               10%
Other requirements                 5%
```

### Technical score

The current rules detect unique occurrences of:

- strong/direct candidate skills;
- transferable candidate skills.

Direct matches contribute more than transferable matches. Term matching uses
word boundaries and collapses known aliases (`node`/`node.js`, `api`/`apis`,
`postgres`/`postgresql`) to avoid inflating a score through overlapping words.

The raw technical score is capped at 100 before applying the 35% weight.

### Functional / experience score

Each of the four profile axes is evaluated from title and description terms.

Title matches receive more weight than body-only matches. Body-only evidence is
capped at four distinct terms per axis so long descriptions do not automatically
produce a perfect functional score.

The strongest axis contributes to the experience/functions score.

This is intended to make hybrid roles visible instead of ranking only pure software-development titles.

### Seniority score

The current heuristic treats:

- Junior and Mid as strongest alignment;
- unspecified seniority as broadly acceptable;
- Senior as possible but penalized;
- Lead / Manager as larger gaps;
- Staff / Principal / Director as progressively weaker fits.

Seniority is a scoring factor, not a hard filter. An explicit level in the title
overrides a generic source label, including `Staff` roles marked `Senior` by
Jobicy. An explicit requirement of at least five years of professional
development also reduces this component and is recorded as a gap. It limits
the final score to 69 so a two-year development profile is not labelled a
very strong match solely through keyword overlap.
For support, database, and infrastructure roles, an explicit requirement above
the candidate's confirmed 3–6 years of support/infra experience also reduces
seniority and caps the final score at 69. This resolves conflicts between a
source's `Junior` label and the actual tenure requested in the description.
An explicit `Staff Engineer` responsibility in the posting also overrides a
`Senior` title/label when it describes the role itself.

### Language score

The current implementation inspects job text for signals such as:

- native English;
- C1/C2;
- fluent / advanced English;
- generic English requirements.

The declared candidate level is conversational English, so stronger explicit requirements reduce the language score.

### Location score

Current logic strongly prefers:

- Uruguay;
- worldwide;
- LATAM;
- Americas.

Restricted roles in regions such as Europe, UK, APAC, Asia, or Australia receive
a large penalty.

US/Canada-only roles also receive a meaningful penalty.

When the location or an explicit work-authorization requirement confirms that
Uruguay is ineligible, the final score is capped at 54. This places the job in
low priority without deleting it. Unknown geography is marked for manual review
and does not receive that cap. The stored breakdown contains the weighted base
score, eligibility status, cap, points removed, and evidence, so the final
score can be reconstructed. This adjustment is outside the six additive weights
because a confirmed exclusion is more consequential than a weak location fit.

An explicit `(Required)` multi-year requirement for a specialist language or
platform absent from the documented profile limits the score to 64. This is
recorded as unverified rather than asserting that the candidate lacks the
skill. Both requirement and location caps are recorded separately in
`score_breakdown`, including each adjustment's removed points.
An explicit requirement for advanced PostgreSQL internals (multiple examples
such as autovacuum, WAL, and bloat) limits the score to 64. The documented
candidate experience is SQL/RLS; operational internals are unverified. This
requirement is recorded separately from keyword matches and does not penalize
ordinary SQL/RLS support roles.
The candidate confirmed no hands-on AWS, Terraform, or Kubernetes use and no
product security experience. Security engineering roles whose primary function
includes multiple product security activities, infrastructure roles with
multiple mandatory cloud operations tools, explicit `Must Have` AWS experience,
and ownership of a Terraform provider are capped at 64 and recorded as
confirmed central gaps. Mentions under `Nice to Have` do not trigger this cap.
The v1.6 rules also identify explicit professional experience requirements in
Spanish and English for AWS, Terraform, Kubernetes, Python, Django, FastAPI,
Go, and NestJS. Confirmed absence of AWS/Terraform/Kubernetes is recorded as
unmet; other specialist experience is unverified until the candidate confirms
it. These central requirements cap the recommendation at 64, preserving the
weighted score and sentence-level evidence. The Get on Board normalizer marks
its separate `desirable` field with `Deseable:` (`getonbrd-v2`) so optional
skills are excluded from the central-requirement check. Existing rows require
reimport before rescoring to gain this distinction.
The v1.7 calibration covers explicit multi-year AWS operation and LLM
integrations in production, additional specialist backend stacks, and
four-year development requirements. Professional or fluent English is a
central gap relative to the declared conversational level and caps a
recommendation at 69 unless another central skill imposes 64. A Senior
development title without a stricter cap cannot be labeled a very strong match
(cap 84).
The v1.8 follow-up treats Ruby on Rails in a role title as a central unverified
skill even when the source puts it in `desirable`, recognizes explicit custom
WordPress development and AWS operations, and reads a `5–10 years` range from
its minimum. Get on Board may place core qualifications in its `desirable`
field, so this field still needs manual QA for conflicting source data.

### Other requirements

The current implementation considers:

- employment type;
- basic detected years-of-experience requirements.

Years of professional development are considered under seniority. The other
component now reflects employment type only.

`requirement_analysis` records each component's criticality and status, with
geography treated as central and explicit bonus qualifications marked desirable.
It is a conservative first pass, not a complete parser of every sentence in an
offer. Missing desired qualifications are not treated as exclusions.

### Score persistence

`scoreActiveJobs()`:

1. loads all active jobs;
2. calls `scoreJob()` for each;
3. upserts the resulting rows into `job_matches` using `job_id` as the conflict key.

This allows the same jobs to be rescored when rules change.

`scoring_version` identifies which rule set created the current result.

## 9. Current UI flow

The current home page is implemented in:

```text
src/app/page.tsx
```

It currently exposes development/MVP controls and QA information:

- Supabase connection state;
- total jobs;
- active jobs;
- inactive jobs;
- active jobs with score;
- Jobicy import action;
- Get on Board import and scoring action;
- safe reprocessing action;
- scoring v1 action;
- a Top 10 priority table for eligible or geographically uncertain matches;
- an expandable audit list for location-incompatible matches;
- normalization QA table.

This is not the final product UI.

The normalization table is intentionally temporary and exists to validate data quality while the MVP is being built.

## 10. Server Actions

Current server actions include:

```text
src/app/actions/import-jobicy.ts
src/app/actions/import-getonbrd.ts
src/app/actions/score-jobs.ts
```

Server Actions are used as the browser-to-server boundary for QA commands.
They reject calls when `VERCEL_ENV=production`, even if someone invokes an
action directly. The production home page omits these buttons and displays the
read-only ranking. The scheduled route is the only production ingestion path.

After mutations they revalidate the home route so the latest database state becomes visible.

Buttons use a small client component based on `useFormStatus` to show:

- pending label;
- spinner;
- disabled state.

## 11. Current scoring QA state

Scoring v1 has been implemented but is not considered complete yet.

The acceptance process requires:

- successful build/type checking;
- scoring all active jobs without runtime errors;
- manual review of the resulting Top 10;
- confirmation that incompatible geography is penalized correctly;
- confirmation that over-senior roles do not dominate;
- confirmation that strong hybrid roles rank competitively;
- calibration if the ranking is conceptually wrong.

Do not mark scoring v1 complete until these acceptance checks pass.

Regression tests for geography, seniority, hybrid roles, and desirable
requirements run with `npm run test:scoring`. Runtime QA still requires
rescoring the stored active jobs and checking the new Top 10 manually.

## 12. Adding a new job source

A new source should normally follow this pattern:

1. create a source-specific fetch/import module;
2. create a source-specific normalizer;
3. map data to the existing `jobs` model;
4. preserve the original payload;
5. deduplicate using source + source job ID;
6. avoid source-specific logic in the scoring engine;
7. add QA before relying on the source for real applications.

Do not create a generic abstraction prematurely if only one or two source implementations exist.

Prefer simple parallel adapters first.

## 13. Planned source strategy

Current implemented sources:

- Jobicy.
- Get on Board.

Another source to assess by marginal eligible jobs:

- Remote OK.

Later targeted sources may include:

- Greenhouse;
- Lever;
- Ashby.

LinkedIn should initially enter through manual or semi-assisted import instead of account automation or mass scraping.

The purpose of multiple sources is useful coverage, not maximum volume.

## 14. Development workflow

The repository follows lightweight Spec-Driven Development.

For relevant features:

```text
Problem
  ↓
Spec / acceptance criteria
  ↓
Minimum implementation
  ↓
Build / lint / tests
  ↓
Runtime and manual QA
  ↓
Documentation
  ↓
Complete
```

Product specs and backlog decisions are maintained in Notion.

Code and technical documentation live in this repository.

See:

```text
AGENTS.md
README.md
docs/DEVELOPER.md
```

for the repository-level rules and documentation responsibilities.

## 15. Definition of done

A relevant feature is not complete merely because it compiles.

It must:

- match the agreed spec;
- pass applicable build/type checks;
- pass applicable tests;
- satisfy acceptance criteria;
- have important edge cases reviewed;
- have affected documentation updated;
- have the corresponding backlog state updated accurately.

## 16. MVP discipline

Before adding a subsystem or feature, ask:

> Does this directly help find, evaluate, or make better job applications?

If not, defer it.

The project should remain a job-search tool, not become an indefinite software-engineering exercise.
