# Job Hunter IA — Agent Instructions

## Project goal

Job Hunter IA exists to help Maximiliano Quintana find, evaluate, prioritize, prepare, and track job opportunities as efficiently as possible.

The priority is getting a job.

Do not turn this repository into a software project for its own sake.

When there is tension between:

- improving the internal system;
- and using the system to find or prepare real job applications;

prioritize the second.

Success is measured by:

- relevant job opportunities found;
- high-quality applications;
- recruiter responses;
- interviews;
- job offers;

not by the number of features implemented.

---

## Candidate profile

Maximiliano has a hybrid technical profile that combines:

- software development;
- infrastructure and systems;
- advanced technical support;
- functional analysis / Business Analysis;
- integrations;
- incident resolution and troubleshooting;
- experience working with enterprise systems, users, and processes.

Relevant technologies and experience include:

- React;
- TypeScript;
- JavaScript;
- Node.js;
- Express;
- PHP;
- MySQL;
- PostgreSQL;
- Supabase;
- SQL;
- Git / GitHub;
- Vercel;
- APIs and integrations;
- SuiteCRM;
- Svelte;
- networking;
- operating systems;
- servers;
- Help Desk / technical support;
- incident coordination;
- Business Analysis;
- conversational English.

Do not assume that the candidate's only relevant career path is Full Stack Development.

---

## Target roles

Evaluate roles based on their actual responsibilities, not only their exact title.

Relevant role families include:

### Development

- Full Stack Developer
- Backend Developer
- Frontend Developer
- Software Developer
- Software Engineer
- Advanced Junior / Semi-Senior Developer

### Integrations / Implementation

- Integration Systems Analyst
- Integration Analyst
- Integrations Specialist
- Implementation Specialist
- Implementation Engineer
- Solutions Engineer when technically relevant
- Technical Consultant when technically relevant
- Automation Specialist

### Technical / Functional

- Systems Analyst
- Technical Business Analyst
- Business Analyst with technical responsibilities
- Functional Analyst with technical responsibilities
- Technical Analyst

### Infrastructure / Support

- Application Support
- Application Support Analyst
- Technical Support Engineer
- Infrastructure Analyst
- Systems Administrator
- Infrastructure / Support
- Technical Operations
- Customer / Technical Implementation roles with meaningful technical content

A hybrid role may be a stronger match than a pure Developer role.

---

## MVP scope

The current MVP must remain deliberately small.

The MVP includes:

- obtaining or importing job offers;
- basic normalization;
- matching against the candidate profile;
- scoring;
- match explanation;
- prioritized job list;
- job detail;
- recommended CV;
- cover letter generation;
- application status tracking;
- opening the original job offer.

Do not add the following to the MVP unless there is a demonstrated need:

- complex bots;
- mass LinkedIn automation;
- Playwright / Selenium for job applications;
- multiple autonomous agents;
- advanced analytics;
- automatic PDF modification;
- automation of every application form;
- unnecessary architectural complexity.

Before adding a feature, ask:

> Does this directly help find, evaluate, or make better job applications?

If the answer is no, move it to the roadmap.

---

## Development methodology

Use lightweight Spec-Driven Development.

Before implementing any relevant feature:

1. Understand the problem.
2. Verify that a specification exists.
3. Read and understand the specification.
4. Confirm the minimum viable solution.
5. Identify risks and relevant alternatives.
6. Implement only what is required by the spec.
7. Run applicable build, lint, tests, and QA.
8. Validate the acceptance criteria.
9. Update affected documentation.
10. Only then consider the feature complete.

A relevant feature spec should define at least:

- objective;
- inputs;
- outputs;
- business rules;
- important edge cases;
- acceptance criteria;
- out of scope.

Minor UI adjustments, wording changes, and trivial bug fixes do not require a separate formal spec unless they change product behavior.

Do not silently expand scope while implementing a feature.

---

## Source of truth

Use the following responsibility boundaries.

### Notion

Source of truth for:

- product decisions;
- MVP scope;
- roadmap;
- backlog;
- feature specs;
- acceptance criteria;
- important architectural and product decisions.

### GitHub repository

Source of truth for:

- implemented code;
- runtime behavior;
- tests;
- committed configuration;
- repository documentation.

### Supabase migrations

Source of truth for:

- database schema;
- constraints;
- indexes;
- triggers;
- RLS;
- database privileges.

Do not treat manually modified database state as authoritative if it is not represented in migrations.

---

## Documentation

Documentation is part of the definition of done.

For every relevant change, determine whether documentation is affected.

### README.md

Update `README.md` when a change modifies:

- project purpose;
- MVP capabilities;
- setup;
- environment variables;
- commands;
- deployment;
- main user workflow;
- supported job sources;
- major project-level behavior.

The README should remain concise and useful as the main entry point to the repository.

Do not turn it into a detailed technical reference.

### docs/DEVELOPER.md

Update `docs/DEVELOPER.md` when a change modifies:

- architecture;
- folder structure with architectural relevance;
- data flow;
- database model;
- security model;
- Supabase usage;
- integrations;
- job ingestion;
- normalization;
- deduplication;
- scoring;
- matching;
- Server Actions;
- application workflow;
- important internal behavior;
- significant implementation decisions;
- development or QA procedures.

This document should explain how the project works technically so that a developer can understand and maintain the system.

### Documentation rule

Do not update documentation for every typo, cosmetic adjustment, or trivial refactor.

Update documentation when existing documentation would become incomplete, inaccurate, or misleading.

A feature is not complete until affected documentation is updated.

---

## Architecture principles

Prefer simple, explicit, and maintainable solutions.

Avoid speculative abstractions.

Do not introduce a new subsystem unless the current requirement actually needs it.

Prefer:

- clear server-side flows;
- small modules;
- pure functions for normalization and scoring when possible;
- auditable data;
- explicit versioning for important algorithms;
- minimal dependencies.

Avoid:

- premature microservices;
- unnecessary queues;
- unnecessary background workers;
- unnecessary event-driven architecture;
- unnecessary agent orchestration;
- unnecessary generalized frameworks.

---

## Current application architecture

The intended application flow is:

Browser
→ Next.js on Vercel
→ server-side application code
→ Supabase / PostgreSQL

The browser must not access privileged database operations directly.

Supabase secret credentials must only be used server-side.

Do not expose:

- `SUPABASE_SECRET_KEY`;
- service-role credentials;
- database passwords;
- other server secrets.

The MVP intentionally does not include an application authentication subsystem unless a real requirement appears.

---

## Database access

The MVP uses backend-only database access.

Tables such as:

- `jobs`;
- `job_matches`;
- `applications`;
- `search_profiles`;

must not be exposed directly to public browser clients.

RLS must remain enabled.

Public roles must not receive privileged table access.

Application access must occur through server-side code using the configured Supabase secret key.

---

## Job ingestion

External job sources must be treated as adapters.

The core system must not depend on one provider.

Expected flow:

External source
→ source-specific adapter
→ normalized job
→ `jobs`
→ scoring
→ prioritized list

Current and planned source types may include:

- Jobicy;
- Remote OK;
- Greenhouse;
- Lever;
- Ashby;
- manual imports;
- other sources that demonstrate useful coverage.

Do not make scoring logic depend on a specific source unless there is a documented product reason.

Preserve the original source payload when practical.

---

## Normalization

Normalization should convert source-specific data into stable internal fields.

Preserve:

- original source identity;
- source URL;
- raw payload;
- normalized payload;
- timestamps needed for auditing.

Normalization must remain separate from matching.

Do not discard a technically relevant job only because its seniority or location is weak.

When useful, preserve filtered jobs as inactive rather than deleting them so that filter behavior remains auditable.

---

## Matching and scoring

The matching system must reflect realistic fit, not simple keyword overlap.

Base scoring weights:

- 35% technical stack and knowledge;
- 25% experience and actual functions;
- 15% seniority;
- 10% language;
- 10% location and work modality;
- 5% other requirements.

Approximate score interpretation:

- 85–100: very strong match;
- 70–84: good candidate to review / apply;
- 55–69: possible match, requires evaluation;
- below 55: low priority.

These categories are guidance, not immutable business rules.

The scoring system must distinguish between:

- central / excluding requirements;
- important requirements;
- desirable requirements;
- transferable or learnable technologies.

Do not penalize all missing requirements equally.

Do not automatically discard jobs because the candidate does not meet 100% of the requirements.

Do not automatically discard senior jobs.

Seniority should affect the score based on realistic competitiveness.

Location incompatibility should meaningfully affect the score.

Hybrid roles that combine technical, functional, infrastructure, support, and development responsibilities may score highly.

Scoring must be:

- explainable;
- auditable;
- versioned;
- reproducible.

Important scoring outputs must be stored in `job_matches`.

Do not use an LLM as an opaque scoring oracle in scoring v1.

---

## Candidate profile axes

Matching should evaluate at least these four axes independently:

1. Development
2. Integrations / Implementation
3. Technical / Functional
4. Infrastructure / Support

A role may score strongly across more than one axis.

Do not collapse the candidate into a single "developer" profile.

---

## CV recommendation

Available CV approaches may include:

- Development;
- Infrastructure / Support;
- Spanish;
- English.

Choose the CV that best represents the actual match.

Allowed adaptation includes:

- professional summary;
- ordering of skills;
- emphasis on relevant experience;
- cover letter;
- application answers.

Never invent:

- professional experience;
- technologies;
- seniority;
- responsibilities;
- language level.

---

## Application automation

Do not build mass-application automation in the MVP.

For platforms with restrictions, prefer:

- discovery;
- analysis;
- preparation;
- opening the original job;
- human final submission.

LinkedIn may be integrated through manual or semi-assisted import without requiring scraping or login automation.

Do not introduce LinkedIn account automation unless there is a later explicit, justified, and compliant requirement.

---

## Testing and QA

Compilation alone is not sufficient evidence that a feature is complete.

For relevant changes, run applicable:

- type checking;
- lint;
- build;
- automated tests;
- integration tests;
- runtime QA;
- manual acceptance checks.

QA must be performed against the acceptance criteria in the feature spec.

When QA reveals a conceptual problem, fix the design before marking the task complete.

Do not mark a Notion task as `Listo` only because the code was merged.

---

## Definition of done

A relevant feature is complete only when:

1. The feature has an approved or agreed specification.
2. The implementation matches the specification.
3. Build / type checking succeeds.
4. Applicable tests succeed.
5. Acceptance criteria are verified.
6. Important edge cases are reviewed.
7. Affected documentation is updated.
8. The implementation is committed.
9. The corresponding backlog item can accurately be marked as complete.

---

## Change discipline

Before making a relevant change:

- inspect the existing implementation;
- inspect the relevant spec;
- identify what actually needs to change;
- make the smallest complete change.

Do not rewrite unrelated code.

Do not refactor broadly while implementing an unrelated feature unless the refactor is required.

If an implementation reveals that the spec is wrong or incomplete, update the spec or raise the discrepancy before silently changing product behavior.

---

## Git discipline

Use clear, scoped commits.

Prefer commit messages such as:

- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `test: ...`
- `chore: ...`

Do not mix unrelated changes in the same commit when avoidable.

Important implementation decisions should also be reflected in Notion's decision log when they affect product or architecture.

---

## Environment and secrets

Never commit secrets.

Do not place real secret values in:

- source code;
- README;
- examples;
- logs;
- screenshots;
- documentation.

Environment examples should contain variable names only.

Current server-side variables include:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

---

## Product priority

Always optimize for the user's actual employment search.

When deciding between:

- another internal improvement;
- and getting useful ranked jobs in front of the user;

prefer the ranked jobs.

When deciding between:

- architectural elegance;
- and a simple maintainable MVP implementation;

prefer the simple maintainable MVP implementation.

When deciding whether to add a feature, ask again:

> Does this directly help find, evaluate, or make better job applications?

If not, defer it.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
