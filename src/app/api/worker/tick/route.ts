import { serverEnv } from "@/lib/env";
import { runWorkerTick } from "@/lib/worker";

export const maxDuration = 300;

function authorized(request: Request) {
  const { workerSecret, cronSecret } = serverEnv();
  const header = request.headers.get("x-worker-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (workerSecret && (header === workerSecret || bearer === workerSecret)) return true;
  if (cronSecret && bearer === cronSecret) return true;
  return false;
}

async function tick(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWorkerTick("cron");
  return Response.json(result);
}

export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}
