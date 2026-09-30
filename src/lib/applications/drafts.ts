export type DraftLanguage = "es" | "en";

export type JobForDraft = {
  title: string;
  company_name: string;
  description_text: string;
  language?: string | null;
};

type RoleFamily = "development" | "integrations" | "analysis" | "support";

const confirmedTechnologies = [
  { pattern: /\breact(?:\.js)?\b/i, name: "React" },
  { pattern: /\btypescript\b/i, name: "TypeScript" },
  { pattern: /\bnode(?:\.js)?\b/i, name: "Node.js" },
  { pattern: /\bphp\b/i, name: "PHP" },
  { pattern: /\bpostgres(?:ql)?\b/i, name: "PostgreSQL" },
  { pattern: /\bmysql\b/i, name: "MySQL" },
  { pattern: /\bsupabase\b/i, name: "Supabase" },
  { pattern: /\bsvelte\b/i, name: "Svelte" },
  { pattern: /\b(?:rest(?:ful)?\s+)?apis?\b/i, name: "APIs" },
  { pattern: /\bsuitecrm\b/i, name: "SuiteCRM" },
  { pattern: /\bexpress(?:\.js)?\b/i, name: "Express" },
] as const;

function roleFamily(title: string): RoleFamily {
  if (/analyst|analista|business analysis|funcional/i.test(title)) {
    return "analysis";
  }
  if (/support|soporte|infraestruct|sysadmin|operations|help.?desk/i.test(title)) {
    return "support";
  }
  if (/integrat|integraci|implement|implantaci|solutions engineer/i.test(title)) {
    return "integrations";
  }
  return "development";
}

function relevantTechnologies(job: JobForDraft) {
  const text = `${job.title} ${job.description_text}`;
  return confirmedTechnologies.filter(({ pattern }) => pattern.test(text))
    .slice(0, 4)
    .map(({ name }) => name);
}

function joinList(items: string[], language: DraftLanguage) {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${language === "es" ? "y" : "and"} ${items.at(-1)}`;
}

function workFocus(job: JobForDraft, language: DraftLanguage) {
  const text = `${job.title} ${job.description_text}`;
  if (/\bcrm\b/i.test(text)) {
    return language === "es" ? "desarrollar e integrar soluciones CRM" : "develop and integrate CRM solutions";
  }
  if (/support|soporte|incident|incidenc|troubleshoot/i.test(text) && roleFamily(job.title) === "support") {
    return language === "es" ? "resolver incidencias y dar soporte a sistemas y usuarios" : "resolve incidents and support systems and users";
  }
  if (roleFamily(job.title) === "integrations") {
    return language === "es" ? "integrar sistemas y mejorar procesos" : "integrate systems and improve processes";
  }
  if (/full.?stack/i.test(job.title)) {
    return language === "es" ? "desarrollar aplicaciones web de extremo a extremo" : "build end-to-end web applications";
  }
  if (/frontend|front-end/i.test(job.title)) {
    return language === "es" ? "desarrollar interfaces web" : "build web interfaces";
  }
  if (/backend|back-end/i.test(job.title)) {
    return language === "es" ? "desarrollar servicios y APIs" : "build services and APIs";
  }
  if (/integrat(?:ion|ions|e)|integraci[oó]n|integraciones/i.test(text)) {
    return language === "es" ? "integrar sistemas y mejorar procesos" : "integrate systems and improve processes";
  }
  if (/\b(?:rest(?:ful)?\s+)?apis?\b/i.test(text)) {
    return language === "es" ? "desarrollar aplicaciones e integrar APIs" : "build applications and integrate APIs";
  }
  if (/frontend|front-end|backend|back-end|full.?stack/i.test(text)) {
    return language === "es" ? "desarrollar aplicaciones web" : "build web applications";
  }
  return language === "es" ? "aportar al trabajo técnico descrito en la vacante" : "contribute to the technical work described in the role";
}

export function preferredDraftLanguage(job: JobForDraft): DraftLanguage {
  if (/^es(?:pañol|panish)?$/i.test(job.language?.trim() ?? "")) return "es";
  if (/^en(?:glish)?$/i.test(job.language?.trim() ?? "")) return "en";
  const text = job.description_text.slice(0, 1800).toLowerCase();
  const spanish = (text.match(/\b(?:para|con|desarrollo|experiencia|equipo|trabajo|buscamos)\b/g) ?? []).length;
  const english = (text.match(/\b(?:with|for|development|experience|team|work|looking)\b/g) ?? []).length;
  return english > spanish ? "en" : "es";
}

export function generateApplicationDrafts(job: JobForDraft, language: DraftLanguage) {
  const family = roleFamily(job.title);
  const technologies = relevantTechnologies(job);
  const focus = workFocus(job, language);
  const stack = technologies.length > 0
    ? language === "es"
      ? `He trabajado con ${joinList(technologies, language)}, tecnologías presentes en esta propuesta.`
      : `I have worked with ${joinList(technologies, language)}, technologies mentioned in this role.`
    : "";

  if (language === "en") {
    const background = family === "support"
      ? "My background includes application support, infrastructure, incident coordination, and helping users solve technical problems."
      : family === "integrations" || family === "analysis"
        ? "My experience combines systems integration, technical and functional analysis, application development, and support for users and processes."
        : "My experience combines web application development with systems integration, technical support, and incident resolution.";
    return {
      coverLetter: `Dear ${job.company_name} team,\n\nI am interested in the ${job.title} role. The opportunity to ${focus} connects with the kind of work I have done and would like to continue developing.\n\n${background} ${stack} I value understanding the problem, communicating clearly with the people involved, and delivering practical solutions.\n\nI would welcome the opportunity to discuss how my background could contribute to this role. Thank you for considering my application.\n\nBest regards,\nMaximiliano Quintana`,
      whyCompany: `I am interested in joining ${job.company_name} because this role offers the opportunity to ${focus}. ${technologies.length > 0 ? `The use of ${joinList(technologies.slice(0, 3), language)} aligns with my experience, and I would like to contribute while continuing to grow in this area.` : "It aligns with my technical background, and I would like to contribute while continuing to grow in this area."}`,
    };
  }

  const background = family === "support"
    ? "Mi experiencia incluye soporte de aplicaciones, infraestructura, coordinación de incidentes y resolución de problemas junto a usuarios."
    : family === "integrations" || family === "analysis"
      ? "Mi experiencia combina integración de sistemas, análisis técnico y funcional, desarrollo de aplicaciones y soporte a usuarios y procesos."
      : "Mi experiencia combina desarrollo de aplicaciones web con integración de sistemas, soporte técnico y resolución de incidentes.";
  return {
    coverLetter: `Hola, equipo de ${job.company_name}:\n\nMe interesa postularme al puesto de ${job.title}. La oportunidad de ${focus} conecta con el tipo de trabajo que he realizado y en el que quiero seguir creciendo.\n\n${background} ${stack} Me gusta entender el problema, comunicarme con las personas involucradas y construir soluciones prácticas.\n\nMe gustaría conversar sobre cómo podría aportar en este rol. Gracias por considerar mi postulación.\n\nSaludos,\nMaximiliano Quintana`,
    whyCompany: `Me interesa sumarme a ${job.company_name} porque este rol ofrece la oportunidad de ${focus}. ${technologies.length > 0 ? `El uso de ${joinList(technologies.slice(0, 3), language)} está alineado con mi experiencia y me gustaría aportar mientras sigo creciendo en esta área.` : "Es una propuesta alineada con mi perfil técnico y me gustaría aportar mientras sigo creciendo en esta área."}`,
  };
}
