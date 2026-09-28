import { connection } from "next/server";
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
      </div>
    </main>
  );
}
