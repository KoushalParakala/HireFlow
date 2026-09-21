import { signIn } from "@/actions/auth";
import { publicEnv } from "@/lib/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const configured = publicEnv().configured;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-[0.2em] text-accent">HireFlow</p>
      <h1 className="display mt-3 text-5xl">Sign in to run a role</h1>
      <p className="mt-4 text-muted">
        Recruiters only. Candidates never log in — they get a private link.
      </p>
      {!configured && (
        <p className="mt-6 rounded-lg border border-line bg-paper-2 p-4 text-sm">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and the publishable key to{" "}
          <code>.env.local</code>.
        </p>
      )}
      {error && (
        <p className="mt-6 rounded-lg border border-line bg-paper-2 p-4 text-sm text-danger">
          {error}
        </p>
      )}
      <form action={signIn} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={next ?? "/jobs"} />
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
