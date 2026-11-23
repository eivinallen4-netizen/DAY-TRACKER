param(
    [Parameter(Mandatory)][ValidateRange(3,999999999)][int]$Build,
    [Parameter(Mandatory)][string]$NotesFile
)
$ErrorActionPreference = 'Stop'
$notes = (Resolve-Path -LiteralPath $NotesFile).Path
$repo = 'eivinallen4-netizen/DAY-TRACKER'
Push-Location $PSScriptRoot
try {
    & .\gradlew.bat assembleSideload "-PtvVersionCode=$Build"
    if ($LASTEXITCODE -ne 0) { throw 'APK build failed.' }
    $output = Get-Content app/build/outputs/apk/sideload/output-metadata.json -Raw | ConvertFrom-Json
    $variant = $output.elements[0]
    if ($output.applicationId -ne 'app.workbetter.tv' -or $variant.versionCode -ne $Build) {
        throw 'APK metadata does not match the requested build.'
    }
    $tags = gh api --paginate "repos/$repo/releases" --jq '.[].tag_name'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the current feed.' }
    foreach ($tag in $tags) {
        if ($tag -match '^tv-build-(\d+)$' -and $Build -le [int]$Matches[1]) {
            throw 'Choose a higher build number than all previously published TV builds.'
        }
    }
    $artifact = Join-Path $PSScriptRoot '../artifacts/Work-Better-TV.apk'
    New-Item -ItemType Directory -Force (Split-Path $artifact) | Out-Null
    Copy-Item -LiteralPath (Join-Path 'app/build/outputs/apk/sideload' $variant.outputFile) -Destination $artifact
    gh release create "tv-build-$Build" $artifact -R $repo --title "Work Better TV · Build $Build" --notes-file $notes --latest
    if ($LASTEXITCODE -ne 0) { throw 'Release upload failed. Check GitHub before retrying.' }
} finally { Pop-Location }
