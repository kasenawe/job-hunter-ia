import { seniorityFromTitle } from "@/lib/jobs/seniority";
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
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
}

function uniqueMatches(text: string, terms: readonly string[]) {
  const aliases: Record<string, string> = {
    "node.js": "node",
    apis: "api",
    postgres: "postgresql",
  };
  return [...new Set(terms.filter((term) => includesTerm(text, term)).map((term) => aliases[term] ?? term))];
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

  const bodyMatches = allMatches.filter((term) => !titleMatches.includes(term));
  return clamp(titleMatches.length * 40 + Math.min(bodyMatches.length, 4) * 8);
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
  const description = job.description_text.toLowerCase();
  const requiresUsAuthorization = /(?:must be|be) legally authorized to work in (?:the )?(?:united states|u\.?s\.?a?\.?)/.test(description) ||
    /restricted to (?:permanent )?(?:u\.?s\.?|united states) residents/.test(description);

  if (requiresUsAuthorization) {
    return { raw: 10, eligibility: "incompatible" as const, evidence: "Autorización o residencia en EE. UU. exigida" };
  }

  if (job.workplace_type && job.workplace_type !== "remote") {
    return /uruguay|montevideo/.test(location)
      ? { raw: 100, eligibility: "eligible" as const, evidence: job.location_text }
      : { raw: 20, eligibility: location ? "incompatible" as const : "uncertain" as const, evidence: job.location_text };
  }

  if (scope === "worldwide" || scope === "latam") return { raw: 100, eligibility: "eligible" as const, evidence: job.remote_scope };
  if (scope === "americas") return { raw: 90, eligibility: "eligible" as const, evidence: job.remote_scope };

  if (/uruguay|montevideo/.test(location)) return { raw: 100, eligibility: "eligible" as const, evidence: job.location_text };
  if (/latam|latin america|south america/.test(location)) return { raw: 95, eligibility: "eligible" as const, evidence: job.location_text };
  if (/americas?/.test(location)) return { raw: 90, eligibility: "eligible" as const, evidence: job.location_text };
  const namedRegion = /\b(?:canada|usa|united states|north america|europe|eu|uk|united kingdom|apac|asia|australia|brazil|brasil|poland|ukraine|norway|germany|spain|france|ireland|netherlands|portugal)\b/.test(location);
  if (location && !/^(remote|various|multiple locations)$/.test(location) && (scope === "restricted" || namedRegion)) {
    return { raw: /canada|usa|united states|north america/.test(location) ? 35 : 10, eligibility: "incompatible" as const, evidence: job.location_text };
  }

  return { raw: scope === "restricted" ? 25 : 70, eligibility: "uncertain" as const, evidence: job.location_text ?? job.remote_scope };
}

function scoreOther(job: JobForScoring) {
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

  return clamp(score);
}

function requiredDevelopmentYears(description: string) {
  const match = description.match(/(?:at least|minimum(?: of)?|more than)?\s*(\d{1,2}|three|four|five|six|seven|eight|nine|ten)(?:\s+or more|\+)?\s+years?\s+(?:of\s+)?(?:professional\s+)?(?:experience\s+(?:in|with)\s+)?(?:web development|software development|software engineering|engineering|backend|frontend|full[- ]stack)/i);
  if (!match) return null;
  const words: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return { years: words[match[1].toLowerCase()] ?? Number(match[1]), evidence: match[0].trim() };
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
  const effectiveSeniority = seniorityFromTitle(job.title) ?? job.seniority;
  const developmentYears = requiredDevelopmentYears(job.description_text);
  const desirableStart = /\b(?:nice to have|preferred qualifications|bonus\s*\(helpful,? but not required\))/i.exec(job.description_text)?.index;
  const desirableMatches = desirableStart === undefined
    ? []
    : uniqueMatches(job.description_text.slice(desirableStart, desirableStart + 700), [
        ...CANDIDATE_PROFILE.strongSkills,
        ...CANDIDATE_PROFILE.transferableSkills,
      ]);

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

  const seniorityRaw = developmentYears && developmentYears.years >= 5
    ? Math.min(scoreSeniority(effectiveSeniority), 45)
    : scoreSeniority(effectiveSeniority);
  const languageRaw = scoreLanguage(text, job.language);
  const location = scoreLocation(job);
  const locationRaw = location.raw;
  const otherRaw = scoreOther(job);

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

  const baseScore = clamp(
    Object.values(weighted).reduce((sum, value) => sum + value, 0),
  );
  // Keep the six weighted components, but prevent a confirmed exclusion from
  // appearing as an actionable match. The cap is recorded in the breakdown.
  const eligibilityCap = location.eligibility === "incompatible" ? 54 : null;
  const totalScore = eligibilityCap === null ? baseScore : Math.min(baseScore, eligibilityCap);

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

  if (effectiveSeniority && ["senior", "lead", "staff", "principal", "manager", "director"].includes(effectiveSeniority)) {
    gaps.push(`Seniority solicitado: ${effectiveSeniority}.`);
  }

  if (developmentYears && developmentYears.years >= 5) {
    gaps.push(`Se solicitan ${developmentYears.years} años de desarrollo profesional; el perfil acredita aproximadamente 2.`);
  }

  if (languageRaw <= 65) {
    gaps.push("La vacante parece exigir un nivel de inglés más alto que el conversacional declarado.");
  }

  if (location.eligibility === "incompatible") {
    risks.push(`Ubicación incompatible con Uruguay: ${location.evidence ?? "restricción de residencia o trabajo"}.`);
  } else if (location.eligibility === "uncertain") {
    risks.push("Alcance geográfico no confirmado; verificar elegibilidad antes de postular.");
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
      criticality: "important",
      status: strongMatches.length ? "matched" : transferableMatches.length ? "transferable" : "unknown",
      weight: SCORING_WEIGHTS.technical,
      raw_score: technicalRaw,
      matched: strongMatches,
      transferable: transferableMatches,
    },
    {
      area: "experience_functions",
      criticality: "important",
      status: bestAxis >= 70 ? "matched" : "partial",
      weight: SCORING_WEIGHTS.experience,
      raw_score: experienceRaw,
      best_axis_score: bestAxis,
    },
    {
      area: "seniority",
      criticality: developmentYears && developmentYears.years >= 5 ? "central" : "important",
      status: seniorityRaw <= 45 ? "gap" : "partial",
      weight: SCORING_WEIGHTS.seniority,
      raw_score: seniorityRaw,
      source_value: job.seniority,
      value: effectiveSeniority,
      development_years: developmentYears,
    },
    {
      area: "language",
      criticality: "important",
      status: languageRaw <= 65 ? "gap" : "uncertain",
      weight: SCORING_WEIGHTS.language,
      raw_score: languageRaw,
    },
    {
      area: "location",
      criticality: "central",
      status: location.eligibility === "incompatible" ? "unmet" : location.eligibility === "eligible" ? "matched" : "uncertain",
      weight: SCORING_WEIGHTS.location,
      raw_score: locationRaw,
      value: location.evidence,
    },
    {
      area: "other",
      criticality: "preference",
      status: "context",
      weight: SCORING_WEIGHTS.other,
      raw_score: otherRaw,
      employment_type: job.employment_type,
    },
    ...(desirableStart === undefined ? [] : [{
      area: "desirable_requirements",
      criticality: "desirable",
      status: desirableMatches.length ? "matched" : "unknown",
      evidence: job.description_text.slice(desirableStart, desirableStart + 160),
      matched: desirableMatches,
    }]),
  ];

  return {
    job_id: job.id,
    total_score: totalScore,
    score_breakdown: {
      weighted,
      base_score: baseScore,
      eligibility_adjustment: {
        status: location.eligibility,
        cap: eligibilityCap,
        points_removed: baseScore - totalScore,
        evidence: location.evidence,
      },
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
    summary: `${category(totalScore)}. ${location.eligibility === "incompatible" ? `Ubicación incompatible (${location.evidence ?? "alcance restringido"}); ` : ""}Mayor afinidad: ${Object.entries(axisScores).sort((a, b) => b[1] - a[1])[0][0].replaceAll("_", " ")}.${developmentYears && developmentYears.years >= 5 ? ` Requiere ${developmentYears.years} años de desarrollo.` : ""}`,
    scoring_version: SCORING_VERSION,
    matched_at: new Date().toISOString(),
  };
}
