import { PyodideManager } from "./pyodide-manager";
import type { ExecuteRequest, HealthResponse } from "./types";

let pyodideManager: PyodideManager | null = null;
let serverStartTime = Date.now();

interface ServerConfig {
  port: number;
  resetGlobals: boolean;
  pyodideCache: string;
}

export async function startServer(config: ServerConfig) {
  // Initialize Pyodide
  console.log("Initializing Pyodide for server...");
  pyodideManager = new PyodideManager({
    pyodideCache: config.pyodideCache,
    verbose: true,
    timeout: 30000,
  });
  await pyodideManager.initialize();
  console.log("Pyodide ready");

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
        return handleExecute(req, config.resetGlobals, headers);
      }

      // 404
      return new Response("Not Found", { status: 404, headers });
    },
  });

  console.log(`Server listening on http://localhost:${server.port}`);
}

async function handleHealth(headers: HeadersInit): Promise<Response> {
  const health: HealthResponse = {
    status: "healthy",
    pyodide_loaded: pyodideManager !== null,
    uptime_seconds: Math.floor((Date.now() - serverStartTime) / 1000),
    executions_count: pyodideManager?.getExecutionCount() || 0,
  };

  return Response.json(health, { headers });
}

async function handleExecute(
  req: Request,
  defaultResetGlobals: boolean,
  headers: HeadersInit
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

    // Execute - all Python executions (including errors) return status 200
    const resetGlobals = body.reset_globals ?? defaultResetGlobals;
    const result = await pyodideManager!.execute(body.code, resetGlobals);

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
