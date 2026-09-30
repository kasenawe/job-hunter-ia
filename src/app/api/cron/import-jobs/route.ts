import { importGetOnBrdJobs } from "@/lib/jobs/getonbrd";
import { importJobicyJobs } from "@/lib/jobs/jobicy";
import { scoreActiveJobs } from "@/lib/scoring/score-active-jobs";

export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [jobicy, getonbrd] = await Promise.allSettled([importJobicyJobs(), importGetOnBrdJobs()]);
  const scored = await scoreActiveJobs();
  if (jobicy.status === "rejected" || getonbrd.status === "rejected") {
    console.error("Scheduled job import failed", {
      jobicy: jobicy.status === "rejected" ? String(jobicy.reason) : "ok",
      getonbrd: getonbrd.status === "rejected" ? String(getonbrd.reason) : "ok",
    });
    return Response.json({ error: "One or more imports failed", scored }, { status: 500 });
  }
  return Response.json({ imported: { jobicy: jobicy.value, getonbrd: getonbrd.value }, scored });
}
