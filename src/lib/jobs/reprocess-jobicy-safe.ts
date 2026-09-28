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

  let kept = 0;
  let deactivated = 0;

  for (const storedJob of storedJobs ?? []) {
    const raw = storedJob.raw_payload as JobicyJob;

    if (!isRelevantJobicyJob(raw)) {
      const { error } = await supabase
        .from("jobs")
        .update({ is_active: false })
        .eq("id", storedJob.id);

      if (error) throw new Error(error.message);
      deactivated += 1;
      continue;
    }

    const normalized = normalizeJobicyJob(raw);

    if (!normalized) {
      continue;
    }

    const { error } = await supabase
      .from("jobs")
      .update({
        remote_scope: normalized.remote_scope,
        employment_type: normalized.employment_type,
        seniority: normalized.seniority,
        normalized_payload: normalized.normalized_payload,
        is_active: true,
      })
      .eq("id", storedJob.id);

    if (error) throw new Error(error.message);
    kept += 1;
  }

  return {
    reviewed: storedJobs?.length ?? 0,
    kept,
    deactivated,
  };
}
