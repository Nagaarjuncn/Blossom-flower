# PowerShell Native Full-Stack HTTP Server with REST APIs
$Port = 3000
$Prefix = "http://localhost:$Port/"
$RootPath = Join-Path $PSScriptRoot "public"
$DataPath = Join-Path $PSScriptRoot "data"
$GardenFile = Join-Path $DataPath "garden.json"
$SettingsFile = Join-Path $DataPath "settings.json"

if (-not (Test-Path $DataPath)) { New-Item -ItemType Directory -Path $DataPath -Force | Out-Null }
if (-not (Test-Path $GardenFile)) { Set-Content -Path $GardenFile -Value '[{"id":"init-1","title":"First Bloom 🌸","timestamp":"2026-09-17T00:00:00Z","stage":"BLOSSOM"}]' }
if (-not (Test-Path $SettingsFile)) { Set-Content -Path $SettingsFile -Value '{"pinchSensitivity":0.35,"growthSpeed":0.06,"soundEnabled":true,"mirrorCamera":true,"visualizationMode":"both"}' }

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Prefix)
$Listener.Start()

Write-Host "====================================================" -ForegroundColor Green
Write-Host "🌸 Blossom Flower PowerShell Server Online!" -ForegroundColor Green
Write-Host "🌐 Serving at: $Prefix" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Green

try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response

        $UrlPath = $Request.Url.AbsolutePath
        $Method = $Request.HttpMethod

        $Response.AddHeader("Access-Control-Allow-Origin", "*")
        $Response.AddHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        $Response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

        if ($Method -eq "OPTIONS") {
            $Response.StatusCode = 204
            $Response.Close()
            continue
        }

        # REST API Routes
        if ($UrlPath -eq "/api/status" -and $Method -eq "GET") {
            $json = '{"status":"online","service":"PowerShell Native Server","version":"1.0.0"}'
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.ContentLength64 = $buffer.Length
            $Response.OutputStream.Write($buffer, 0, $buffer.Length)
            $Response.Close()
            continue
        }

        if ($UrlPath -eq "/api/garden" -and $Method -eq "GET") {
            $content = Get-Content $GardenFile -Raw
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.ContentLength64 = $buffer.Length
            $Response.OutputStream.Write($buffer, 0, $buffer.Length)
            $Response.Close()
            continue
        }

        if ($UrlPath -eq "/api/garden" -and $Method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $newEntry = $body | ConvertFrom-Json
            $items = Get-Content $GardenFile -Raw | ConvertFrom-Json
            $entryObj = [PSCustomObject]@{
                id = "blossom-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                title = if ($newEntry.title) { $newEntry.title } else { "Bloom" }
                timestamp = [DateTime]::UtcNow.ToString("o")
                stage = "BLOSSOM"
                snapshotUrl = $newEntry.snapshotUrl
            }
            $all = @($entryObj) + @($items)
            $all | ConvertTo-Json -Depth 5 | Set-Content $GardenFile
            $resJson = '{"success":true}'
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($resJson)
            $Response.StatusCode = 201
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.ContentLength64 = $buffer.Length
            $Response.OutputStream.Write($buffer, 0, $buffer.Length)
            $Response.Close()
            continue
        }

        if ($UrlPath -like "/api/garden/*" -and $Method -eq "DELETE") {
            $delId = $UrlPath.Substring("/api/garden/".Length)
            $items = Get-Content $GardenFile -Raw | ConvertFrom-Json
            $filtered = @($items | Where-Object { $_.id -ne $delId })
            $filtered | ConvertTo-Json -Depth 5 | Set-Content $GardenFile
            $resJson = '{"success":true,"deletedId":"' + $delId + '"}'
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($resJson)
            $Response.StatusCode = 200
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.ContentLength64 = $buffer.Length
            $Response.OutputStream.Write($buffer, 0, $buffer.Length)
            $Response.Close()
            continue
        }

        if ($UrlPath -eq "/api/settings" -and $Method -eq "GET") {
            $content = Get-Content $SettingsFile -Raw
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.ContentLength64 = $buffer.Length
            $Response.OutputStream.Write($buffer, 0, $buffer.Length)
            $Response.Close()
            continue
        }

        if ($UrlPath -eq "/api/settings" -and $Method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            Set-Content -Path $SettingsFile -Value $body
            $resJson = '{"success":true}'
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($resJson)
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.ContentLength64 = $buffer.Length
            $Response.OutputStream.Write($buffer, 0, $buffer.Length)
            $Response.Close()
            continue
        }

        # Static file delivery
        $LocalFile = if ($UrlPath -eq "/") { Join-Path $RootPath "index.html" } else { Join-Path $RootPath ($UrlPath.TrimStart('/')) }

        if (Test-Path $LocalFile -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($LocalFile).ToLower()
            $mime = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($LocalFile)
            $Response.ContentType = $mime
            $Response.ContentLength64 = $bytes.Length
            $Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $Response.StatusCode = 404
            $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $Response.OutputStream.Write($buf, 0, $buf.Length)
        }
        $Response.Close()
    }
} finally {
    $Listener.Stop()
    $Listener.Close()
}
