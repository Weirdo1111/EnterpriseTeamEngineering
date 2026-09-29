param([string]$SourcePath = '', [string]$PreviewPath = '')
$ErrorActionPreference = 'Stop'
$source = if ($SourcePath) { (Resolve-Path -LiteralPath $SourcePath).Path } else { Join-Path $PSScriptRoot ([string]::Concat([char]0x4E2A,[char]0x4EBA,[char]0x5DE5,[char]0x4F5C,[char]0x6C47,[char]0x62A5,'-', [char]0x4E34,[char]0x5E8A,'AI', [char]0x4E0E,'RAG.pptx')) }
$preview = if ($PreviewPath) { $PreviewPath } else { Join-Path $env:TEMP 'qiye-personal-work-ppt-preview' }
New-Item -ItemType Directory -Path $preview -Force | Out-Null
$app = $null
$deck = $null
try {
    $app = New-Object -ComObject PowerPoint.Application
    $app.DisplayAlerts = 1
    $deck = $app.Presentations.Open($source, -1, 0, 0)
    $deck.Export($preview, 'PNG', 1600, 900)
    $overflow = @()
    foreach ($slide in $deck.Slides) {
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                if ($shape.TextFrame.TextRange.BoundHeight -gt ($shape.Height + 4)) {
                    $overflow += [pscustomobject]@{ Slide=$slide.SlideIndex; Shape=$shape.Name; Text=$shape.TextFrame.TextRange.Text; BoxHeight=$shape.Height; TextHeight=$shape.TextFrame.TextRange.BoundHeight }
                }
            }
        }
    }
    [pscustomobject]@{ Slides=$deck.Slides.Count; Preview=$preview; OverflowCount=$overflow.Count } | ConvertTo-Json
    $overflow | ConvertTo-Json -Depth 3
} finally {
    if ($deck) { $deck.Close(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($deck) }
    if ($app) { $app.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
}
