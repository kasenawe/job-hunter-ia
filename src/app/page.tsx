import { connection } from "next/server";

import { importJobicyJobsAction } from "@/app/actions/import-jobicy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  await connection();

  const supabase = createSupabaseServerClient();

  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true });

  const connected = !error;

  if (error) {
    console.error("Supabase connectivity check failed:", error.message);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-8">
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
      </div>
    </main>
  );
}
