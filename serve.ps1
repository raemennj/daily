# Simple local static server for testing the PWA without extra installs.
param(
  [int]$Port = 8080,
  [string]$Root = (Resolve-Path ".")
)

Add-Type -AssemblyName System.Web

function Get-ContentType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html"       { "text/html; charset=utf-8" }
    ".js"         { "application/javascript; charset=utf-8" }
    ".css"        { "text/css; charset=utf-8" }
    ".json"       { "application/json; charset=utf-8" }
    ".webmanifest"{ "application/manifest+json" }
    ".png"        { "image/png" }
    default       { "application/octet-stream" }
  }
}

$rootFull = [System.IO.Path]::GetFullPath($Root)
$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $rootFull at $prefix (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [System.Web.HttpUtility]::UrlDecode($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $rootFull $path))
      if (-not ($fullPath.StartsWith($rootFull))) { throw "Blocked path" }
      if (-not (Test-Path $fullPath)) {
        $ctx.Response.StatusCode = 404
        $ctx.Response.Close()
        continue
      }
      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      $ctx.Response.ContentType = Get-ContentType $fullPath
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.OutputStream.Close()
    } catch {
      $ctx.Response.StatusCode = 500
      $ctx.Response.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
