import "server-only";

export type JobicyJob = {
  id?: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | string | null;
  salaryMax?: number | string | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  [key: string]: unknown;
};

const STRONG = [
  /software (developer|engineer)/i,
  /full[- ]?stack/i,
  /front[- ]?end/i,
  /back[- ]?end/i,
  /web developer/i,
  /javascript/i,
  /typescript/i,
  /react/i,
  /node(?:\.js|js)?/i,
  /php developer/i,
  /integration/i,
  /implementation/i,
  /systems? analyst/i,
  /business analyst/i,
  /application support/i,
  /technical support/i,
  /support engineer/i,
  /infrastructure/i,
  /systems? administrator/i,
  /sysadmin/i,
  /devops/i,
  /site reliability engineer|\bSRE\b/i,
  /technical operations/i,
  /automation/i,
  /solutions? engineer/i,
  /technical consultant/i,
  /technical account manager/i,
  /customer success engineer/i,
];

const EXCLUDE = [
  /psycholog/i,
  /customer success(?: manager)?/i,
  /account manager/i,
  /growth/i,
  /marketing/i,
  /sales/i,
  /recruit/i,
  /designer|design engineer/i,
  /data scientist/i,
  /machine learning/i,
  /security engineer|cyber/i,
  /finance|legal|content|human resources/i,
];

const GENERIC = [/engineer/i, /developer/i, /analyst/i, /administrator/i, /specialist/i, /consultant/i];
const TECH = ["software","api","integration","implementation","javascript","typescript","react","node","php","sql","postgres","mysql","backend","frontend","cloud","saas","infrastructure","systems","application support","technical support","automation","server","network"];

const clean = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const strip = (v?: string) => (v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const num = (v: unknown) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const iso = (v: unknown) => typeof v === "string" && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null;

export function isRelevantJobicyJob(job: JobicyJob) {
  const title = clean(job.jobTitle) ?? "";
  if (STRONG.some((p) => p.test(title))) return true;
  if (EXCLUDE.some((p) => p.test(title))) return false;
  if (!GENERIC.some((p) => p.test(title))) return false;

  const text = [title, job.jobExcerpt, job.jobDescription, ...(job.jobIndustry ?? [])]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();

  return TECH.filter((term) => text.includes(term)).length >= 2;
}

function seniority(v: unknown) {
  const s = clean(v)?.toLowerCase();
  if (!s || s === "any") return null;
  if (/intern|trainee/.test(s)) return "intern";
  if (/entry|junior|jr\.?/.test(s)) return "junior";
  if (/mid|middle|intermediate/.test(s)) return "mid";
  if (/senior|sr\.?/.test(s)) return "senior";
  if (/staff/.test(s)) return "staff";
  if (/principal/.test(s)) return "principal";
  if (/lead/.test(s)) return "lead";
  if (/manager/.test(s)) return "manager";
  if (/director|head|vp|vice president|executive/.test(s)) return "director";
  return s;
}

function employment(v: unknown) {
  const s = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join(" ").toLowerCase() : "";
  if (/full[- ]?time/.test(s)) return "full-time";
  if (/part[- ]?time/.test(s)) return "part-time";
  if (/contract/.test(s)) return "contract";
  if (/freelance/.test(s)) return "freelance";
  if (/intern/.test(s)) return "internship";
  return null;
}

function scope(v: unknown) {
  const s = clean(v)?.toLowerCase();
  if (!s) return null;
  if (/worldwide|anywhere|global/.test(s)) return "worldwide";
  if (/latam|latin america|south america/.test(s)) return "latam";
  if (/americas?/.test(s)) return "americas";
  return "restricted";
}

export function normalizeJobicyJob(job: JobicyJob) {
  const source_job_id = job.id == null ? null : String(job.id);
  const source_url = clean(job.url);
  const title = clean(job.jobTitle);
  const company_name = clean(job.companyName);
  if (!source_job_id || !source_url || !title || !company_name) return null;

  let salary_min = num(job.salaryMin);
  let salary_max = num(job.salaryMax);
  if (salary_min != null && salary_max != null && salary_max < salary_min) [salary_min, salary_max] = [salary_max, salary_min];

  const sourceTypes = (job.jobType ?? []).filter((v): v is string => typeof v === "string");
  const industries = (job.jobIndustry ?? []).filter((v): v is string => typeof v === "string");

  return {
    source: "jobicy",
    source_job_id,
    source_url,
    apply_url: null,
    title,
    company_name,
    location_text: clean(job.jobGeo),
    remote_scope: scope(job.jobGeo),
    workplace_type: "remote",
    employment_type: employment(job.jobType),
    seniority: seniority(job.jobLevel),
    language: null,
    description_text: strip(job.jobDescription) || strip(job.jobExcerpt) || "Description unavailable",
    posted_at: iso(job.pubDate),
    expires_at: null,
    salary_min,
    salary_max,
    salary_currency: clean(job.salaryCurrency),
    salary_interval: clean(job.salaryPeriod),
    raw_payload: job,
    normalized_payload: {
      normalization_version: "jobicy-v2",
      industries,
      source_job_types: sourceTypes,
      source_seniority: clean(job.jobLevel),
      source_geo: clean(job.jobGeo),
      company_logo: clean(job.companyLogo),
    },
    is_active: true,
  };
}
