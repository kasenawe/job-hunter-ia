"use client";

import { useState } from "react";

import type { DraftLanguage } from "@/lib/applications/drafts";

type Drafts = { coverLetter: string; whyCompany: string };

export function ApplicationDrafts({ initialLanguage, initialDrafts }: {
  initialLanguage: DraftLanguage;
  initialDrafts: Record<DraftLanguage, Drafts>;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [copied, setCopied] = useState<keyof Drafts | null>(null);

  function update(field: keyof Drafts, value: string) {
    setDrafts((current) => ({
      ...current,
      [language]: { ...current[language], [field]: value },
    }));
    setCopied(null);
  }

  async function copy(field: keyof Drafts) {
    try {
      await navigator.clipboard.writeText(drafts[language][field]);
      setCopied(field);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Textos para postularte</h2>
          <p className="mt-1 text-sm text-zinc-400">Borradores basados en el aviso y tu experiencia confirmada. Revisalos antes de enviarlos.</p>
        </div>
        <div className="flex rounded-lg border border-zinc-700 p-1" aria-label="Idioma del borrador">
          {(["es", "en"] as const).map((option) => (
            <button key={option} type="button" onClick={() => { setLanguage(option); setCopied(null); }}
              aria-pressed={language === option}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${language === option ? "bg-zinc-100 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}>
              {option === "es" ? "Español" : "English"}
            </button>
          ))}
        </div>
      </div>

      {([
        ["coverLetter", "Carta de presentación", 10],
        ["whyCompany", "¿Por qué quieres unirte a esta empresa?", 5],
      ] as const).map(([field, label, rows]) => (
        <div key={field}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor={field} className="font-medium">{label}</label>
            <button type="button" onClick={() => copy(field)}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800">
              {copied === field ? "Copiado" : "Copiar"}
            </button>
          </div>
          <textarea id={field} rows={rows} value={drafts[language][field]}
            onChange={(event) => update(field, event.target.value)}
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm leading-6 text-zinc-100 outline-none focus:border-zinc-400" />
        </div>
      ))}
    </section>
  );
}
