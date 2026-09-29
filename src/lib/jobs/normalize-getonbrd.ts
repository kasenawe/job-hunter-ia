import { seniorityFromTitle } from "@/lib/jobs/seniority";

type RelatedLocation = { id?: string | number; attributes?: { name?: string } };

export type GetOnBrdJob = {
  id?: string;
  links?: { public_url?: string };
  attributes?: {
    title?: string;
    description?: string;
    projects?: string;
    functions?: string;
    desirable?: string;
    benefits?: string;
    remote?: boolean;
    remote_modality?: string;
    remote_zone?: string | null;
    countries?: string[];
    location_tenants?: { data?: RelatedLocation[] };
    location_regions?: { data?: RelatedLocation[] };
    location_cities?: { data?: RelatedLocation[] };
    company?: { data?: { attributes?: { name?: string } } };
    seniority?: { data?: { attributes?: { locale_key?: string; name?: string } } };
    lang?: string;
    min_salary?: number | null;
    max_salary?: number | null;
    published_at?: number;
  };
};

const RELEVANT_TITLE = /(?:full[ -]?stack|front[ -]?end|back[ -]?end|developer|desarrollador|software engineer|integration|integraci[oó]n|implementation|implementaci[oó]n|systems? analyst|analista (?:de sistemas|funcional|t[eé]cnico|de soporte)|business analyst|soporte|technical support|support engineer|infrastructure|infraestructura|sysadmin|administrator|network automation|automatizaci[oó]n|solutions? engineer|technical consultant|consultor t[eé]cnico|product engineer)/i;
const EXCLUDED_TITLE = /(?:marketing|\bsales\b|ventas|cybersecurity|security engineer|data scientist|machine learning|\blead\b|principal|staff|director|manager)/i;

const names = (items?: RelatedLocation[]) =>
  (items ?? []).map((item) => item.attributes?.name ?? (typeof item.id === "string" ? item.id : "")).filter(Boolean);

function plain(value?: string) {
  return (value ?? "")
    .replace(/<\/(?:li|p|div|h[1-6])\s*>/gi, ". ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\.\.\s+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRelevantGetOnBrdJob(job: GetOnBrdJob) {
  const title = job.attributes?.title ?? "";
  return RELEVANT_TITLE.test(title) && !EXCLUDED_TITLE.test(title);
}

export function normalizeGetOnBrdJob(job: GetOnBrdJob) {
  const attributes = job.attributes;
  const id = job.id?.trim();
  const sourceUrl = job.links?.public_url;
  const title = attributes?.title?.trim();
  const company = attributes?.company?.data?.attributes?.name?.trim();
  if (!id || !sourceUrl?.startsWith("https://www.getonbrd.com/jobs/") || !title || !company || !attributes) return null;

  const tenants = names(attributes.location_tenants?.data);
  const regions = names(attributes.location_regions?.data);
  const cities = names(attributes.location_cities?.data);
  const countries = (attributes.countries ?? []).filter((country) => country !== "Remote");
  const remote = attributes.remote_modality === "fully_remote" || attributes.remote_modality === "remote_local";
  const worldwide = attributes.remote_modality === "fully_remote";
  const acceptedLocations = [...tenants, ...regions, ...countries];
  const locationText = worldwide ? "Worldwide" : [...new Set([...cities, ...acceptedLocations])].join(", ") || null;
  const allowsUruguay = acceptedLocations.some((name) => /uruguay|montevideo|south america|latin america|latam|americas/i.test(name));
  const knownRestriction = acceptedLocations.length > 0 && !allowsUruguay;
  const workplaceType = remote ? "remote" : attributes.remote_modality === "hybrid" ? "hybrid" : "on-site";
  const scope = worldwide ? "worldwide" : allowsUruguay && regions.some((name) => /south america|latin america|latam/i.test(name)) ? "latam" : knownRestriction ? "restricted" : null;
  const requiredDescription = [attributes.projects, attributes.functions, attributes.description]
    .map(plain).filter(Boolean).join("\n\n");
  const desirable = plain(attributes.desirable);
  const description = [requiredDescription, desirable && `Deseable: ${desirable}`]
    .filter(Boolean).join("\n\n") || "Descripción no disponible";
  const posted = attributes.published_at && Number.isFinite(attributes.published_at)
    ? new Date(attributes.published_at * 1000).toISOString() : null;
  const seniority = seniorityFromTitle(title) ?? ({ junior: "junior", senior: "senior", "semi-senior": "mid" }[attributes.seniority?.data?.attributes?.locale_key ?? ""] ?? null);

  return {
    source: "getonbrd",
    source_job_id: id,
    source_url: sourceUrl,
    apply_url: null,
    title,
    company_name: company,
    location_text: locationText,
    remote_scope: scope,
    workplace_type: workplaceType,
    employment_type: null,
    seniority,
    language: attributes.lang === "en" ? "English" : attributes.lang === "es" ? "Spanish" : null,
    description_text: description,
    posted_at: posted,
    expires_at: null,
    salary_min: attributes.min_salary ?? null,
    salary_max: attributes.max_salary ?? null,
    salary_currency: attributes.min_salary != null || attributes.max_salary != null ? "USD" : null,
    salary_interval: attributes.min_salary != null || attributes.max_salary != null ? "month" : null,
    raw_payload: job,
    normalized_payload: {
      normalization_version: "getonbrd-v2",
      source_remote_modality: attributes.remote_modality ?? null,
      source_remote_zone: attributes.remote_zone ?? null,
      source_countries: attributes.countries ?? [],
      accepted_locations: acceptedLocations,
      geographic_eligibility: worldwide || allowsUruguay ? "eligible" : knownRestriction ? "incompatible" : "uncertain",
    },
    is_active: worldwide || allowsUruguay,
  };
}
