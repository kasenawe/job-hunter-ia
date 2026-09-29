import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRelevantGetOnBrdJob, normalizeGetOnBrdJob, type GetOnBrdJob } from "@/lib/jobs/normalize-getonbrd";

const BASE_URL = "https://www.getonbrd.com/api/v0/categories";
const CATEGORIES = ["programming", "sysadmin-devops-qa", "technical-support", "customer-support", "innovation-agile"];
const MIN_IMPORT_INTERVAL_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;

type Page = { data?: GetOnBrdJob[]; meta?: { total_pages?: number } };

async function fetchPage(category: string, page: number): Promise<Page> {
  const url = new URL(`${BASE_URL}/${category}/jobs`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PAGE_SIZE));
  for (const related of ["company", "location_tenants", "location_regions", "location_cities", "seniority"]) {
    url.searchParams.append("expand[]", related);
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
    headers: { Accept: "application/json", "User-Agent": "JobHunterIA/1.0" },
  });
  if (!response.ok) throw new Error(`Get on Board ${category} page ${page} returned HTTP ${response.status}`);
  const payload = (await response.json()) as Page;
  if (!Array.isArray(payload.data) || !Number.isInteger(payload.meta?.total_pages)) {
    throw new Error(`Get on Board ${category} page ${page} returned an invalid payload`);
  }
  return payload;
}

export async function importGetOnBrdJobs() {
  const supabase = createSupabaseServerClient();
  const { data: latest, error: latestError } = await supabase.from("jobs")
    .select("last_seen_at").eq("source", "getonbrd")
    .order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw new Error(`Could not check Get on Board import interval: ${latestError.message}`);
  if (latest?.last_seen_at && Date.now() - new Date(latest.last_seen_at).getTime() < MIN_IMPORT_INTERVAL_MS) {
    return { imported: 0, skipped: true };
  }

  // All pages must succeed before a previously seen job may be marked inactive.
  const firstPages = await Promise.all(CATEGORIES.map((category) => fetchPage(category, 1)));
  const allJobs = firstPages.flatMap((payload) => payload.data ?? []);
  for (let index = 0; index < CATEGORIES.length; index++) {
    const pages = Math.min(firstPages[index].meta?.total_pages ?? 1, 10);
    for (let page = 2; page <= pages; page++) {
      allJobs.push(...(await fetchPage(CATEGORIES[index], page)).data ?? []);
    }
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  const unique = new Map<string, GetOnBrdJob>();
  for (const job of allJobs) {
    if (job.id && isRelevantGetOnBrdJob(job) &&
      (job.attributes?.published_at ?? 0) * 1000 >= cutoff) unique.set(job.id, job);
  }
  const rows = [...unique.values()].map(normalizeGetOnBrdJob)
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const now = new Date().toISOString();

  for (let start = 0; start < rows.length; start += 40) {
    const chunk = rows.slice(start, start + 40);
    const { error } = await supabase.from("jobs").upsert(chunk, { onConflict: "source,source_job_id" });
    if (error) throw new Error(`Could not store Get on Board jobs: ${error.message}`);
    const { error: seenError } = await supabase.from("jobs").update({ last_seen_at: now })
      .eq("source", "getonbrd").in("source_job_id", chunk.map((row) => row.source_job_id));
    if (seenError) throw new Error(`Could not update Get on Board last_seen_at: ${seenError.message}`);
  }

  const currentIds = new Set(rows.map((row) => row.source_job_id));
  const { data: previous, error: previousError } = await supabase.from("jobs")
    .select("id,source_job_id").eq("source", "getonbrd").eq("is_active", true);
  if (previousError) throw new Error(`Could not inspect old Get on Board jobs: ${previousError.message}`);
  const missingIds = (previous ?? []).filter((job) => !currentIds.has(job.source_job_id)).map((job) => job.id);
  for (let start = 0; start < missingIds.length; start += 40) {
    const { error } = await supabase.from("jobs").update({ is_active: false })
      .in("id", missingIds.slice(start, start + 40));
    if (error) throw new Error(`Could not deactivate stale Get on Board jobs: ${error.message}`);
  }

  return { imported: rows.length, active: rows.filter((row) => row.is_active).length, skipped: false };
}
