# Node.js runtime

The buyer package contains the unmodified official Node.js 24.22.1 Windows x64 binary from:

https://nodejs.org/dist/v24.22.1/win-x64/node.exe

SHA-256: `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5`

The digest was checked against the official release SHASUMS256.txt. The downloaded executable has a valid OpenJS Foundation signature on the build machine. The accompanying `LICENSE-Node.txt` includes Node.js and its third-party notices. Node.js is independent of this product and of Codex.

The source archive excludes the binary; `download-runtime.ps1` fetches this pinned binary and verifies its digest when building a buyer package. The buyer package does not download a runtime at launch.
