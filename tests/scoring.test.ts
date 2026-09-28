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
  assert.equal(match.score_breakdown.base_score - match.total_score, match.score_breakdown.eligibility_adjustment.points_removed + match.score_breakdown.requirements_adjustment.points_removed);
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

test("exceptional written and spoken English is a visible gap for conversational English", () => {
  const match = scoreJob(job({
    title: "Cloud Support Engineer",
    location_text: "Anywhere",
    remote_scope: "worldwide",
    description_text: "Hands-on Linux support, networking, cloud troubleshooting, and exceptional written and spoken English.",
  }));

  assert.equal(match.score_breakdown.raw.language, 55);
  assert.ok(match.gaps.some((gap) => gap.includes("inglés más alto")));
  assert.equal(match.score_breakdown.eligibility_adjustment.status, "eligible");
});

test("five years of PHP software engineering cannot be a very strong match with two years of development", () => {
  const match = scoreJob(job({
    title: "Senior Software Engineer",
    description_text: "Build PHP, React and SQL web applications. 5+ years of PHP web application software engineering experience required.",
  }));
  assert.equal(match.score_breakdown.requirements_adjustment.cap, 69);
  assert.ok(match.total_score <= 69);
  assert.ok(match.gaps.some((gap) => gap.includes("5 años de desarrollo")));
});

test("explicit multi-year Go requirement is recorded as central and limits a broad keyword match", () => {
  const match = scoreJob(job({
    title: "Software Engineer - Auth",
    description_text: "About the company: Postgres, Supabase, TypeScript, React, Node.js, APIs. (Required) Have 4+ years of professional experience writing and shipping Go in production. Implement authentication features in Go and TypeScript.",
  }));
  assert.equal(match.score_breakdown.requirements_adjustment.cap, 64);
  assert.ok(match.requirement_analysis.some((item) => item.area === "specialist_requirement" && item.criticality === "central" && item.skill === "Go"));
  assert.ok(match.gaps.some((gap) => gap.includes("4 años profesionales en Go")));
});

test("seven-year support and deep PostgreSQL internals override a Junior source label", () => {
  const match = scoreJob(job({
    title: "Database Support Engineer",
    seniority: "junior",
    description_text: "You have 7+ years in technical support, databases, backend engineering, SRE, or a similar field. Postgres Expertise: You know PostgreSQL deeply—autovacuum behavior, WAL growth, long-running transactions, table bloat, and other internals. Troubleshoot Postgres queries and customer issues.",
  }));
  assert.equal(match.score_breakdown.raw.seniority, 45);
  assert.equal(match.score_breakdown.requirements_adjustment.cap, 64);
  assert.ok(match.requirement_analysis.some((item) => item.area === "support_tenure" && item.criticality === "central"));
  assert.ok(match.requirement_analysis.some((item) => item.area === "database_internals" && item.status === "unverified"));
  assert.ok(match.gaps.some((gap) => gap.includes("3–6 años")));
  assert.ok(match.total_score <= 64);
});

test("SQL/RLS support without an explicit internals requirement remains competitive", () => {
  const match = scoreJob(job({
    title: "Database Support Engineer",
    description_text: "Support customers with PostgreSQL SQL, RLS, APIs and application queries; 4 years in technical support preferred.",
  }));
  assert.equal(match.score_breakdown.requirements_adjustment.cap, null);
  assert.ok(!match.gaps.some((gap) => gap.includes("PostgreSQL avanzado")));
});

test("security engineering as the primary function is a confirmed central gap", () => {
  const match = scoreJob(job({
    title: "Security Software Engineer",
    seniority: "senior",
    description_text: "Build React and Node.js APIs. Their primary focus is to challenge the team to think more deeply about security through threat modeling, static analysis tools, and fuzzing. These roles encompass product security and vulnerability response.",
  }));
  assert.equal(match.score_breakdown.requirements_adjustment.cap, 64);
  assert.ok(match.requirement_analysis.some((item) => item.area === "product_security" && item.status === "unmet"));
  assert.ok(match.gaps.some((gap) => gap.includes("no tener experiencia")));
});

test("mandatory cloud operations stack is a gap, while bonus tools are not", () => {
  const required = scoreJob(job({
    title: "Infrastructure Engineer",
    description_text: "Operate Linux servers, networks, APIs, and TypeScript automation. Qualifications: Strong proficiency with AWS services. Hands-on experience utilizing Terraform for Infrastructure as Code. Solid understanding of Kubernetes concepts. Nice to Have: Go and security certifications.",
  }));
  const bonus = scoreJob(job({
    title: "Infrastructure Engineer",
    description_text: "Operate Linux servers and networks. Qualifications: Support and troubleshoot production systems. Nice to Have: AWS, Terraform, Kubernetes.",
  }));
  assert.equal(required.score_breakdown.requirements_adjustment.cap, 64);
  assert.ok(required.requirement_analysis.some((item) => item.area === "confirmed_tool_gap" && item.status === "unmet" && item.skills?.length === 3));
  assert.equal(bonus.score_breakdown.requirements_adjustment.cap, null);
});

test("a must-have AWS role and ownership of a Terraform provider expose confirmed tool gaps", () => {
  const aws = scoreJob(job({
    title: "Senior AI Solutions Engineer",
    description_text: "Build React integrations and APIs. Requirements: 5+ years of software engineering experience. Must Have: Strong Python development experience. Hands-on experience with AWS Bedrock. Experience building AI Agents. Nice to Have: PHP and CRM.",
  }));
  const terraform = scoreJob(job({
    title: "Software Engineer: IaC Platform Experience",
    description_text: "Own the Terraform provider as a core part of the platform. Build TypeScript APIs and Go provider resources.",
  }));
  assert.equal(aws.score_breakdown.requirements_adjustment.cap, 64);
  assert.ok(aws.requirement_analysis.some((item) => item.area === "confirmed_tool_gap" && item.skills?.includes("AWS")));
  assert.equal(terraform.score_breakdown.requirements_adjustment.cap, 64);
  assert.ok(terraform.requirement_analysis.some((item) => item.area === "confirmed_tool_gap" && item.skills?.includes("Terraform")));
});

test("a Staff responsibility is not treated as Senior from the feed title", () => {
  const match = scoreJob(job({
    title: "Senior Software Engineer, Backend",
    seniority: "senior",
    description_text: "Responsibilities Staff Backend Engineer who blends systems thinking with product pragmatism. Build Node.js APIs and SQL integrations.",
  }));
  assert.ok(match.requirement_analysis.some((item) => item.area === "seniority" && item.value === "staff" && item.raw_score === 25));
});
