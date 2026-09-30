"use server";

import { revalidatePath } from "next/cache";

import { importJobicyJobs } from "@/lib/jobs/jobicy";
import { reprocessStoredJobicyJobsSafely } from "@/lib/jobs/reprocess-jobicy-safe";

export async function importJobicyJobsAction() {
  await importJobicyJobs();
  revalidatePath("/");
}

export async function reprocessStoredJobicyJobsAction() {
  await reprocessStoredJobicyJobsSafely();
  revalidatePath("/");
}
