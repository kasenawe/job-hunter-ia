import "server-only";

import { scoreJob, type JobForScoring } from "@/lib/scoring/score-job";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function scoreActiveJobs() {
  const supabase = createSupabaseServerClient();

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select(
      "id,title,company_name,location_text,remote_scope,workplace_type,employment_type,seniority,language,description_text",
    )
    .eq("is_active", true);

  if (jobsError) {
    throw new Error(`Could not load active jobs for scoring: ${jobsError.message}`);
  }

  const matches = (jobs ?? []).map((job) =>
    scoreJob(job as JobForScoring),
  );

  if (matches.length === 0) {
    return { scored: 0 };
  }

  const { error: upsertError } = await supabase
    .from("job_matches")
    .upsert(matches, { onConflict: "job_id" });

  if (upsertError) {
    throw new Error(`Could not persist job scores: ${upsertError.message}`);
  }

  return { scored: matches.length };
}
