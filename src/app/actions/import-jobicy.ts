"use server";

import { revalidatePath } from "next/cache";

import { importJobicyJobs } from "@/lib/jobs/jobicy";

export async function importJobicyJobsAction() {
  await importJobicyJobs();
  revalidatePath("/");
}
