"use server";

import { revalidatePath } from "next/cache";
import { importGetOnBrdJobs } from "@/lib/jobs/getonbrd";
import { scoreActiveJobs } from "@/lib/scoring/score-active-jobs";

export async function importGetOnBrdJobsAction() {
  await importGetOnBrdJobs({ force: process.env.VERCEL_ENV === "preview" });
  await scoreActiveJobs();
  revalidatePath("/");
}
