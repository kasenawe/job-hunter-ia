import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isRelevantJobicyJob,
  normalizeJobicyJob,
  type JobicyJob,
} from "@/lib/jobs/normalize-jobicy";

export async function reprocessStoredJobicyJobsSafely() {
  const supabase = createSupabaseServerClient();

  const { data: storedJobs, error: readError } = await supabase
    .from("jobs")
    .select("id,raw_payload")
    .eq("source", "jobicy");

  if (readError) {
    throw new Error(readError.message);
  }

  const keptRows: NonNullable<ReturnType<typeof normalizeJobicyJob>>[] = [];
  const inactiveIds: string[] = [];

  for (const storedJob of storedJobs ?? []) {
    const raw = storedJob.raw_payload as JobicyJob;

    if (!isRelevantJobicyJob(raw)) {
      inactiveIds.push(storedJob.id);
      continue;
    }

    const normalized = normalizeJobicyJob(raw);

    if (normalized) {
      keptRows.push(normalized);
    } else {
      inactiveIds.push(storedJob.id);
    }
  }

  if (keptRows.length > 0) {
    const { error } = await supabase.from("jobs").upsert(keptRows, {
      onConflict: "source,source_job_id",
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  if (inactiveIds.length > 0) {
    const { error } = await supabase
      .from("jobs")
      .update({ is_active: false })
      .in("id", inactiveIds);

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    reviewed: storedJobs?.length ?? 0,
    kept: keptRows.length,
    deactivated: inactiveIds.length,
  };
}
