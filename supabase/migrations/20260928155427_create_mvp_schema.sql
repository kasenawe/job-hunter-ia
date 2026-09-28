-- Job Hunter IA - MVP schema
-- Initial persistence model for jobs, matching, applications and search profile.

-- ---------------------------------------------------------------------------
-- jobs
-- Raw + normalized representation of vacancies coming from external sources.
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),

  source text not null,
  source_job_id text not null,
  source_url text not null,
  apply_url text,

  title text not null,
  company_name text not null,

  location_text text,
  remote_scope text,
  workplace_type text,
  employment_type text,
  seniority text,
  language text,

  description_text text not null,

  posted_at timestamptz,
  expires_at timestamptz,

  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_interval text,

  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,

  is_active boolean not null default true,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jobs_source_not_blank
    check (btrim(source) <> ''),

  constraint jobs_source_job_id_not_blank
    check (btrim(source_job_id) <> ''),

  constraint jobs_source_url_not_blank
    check (btrim(source_url) <> ''),

  constraint jobs_title_not_blank
    check (btrim(title) <> ''),

  constraint jobs_company_name_not_blank
    check (btrim(company_name) <> ''),

  constraint jobs_description_not_blank
    check (btrim(description_text) <> ''),

  constraint jobs_workplace_type_valid
    check (
      workplace_type is null
      or workplace_type in ('remote', 'hybrid', 'on-site')
    ),

  constraint jobs_salary_min_valid
    check (salary_min is null or salary_min >= 0),

  constraint jobs_salary_max_valid
    check (salary_max is null or salary_max >= 0),

  constraint jobs_salary_range_valid
    check (
      salary_min is null
      or salary_max is null
      or salary_max >= salary_min
    ),

  constraint jobs_last_seen_valid
    check (last_seen_at >= first_seen_at),

  constraint jobs_raw_payload_object
    check (jsonb_typeof(raw_payload) = 'object'),

  constraint jobs_normalized_payload_object
    check (jsonb_typeof(normalized_payload) = 'object'),

  constraint jobs_source_identity_unique
    unique (source, source_job_id)
);


-- ---------------------------------------------------------------------------
-- job_matches
-- Latest evaluation of a job against Maximiliano's active search profile.
-- ---------------------------------------------------------------------------

create table public.job_matches (
  id uuid primary key default gen_random_uuid(),

  job_id uuid not null unique
    references public.jobs(id)
    on delete cascade,

  total_score smallint not null,

  score_breakdown jsonb not null default '{}'::jsonb,
  axis_scores jsonb not null default '{}'::jsonb,

  strengths jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  requirement_analysis jsonb not null default '[]'::jsonb,

  recommended_cv text,
  summary text not null,

  scoring_version text not null,
  matched_at timestamptz not null default now(),

  constraint job_matches_score_valid
    check (total_score between 0 and 100),

  constraint job_matches_summary_not_blank
    check (btrim(summary) <> ''),

  constraint job_matches_scoring_version_not_blank
    check (btrim(scoring_version) <> ''),

  constraint job_matches_score_breakdown_object
    check (jsonb_typeof(score_breakdown) = 'object'),

  constraint job_matches_axis_scores_object
    check (jsonb_typeof(axis_scores) = 'object'),

  constraint job_matches_strengths_array
    check (jsonb_typeof(strengths) = 'array'),

  constraint job_matches_gaps_array
    check (jsonb_typeof(gaps) = 'array'),

  constraint job_matches_risks_array
    check (jsonb_typeof(risks) = 'array'),

  constraint job_matches_requirement_analysis_array
    check (jsonb_typeof(requirement_analysis) = 'array')
);


-- ---------------------------------------------------------------------------
-- applications
-- Human application state. This survives job-feed refreshes.
-- ---------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),

  job_id uuid not null unique
    references public.jobs(id),

  status text not null default 'reviewing',

  cover_letter text,
  notes text,
  applied_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint applications_status_valid
    check (
      status in (
        'reviewing',
        'discarded',
        'applied',
        'interview',
        'rejected',
        'offer'
      )
    )
);


-- ---------------------------------------------------------------------------
-- search_profiles
-- Candidate/search configuration used by the matching engine.
-- MVP supports one active profile.
-- ---------------------------------------------------------------------------

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),

  name text not null unique,
  is_active boolean not null default false,

  target_roles jsonb not null default '[]'::jsonb,
  location_rules jsonb not null default '{}'::jsonb,
  language_rules jsonb not null default '{}'::jsonb,
  candidate_profile jsonb not null default '{}'::jsonb,
  scoring_weights jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint search_profiles_name_not_blank
    check (btrim(name) <> ''),

  constraint search_profiles_target_roles_array
    check (jsonb_typeof(target_roles) = 'array'),

  constraint search_profiles_location_rules_object
    check (jsonb_typeof(location_rules) = 'object'),

  constraint search_profiles_language_rules_object
    check (jsonb_typeof(language_rules) = 'object'),

  constraint search_profiles_candidate_profile_object
    check (jsonb_typeof(candidate_profile) = 'object'),

  constraint search_profiles_scoring_weights_object
    check (jsonb_typeof(scoring_weights) = 'object')
);


-- ---------------------------------------------------------------------------
-- Indexes
-- Only indexes justified by the first MVP screens/workflows.
-- ---------------------------------------------------------------------------

create index jobs_active_posted_idx
  on public.jobs (is_active, posted_at desc);

create index jobs_last_seen_idx
  on public.jobs (last_seen_at desc);

create index job_matches_score_idx
  on public.job_matches (total_score desc);

create index applications_status_idx
  on public.applications (status);

create unique index search_profiles_single_active_idx
  on public.search_profiles (is_active)
  where is_active;


-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_set_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

create trigger applications_set_updated_at
before update on public.applications
for each row
execute function public.set_updated_at();

create trigger search_profiles_set_updated_at
before update on public.search_profiles
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Security
--
-- MVP has no end-user authentication yet.
-- Browser/public clients must not access these tables directly.
-- Backend code will use a Supabase secret key.
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.job_matches enable row level security;
alter table public.applications enable row level security;
alter table public.search_profiles enable row level security;

revoke all on table public.jobs
  from public, anon, authenticated;

revoke all on table public.job_matches
  from public, anon, authenticated;

revoke all on table public.applications
  from public, anon, authenticated;

revoke all on table public.search_profiles
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.jobs
  to service_role;

grant select, insert, update, delete
  on table public.job_matches
  to service_role;

grant select, insert, update, delete
  on table public.applications
  to service_role;

grant select, insert, update, delete
  on table public.search_profiles
  to service_role;

revoke execute
  on function public.set_updated_at()
  from public, anon, authenticated;

grant execute
  on function public.set_updated_at()
  to service_role;