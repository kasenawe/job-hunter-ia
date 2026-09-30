"use server";

import { revalidatePath } from "next/cache";
import { importGetOnBrdJobs } from "@/lib/jobs/getonbrd";
import { scoreActiveJobs } from "@/lib/scoring/score-active-jobs";

export async function importGetOnBrdJobsAction() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("La importación manual no está disponible en producción");
  }
  await importGetOnBrdJobs({ force: process.env.VERCEL_ENV === "preview" });
  await scoreActiveJobs();
  revalidatePath("/");
}
