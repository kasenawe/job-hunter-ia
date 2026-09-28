import { connection } from "next/server";

import { importJobicyJobsAction } from "@/app/actions/import-jobicy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-UY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default async function Home() {
  await connection();

  const supabase = createSupabaseServerClient();

  const [
    { count, error: countError },
    { data: recentJobs, error: jobsError },
  ] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase
      .from("jobs")
      .select(
        "id,title,company_name,location_text,remote_scope,workplace_type,employment_type,seniority,posted_at,source_url",
      )
      .eq("is_active", true)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  const connected = !countError && !jobsError;

  if (countError) {
    console.error("Supabase count check failed:", countError.message);
  }

  if (jobsError) {
    console.error("Supabase QA jobs query failed:", jobsError.message);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
            Job Hunter IA
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Base del MVP operativa
          </h1>
          <p className="mt-3 text-zinc-400">
            Next.js en Vercel conectado con Supabase desde el servidor.
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-sm text-zinc-400">Supabase</p>
              <p className="mt-1 text-lg font-medium">
                {connected ? "Conectado" : "Error de conexión"}
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm text-zinc-400">Ofertas almacenadas</p>
              <p className="mt-1 text-3xl font-semibold">
                {connected ? (count ?? 0) : "—"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Fuente inicial</p>
          <h2 className="mt-1 text-xl font-medium">Jobicy</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Importa ofertas remotas orientadas a desarrollo, soporte,
            integraciones, implementación y análisis técnico. Las ofertas se
            normalizan y se deduplican antes de guardarse.
          </p>

          <form action={importJobicyJobsAction} className="mt-5">
            <button
              type="submit"
              className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-white"
            >
              Importar ofertas de Jobicy
            </button>
          </form>

          <p className="mt-3 text-xs text-zinc-500">
            Para respetar la fuente, una importación exitosa bloquea nuevas
            consultas durante aproximadamente una hora.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-6">
            <p className="text-sm text-zinc-400">QA de normalización</p>
            <h2 className="mt-1 text-xl font-medium">
              20 ofertas más recientes
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Esta tabla es temporal: sirve para validar que los datos de
              Jobicy estén cayendo correctamente antes de implementar scoring.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Puesto</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Ubicación</th>
                  <th className="px-4 py-3 font-medium">Seniority</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(recentJobs ?? []).map((job) => (
                  <tr key={job.id} className="align-top">
                    <td className="min-w-64 px-4 py-4 font-medium text-zinc-100">
                      {job.title}
                    </td>
                    <td className="min-w-44 px-4 py-4 text-zinc-300">
                      {job.company_name}
                    </td>
                    <td className="min-w-52 px-4 py-4 text-zinc-400">
                      {job.location_text ?? job.remote_scope ?? "—"}
                    </td>
                    <td className="min-w-36 px-4 py-4 text-zinc-400">
                      {job.seniority ?? "—"}
                    </td>
                    <td className="min-w-40 px-4 py-4 text-zinc-400">
                      {job.employment_type ?? job.workplace_type ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-zinc-400">
                      {formatDate(job.posted_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <a
                        href={job.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white"
                      >
                        Abrir
                      </a>
                    </td>
                  </tr>
                ))}

                {(recentJobs ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-zinc-500"
                    >
                      No hay ofertas para revisar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
