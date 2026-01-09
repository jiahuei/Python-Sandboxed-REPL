export interface PyodideConfig {
  pyodideCache: string;
  verbose?: boolean;
  timeout?: number;
}

export interface ExecutionResult {
  status: "success" | "exception" | "error";
  result: string | null;
  error?: string;
  execution_time_ms: number;
}

export interface ExecuteRequest {
  code: string;
  reset_globals?: boolean;
}

export interface HealthResponse {
  status: "healthy";
  pyodide_loaded: boolean;
  uptime_seconds: number;
  execution_count: number;
}

// Worker message types
export interface WorkerRequest {
  type: "execute";
  id: string;
  code: string;
  resetGlobals: boolean;
}

export interface WorkerResponse {
  type: "result" | "error" | "ready";
  workerId?: number;
  id?: string;
  result?: ExecutionResult;
  error?: string;
}

export interface WorkerInitMessage {
  type: "init";
  config: PyodideConfig;
  workerId: number;
}
