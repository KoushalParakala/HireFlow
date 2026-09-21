function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    supabaseUrl: url ?? "",
    supabasePublishableKey: key ?? "",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    configured: Boolean(url && key),
  };
}

export function serverEnv() {
  const pub = publicEnv();
  return {
    ...pub,
    supabaseSecret:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
    workerSecret: process.env.WORKER_SECRET ?? "",
    cronSecret: process.env.CRON_SECRET ?? "",
    providerMode: (process.env.PROVIDER_MODE ?? "fake") as "fake" | "real",
    groqApiKey: process.env.GROQ_API_KEY ?? "",
    groqModelSmart:
      process.env.GROQ_MODEL_SMART ?? "openai/gpt-oss-120b",
    groqModelFast: process.env.GROQ_MODEL_FAST ?? "openai/gpt-oss-20b",
    gmailUser: process.env.GMAIL_USER ?? "",
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD ?? "",
    githubToken: process.env.GITHUB_TOKEN ?? "",
    apifyToken: process.env.APIFY_TOKEN ?? "",
    apifyLinkedinActor:
      process.env.APIFY_LINKEDIN_ACTOR ?? "apimaestro/linkedin-profile-detail",
    apifyGoogleSearchActor:
      process.env.APIFY_GOOGLE_SEARCH_ACTOR ?? "apify/google-search-scraper",
  };
}

export function requireAdminEnv() {
  const env = serverEnv();
  return {
    ...env,
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl),
    supabasePublishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      env.supabasePublishableKey,
    ),
    supabaseSecret: required("SUPABASE_SERVICE_ROLE_KEY", env.supabaseSecret),
  };
}
