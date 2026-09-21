import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import { getUser } from "@/lib/supabase/server";
import { kickWorkerIfQueued } from "@/lib/worker";

export default async function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  after(() => kickWorkerIfQueued());
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/jobs" className="display text-2xl">
            HireFlow
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted">
            <Link href="/jobs">Jobs</Link>
            <Link href="/ops">Ops</Link>
            <form action={signOut}>
              <button type="submit" className="hover:text-ink">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
