[CmdletBinding()]
param(
    [Parameter()]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string] $Version = '0.4.1'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceScript = Join-Path $repositoryRoot 'pixinsight\CCDASTROWorkflowManager.js'
$updatesDirectory = Join-Path $repositoryRoot 'updates'
$stageRoot = Join-Path $PSScriptRoot '.stage'
$stageScriptDirectory = Join-Path $stageRoot 'src\scripts\CCDASTRO'
$packageName = "CCDASTROWorkflowManager-$Version.zip"
$packagePath = Join-Path $updatesDirectory $packageName
$manifestPath = Join-Path $updatesDirectory 'updates.xri'
$releaseDate = (Get-Date).ToUniversalTime().ToString('yyyyMMdd')

if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) {
    throw "Workflow script not found: $sourceScript"
}

$sourceText = [System.IO.File]::ReadAllText($sourceScript)
$versionMatches = [regex]::Matches($sourceText, '#define\s+VERSION\s+"([^"]+)"')
if ($versionMatches.Count -eq 0) {
    throw 'Could not read VERSION from CCDASTROWorkflowManager.js.'
}
$workflowVersion = $versionMatches[$versionMatches.Count - 1].Groups[1].Value
if ($workflowVersion -ne $Version) {
    throw "Requested package version $Version does not match script version $workflowVersion."
}

if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageScriptDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $updatesDirectory -Force | Out-Null

Copy-Item -LiteralPath $sourceScript -Destination $stageScriptDirectory

if (Test-Path -LiteralPath $packagePath) {
    Remove-Item -LiteralPath $packagePath -Force
}
Compress-Archive -Path (Join-Path $stageRoot 'src') -DestinationPath $packagePath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    $requiredEntry = 'src/scripts/CCDASTRO/CCDASTROWorkflowManager.js'
    if ($entries -notcontains $requiredEntry) {
        throw "Package is missing required entry: $requiredEntry. Found: $($entries -join ', ')"
    }
} finally {
    $archive.Dispose()
}

$sha1 = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA1).Hash.ToLowerInvariant()
if ($sha1 -notmatch '^[a-f0-9]{40}$') {
    throw "Invalid SHA-1 generated for package: $sha1"
}

$manifest = @"
<?xml version="1.0" encoding="UTF-8"?>
<xri version="1.0">
  <description>
    <p>CCDASTRO PixInsight Scripts</p>
    <p>Configurable post-processing workflows for integrated OSC/RGB images.</p>
  </description>
  <platform os="all" arch="noarch" version="1.9.4:2.0.0">
    <package fileName="$packageName" sha1="$sha1" type="script" releaseDate="$releaseDate">
      <title>CCDASTRO Workflow Manager $Version</title>
      <description>
        <p>Configurable PixInsight post-processing workflow manager.</p>
        <ul>
          <li>v0.4.1 ImageSolver preprocessing compatibility fix</li>
          <li>Metadata-assisted ImageSolver adapter with setup dialog</li>
          <li>GradientCorrection and GraXpert choices</li>
          <li>BlurXTerminator and SyQon Parallax choices</li>
          <li>NoiseXTerminator and SyQon Prism choices</li>
          <li>Starless and stars-only workflow branches</li>
          <li>Independent stretching and PixelMath recombination</li>
        </ul>
      </description>
    </package>
  </platform>
</xri>
"@

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8WithoutBom)

[xml] $parsedManifest = [System.IO.File]::ReadAllText($manifestPath)
$packageNode = $parsedManifest.xri.platform.package
if ($packageNode.fileName -ne $packageName) {
    throw 'Manifest package filename validation failed.'
}
if ($packageNode.sha1 -ne $sha1) {
    throw 'Manifest SHA-1 validation failed.'
}
if ($packageNode.releaseDate -notmatch '^\d{8}$') {
    throw 'Manifest releaseDate must use YYYYMMDD.'
}
$manifestBytes = [System.IO.File]::ReadAllBytes($manifestPath)
if ($manifestBytes.Length -ge 3 -and
    $manifestBytes[0] -eq 0xEF -and
    $manifestBytes[1] -eq 0xBB -and
    $manifestBytes[2] -eq 0xBF) {
    throw 'updates.xri must be UTF-8 without a BOM.'
}

Remove-Item -LiteralPath $stageRoot -Recurse -Force

Write-Host "Built: $packagePath"
Write-Host "SHA-1: $sha1"
Write-Host "Manifest: $manifestPath"
Write-Host 'Repository URL after merge:'
Write-Host 'https://raw.githubusercontent.com/CCDASTRO/Siril-and-Seti-Astro-Pro-Workflows/main/updates/'
