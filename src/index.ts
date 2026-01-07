import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import readline from "readline";

import { loadPyodide } from "pyodide";

// This polyfill implements Synchronous XHR
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

    // Patch setRequestHeader on the instance after construction
    // Otherwise it produces a lot of warnings
    // Alternatively, we could specify `disableHeaderCheck: true`
    const originalSetRequestHeader = this.setRequestHeader;
    this.setRequestHeader = function (header: string, value: string) {
      const normalizedHeader = header.toLowerCase();

      // Skip forbidden headers silently
      if (
        forbiddenRequestHeaders.includes(normalizedHeader) ||
        normalizedHeader.startsWith("proxy-") ||
        normalizedHeader.startsWith("sec-")
      ) {
        return true; // Return true to mimic successful set
      }

      return originalSetRequestHeader.call(this, header, value);
    };
  }
}

(globalThis as any).XMLHttpRequest = WrappedXMLHttpRequest;

const PYODIDE_VERSION = "0.29.0";
const TARBALL_NAME = `pyodide-${PYODIDE_VERSION}.tar.bz2`;

// Parse CLI arguments
function parseArgs() {
  const args = Bun.argv.slice(2); // Skip 'bun' and script path
  let resetGlobals = false;
  let pyodideCache = join(homedir(), ".pyodide-env");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--reset-globals") {
      resetGlobals = true;
    } else if (args[i] === "--pyodide-cache") {
      i++;
      const cachePath = args[i];
      if (cachePath) {
        // Expand ~ to home directory
        if (cachePath.startsWith("~/")) {
          pyodideCache = join(homedir(), cachePath.slice(2));
        } else if (cachePath === "~") {
          pyodideCache = homedir();
        } else {
          pyodideCache = cachePath;
        }
      }
    }
  }

  return { resetGlobals, pyodideCache };
}

const { resetGlobals, pyodideCache } = parseArgs();
const PYODIDE_ENV_DIR = pyodideCache;

async function setupPyodide() {
  // Check if pyodide-env directory already exists
  if (existsSync(PYODIDE_ENV_DIR)) {
    return;
  }

  console.log(
    `Pyodide environment not found. Setting up Pyodide ${PYODIDE_VERSION}...`
  );

  const tarballPath = TARBALL_NAME;
  const downloadUrl = `https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/${TARBALL_NAME}`;

  // Download tarball if not already present
  if (!existsSync(tarballPath)) {
    console.log(`Downloading ${TARBALL_NAME}...`);
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download Pyodide: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(tarballPath, arrayBuffer);
    console.log("Download complete.");
  } else {
    console.log(`${TARBALL_NAME} already exists, skipping download.`);
  }

  // Create pyodide-env directory
  mkdirSync(PYODIDE_ENV_DIR, { recursive: true });

  // Extract tarball using tar command
  console.log(`Extracting ${TARBALL_NAME}...`);
  await Bun.$`tar -xjf ${tarballPath} -C ${PYODIDE_ENV_DIR} --strip-components=1`;
  console.log("Extraction complete.");
}

async function main() {
  try {
    // 1. Ensure Pyodide is downloaded and extracted
    await setupPyodide();

    // 2. Initialize Pyodide ONCE.
    // We do not want to reload the WASM module every time (too slow).
    console.log("Loading Pyodide...");
    const pyodide = await loadPyodide({
      indexURL: PYODIDE_ENV_DIR,
      stdout: () => {},
      stderr: () => {},
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
    // 3. Patch libraries
    pyodide.runPython(`
# Specify matplotlib backend
import matplotlib
matplotlib.use("AGG")

# Patch HTTP libraries
import pyodide_http
pyodide_http.patch_all()

# Patch urllib3 Node.JS detection
# https://github.com/urllib3/urllib3/blob/aaab4eccc10c965897540b21e15f11859d0b62e7/src/urllib3/contrib/emscripten/fetch.py#L456
import js
js.process.release.name = ""

# Patch httpx
# URL object causes borrowed proxy error
# https://github.com/hoodmane/httpx/blob/53c7975db6bc4dff552af6e1c3a3b07f51a3b51a/httpx/_transports/jsfetch.py#L395
import httpx
from httpx._transports import jsfetch
from httpx._transports.jsfetch import _no_jspi_fallback


def _no_jspi_fallback_patched(request):
    request.url = str(request.url)
    return _no_jspi_fallback(request)


jsfetch._no_jspi_fallback = _no_jspi_fallback_patched
    `);
    console.log(
      "\nInteractive Mode: Enter Python code to evaluate. (Ctrl+C to exit)"
    );

    // 4. Set up the Readline interface to listen to Stdin
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ">>> ",
    });

    rl.prompt();

    // 5. Handle input line-by-line
    rl.on("line", async (line) => {
      const code = line.trim();

      if (code) {
        const context = pyodide.toPy({});
        try {
          let result;
          if (resetGlobals) {
            // Create a fresh context for execution
            result = await pyodide.runPythonAsync(code, { globals: context });
          } else {
            result = await pyodide.runPythonAsync(code);
          }

          if (result !== undefined) {
            console.log(result.toString());
            if (result && typeof result.destroy === "function") {
              result.destroy();
            }
          }
        } catch (error: any) {
          // Only print the Python error message, not the JS stack trace
          if (error.message) {
            console.log(pyodide.runPython("import sys;repr(sys.last_exc)"));
            // console.log(error.message);
          } else {
            console.error(error);
          }
        } finally {
          // Destroy the context after execution
          context.destroy();
        }
      }

      rl.prompt();
    });

    // Handle process exit
    rl.on("close", () => {
      console.log("\nExiting...");
      process.exit(0);
    });
  } catch (error) {
    console.error("Fatal Initialization Error:");
    console.error(error);
    process.exit(1);
  }
}

main();
