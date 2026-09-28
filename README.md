# Job Hunter IA

Job Hunter IA is a personal job-search assistant built to help Maximiliano Quintana find, evaluate, prioritize, prepare, and track relevant job opportunities.

The project is intentionally focused on one outcome: **improving the quality and efficiency of the job search**.

## Current MVP

The MVP currently supports:

- importing remote jobs from Jobicy;
- normalizing source-specific job data into a common internal model;
- preserving raw source payloads for auditability;
- filtering obvious non-relevant jobs without deleting historical records;
- deterministic and explainable scoring against the candidate profile;
- ranking active jobs by match score;
- recommending a CV direction based on the strongest profile axis;
- opening the original job offer.

Scoring v1.1 is currently in QA and calibration. Confirmed location exclusions
remain visible for audit but are capped below the application-priority threshold.

Planned MVP work includes:

- detailed match explanations;
- job detail view;
- application status tracking;
- cover letter generation;
- additional job sources;
- semi-assisted manual imports for sources such as LinkedIn.

## Candidate positioning

The system does not treat the candidate only as a Full Stack Developer.

Matching considers four profile axes:

1. Development
2. Integrations / Implementation
3. Technical / Functional
4. Infrastructure / Support

Hybrid roles can be more relevant than pure development roles when they make better use of the candidate's combined experience.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase / PostgreSQL
- Vercel

## Architecture

The MVP uses a backend-only data access model:

```text
Browser
  ↓
Next.js on Vercel
  ↓
Server-side application code
  ↓
Supabase / PostgreSQL
```

Privileged Supabase credentials are never exposed to the browser.

For the detailed technical architecture, see [docs/DEVELOPER.md](docs/DEVELOPER.md).

## Environment variables

Create a local `.env.local` file with:

```bash
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

Never commit real secret values.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Run scoring regression tests:

```bash
npm run test:scoring
```

Build:

```bash
npm run build
```

## Database

Database changes are managed through Supabase migrations in:

```text
supabase/migrations/
```

The current MVP data model includes:

- `jobs`
- `job_matches`
- `applications`
- `search_profiles`

RLS is enabled and public browser roles do not have direct access to these tables.

## Job sources

### Implemented

- Jobicy

### Planned / evaluated

- Remote OK
- Greenhouse
- Lever
- Ashby
- manual / semi-assisted imports
- LinkedIn through manual or semi-assisted import rather than account automation

The internal matching system is source-agnostic after normalization.

## Development methodology

The project uses lightweight **Spec-Driven Development (SDD)**.

Product scope, backlog, feature specs, and acceptance criteria live in Notion. Repository behavior, code, tests, and technical documentation live in GitHub.

See [AGENTS.md](AGENTS.md) for the project development rules and definition of done.

## Deployment

The application is deployed on Vercel:

https://job-hunter-ia.vercel.app

The repository's `main` branch is the deployment source.
