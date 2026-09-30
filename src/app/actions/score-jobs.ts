"use server";

import { revalidatePath } from "next/cache";

import { scoreActiveJobs } from "@/lib/scoring/score-active-jobs";

export async function scoreActiveJobsAction() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("El scoring manual no está disponible en producción");
  }
  await scoreActiveJobs();
  revalidatePath("/");
}
