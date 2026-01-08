export interface PyodideConfig {
  pyodideCache: string;
  verbose?: boolean;
  timeout?: number;
}

export interface ExecutionResult {
  status: "success" | "error";
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
