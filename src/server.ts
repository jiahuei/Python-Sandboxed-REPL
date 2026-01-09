import { PyodideManager } from "./pyodide-manager";
import { WorkerPool } from "./worker-pool";
import type { ExecuteRequest, HealthResponse } from "./types";

let pyodideManager: PyodideManager | null = null;
let workerPool: WorkerPool | null = null;
let serverConfig: ServerConfig | null = null;
let serverStartTime = Date.now();

interface ServerConfig {
  port: number;
  resetGlobals: boolean;
  pyodideCache: string;
  workerCount: number;
}

export async function startServer(config: ServerConfig) {
  // Store config for use in handleExecute
  serverConfig = config;

  console.log("Initializing execution environment...");

  if (config.workerCount > 0) {
    // Use worker pool
    console.log(`Starting with ${config.workerCount} workers...`);
    workerPool = new WorkerPool({
      workerCount: config.workerCount,
      pyodideConfig: {
        pyodideCache: config.pyodideCache,
        verbose: true,
        timeout: 30000,
      },
    });
    await workerPool.initialize();
  } else {
    // Use single-threaded PyodideManager (backward compatible)
    console.log("Starting in single-threaded mode...");
    pyodideManager = new PyodideManager({
      pyodideCache: config.pyodideCache,
      verbose: true,
      timeout: 30000,
    });
    await pyodideManager.initialize();
  }

  console.log("Execution environment ready");

  // Start HTTP server
  const server = Bun.serve({
    port: config.port,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS headers
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      // Handle OPTIONS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers, status: 204 });
      }

      // GET /health
      if (url.pathname === "/health" && req.method === "GET") {
        return handleHealth(headers);
      }

      // POST /python
      if (url.pathname === "/python" && req.method === "POST") {
        return handleExecute(req, serverConfig!.resetGlobals, headers, serverConfig!);
      }

      // 404
      return new Response("Not Found", { status: 404, headers });
    },
  });

  console.log(`Server listening on http://localhost:${server.port}`);
}

async function handleHealth(
  headers: Record<string, string>
): Promise<Response> {
  const health: HealthResponse = {
    status: "healthy",
    pyodide_loaded: workerPool
      ? workerPool.pyodideLoaded()
      : pyodideManager !== null,
    uptime_seconds: Math.floor((Date.now() - serverStartTime) / 1000),
    execution_count:
      workerPool?.getExecutionCount() ||
      pyodideManager?.getExecutionCount() ||
      0,
  };

  return Response.json(health, { headers });
}

async function handleExecute(
  req: Request,
  defaultResetGlobals: boolean,
  headers: Record<string, string>,
  config: ServerConfig
): Promise<Response> {
  try {
    // Parse request
    const body = (await req.json()) as ExecuteRequest;

    if (!body.code || typeof body.code !== "string") {
      return Response.json(
        { status: "error", error: 'Missing or invalid "code" field' },
        { status: 400, headers }
      );
    }

    // IMPORTANT: Multiple workers (>1) always use reset_globals=true
    const resetGlobals =
      config.workerCount > 1 ? true : body.reset_globals ?? defaultResetGlobals;

    // Execute via worker pool or manager
    const result = workerPool
      ? await workerPool.execute(body.code, resetGlobals)
      : await pyodideManager!.execute(body.code, resetGlobals);

    // Always return 200 for Python execution (errors are treated as output)
    return Response.json(result, { status: 200, headers });
  } catch (error: any) {
    return Response.json(
      {
        status: "error",
        error: error.message || "Internal server error",
      },
      { status: 500, headers }
    );
  }
}
