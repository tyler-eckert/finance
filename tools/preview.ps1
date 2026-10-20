# eckert.fin - local preview. Serves this folder at http://localhost:8080 so you can try changes
# against your real data before pushing to GitHub. Nothing is uploaded anywhere; close the window to stop.
param([int]$Port = 8080)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.png'='image/png'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
$l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$Port/"); $l.Start()
Write-Host "eckert.fin preview running at http://localhost:$Port  (Ctrl+C or close this window to stop)" -ForegroundColor Green
Start-Process "http://localhost:$Port/"
try { while ($l.IsListening) {
  $c = $l.GetContext(); $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/')); if ($p -eq '') { $p = 'index.html' }
  $f = [IO.Path]::GetFullPath((Join-Path $root $p)); $r = $c.Response; $r.Headers.Add('Cache-Control', 'no-store')
  # only files inside the repo, and never the private / seed folders
  if ($f.StartsWith($root) -and (Test-Path $f -PathType Leaf) -and $p -notmatch '^(private|seed)[\\/]') {
    $b = [IO.File]::ReadAllBytes($f); $e = [IO.Path]::GetExtension($f).ToLower()
    $r.ContentType = $(if ($types[$e]) { $types[$e] } else { 'application/octet-stream' }); $r.OutputStream.Write($b, 0, $b.Length)
  } else { $r.StatusCode = 404 }
  $r.Close() } } finally { $l.Stop() }
