import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const JOBICY_ENDPOINT = "https://jobicy.com/api/v2/remote-jobs";
const MIN_IMPORT_INTERVAL_MS = 60 * 60 * 1000;

const JOBICY_QUERIES = [
  { count: 40, industry: "engineering" },
  { count: 30, industry: "supporting" },
  { count: 20, tag: "integration" },
  { count: 20, tag: "implementation" },
  { count: 20, tag: "business analyst" },
] as const;

type JobicyJob = {
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

type JobicyResponse = {
  jobs?: JobicyJob[];
};

type JobicyQuery = {
  count: number;
  industry?: string;
  tag?: string;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function stripHtml(value: string | undefined): string {
  return (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function safeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchJobicyJobs(query: JobicyQuery): Promise<JobicyJob[]> {
  const url = new URL(JOBICY_ENDPOINT);
  url.searchParams.set("count", String(query.count));

  if (query.industry) {
    url.searchParams.set("industry", query.industry);
  }

  if (query.tag) {
    url.searchParams.set("tag", query.tag);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Jobicy request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as JobicyResponse;
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function importJobicyJobs() {
  const supabase = createSupabaseServerClient();

  const { data: latestJob, error: latestJobError } = await supabase
    .from("jobs")
    .select("last_seen_at")
    .eq("source", "jobicy")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestJobError) {
    throw new Error(`Could not check Jobicy import interval: ${latestJobError.message}`);
  }

  if (latestJob?.last_seen_at) {
    const lastImportTime = new Date(latestJob.last_seen_at).getTime();

    if (
      Number.isFinite(lastImportTime) &&
      Date.now() - lastImportTime < MIN_IMPORT_INTERVAL_MS
    ) {
      return {
        imported: 0,
        skipped: true,
      };
    }
  }

  const batches = await Promise.all(
    JOBICY_QUERIES.map((query) => fetchJobicyJobs(query)),
  );

  const uniqueJobs = new Map<string, JobicyJob>();

  for (const job of batches.flat()) {
    if (job.id !== undefined && job.id !== null) {
      uniqueJobs.set(String(job.id), job);
    }
  }

  const now = new Date().toISOString();

  const rows = Array.from(uniqueJobs.values()).flatMap((job) => {
    const sourceJobId =
      job.id === undefined || job.id === null ? null : String(job.id);
    const sourceUrl = cleanText(job.url);
    const title = cleanText(job.jobTitle);
    const companyName = cleanText(job.companyName);

    const descriptionText =
      stripHtml(job.jobDescription) ||
      stripHtml(job.jobExcerpt) ||
      "Description unavailable";

    if (!sourceJobId || !sourceUrl || !title || !companyName) {
      return [];
    }

    const jobTypes = Array.isArray(job.jobType)
      ? job.jobType.map(cleanText).filter((value): value is string => Boolean(value))
      : [];

    const industries = Array.isArray(job.jobIndustry)
      ? job.jobIndustry
          .map(cleanText)
          .filter((value): value is string => Boolean(value))
      : [];

    return [
      {
        source: "jobicy",
        source_job_id: sourceJobId,
        source_url: sourceUrl,
        apply_url: null,
        title,
        company_name: companyName,
        location_text: cleanText(job.jobGeo),
        remote_scope: cleanText(job.jobGeo),
        workplace_type: "remote",
        employment_type: jobTypes.length > 0 ? jobTypes.join(", ") : null,
        seniority: cleanText(job.jobLevel),
        language: null,
        description_text: descriptionText,
        posted_at: safeIsoDate(job.pubDate),
        expires_at: null,
        salary_min: safeNumber(job.salaryMin),
        salary_max: safeNumber(job.salaryMax),
        salary_currency: cleanText(job.salaryCurrency),
        salary_interval: cleanText(job.salaryPeriod),
        raw_payload: job,
        normalized_payload: {
          industries,
          job_types: jobTypes,
          company_logo: cleanText(job.companyLogo),
          excerpt: cleanText(job.jobExcerpt),
          source_geo: cleanText(job.jobGeo),
        },
        is_active: true,
        last_seen_at: now,
      },
    ];
  });

  if (rows.length === 0) {
    return {
      imported: 0,
      skipped: false,
    };
  }

  const { error } = await supabase.from("jobs").upsert(rows, {
    onConflict: "source,source_job_id",
  });

  if (error) {
    throw new Error(`Could not store Jobicy jobs: ${error.message}`);
  }

  return {
    imported: rows.length,
    skipped: false,
  };
}
