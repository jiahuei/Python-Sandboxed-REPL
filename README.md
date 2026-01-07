# Python Sandboxed REPL

A sandboxed Python REPL that compiles to a single binary, run entirely using WebAssembly. No installation required!

## What is this?

This project lets you run Python code in a secure, sandboxed environment using [Pyodide](https://pyodide.org/). It's perfect for:

- Running Python code without installing Python
- Creating a portable, self-contained Python environment
- Experimenting with Python in a controlled sandbox
- Distributing a Python REPL as a single executable file

## Features

- **No Python installation needed** - Everything runs in WebAssembly
- **Pre-loaded popular packages** including:
  - Data science: `numpy`, `pandas`, `matplotlib`, `scikit-image`
  - HTTP requests: `requests`, `httpx`, `aiohttp`
  - Image processing: `Pillow`, `opencv-python`
  - Data formats: `beautifulsoup4`, `pyyaml`, `orjson`
  - Math & symbolic: `sympy`, `tiktoken`
  - And many more!
- **HTTP support** - Make real HTTP requests from Python
- **Interactive REPL** - Standard Python prompt
- **Compile to binary** - Bundle everything into a single executable

## Prerequisites

- [Bun](https://bun.sh) runtime installed

## Quick Start

### Run the REPL without Compiling

```shell
# Install dependencies
bun install

# Run the REPL
bun src/index.ts
```

On first run, Pyodide (~420MB) will be automatically downloaded and extracted. Subsequent runs will use the cached files.

You'll see a Python prompt where you can enter code:

```python
>>> print("Hello from Python!")
Hello from Python!

>>> import numpy as np
>>> np.array([1, 2, 3]).mean()
2.0

>>> import httpx
>>> httpx.get("https://api.github.com").status_code
200
```

Press `Ctrl+C` to exit.

### Build Standalone Binary

Compile the REPL into a single `woma` executable:

```bash
# Install dependencies
bun install
# Compile
bun run build
# Run
./woma
```

The compiled binary is fully self-contained and can be distributed without requiring Bun or any other dependencies.

### Running Tests

Run the test suite:

```bash
bun test
```

Tests verify:

- Basic Python execution (1+1)
- HTTP requests with httpx
- Compiled binary functionality

## Technical Details

### XMLHttpRequest Polyfill

The project includes a custom `XMLHttpRequest` wrapper that:

- Enables synchronous XHR (required by some Python packages)
- Filters forbidden HTTP headers that cause warnings

### HTTP Library Patches

Several patches are applied to make HTTP libraries work in Bun:

- **pyodide-http**: Patches urllib, requests, and aiohttp
- **urllib3**: Disables Node.js detection
- **httpx**: Converts URL objects to strings to avoid proxy errors

## Project Structure

```
.
├── src/
│   ├── index.ts              # Main REPL implementation
│   ├── index.test.ts         # Test suite
│   └── xmlhttprequest-ssl.d.ts # TypeScript definitions
├── pyodide-env/              # Pyodide distribution (auto-downloaded on first run)
├── package.json              # Dependencies and scripts
└── woma                      # Compiled binary (after build)
```

## Limitations

- **Startup time**: First launch downloads Pyodide and takes additional time; subsequent launches take ~5-10 seconds to load Python runtime
- **Package size**: Pyodide distribution is ~420MB
- **No native extensions**: Only pure Python or pre-compiled WASM packages work
- **No filesystem**: Uses virtual filesystem
- **Memory**: [Limited to 2GB](https://github.com/pyodide/pyodide/issues/1513#issuecomment-823841440)

## License

This project is licensed under Apache 2.0.

Pyodide is [licensed under the Mozilla Public License Version 2.0](https://github.com/pyodide/pyodide/blob/main/LICENSE).

## Credits

Built with:

- [Pyodide](https://pyodide.org/)
- [Bun](https://bun.sh)
- [xmlhttprequest-ssl](https://github.com/mjwwit/node-XMLHttpRequest)
