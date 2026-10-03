# Klammr one-line installer for Windows. Downloads the latest release bundle for this machine from GitHub,
# checks its sha256 and runs the installer inside it; arguments are passed on to that installer (--help lists
# them). With --uninstall it fetches that release's source and runs the uninstaller instead. In PowerShell:
#
#   irm https://klammr.github.io/klammr/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://klammr.github.io/klammr/install.ps1))) --desktop-shortcut
#   & ([scriptblock]::Create((irm https://klammr.github.io/klammr/install.ps1))) --uninstall
#
# Environment: KLAMMR_VERSION (a release such as 0.2.0; default: the latest), KLAMMR_REPO_URL, KLAMMR_CACHE_DIR
# (where the bundle is unpacked and removed afterwards; default: the temp directory). Needs Windows PowerShell
# 5.1 or PowerShell 7 and Node.js 18+, which only runs the installer; no admin rights. Everything runs in one
# script block, so nothing is left behind in your session and an error never closes the window.

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # Windows PowerShell 5.1 downloads far more slowly with a progress bar
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $uninstall = $false
  $rest = @()
  foreach ($a in $args) { if ("$a" -eq '--uninstall') { $uninstall = $true } else { $rest += "$a" } }

  # Test-Node/Find-Node: the same search as product/install.ps1.
  function Test-Node([string] $exe) {
    $ErrorActionPreference = 'Continue'
    if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { return $false }
    try { $major = & $exe -p 'process.versions.node.split(".")[0]' 2>$null } catch { return $false }
    return ([int]$major -ge 18)
  }

  function Find-Node {
    $onPath = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($onPath -and (Test-Node $onPath.Source)) { return $onPath.Source }
    $candidates = @(
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
      (Join-Path $env:LOCALAPPDATA 'Volta\bin\node.exe'),
      (Join-Path $env:APPDATA 'fnm\aliases\default\node.exe'),
      (Join-Path $env:LOCALAPPDATA 'fnm_multishells\*\node.exe'),
      (Join-Path $env:APPDATA 'nvm\*\node.exe'),
      'C:\nvm4w\nodejs\node.exe'
    )
    foreach ($pattern in $candidates) {
      foreach ($hit in @(Get-Item -Path $pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)) {
        if (Test-Node $hit.FullName) { return $hit.FullName }
      }
    }
    return $null
  }

  function Get-File([string] $url, [string] $file) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file }
    catch { throw "download failed: $url ($($_.Exception.Message))" }
  }

  # The bundle is a zip with long paths inside; Windows' own tar.exe (bsdtar) unpacks it, as install.mjs does.
  function Expand-Zip([string] $zip, [string] $dir) {
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
      $ErrorActionPreference = 'Continue'
      & $tar -xf $zip -C $dir
      if ($LASTEXITCODE -ne 0) { throw "could not unpack $zip (tar exit code $LASTEXITCODE)" }
    } else {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [IO.Compression.ZipFile]::ExtractToDirectory($zip, $dir)
    }
  }

  $node = Find-Node
  if (-not $node) {
    throw "Node.js 18 or newer is required to run the Klammr installer (it is not needed to use Klammr).`nInstall it with:  winget install OpenJS.NodeJS.LTS      or from https://nodejs.org`nThen open a new terminal and run this command again."
  }
  # Node's platform and CPU pick the bundle: the installer checks the bundle against exactly these.
  $target = "$(& $node -p "process.platform + '-' + process.arch")".Trim()
  if (@('win32-x64', 'win32-arm64') -notcontains $target) {
    throw "there is no Klammr build for $target here (Windows on x64 or arm64; on Linux and macOS use install.sh)"
  }

  $repo = if ($env:KLAMMR_REPO_URL) { $env:KLAMMR_REPO_URL.TrimEnd('/') } else { 'https://github.com/klammr/klammr' }
  $version = "$env:KLAMMR_VERSION"
  if (-not $version) {
    # GitHub redirects releases/latest to releases/tag/<tag>, or to releases/ while there is none.
    $r = Invoke-WebRequest -UseBasicParsing -Method Head -Uri "$repo/releases/latest"
    $final = if ($r.BaseResponse.ResponseUri) { $r.BaseResponse.ResponseUri.AbsoluteUri } else { $r.BaseResponse.RequestMessage.RequestUri.AbsoluteUri }
    if ($final -notmatch '/releases/tag/([^/?#]+)') { throw "no Klammr release is published at $repo/releases yet" }
    $version = $Matches[1]
  }
  $version = $version -replace '^v', ''

  $base = if ($env:KLAMMR_CACHE_DIR -and -not $uninstall) { $env:KLAMMR_CACHE_DIR } else { [IO.Path]::GetTempPath() }
  $work = Join-Path $base ('klammr-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  try {
    if ($uninstall) {
      Write-Host "==> Klammr ${version}: fetching the uninstaller"
      $zip = Join-Path $work 'source.zip'
      Get-File "$repo/archive/refs/tags/v$version.zip" $zip
      Expand-Zip $zip $work
      $script = @(Get-ChildItem -LiteralPath $work -Directory | ForEach-Object { Join-Path $_.FullName 'product\uninstall.mjs' } | Where-Object { Test-Path -LiteralPath $_ })[0]
    } else {
      $file = "Klammr-$target-$version.zip"
      $url = "$repo/releases/download/v$version/$file"
      $zip = Join-Path $work $file
      Write-Host "==> Klammr $version for ${target}: downloading $file"
      Get-File "$url.sha256" "$zip.sha256"
      Get-File $url $zip
      $expected = ("$(Get-Content -Raw -LiteralPath "$zip.sha256")".Trim() -split '\s+')[0].ToLowerInvariant()
      $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
      if ($expected -ne $actual) { throw "sha256 mismatch for $file (expected $expected, got $actual)" }
      Write-Host "    sha256 ok $actual"
      Expand-Zip $zip $work
      Remove-Item -LiteralPath $zip -Force
      $script = @(Get-ChildItem -LiteralPath $work -Directory -Filter 'Klammr-*' | ForEach-Object { Join-Path $_.FullName 'install.mjs' } | Where-Object { Test-Path -LiteralPath $_ })[0]
    }
    if (-not $script) { throw 'the download does not contain the Klammr installer' }

    $ErrorActionPreference = 'Continue'   # the installer's warnings on stderr are not errors
    & $node $script @rest
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) { throw "the Klammr $(if ($uninstall) { 'uninstaller' } else { 'installer' }) stopped with exit code $code" }
  } finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
} @args
