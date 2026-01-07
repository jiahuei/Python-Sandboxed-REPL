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
