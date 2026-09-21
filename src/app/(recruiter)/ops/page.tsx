import { createClient } from "@/lib/supabase/server";
import { RunScoringButton } from "@/components/run-scoring-button";

export default async function OpsPage() {
  const supabase = await createClient();
  const [{ data: runs }, { data: calls }] = await Promise.all([
    supabase.from("worker_runs").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("provider_calls").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl">Ops</h1>
          <p className="mt-2 text-muted">
            Worker ticks and provider calls. Failures stay visible — never rewritten as zeros.
          </p>
        </div>
        <RunScoringButton />
      </div>
      <h2 className="display mt-10 text-2xl">Worker runs</h2>
      <Table
        rows={(runs ?? []).map((r) => [
          r.created_at,
          r.worker_id,
          String(r.claimed),
          String(r.completed),
          String(r.failed),
          r.notes ?? "",
        ])}
        head={["When", "Worker", "Claimed", "Done", "Failed", "Notes"]}
      />
      <h2 className="display mt-10 text-2xl">Provider calls</h2>
      <Table
        rows={(calls ?? []).map((c) => [
          c.created_at,
          c.kind,
          c.ok ? "ok" : "fail",
          c.model ?? "",
          c.error ?? "",
        ])}
        head={["When", "Kind", "Status", "Model", "Error"]}
      />
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="p-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="p-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className="p-6 text-muted" colSpan={head.length}>
                Nothing yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
