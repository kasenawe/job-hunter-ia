import assert from "node:assert/strict";
import test from "node:test";

import { isRelevantJobicyJob, normalizeJobicyJob } from "../src/lib/jobs/normalize-jobicy";
import { scoreJob, type JobForScoring } from "../src/lib/scoring/score-job";

function job(overrides: Partial<JobForScoring> = {}): JobForScoring {
  return {
    id: "example",
    title: "Integration Systems Analyst",
    company_name: "Example",
    location_text: "LATAM",
    remote_scope: "latam",
    workplace_type: "remote",
    employment_type: "full-time",
    seniority: "mid",
    language: null,
    description_text: "Implement APIs and CRM integrations. Troubleshoot incidents with users and analyze business processes using SQL and Node.js.",
    ...overrides,
  };
}

test("a strong technical match cannot outrank confirmed US-only eligibility", () => {
  const match = scoreJob(job({
    title: "Full Stack Software Engineer",
    location_text: "USA",
    remote_scope: "restricted",
    seniority: null,
    description_text: "React, Node.js, PHP, MySQL, SQL, APIs and integrations. Must be legally authorized to work in the United States. Five or more years of professional web development experience.",
  }));

  assert.ok(match.total_score < 55);
  assert.equal(match.score_breakdown.eligibility_adjustment.status, "incompatible");
  assert.equal(match.score_breakdown.eligibility_adjustment.cap, 54);
  assert.equal(match.score_breakdown.base_score - match.total_score, match.score_breakdown.eligibility_adjustment.points_removed);
  assert.ok(match.requirement_analysis.some((item) => item.area === "location" && item.criticality === "central" && item.status === "unmet"));
  assert.ok(match.gaps.some((gap) => gap.includes("5 años")));
  assert.match(match.summary, /Ubicación incompatible/);
});

test("the title overrides a generic Senior source label for Staff roles", () => {
  const source = {
    id: 1,
    url: "https://jobicy.com/jobs/1",
    jobTitle: "Staff Backend Engineer",
    companyName: "Example",
    jobGeo: "LATAM",
    jobLevel: "Senior",
    jobDescription: "Build Node.js backend APIs with SQL.",
  };
  const normalized = normalizeJobicyJob(source);
  assert.equal(normalized?.seniority, "staff");

  const match = scoreJob(job({ title: source.jobTitle, seniority: "senior", description_text: source.jobDescription }));
  assert.ok(match.requirement_analysis.some((item) => item.area === "seniority" && item.value === "staff" && item.raw_score === 25));
});

test("eligible hybrid roles remain competitive and uncertain geography is not capped", () => {
  const hybrid = scoreJob(job());
  const europe = scoreJob(job({ location_text: "Europe", remote_scope: "restricted" }));
  const unknown = scoreJob(job({ location_text: null, remote_scope: null }));
  const unnormalizedEurope = scoreJob(job({ location_text: "Europe", remote_scope: null }));

  assert.ok(hybrid.total_score > europe.total_score);
  assert.ok(hybrid.total_score >= 55);
  assert.equal(europe.score_breakdown.eligibility_adjustment.status, "incompatible");
  assert.equal(unknown.score_breakdown.eligibility_adjustment.status, "uncertain");
  assert.equal(unknown.score_breakdown.eligibility_adjustment.cap, null);
  assert.equal(unnormalizedEurope.score_breakdown.eligibility_adjustment.status, "incompatible");
});

test("explicit bonus skills are recorded as desirable, not an unmet central requirement", () => {
  const match = scoreJob(job({
    description_text: "Implement APIs and CRM integrations. Bonus (Helpful, but not required): PHP and React experience.",
  }));
  assert.ok(match.requirement_analysis.some((item) => item.area === "desirable_requirements" && item.criticality === "desirable" && item.status === "matched"));
});

test("marketing automation alone does not pass the technical prefilter", () => {
  assert.equal(isRelevantJobicyJob({ jobTitle: "Lifecycle Marketing Automation Specialist" }), false);
});
