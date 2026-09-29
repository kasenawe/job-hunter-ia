import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGetOnBrdJob, type GetOnBrdJob } from "../src/lib/jobs/normalize-getonbrd";
import { scoreJob, type JobForScoring } from "../src/lib/scoring/score-job";

function source(overrides: Partial<NonNullable<GetOnBrdJob["attributes"]>> = {}): GetOnBrdJob {
  return {
    id: "full-stack-developer-example-remote",
    links: { public_url: "https://www.getonbrd.com/jobs/full-stack-developer-example-remote" },
    attributes: {
      title: "Full-Stack Developer",
      description: "<p>Build React and Node.js applications with PostgreSQL.</p>",
      remote_modality: "remote_local",
      countries: ["Remote"],
      company: { data: { attributes: { name: "Example" } } },
      location_tenants: { data: [{ id: "chile", attributes: { name: "Chile" } }] },
      location_regions: { data: [] },
      ...overrides,
    },
  };
}

test("a strong Chile-only remote role is stored inactive and cannot enter the ranking", () => {
  const job = normalizeGetOnBrdJob(source());
  assert.equal(job?.is_active, false);
  assert.equal(job?.remote_scope, "restricted");
  assert.equal(job?.location_text, "Chile");
});

test("explicit Uruguay and South America locations are eligible", () => {
  const uruguay = normalizeGetOnBrdJob(source({
    location_tenants: { data: [{ id: "uruguay", attributes: { name: "Uruguay" } }] },
  }));
  const region = normalizeGetOnBrdJob(source({
    location_tenants: { data: [] },
    location_regions: { data: [{ id: "south_america", attributes: { name: "South America" } }] },
  }));
  assert.equal(uruguay?.is_active, true);
  assert.equal(region?.is_active, true);
  assert.equal(region?.remote_scope, "latam");
  assert.equal(scoreJob({ ...region, id: "example" } as JobForScoring).score_breakdown.eligibility_adjustment.status, "eligible");
});

test("worldwide roles are eligible, but ambiguous remote roles are held from ranking", () => {
  const worldwide = normalizeGetOnBrdJob(source({ remote_modality: "fully_remote", location_tenants: { data: [] } }));
  const unknown = normalizeGetOnBrdJob(source({ location_tenants: { data: [] } }));
  assert.equal(worldwide?.remote_scope, "worldwide");
  assert.equal(worldwide?.is_active, true);
  assert.equal(unknown?.is_active, false);
  assert.equal(unknown?.normalized_payload.geographic_eligibility, "uncertain");
});

test("a local Uruguay hybrid role remains eligible", () => {
  const hybrid = normalizeGetOnBrdJob(source({
    remote_modality: "hybrid", remote: false, countries: ["Uruguay"],
    location_tenants: { data: [] },
    location_cities: { data: [{ id: "montevideo", attributes: { name: "Montevideo" } }] },
  }));
  assert.equal(hybrid?.workplace_type, "hybrid");
  assert.equal(hybrid?.is_active, true);
  assert.match(hybrid?.location_text ?? "", /Montevideo/);
});
