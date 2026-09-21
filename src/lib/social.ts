export type SocialAccount = { provider: string; url: string };

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;

/**
 * Canonical form is linkedin.com/in/<slug>. Real profiles arrive with tracking
 * params, a missing www, and trailing sections like /details/projects/, and all
 * of those have to collapse to one string for it to work as a dedupe key.
 * Company and school pages are not people, so they resolve to null.
 */
export function canonicalLinkedin(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!LINKEDIN_HOST.test(parsed.hostname)) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const at = segments.indexOf("in");
  const slug = at === -1 ? null : segments[at + 1];
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug.toLowerCase()}`;
}

/**
 * GitHub files some LinkedIn links under the "generic" provider rather than
 * "linkedin", so the URL host decides and the label is ignored. The website
 * field is worth a look too, since people sometimes put LinkedIn there.
 */
export function linkedinFrom(
  accounts: SocialAccount[],
  website?: string | null,
): string | null {
  for (const account of accounts) {
    const url = canonicalLinkedin(account?.url);
    if (url) return url;
  }
  return canonicalLinkedin(website);
}

/**
 * A link the recruiter clicks, not a request we make. Their own browser and
 * their own session do the searching, which keeps us off LinkedIn entirely.
 */
export function linkedinSearchUrl(
  name: string | null,
  company: string | null,
): string | null {
  const keywords = [name, company]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!keywords) return null;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

/** Pull a LinkedIn URL out of pasted profile text. */
export function linkedinFromText(text: string): string | null {
  const match = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s"'<>)\]]+/i);
  return match ? canonicalLinkedin(match[0]) : null;
}

/** Non-LinkedIn links, kept because they are often the only contact route. */
export function otherSocials(accounts: SocialAccount[]): SocialAccount[] {
  return accounts.filter((account) => !canonicalLinkedin(account?.url));
}
