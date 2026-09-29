"use server";

import { revalidatePath } from "next/cache";
import { importGetOnBrdJobs } from "@/lib/jobs/getonbrd";
import { scoreActiveJobs } from "@/lib/scoring/score-active-jobs";

export async function importGetOnBrdJobsAction() {
  await importGetOnBrdJobs();
  await scoreActiveJobs();
  revalidatePath("/");
}
