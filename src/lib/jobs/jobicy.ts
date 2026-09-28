import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isRelevantJobicyJob,
  normalizeJobicyJob,
  type JobicyJob,
} from "@/lib/jobs/normalize-jobicy";

const JOBICY_ENDPOINT = "https://jobicy.com/api/v2/remote-jobs";
const MIN_IMPORT_INTERVAL_MS = 60 * 60 * 1000;
const JOBICY_COUNT = 200;
const JOBICY_GEO = "latam";

type JobicyResponse = { jobs?: JobicyJob[] };

async function fetchJobicyJobs(): Promise<JobicyJob[]> {
  const url = new URL(JOBICY_ENDPOINT);
  url.searchParams.set("count", String(JOBICY_COUNT));
  url.searchParams.set("geo", JOBICY_GEO);

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
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
    throw new Error(
      `Could not check Jobicy import interval: ${latestJobError.message}`,
    );
  }

  if (latestJob?.last_seen_at) {
    const lastImportTime = new Date(latestJob.last_seen_at).getTime();

    if (
      Number.isFinite(lastImportTime) &&
      Date.now() - lastImportTime < MIN_IMPORT_INTERVAL_MS
    ) {
      return { imported: 0, skipped: true };
    }
  }

  const uniqueJobs = new Map<string, JobicyJob>();

  for (const job of await fetchJobicyJobs()) {
    if (job.id != null && isRelevantJobicyJob(job)) {
      uniqueJobs.set(String(job.id), job);
    }
  }

  const rows = Array.from(uniqueJobs.values())
    .map(normalizeJobicyJob)
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return { imported: 0, skipped: false };
  }

  const { error: upsertError } = await supabase.from("jobs").upsert(rows, {
    onConflict: "source,source_job_id",
  });

  if (upsertError) {
    throw new Error(`Could not store Jobicy jobs: ${upsertError.message}`);
  }

  const { error: lastSeenError } = await supabase
    .from("jobs")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("source", "jobicy")
    .in(
      "source_job_id",
      rows.map((row) => row.source_job_id),
    );

  if (lastSeenError) {
    throw new Error(
      `Could not update Jobicy last_seen_at: ${lastSeenError.message}`,
    );
  }

  return { imported: rows.length, skipped: false };
}

export async function reprocessStoredJobicyJobs() {
  const supabase = createSupabaseServerClient();

  const { data: storedJobs, error: readError } = await supabase
    .from("jobs")
    .select("id,raw_payload")
    .eq("source", "jobicy");

  if (readError) {
    throw new Error(`Could not read stored Jobicy jobs: ${readError.message}`);
  }

  const keptRows: NonNullable<ReturnType<typeof normalizeJobicyJob>>[] = [];
  const removedIds: string[] = [];

  for (const storedJob of storedJobs ?? []) {
    const raw = storedJob.raw_payload as JobicyJob;

    if (!isRelevantJobicyJob(raw)) {
      removedIds.push(storedJob.id);
      continue;
    }

    const normalized = normalizeJobicyJob(raw);

    if (normalized) keptRows.push(normalized);
    else removedIds.push(storedJob.id);
  }

  if (keptRows.length > 0) {
    const { error } = await supabase.from("jobs").upsert(keptRows, {
      onConflict: "source,source_job_id",
    });

    if (error) {
      throw new Error(`Could not reprocess stored Jobicy jobs: ${error.message}`);
    }
  }

  if (removedIds.length > 0) {
    const { error } = await supabase.from("jobs").delete().in("id", removedIds);

    if (error) {
      throw new Error(`Could not remove irrelevant Jobicy jobs: ${error.message}`);
    }
  }

  return {
    reviewed: storedJobs?.length ?? 0,
    kept: keptRows.length,
    removed: removedIds.length,
  };
}
