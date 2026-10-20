#!/bin/sh
# Double-click (Mac) or run to preview eckert.fin locally at http://localhost:8080
cd "$(dirname "$0")/.." && (sleep 1; open http://localhost:8080 2>/dev/null || xdg-open http://localhost:8080) & python3 -m http.server 8080 --bind 127.0.0.1
