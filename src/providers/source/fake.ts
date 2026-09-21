import type { SourceKind, SourceProvider, SourcedPerson } from "./index";

function githubPerson(
  handle: string,
  name: string,
  score: number,
  repo: string,
  skills: string[],
): SourcedPerson {
  return {
    externalId: handle,
    handle,
    name,
    profileUrl: `https://github.com/${handle}`,
    avatarUrl: null,
    location: "Bengaluru, India",
    email: null,
    bio: `Builds ${skills[0]} things.`,
    company: null,
    blog: null,
    followers: 42,
    publicRepos: 18,
    hireable: true,
    socials: [{ provider: "linkedin", url: `https://www.linkedin.com/in/${handle}` }],
    linkedinUrl: `https://www.linkedin.com/in/${handle}`,
    skills,
    evidence: [
      {
        full_name: `${handle}/${repo}`,
        html_url: `https://github.com/${handle}/${repo}`,
        description: `A ${skills[0]} project`,
        stars: 37,
        pushed_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
        size: 2_400,
        topics: skills.map((s) => s.toLowerCase()),
        languages: ["TypeScript", "Python"],
        deps: skills.map((s) => s.toLowerCase()),
        commits: 148,
        total_commits: 162,
        share: 0.91,
        proves: skills.map((s) => s.toLowerCase()),
      },
    ],
    matched: skills.map((skill) => ({ skill, how: "dependency", repo: `${handle}/${repo}` })),
    missing: [],
    evidenceScore: score,
    summary: `${handle}/${repo} — 148 of 162 commits (91%), 37★. Declared deps include ${skills.join(", ")}.`,
  };
}

function linkedinPerson(
  handle: string,
  name: string,
  score: number,
  role: string,
  company: string,
  skills: string[],
): SourcedPerson {
  const linkedinUrl = `https://www.linkedin.com/in/${handle}`;
  return {
    externalId: handle,
    handle,
    name,
    profileUrl: linkedinUrl,
    avatarUrl: null,
    location: "Bengaluru, India",
    email: null,
    bio: `${role} | ${skills.join(" · ")}`,
    company,
    blog: null,
    followers: 420,
    publicRepos: null,
    hireable: true,
    socials: [{ provider: "linkedin", url: linkedinUrl }],
    linkedinUrl,
    skills,
    evidence: [
      {
        full_name: `${role} @ ${company}`,
        html_url: linkedinUrl,
        description: `Builds ${skills[0]} systems in production.`,
        stars: 0,
        pushed_at: new Date().toISOString(),
        size: 960,
        topics: skills.map((s) => s.toLowerCase()),
        languages: [],
        deps: skills.map((s) => s.toLowerCase()),
        commits: 24,
        total_commits: 24,
        share: 1,
        proves: skills.map((s) => s.toLowerCase()),
      },
    ],
    matched: skills.map((skill) => ({ skill, how: "dependency", repo: `${role} @ ${company}` })),
    missing: [],
    evidenceScore: score,
    summary: `${role} @ ${company} — current role. Declared skills include ${skills.join(", ")}.`,
  };
}

export function fakeSource(kind: SourceKind): SourceProvider {
  if (kind === "github") {
    return {
      key: "github",
      async search() {
        const people = [
          githubPerson("fake-builder", "Fake Builder", 82, "rag-pipeline", ["LangChain", "FastAPI"]),
          githubPerson("fake-shipper", "Fake Shipper", 67, "vector-search", ["Postgres", "TypeScript"]),
        ];
        return {
          ok: true,
          data: {
            people,
            stats: {
              authed: false,
              queries: ["fake"],
              reposFound: 2,
              reposKept: 2,
              reposInspected: 2,
              peopleConsidered: 2,
              droppedLocation: 0,
              droppedScore: 0,
              locationUnknown: 0,
              withLinkedin: 2,
              calls: { core: 0, search: 0, code_search: 0 },
              notes: ["PROVIDER_MODE=fake, no GitHub calls made"],
              partial: false,
            },
          },
          meta: { kind: "source_github", model: "fake", durationMs: 1 },
        };
      },
    };
  }

  return {
    key: "linkedin",
    async search() {
      const people = [
        linkedinPerson("fake-builder", "Fake Builder", 82, "Founding Engineer", "Acme", [
          "LangChain",
          "FastAPI",
        ]),
        linkedinPerson("fake-shipper", "Fake Shipper", 67, "Senior Backend Engineer", "Northstar", [
          "Postgres",
          "TypeScript",
        ]),
      ];
      return {
        ok: true,
        data: {
          people,
          stats: {
            authed: false,
            queries: ["fake"],
            reposFound: 2,
            reposKept: 2,
            reposInspected: 2,
            peopleFound: 2,
            peopleConsidered: 2,
            droppedLocation: 0,
            droppedScore: 0,
            locationUnknown: 0,
            withLinkedin: 2,
            calls: { runs: 0, polls: 0, items: 0 },
            notes: ["PROVIDER_MODE=fake, no Apify calls made"],
            partial: false,
          },
        },
        meta: { kind: "source_linkedin", model: "fake", durationMs: 1 },
      };
    },
  };
}
