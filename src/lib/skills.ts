import type { JobCriteria } from "@/lib/schemas";

/**
 * A JD says "LangChain"; GitHub wants a topic, a language, and — for proof —
 * the string that shows up in a dependency manifest. One skill therefore maps
 * to several different query surfaces.
 */
export type SkillSignal = {
  skill: string;
  slug: string;
  languages: string[];
  topics: string[];
  deps: string[];
  imports: string[];
  known: boolean;
};

export type Signals = {
  must: SkillSignal[];
  nice: SkillSignal[];
  languages: string[];
  topics: string[];
  keywords: string[];
};

type Entry = {
  aliases: string[];
  languages?: string[];
  topics?: string[];
  deps?: string[];
  imports?: string[];
};

const CATALOG: Entry[] = [
  // --- Web front end ---
  {
    aliases: ["react", "react.js", "reactjs"],
    languages: ["TypeScript", "JavaScript"],
    topics: ["react"],
    deps: ["react", "react-dom"],
    imports: ['"from react"'],
  },
  {
    aliases: ["next", "next.js", "nextjs"],
    languages: ["TypeScript", "JavaScript"],
    topics: ["nextjs"],
    deps: ["next"],
    imports: ['"next/navigation"'],
  },
  {
    aliases: ["vue", "vue.js", "vuejs"],
    languages: ["Vue", "JavaScript"],
    topics: ["vue"],
    deps: ["vue"],
  },
  {
    aliases: ["angular"],
    languages: ["TypeScript"],
    topics: ["angular"],
    deps: ["@angular/core"],
  },
  {
    aliases: ["svelte", "sveltekit"],
    languages: ["Svelte", "TypeScript"],
    topics: ["svelte"],
    deps: ["svelte"],
  },
  {
    aliases: ["tailwind", "tailwindcss", "tailwind css"],
    topics: ["tailwindcss"],
    deps: ["tailwindcss"],
  },
  {
    aliases: ["three.js", "threejs", "webgl"],
    languages: ["JavaScript", "TypeScript"],
    topics: ["threejs", "webgl"],
    deps: ["three"],
  },
  // --- Languages ---
  {
    aliases: ["typescript", "ts"],
    languages: ["TypeScript"],
    topics: ["typescript"],
    deps: ["typescript"],
  },
  {
    aliases: ["javascript", "js", "es6"],
    languages: ["JavaScript"],
    topics: ["javascript"],
  },
  {
    aliases: ["python", "python3"],
    languages: ["Python"],
    topics: ["python"],
  },
  { aliases: ["go", "golang"], languages: ["Go"], topics: ["golang"] },
  { aliases: ["rust"], languages: ["Rust"], topics: ["rust"] },
  { aliases: ["java"], languages: ["Java"], topics: ["java"] },
  { aliases: ["kotlin"], languages: ["Kotlin"], topics: ["kotlin"] },
  { aliases: ["swift", "ios"], languages: ["Swift"], topics: ["swift", "ios"] },
  { aliases: ["c++", "cpp"], languages: ["C++"], topics: ["cpp"] },
  { aliases: ["c#", "csharp", ".net", "dotnet"], languages: ["C#"], topics: ["dotnet"] },
  { aliases: ["ruby"], languages: ["Ruby"], topics: ["ruby"] },
  { aliases: ["php"], languages: ["PHP"], topics: ["php"] },
  { aliases: ["scala"], languages: ["Scala"], topics: ["scala"] },
  { aliases: ["elixir"], languages: ["Elixir"], topics: ["elixir"] },
  { aliases: ["sql"], topics: ["sql"] },
  // --- Back end ---
  {
    aliases: ["node", "node.js", "nodejs"],
    languages: ["JavaScript", "TypeScript"],
    topics: ["nodejs"],
    deps: ["express", "fastify", "@types/node"],
  },
  {
    aliases: ["express", "express.js"],
    languages: ["JavaScript", "TypeScript"],
    topics: ["express"],
    deps: ["express"],
  },
  {
    aliases: ["nestjs", "nest.js"],
    languages: ["TypeScript"],
    topics: ["nestjs"],
    deps: ["@nestjs/core"],
  },
  {
    aliases: ["django"],
    languages: ["Python"],
    topics: ["django"],
    deps: ["django"],
    imports: ['"from django"'],
  },
  {
    aliases: ["flask"],
    languages: ["Python"],
    topics: ["flask"],
    deps: ["flask"],
    imports: ['"from flask"'],
  },
  {
    aliases: ["fastapi"],
    languages: ["Python"],
    topics: ["fastapi"],
    deps: ["fastapi"],
    imports: ['"from fastapi"'],
  },
  {
    aliases: ["spring", "spring boot"],
    languages: ["Java", "Kotlin"],
    topics: ["spring-boot"],
    deps: ["spring-boot"],
  },
  {
    aliases: ["rails", "ruby on rails"],
    languages: ["Ruby"],
    topics: ["rails"],
    deps: ["rails"],
  },
  {
    aliases: ["laravel"],
    languages: ["PHP"],
    topics: ["laravel"],
    deps: ["laravel/framework"],
  },
  {
    aliases: ["graphql"],
    topics: ["graphql"],
    deps: ["graphql", "apollo"],
  },
  {
    aliases: ["grpc"],
    topics: ["grpc"],
    deps: ["grpc"],
  },
  // --- AI / ML ---
  {
    aliases: ["langchain"],
    languages: ["Python", "TypeScript"],
    topics: ["langchain"],
    deps: ["langchain"],
    imports: ['"from langchain"'],
  },
  {
    aliases: ["llamaindex", "llama index"],
    languages: ["Python"],
    topics: ["llamaindex"],
    deps: ["llama-index"],
    imports: ['"from llama_index"'],
  },
  {
    aliases: ["rag", "retrieval augmented generation"],
    languages: ["Python", "TypeScript"],
    topics: ["rag", "retrieval-augmented-generation"],
    deps: ["langchain", "llama-index", "chromadb", "pgvector", "pinecone"],
  },
  {
    aliases: ["llm", "llms", "large language models", "genai", "generative ai"],
    languages: ["Python"],
    topics: ["llm", "generative-ai"],
    deps: ["openai", "anthropic", "transformers", "langchain", "groq"],
  },
  {
    aliases: ["openai", "gpt", "chatgpt"],
    topics: ["openai"],
    deps: ["openai"],
    imports: ['"from openai"'],
  },
  {
    aliases: ["pytorch", "torch"],
    languages: ["Python"],
    topics: ["pytorch"],
    deps: ["torch"],
    imports: ['"import torch"'],
  },
  {
    aliases: ["tensorflow", "keras"],
    languages: ["Python"],
    topics: ["tensorflow"],
    deps: ["tensorflow", "keras"],
    imports: ['"import tensorflow"'],
  },
  {
    aliases: ["huggingface", "hugging face", "transformers"],
    languages: ["Python"],
    topics: ["huggingface", "transformers"],
    deps: ["transformers"],
    imports: ['"from transformers"'],
  },
  {
    aliases: ["scikit-learn", "sklearn", "machine learning", "ml"],
    languages: ["Python", "Jupyter Notebook"],
    topics: ["machine-learning"],
    deps: ["scikit-learn", "numpy", "pandas"],
  },
  {
    aliases: ["nlp", "natural language processing"],
    languages: ["Python"],
    topics: ["nlp"],
    deps: ["spacy", "nltk", "transformers"],
  },
  {
    aliases: ["computer vision", "cv", "opencv"],
    languages: ["Python"],
    topics: ["computer-vision", "opencv"],
    deps: ["opencv-python", "torchvision"],
  },
  {
    aliases: ["pandas", "numpy", "data analysis"],
    languages: ["Python", "Jupyter Notebook"],
    topics: ["pandas", "data-analysis"],
    deps: ["pandas", "numpy"],
  },
  {
    aliases: ["vector database", "embeddings", "pgvector", "pinecone", "chroma"],
    topics: ["vector-database", "embeddings"],
    deps: ["pgvector", "pinecone", "chromadb", "qdrant", "weaviate"],
  },
  // --- Data engineering ---
  {
    aliases: ["spark", "pyspark"],
    languages: ["Scala", "Python"],
    topics: ["apache-spark"],
    deps: ["pyspark"],
  },
  { aliases: ["airflow"], languages: ["Python"], topics: ["airflow"], deps: ["apache-airflow"] },
  { aliases: ["dbt"], topics: ["dbt"], deps: ["dbt-core"] },
  { aliases: ["kafka"], topics: ["kafka"], deps: ["kafka", "kafkajs", "confluent-kafka"] },
  { aliases: ["celery"], languages: ["Python"], topics: ["celery"], deps: ["celery"] },
  // --- Data stores ---
  {
    aliases: ["postgres", "postgresql"],
    topics: ["postgresql"],
    deps: ["pg", "psycopg", "postgres", "asyncpg"],
  },
  {
    aliases: ["supabase"],
    topics: ["supabase"],
    deps: ["@supabase/supabase-js", "supabase"],
    imports: ['"@supabase/supabase-js"'],
  },
  { aliases: ["mongodb", "mongo"], topics: ["mongodb"], deps: ["mongoose", "pymongo", "mongodb"] },
  { aliases: ["redis"], topics: ["redis"], deps: ["redis", "ioredis"] },
  { aliases: ["mysql"], topics: ["mysql"], deps: ["mysql", "mysql2", "pymysql"] },
  { aliases: ["elasticsearch"], topics: ["elasticsearch"], deps: ["elasticsearch"] },
  { aliases: ["prisma"], topics: ["prisma"], deps: ["prisma", "@prisma/client"] },
  { aliases: ["drizzle"], topics: ["drizzle-orm"], deps: ["drizzle-orm"] },
  { aliases: ["sqlalchemy"], languages: ["Python"], topics: ["sqlalchemy"], deps: ["sqlalchemy"] },
  { aliases: ["firebase"], topics: ["firebase"], deps: ["firebase", "firebase-admin"] },
  // --- Infra ---
  { aliases: ["docker"], topics: ["docker"], deps: ["docker"] },
  { aliases: ["kubernetes", "k8s"], languages: ["Go"], topics: ["kubernetes"], deps: ["kubernetes"] },
  { aliases: ["terraform", "iac"], languages: ["HCL"], topics: ["terraform"] },
  { aliases: ["aws"], topics: ["aws"], deps: ["boto3", "aws-sdk", "@aws-sdk/client-s3"] },
  { aliases: ["gcp", "google cloud"], topics: ["gcp"], deps: ["google-cloud"] },
  { aliases: ["azure"], topics: ["azure"], deps: ["azure"] },
  { aliases: ["devops", "ci/cd", "cicd", "github actions"], topics: ["devops", "github-actions"] },
  // --- Mobile ---
  {
    aliases: ["flutter", "dart"],
    languages: ["Dart"],
    topics: ["flutter"],
    deps: ["flutter"],
  },
  {
    aliases: ["react native", "react-native"],
    languages: ["TypeScript", "JavaScript"],
    topics: ["react-native"],
    deps: ["react-native"],
  },
  { aliases: ["android"], languages: ["Kotlin", "Java"], topics: ["android"] },
  // --- Testing / misc ---
  { aliases: ["playwright"], topics: ["playwright"], deps: ["playwright", "@playwright/test"] },
  { aliases: ["cypress"], topics: ["cypress"], deps: ["cypress"] },
  { aliases: ["jest"], topics: ["jest"], deps: ["jest"] },
  { aliases: ["pytest"], languages: ["Python"], topics: ["pytest"], deps: ["pytest"] },
  { aliases: ["selenium"], topics: ["selenium"], deps: ["selenium"] },
  { aliases: ["webrtc"], topics: ["webrtc"], deps: ["simple-peer", "aiortc"] },
  { aliases: ["websockets", "websocket"], topics: ["websocket"], deps: ["ws", "socket.io"] },
  { aliases: ["stripe", "payments"], topics: ["stripe"], deps: ["stripe"] },
  { aliases: ["unity", "game development"], languages: ["C#"], topics: ["unity", "gamedev"] },
  { aliases: ["blockchain", "solidity", "web3"], languages: ["Solidity"], topics: ["blockchain", "web3"], deps: ["ethers", "web3"] },
];

const LOOKUP = new Map<string, Entry>();
for (const entry of CATALOG) {
  for (const alias of entry.aliases) LOOKUP.set(normalize(alias), entry);
}

/** Words a JD wraps around a skill that carry no search signal. */
const FILLER =
  /\b(\d+\s*\+?\s*(years?|yrs?)|years?|yrs?|experience|experienced|expertise|expert|strong|solid|proven|deep|hands\s*on|handson|working|knowledge|understanding|familiarity|familiar|good|excellent|advanced|basic|senior|junior|mid|level|lead|staff|principal|using|with|in|of|and|or|the|a|an|plus|must|have|ability|to|skills?|proficiency|proficient)\b/g;

export function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFiller(value: string) {
  return normalize(value).replace(FILLER, " ").replace(/\s+/g, " ").trim();
}

/**
 * Resolve one JD phrase to search signals. A phrase like
 * "Strong Python (3+ years) with FastAPI" yields both the Python and FastAPI
 * entries, so a single bullet can contribute more than one signal.
 */
export function signalsFor(skill: string): SkillSignal[] {
  const core = stripFiller(skill);
  if (!core) return [];

  const direct = LOOKUP.get(core);
  if (direct) return [toSignal(skill, core, direct)];

  const found: SkillSignal[] = [];
  const seen = new Set<Entry>();
  // Longest alias first so "react native" wins over "react".
  const tokens = core.split(" ").filter(Boolean);
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let i = 0; i + size <= tokens.length; i += 1) {
      const phrase = tokens.slice(i, i + size).join(" ");
      const entry = LOOKUP.get(phrase);
      if (entry && !seen.has(entry)) {
        seen.add(entry);
        found.push(toSignal(skill, phrase, entry));
      }
    }
  }
  if (found.length) return found;

  // Unknown skill: still usable as a topic guess and a manifest substring, but
  // flagged so query building does not lean on it.
  const slug = core.replace(/\s+/g, "-");
  return [
    {
      skill,
      slug,
      languages: [],
      topics: slug.length >= 3 && !slug.includes("-") ? [slug] : [],
      deps: core.length >= 4 ? [core.replace(/\s+/g, "-")] : [],
      imports: [],
      known: false,
    },
  ];
}

function toSignal(skill: string, slug: string, entry: Entry): SkillSignal {
  return {
    skill,
    slug,
    languages: entry.languages ?? [],
    topics: entry.topics ?? [],
    deps: entry.deps ?? [],
    imports: entry.imports ?? [],
    known: true,
  };
}

export function deriveSignals(
  criteria: Pick<JobCriteria, "must_have" | "nice_to_have">,
): Signals {
  const must = dedupe(criteria.must_have.flatMap(signalsFor));
  const nice = dedupe(criteria.nice_to_have.flatMap(signalsFor)).filter(
    (signal) => !must.some((m) => m.slug === signal.slug),
  );
  const all = [...must, ...nice];

  // Catalog topics are real GitHub topics; guessed ones are just a slug that
  // might not exist. Keep both, but let the known ones drive the tight queries.
  const knownTopics = rank(all.filter((s) => s.known).flatMap((s) => s.topics));
  const guessedTopics = rank(all.filter((s) => !s.known).flatMap((s) => s.topics));

  return {
    must,
    nice,
    languages: rank(all.flatMap((s) => s.languages)),
    topics: [...knownTopics, ...guessedTopics.filter((t) => !knownTopics.includes(t))],
    keywords: rank(all.map((s) => s.slug)),
  };
}

function dedupe(signals: SkillSignal[]) {
  const map = new Map<string, SkillSignal>();
  for (const signal of signals) {
    const existing = map.get(signal.slug);
    if (!existing || (!existing.known && signal.known)) map.set(signal.slug, signal);
  }
  return [...map.values()];
}

/** Most-mentioned first, so query building can take the strongest few. */
function rank(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value);
}
