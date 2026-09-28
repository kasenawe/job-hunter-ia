import "server-only";

import {
  CANDIDATE_PROFILE,
  SCORING_VERSION,
  SCORING_WEIGHTS,
} from "@/lib/scoring/profile";

export type JobForScoring = {
  id: string;
  title: string;
  company_name: string;
  location_text: string | null;
  remote_scope: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  seniority: string | null;
  language: string | null;
  description_text: string;
};

function includesTerm(text: string, term: string) {
  return text.includes(term.toLowerCase());
}

function uniqueMatches(text: string, terms: readonly string[]) {
  return [...new Set(terms.filter((term) => includesTerm(text, term)))];
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function axisScore(
  title: string,
  text: string,
  terms: readonly string[],
): number {
  const titleMatches = uniqueMatches(title, terms);
  const allMatches = uniqueMatches(text, terms);

  return clamp(titleMatches.length * 35 + allMatches.length * 12);
}

function scoreSeniority(seniority: string | null) {
  switch (seniority) {
    case "junior":
    case "mid":
      return 100;
    case null:
      return 80;
    case "senior":
      return 65;
    case "lead":
    case "manager":
      return 40;
    case "staff":
    case "principal":
      return 25;
    case "director":
      return 10;
    case "intern":
      return 45;
    default:
      return 65;
  }
}

function scoreLanguage(text: string, language: string | null) {
  const explicit = (language ?? "").toLowerCase();

  if (explicit.includes("spanish")) return 100;

  if (
    /native english|english native|c2 english|c1 english|native-level english/.test(
      text,
    )
  ) {
    return 55;
  }

  if (/fluent english|advanced english|professional english/.test(text)) {
    return 65;
  }

  if (/english required|english proficiency|strong english/.test(text)) {
    return 75;
  }

  return 80;
}

function scoreLocation(job: JobForScoring) {
  const location = (job.location_text ?? "").toLowerCase();
  const scope = (job.remote_scope ?? "").toLowerCase();

  if (job.workplace_type && job.workplace_type !== "remote") {
    return /uruguay|montevideo/.test(location) ? 100 : 20;
  }

  if (scope === "worldwide" || scope === "latam") return 100;
  if (scope === "americas") return 90;

  if (/uruguay|montevideo/.test(location)) return 100;
  if (/latam|latin america|south america/.test(location)) return 95;
  if (/americas?/.test(location)) return 90;
  if (/canada|usa|united states|north america/.test(location)) return 35;
  if (/europe|\beu\b|uk|united kingdom|apac|asia|australia/.test(location)) {
    return 10;
  }

  return scope === "restricted" ? 25 : 70;
}

function scoreOther(job: JobForScoring, text: string) {
  let score = 75;

  switch (job.employment_type) {
    case "full-time":
      score = 100;
      break;
    case "contract":
      score = 80;
      break;
    case "freelance":
      score = 65;
      break;
    case "part-time":
      score = 60;
      break;
  }

  const yearsMatch = text.match(/(?:minimum|min\.?|at least)?\s*(\d{1,2})\+?\s+years?/);
  const years = yearsMatch ? Number(yearsMatch[1]) : null;

  if (years !== null && years >= 5) {
    score -= 25;
  } else if (years !== null && years >= 3) {
    score -= 10;
  }

  return clamp(score);
}

function category(score: number) {
  if (score >= 85) return "match muy fuerte";
  if (score >= 70) return "buen candidato para revisar/postular";
  if (score >= 55) return "match posible, requiere evaluación";
  return "baja prioridad";
}

export function scoreJob(job: JobForScoring) {
  const title = job.title.toLowerCase();
  const text = `${job.title} ${job.description_text}`.toLowerCase();

  const strongMatches = uniqueMatches(text, CANDIDATE_PROFILE.strongSkills);
  const transferableMatches = uniqueMatches(
    text,
    CANDIDATE_PROFILE.transferableSkills,
  );

  const technicalRaw = clamp(
    Math.min(70, strongMatches.length * 10) +
      Math.min(30, transferableMatches.length * 6),
  );

  const axisScores = {
    development: axisScore(
      title,
      text,
      CANDIDATE_PROFILE.axisTerms.development,
    ),
    integrations: axisScore(
      title,
      text,
      CANDIDATE_PROFILE.axisTerms.integrations,
    ),
    technical_functional: axisScore(
      title,
      text,
      CANDIDATE_PROFILE.axisTerms.technicalFunctional,
    ),
    infrastructure_support: axisScore(
      title,
      text,
      CANDIDATE_PROFILE.axisTerms.infrastructureSupport,
    ),
  };

  const bestAxis = Math.max(...Object.values(axisScores));
  const titleTargeted = CANDIDATE_PROFILE.targetRoleTerms.some((term) =>
    includesTerm(title, term),
  );

  const experienceRaw = clamp(
    (titleTargeted ? 35 : 15) + Math.round(bestAxis * 0.65),
  );

  const seniorityRaw = scoreSeniority(job.seniority);
  const languageRaw = scoreLanguage(text, job.language);
  const locationRaw = scoreLocation(job);
  const otherRaw = scoreOther(job, text);

  const weighted = {
    technical: Math.round(
      (technicalRaw * SCORING_WEIGHTS.technical) / 100,
    ),
    experience: Math.round(
      (experienceRaw * SCORING_WEIGHTS.experience) / 100,
    ),
    seniority: Math.round(
      (seniorityRaw * SCORING_WEIGHTS.seniority) / 100,
    ),
    language: Math.round(
      (languageRaw * SCORING_WEIGHTS.language) / 100,
    ),
    location: Math.round(
      (locationRaw * SCORING_WEIGHTS.location) / 100,
    ),
    other: Math.round((otherRaw * SCORING_WEIGHTS.other) / 100),
  };

  const totalScore = clamp(
    Object.values(weighted).reduce((sum, value) => sum + value, 0),
  );

  const strengths: string[] = [];
  const gaps: string[] = [];
  const risks: string[] = [];

  if (strongMatches.length > 0) {
    strengths.push(
      `Stack coincidente: ${strongMatches.slice(0, 6).join(", ")}`,
    );
  }

  if (transferableMatches.length > 0) {
    strengths.push(
      `Experiencia transferible: ${transferableMatches.slice(0, 5).join(", ")}`,
    );
  }

  if (bestAxis >= 70) {
    strengths.push("Las funciones del puesto encajan con al menos uno de los ejes del perfil.");
  }

  if (strongMatches.length === 0) {
    gaps.push("No se detectaron tecnologías del stack principal en la descripción.");
  }

  if (job.seniority && ["senior", "lead", "staff", "principal", "manager", "director"].includes(job.seniority)) {
    gaps.push(`Seniority solicitado: ${job.seniority}.`);
  }

  if (languageRaw <= 65) {
    gaps.push("La vacante parece exigir un nivel de inglés más alto que el conversacional declarado.");
  }

  if (locationRaw <= 35) {
    risks.push(`Restricción geográfica: ${job.location_text ?? job.remote_scope ?? "no especificada"}.`);
  }

  const yearsMatch = text.match(/(?:minimum|min\.?|at least)?\s*(\d{1,2})\+?\s+years?/);
  if (yearsMatch && Number(yearsMatch[1]) >= 5) {
    risks.push(`La descripción menciona ${yearsMatch[1]}+ años de experiencia.`);
  }

  const recommendedCv =
    axisScores.infrastructure_support >
      Math.max(
        axisScores.development,
        axisScores.integrations,
        axisScores.technical_functional,
      )
      ? "Infraestructura / soporte"
      : "Desarrollo";

  const requirementAnalysis = [
    {
      area: "technical",
      weight: SCORING_WEIGHTS.technical,
      raw_score: technicalRaw,
      matched: strongMatches,
    },
    {
      area: "experience_functions",
      weight: SCORING_WEIGHTS.experience,
      raw_score: experienceRaw,
      best_axis_score: bestAxis,
    },
    {
      area: "seniority",
      weight: SCORING_WEIGHTS.seniority,
      raw_score: seniorityRaw,
      value: job.seniority,
    },
    {
      area: "language",
      weight: SCORING_WEIGHTS.language,
      raw_score: languageRaw,
    },
    {
      area: "location",
      weight: SCORING_WEIGHTS.location,
      raw_score: locationRaw,
      value: job.location_text ?? job.remote_scope,
    },
    {
      area: "other",
      weight: SCORING_WEIGHTS.other,
      raw_score: otherRaw,
      employment_type: job.employment_type,
    },
  ];

  return {
    job_id: job.id,
    total_score: totalScore,
    score_breakdown: {
      weighted,
      raw: {
        technical: technicalRaw,
        experience: experienceRaw,
        seniority: seniorityRaw,
        language: languageRaw,
        location: locationRaw,
        other: otherRaw,
      },
    },
    axis_scores: axisScores,
    strengths,
    gaps,
    risks,
    requirement_analysis: requirementAnalysis,
    recommended_cv: recommendedCv,
    summary: `${category(totalScore)}. Score ${totalScore}/100 con mayor afinidad en el eje ${Object.entries(axisScores).sort((a, b) => b[1] - a[1])[0][0].replaceAll("_", " ")}.`,
    scoring_version: SCORING_VERSION,
    matched_at: new Date().toISOString(),
  };
}
