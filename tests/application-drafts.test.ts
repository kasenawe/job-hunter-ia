import assert from "node:assert/strict";
import test from "node:test";

import { generateApplicationDrafts, preferredDraftLanguage } from "../src/lib/applications/drafts";

test("Spanish full-stack draft ties interest to the actual role and confirmed skills", () => {
  const job = {
    title: "Desarrollador(a) Full-Stack – IA / React / Node.js",
    company_name: "BC Tecnología",
    description_text: "Buscamos desarrollar frontend con React y TypeScript e implementar APIs con Node.js. Experiencia con AWS deseable.",
    language: null,
  };
  const drafts = generateApplicationDrafts(job, "es");
  assert.equal(preferredDraftLanguage(job), "es");
  assert.match(drafts.coverLetter, /BC Tecnología/);
  assert.match(drafts.coverLetter, /React.*TypeScript.*Node\.js/);
  assert.match(drafts.whyCompany, /desarrollar aplicaciones web de extremo a extremo/);
  assert.doesNotMatch(drafts.coverLetter, /trabajado con AWS|experiencia en AWS/i);
});

test("English support draft uses support experience without inventing company facts", () => {
  const job = {
    title: "Application Support Engineer",
    company_name: "Example Co",
    description_text: "Work with users to troubleshoot incidents and support our applications. Kubernetes experience required.",
  };
  const drafts = generateApplicationDrafts(job, "en");
  assert.equal(preferredDraftLanguage(job), "en");
  assert.match(drafts.coverLetter, /application support, infrastructure, incident coordination/);
  assert.match(drafts.whyCompany, /resolving incidents and supporting systems and users/);
  assert.doesNotMatch(drafts.coverLetter, /Kubernetes|mission|culture/);
});

test("thin job descriptions produce a restrained motivation", () => {
  const drafts = generateApplicationDrafts({
    title: "Technical Analyst",
    company_name: "Example Co",
    description_text: "Technical role.",
  }, "es");
  assert.match(drafts.whyCompany, /trabajo técnico descrito en la vacante/);
  assert.doesNotMatch(drafts.whyCompany, /cultura|misión|clientes/);
});
