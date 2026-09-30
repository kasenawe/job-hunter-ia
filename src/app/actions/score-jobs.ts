"use server";

import { revalidatePath } from "next/cache";

import { scoreActiveJobs } from "@/lib/scoring/score-active-jobs";

export async function scoreActiveJobsAction() {
  await scoreActiveJobs();
  revalidatePath("/");
}
