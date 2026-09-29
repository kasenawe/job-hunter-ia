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
    /native english|english native|c2 english|c1 english|native-level english|exceptional (?:written and spoken )?english/.test(
      text,
    )
  ) {
    return 55;
  }

  if (/fluent english|advanced english|professional english|professional written and spoken english/.test(text)) {
    return 65;
  }

  if (/english required|english proficiency|strong english|strong written and verbal english/.test(text)) {
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

function requiredDevelopmentYears(description: string, title: string) {
  const requirements = description.matchAll(/(?:at least|minimum(?: of)?|more than)?\s*(\d{1,2}|three|four|five|six|seven|eight|nine|ten)(?:\s+or more|\+)?\s+years?\s+(?:of\s+)?([^.!?\n]{0,120})/gi);
  const words: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const match of requirements) {
    const context = match[2].toLowerCase();
    if (/^(?:experience\s+)?in\s+(?:technical support|databases|database support|sre)\b/.test(context)) continue;
    const development = /software (?:development|engineering)|web (?:development|application)|backend|frontend|full[- ]stack/.test(context);
    const genericDevelopment = /^(?:professional )?experience\b/.test(context) &&
      !/^experience\s+(?:in|with)\s+(?:technical support|databases|sre)\b/.test(context) &&
      /developer|software engineer|full[- ]stack/i.test(title);
    if (development || genericDevelopment) {
      return { years: words[match[1].toLowerCase()] ?? Number(match[1]), evidence: match[0].trim() };
    }
  }
  return null;
}

function requiredSupportYears(description: string, title: string) {
  if (!/support|database|infrastructure|sre/i.test(title)) return null;
  const requirements = description.matchAll(/(?:at least|minimum(?: of)?|more than)?\s*(\d{1,2}|three|four|five|six|seven|eight|nine|ten)(?:\s+or more|\+)?\s+years?\s+(?:of\s+)?(?:experience\s+)?(?:in\s+)?(technical support|database(?:s| support)?|infrastructure|sre)\b[^.!?\n]{0,90}/gi);
  const words: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const match of requirements) {
    const years = words[match[1].toLowerCase()] ?? Number(match[1]);
    if (years > CANDIDATE_PROFILE.supportExperienceMaxYears) {
      return { years, evidence: match[0].trim() };
    }
  }
  return null;
}

function requiredAdvancedPostgres(description: string, title: string) {
  if (!/postgres|database/i.test(title)) return null;
  const requirement = /(?:postgres(?:ql)? expertise|(?:know|understand) postgresql deeply)[^.!?\n]{0,200}/i.exec(description);
  if (!requirement) return null;
  const internals = ["autovacuum", "wal", "table bloat", "long-running transactions"]
    .filter((term) => includesTerm(requirement[0], term));
  return internals.length >= 2 ? { evidence: requirement[0].trim(), internals } : null;
}

function requiredProductSecurity(description: string, title: string) {
  if (!/\bsecurity (?:software )?engineer\b|\bproduct security\b/i.test(title)) return null;
  if (!CANDIDATE_PROFILE.confirmedNoExperience.includes("product security")) return null;
  const focus = /primary focus[^.!?\n]{0,220}/i.exec(description)
    ?? /security-focused software engineers[^.!?\n]{0,220}/i.exec(description);
  if (!focus || !/security|threat modeling/i.test(focus[0])) return null;
  const activities = ["threat modeling", "fuzzing", "vulnerability response", "static analysis"]
    .filter((term) => includesTerm(description, term));
  return activities.length >= 2 ? { evidence: focus[0].trim(), activities } : null;
}

function requiredConfirmedAbsentTools(description: string, title: string) {
  const mustHave = /\bMust Have:\s*([^\n]{0,1800})/i.exec(description)?.[1]
    ?.split(/\b(?:Nice to Have|Preferred Qualifications)\b/i)[0];
  if (mustHave && /hands-on experience with AWS\b/i.test(mustHave) &&
      CANDIDATE_PROFILE.confirmedNoExperience.includes("AWS")) {
    return { skills: ["AWS"], evidence: /hands-on experience with AWS[^.!?\n]{0,60}/i.exec(mustHave)?.[0] ?? "Must Have: AWS" };
  }

  if (/\b(?:IaC|Terraform provider)\b/i.test(title) &&
      /\bown the Terraform provider\b/i.test(description) &&
      CANDIDATE_PROFILE.confirmedNoExperience.includes("Terraform")) {
    return { skills: ["Terraform"], evidence: "Own the Terraform provider as a core part of the platform" };
  }

  if (!/\b(?:infrastructure|devops|platform) engineer\b/i.test(title)) return null;
  const qualifications = /\bQualifications\b([^\n]{0,2500})/i.exec(description)?.[1]
    ?.split(/\b(?:Nice to Have|Preferred Qualifications)\b/i)[0];
  if (!qualifications) return null;
  const requirements = [
    { skill: "AWS", pattern: /(?:strong proficiency with|hands-on experience with) AWS\b/i },
    { skill: "Terraform", pattern: /hands-on experience (?:utilizing|with) Terraform\b/i },
    { skill: "Kubernetes", pattern: /(?:solid understanding of|hands-on experience with) Kubernetes\b/i },
  ];
  const missing = requirements.filter(({ skill, pattern }) =>
    CANDIDATE_PROFILE.confirmedNoExperience.some((known) => known === skill) && pattern.test(qualifications));
  if (missing.length < 2) return null;
  return {
    skills: missing.map(({ skill }) => skill),
    evidence: missing.map(({ pattern }) => pattern.exec(qualifications)?.[0]).join("; "),
  };
}

function requiredUnverifiedSpecialistSkill(description: string) {
  const requirement = /\(required\)[^.]{0,130}?\b(\d{1,2})\+?\s+years?\b[^.]{0,140}?\b(Go|Golang|Kotlin|Android|Python|Java|C#|Ruby)\b/gi;
  for (const match of description.matchAll(requirement)) {
    const skill = match[2].toLowerCase();
    if (![...CANDIDATE_PROFILE.strongSkills, ...CANDIDATE_PROFILE.transferableSkills].some((known) => known.toLowerCase() === skill)) {
      return { years: Number(match[1]), skill: match[2], evidence: match[0].trim() };
    }
  }
  return null;
}

function requiredSpecialistSkills(description: string) {
  // Only inspect the required portion. Get on Board stores its optional skills
  // after the main description, while other sources use inline bonus headings.
  const requiredText = description.split(/\b(?:nice to have|preferred qualifications|bonus\s*\(helpful,? but not required\)|deseables?|ser[aá] un plus|se valora(?:r[aá])?)\s*:/i)[0];
  const skills = ["AWS", "Terraform", "Kubernetes", "Python", "Django", "FastAPI", "Go", "Golang", "NestJS"];
  const documented = [...CANDIDATE_PROFILE.strongSkills, ...CANDIDATE_PROFILE.transferableSkills];
  const sentences = requiredText.split(/(?<=[.!?])\s+|\n+/);
  const gaps: { skill: string; status: "unmet" | "unverified"; evidence: string }[] = [];

  for (const sentence of sentences) {
    if (!/(?:experiencia (?:s[oó]lida |pr[aá]ctica |profesional |comprobable )?(?:desarrollando|trabajando|dise[nñ]ando|operando|utilizando|con|en)|hands-on experience|strong (?:proficiency|experience|expertise)|dominio de|proficien(?:t|cy) (?:in|with)|expertise (?:in|with)|required)/i.test(sentence)) continue;
    for (const skill of skills) {
      if (!includesTerm(sentence, skill) || documented.some((known) => known.toLowerCase() === skill.toLowerCase()) || gaps.some((gap) => gap.skill === skill)) continue;
      gaps.push({
        skill,
        status: CANDIDATE_PROFILE.confirmedNoExperience.some((known) => known === skill) ? "unmet" : "unverified",
        evidence: sentence.trim().slice(0, 240),
      });
    }
  }
  return gaps;
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
  const describedStaffRole = /\b(?:Responsibilities|Role):?\s+Staff (?:Backend|Software|Frontend|Full[- ]stack) Engineer\b/i.test(job.description_text);
  const effectiveSeniority = describedStaffRole ? "staff" : seniorityFromTitle(job.title) ?? job.seniority;
  const developmentYears = requiredDevelopmentYears(job.description_text, job.title);
  const supportYears = requiredSupportYears(job.description_text, job.title);
  const advancedPostgres = requiredAdvancedPostgres(job.description_text, job.title);
  const productSecurity = requiredProductSecurity(job.description_text, job.title);
  const absentTools = requiredConfirmedAbsentTools(job.description_text, job.title);
  const specialistRequirement = requiredUnverifiedSpecialistSkill(job.description_text);
  const specialistSkills = requiredSpecialistSkills(job.description_text);
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

  const seniorityRaw = (developmentYears && developmentYears.years >= 5) || supportYears
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
  // Central requirements limit the recommendation category without altering
  // the six weighted components; each adjustment remains auditable.
  const requirementsCap = (specialistRequirement && specialistRequirement.years >= 3) || advancedPostgres || productSecurity || absentTools || specialistSkills.length
    ? 64
    : (developmentYears && developmentYears.years >= 5) || supportYears ? 69 : null;
  const scoreAfterRequirements = requirementsCap === null ? baseScore : Math.min(baseScore, requirementsCap);
  const eligibilityCap = location.eligibility === "incompatible" ? 54 : null;
  const totalScore = eligibilityCap === null ? scoreAfterRequirements : Math.min(scoreAfterRequirements, eligibilityCap);

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

  if (supportYears) {
    gaps.push(`Se solicitan ${supportYears.years} años en soporte/bases de datos o áreas afines; el perfil declara 3–6 años en soporte/infraestructura.`);
  }

  if (advancedPostgres) {
    gaps.push(`Se requiere PostgreSQL avanzado (${advancedPostgres.internals.join(", ")}); el perfil acredita SQL/RLS, sin evidencia de esos internals.`);
  }

  if (productSecurity) {
    gaps.push(`El puesto se centra en seguridad de producto (${productSecurity.activities.join(", ")}); el perfil confirma no tener experiencia en esa función.`);
  }

  if (absentTools) {
    gaps.push(`Se requiere experiencia práctica en ${absentTools.skills.join(", ")}; el perfil confirma no haber usado esas herramientas.`);
  }

  if (specialistRequirement && specialistRequirement.years >= 3) {
    gaps.push(`No hay evidencia de ${specialistRequirement.years} años profesionales en ${specialistRequirement.skill}, un requisito explícito.`);
  }

  for (const requirement of specialistSkills) {
    gaps.push(requirement.status === "unmet"
      ? `Se requiere experiencia práctica en ${requirement.skill}; el perfil confirma no haber usado esa herramienta.`
      : `Se requiere experiencia en ${requirement.skill}; no consta experiencia profesional acreditada en el perfil.`);
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

  const requirementAnalysis: Array<{
    area: string;
    criticality: string;
    status: string;
    value?: string | null;
    raw_score?: number;
    skill?: string;
    skills?: string[];
    [key: string]: unknown;
  }> = [
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
      criticality: (developmentYears && developmentYears.years >= 5) || supportYears ? "central" : "important",
      status: seniorityRaw <= 45 ? "gap" : "partial",
      weight: SCORING_WEIGHTS.seniority,
      raw_score: seniorityRaw,
      source_value: job.seniority,
      value: effectiveSeniority,
      development_years: developmentYears,
      support_years: supportYears,
    },
    ...(supportYears ? [{
      area: "support_tenure",
      criticality: "central",
      status: "gap",
      evidence: supportYears.evidence,
      years: supportYears.years,
      candidate_max_years: CANDIDATE_PROFILE.supportExperienceMaxYears,
    }] : []),
    ...(advancedPostgres ? [{
      area: "database_internals",
      criticality: "central",
      status: "unverified",
      evidence: advancedPostgres.evidence,
      skills: advancedPostgres.internals,
      candidate_scope: CANDIDATE_PROFILE.postgresExperience,
    }] : []),
    ...(productSecurity ? [{
      area: "product_security",
      criticality: "central",
      status: "unmet",
      evidence: productSecurity.evidence,
      activities: productSecurity.activities,
    }] : []),
    ...(absentTools ? [{
      area: "confirmed_tool_gap",
      criticality: "central",
      status: "unmet",
      evidence: absentTools.evidence,
      skills: absentTools.skills,
    }] : []),
    ...(specialistRequirement && specialistRequirement.years >= 3 ? [{
      area: "specialist_requirement",
      criticality: "central",
      status: "unverified",
      evidence: specialistRequirement.evidence,
      skill: specialistRequirement.skill,
      years: specialistRequirement.years,
    }] : []),
    ...specialistSkills.map((requirement) => ({
      area: "specialist_skill",
      criticality: "central",
      status: requirement.status,
      evidence: requirement.evidence,
      skill: requirement.skill,
    })),
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
      requirements_adjustment: {
        cap: requirementsCap,
        points_removed: baseScore - scoreAfterRequirements,
        evidence: productSecurity ? productSecurity.evidence
          : absentTools ? absentTools.evidence
          : advancedPostgres ? advancedPostgres.evidence
          : specialistRequirement && specialistRequirement.years >= 3
          ? specialistRequirement.evidence
          : specialistSkills[0] ? specialistSkills[0].evidence
          : developmentYears && developmentYears.years >= 5 ? developmentYears.evidence
          : supportYears?.evidence ?? null,
      },
      eligibility_adjustment: {
        status: location.eligibility,
        cap: eligibilityCap,
        points_removed: scoreAfterRequirements - totalScore,
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
    summary: `${category(totalScore)}. ${location.eligibility === "incompatible" ? `Ubicación incompatible (${location.evidence ?? "alcance restringido"}); ` : ""}Mayor afinidad: ${Object.entries(axisScores).sort((a, b) => b[1] - a[1])[0][0].replaceAll("_", " ")}.${developmentYears && developmentYears.years >= 5 ? ` Requiere ${developmentYears.years} años de desarrollo.` : ""}${supportYears ? ` Requiere ${supportYears.years} años de soporte/áreas afines.` : ""}${advancedPostgres ? " PostgreSQL avanzado sin acreditar." : ""}${productSecurity ? " Seguridad de producto no acreditada." : ""}${absentTools ? ` Requiere ${absentTools.skills.join("/")} sin experiencia previa.` : ""}${specialistRequirement && specialistRequirement.years >= 3 ? ` Acreditar ${specialistRequirement.years} años en ${specialistRequirement.skill}.` : ""}${specialistSkills.length ? ` Requisito central: ${specialistSkills.map(({ skill }) => skill).join(", ")}.` : ""}`,
    scoring_version: SCORING_VERSION,
    matched_at: new Date().toISOString(),
  };
}
