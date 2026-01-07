import { beforeAll, expect, test } from "bun:test";
import { loadPyodide } from "pyodide";
import { XMLHttpRequest as OriginalXMLHttpRequest } from "xmlhttprequest-ssl";

const forbiddenRequestHeaders = [
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "content-transfer-encoding",
  "cookie",
  "cookie2",
  "date",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
];

class WrappedXMLHttpRequest extends OriginalXMLHttpRequest {
  constructor(options?: any) {
    super({ ...options, syncPolicy: "enabled" });

    const originalSetRequestHeader = this.setRequestHeader;
    this.setRequestHeader = function (header: string, value: string) {
      const normalizedHeader = header.toLowerCase();

      if (
        forbiddenRequestHeaders.includes(normalizedHeader) ||
        normalizedHeader.startsWith("proxy-") ||
        normalizedHeader.startsWith("sec-")
      ) {
        return true;
      }

      return originalSetRequestHeader.call(this, header, value);
    };
  }
}

(globalThis as any).XMLHttpRequest = WrappedXMLHttpRequest;

let pyodide: any;

beforeAll(async () => {
  console.log("Loading Pyodide for tests...");
  pyodide = await loadPyodide({
    indexURL: "pyodide-env",
  });

  await pyodide.loadPackage([
    "aiohttp",
    "audioop-lts",
    "beautifulsoup4",
    "httpx",
    "matplotlib",
    "numpy",
    "opencv-python",
    "orjson",
    "pandas",
    "Pillow",
    "pyodide-http",
    "pyyaml",
    "regex",
    "requests",
    "ruamel.yaml",
    "scikit-image",
    "simplejson",
    "soundfile",
    "sympy",
    "tiktoken",
  ]);

  // Patch libraries
  pyodide.runPython(`
# Specify matplotlib backend
import matplotlib
matplotlib.use("AGG")

# Patch HTTP libraries
import pyodide_http
pyodide_http.patch_all()

# Patch urllib3 Node.JS detection
import js
js.process.release.name = ""

# Patch httpx
import httpx
from httpx._transports import jsfetch
from httpx._transports.jsfetch import _no_jspi_fallback


def _no_jspi_fallback_patched(request):
    request.url = str(request.url)
    return _no_jspi_fallback(request)


jsfetch._no_jspi_fallback = _no_jspi_fallback_patched
  `);

  console.log("Pyodide loaded and configured for tests");
}, 60000); // 60 second timeout for initialization

test("1+1 equals 2", async () => {
  const result = await pyodide.runPythonAsync("1+1");
  expect(result).toBe(2);
});

test("httpx.get() fetches weather.txt", async () => {
  const code = `httpx.get("https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/refs/heads/main/services/api/tests/files/txt/weather.txt").text`;
  const result = await pyodide.runPythonAsync(code);

  // Check that we got some text back
  expect(typeof result).toBe("string");
  expect(result).toBe("Temperature in Kuala Lumpur is 27 degrees celsius.");
}, 30000); // 30 second timeout for HTTP request

test("compiled REPL integration test", async () => {
  const fs = require("fs");
  const path = require("path");

  // Check if pyodide-env exists
  const pyodideEnvPath = path.join(process.cwd(), "pyodide-env");
  if (!fs.existsSync(pyodideEnvPath)) {
    console.log("pyodide-env not found, running setup...");
    const setupProc = Bun.spawn(["bun", "run", "setup"], {
      cwd: process.cwd(),
      stdout: "inherit",
      stderr: "inherit",
    });
    const setupExitCode = await setupProc.exited;
    expect(setupExitCode).toBe(0);
    console.log("Setup completed");
  }

  // Build the compiled binary
  console.log("Building compiled REPL...");
  const buildProc = Bun.spawn(["bun", "run", "build"], {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
  });
  const buildExitCode = await buildProc.exited;
  expect(buildExitCode).toBe(0);
  console.log("Build completed");

  // Test the compiled binary
  console.log("Testing compiled REPL...");
  const binaryPath = path.join(process.cwd(), "woma");
  expect(fs.existsSync(binaryPath)).toBe(true);

  const replProc = Bun.spawn([binaryPath], {
    cwd: process.cwd(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  let allOutput = "";
  let lastPromptIndex = 0;

  // Start reading output in background
  const reader = replProc.stdout.getReader();
  const decoder = new TextDecoder();

  // Background task to continuously read stdout
  const readTask = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        allOutput += text;
      }
    } catch (e) {
      // Stream closed, that's ok
    }
  })();

  // Helper to wait for a new prompt
  const waitForPrompt = async (timeoutMs: number = 5000): Promise<string> => {
    const startTime = Date.now();
    const startIndex = lastPromptIndex;

    while (Date.now() - startTime < timeoutMs) {
      const newPromptIndex = allOutput.indexOf(">>> ", lastPromptIndex);
      if (newPromptIndex > lastPromptIndex) {
        const output = allOutput.substring(startIndex, newPromptIndex);
        lastPromptIndex = newPromptIndex + 4; // Skip past ">>> "
        return output;
      }
      await Bun.sleep(100);
    }

    // Return what we have so far
    return allOutput.substring(startIndex);
  };

  // Wait for initial prompt
  await waitForPrompt(20000);
  console.log("REPL started, sending test commands...");

  // Test 1: 1+1
  replProc.stdin.write("1+1\n");
  await Bun.sleep(100); // Give it a moment to process
  const output1 = await waitForPrompt();
  console.log("Test 1+1 output:", output1);
  expect(output1).toContain("2");

  // Test 2: httpx.get
  replProc.stdin.write(
    'httpx.get("https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/refs/heads/main/services/api/tests/files/txt/weather.txt").text\n'
  );
  await Bun.sleep(100); // Give it a moment to process
  const output2 = await waitForPrompt(30000); // Longer timeout for HTTP request
  console.log("Test httpx output:", output2);
  expect(output2).toContain("Temperature in Kuala Lumpur is 27 degrees celsius");

  // Cleanup: close the process
  replProc.kill();
  await readTask.catch(() => {}); // Wait for read task to finish

  console.log("Compiled REPL integration test passed!");
}, 180000); // 3 minute timeout for full integration test
