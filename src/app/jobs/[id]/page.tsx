import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ApplicationDrafts } from "@/components/application-drafts";
import { generateApplicationDrafts, preferredDraftLanguage } from "@/lib/applications/drafts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const [{ data: job, error: jobError }, { data: match, error: matchError }] = await Promise.all([
    supabase.from("jobs")
      .select("id,title,company_name,description_text,language,location_text,source_url,is_active")
      .eq("id", id).eq("is_active", true).maybeSingle(),
    supabase.from("job_matches")
      .select("total_score,recommended_cv,summary")
      .eq("job_id", id).maybeSingle(),
  ]);

  if (jobError || matchError) throw new Error("No se pudo cargar la oferta");
  if (!job) notFound();

  const initialLanguage = preferredDraftLanguage(job);
  const initialDrafts = {
    es: generateApplicationDrafts(job, "es"),
    en: generateApplicationDrafts(job, "en"),
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/" className="text-sm text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-white">← Volver al ranking</Link>
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7">
          <p className="text-sm text-zinc-400">{job.company_name} · {job.location_text ?? "Ubicación sin detallar"}</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{job.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {match && <span className="rounded-lg bg-zinc-800 px-3 py-1">Match {match.total_score}/100</span>}
            {match?.recommended_cv && <span className="text-zinc-300">CV recomendado: {match.recommended_cv}</span>}
            <a href={job.source_url} target="_blank" rel="noreferrer"
              className="rounded-lg border border-zinc-500 px-3 py-1.5 font-medium hover:bg-zinc-800">Abrir oferta original ↗</a>
          </div>
          {match?.summary && <p className="mt-4 text-sm text-zinc-400">{match.summary}</p>}
        </header>

        <ApplicationDrafts initialLanguage={initialLanguage} initialDrafts={initialDrafts} />

        <details className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7">
          <summary className="cursor-pointer font-medium">Leer descripción original</summary>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{job.description_text}</p>
        </details>
      </div>
    </main>
  );
}
