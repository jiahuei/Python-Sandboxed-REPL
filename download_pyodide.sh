# Download the build artifacts only if not already present
TARBALL="pyodide-${VERSION}.tar.bz2"
if [ ! -f "$TARBALL" ]; then
    echo "Downloading $TARBALL..."
    curl -L -O "https://github.com/pyodide/pyodide/releases/download/${VERSION}/${TARBALL}"
else
    echo "$TARBALL already exists, skipping download."
fi

# Recreate the directory
rm -rf pyodide-env && mkdir pyodide-env

# Extract (strip-components removes the top-level folder inside the tar)
echo "Extracting $TARBALL ..."
tar -xjf "$TARBALL" -C pyodide-env --strip-components=1

# Cleanup
# rm "$TARBALL"
