"use server";

import { revalidatePath } from "next/cache";

import { importJobicyJobs } from "@/lib/jobs/jobicy";
import { reprocessStoredJobicyJobsSafely } from "@/lib/jobs/reprocess-jobicy-safe";

export async function importJobicyJobsAction() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("La importación manual no está disponible en producción");
  }
  await importJobicyJobs();
  revalidatePath("/");
}

export async function reprocessStoredJobicyJobsAction() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("El reprocesamiento manual no está disponible en producción");
  }
  await reprocessStoredJobicyJobsSafely();
  revalidatePath("/");
}
