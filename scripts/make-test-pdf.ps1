<#
.SYNOPSIS
    Creates a small, valid multi-page PDF used to test the upload endpoint.

.DESCRIPTION
    The PDF is assembled by hand so the project needs no extra dependency
    (no headless browser, no PDF writer). Everything written here is plain
    ASCII, so the string offsets used to build the cross reference table are
    also the byte offsets the format expects.

.EXAMPLE
    .\scripts\make-test-pdf.ps1
    .\scripts\make-test-pdf.ps1 -OutputPath .\tmp\other.pdf
#>
[CmdletBinding()]
param(
    [Parameter()]
    [string]$OutputPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $OutputPath = Join-Path $projectRoot "tmp\test-document.pdf"
}

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

function New-PdfTextContent {
    param(
        [Parameter()]
        [AllowEmptyString()]
        [string[]]$Lines,

        [Parameter()]
        [double]$StartY = 760,

        [Parameter()]
        [double]$LineHeight = 22,

        [Parameter()]
        [double]$FontSize = 12
    )

    $parts = New-Object System.Collections.Generic.List[string]
    $parts.Add("BT")
    $parts.Add("/F1 $FontSize Tf")
    $parts.Add("72 $StartY Td")

    for ($index = 0; $index -lt $Lines.Count; $index++) {
        if ($index -gt 0) {
            $parts.Add("0 -$LineHeight Td")
        }

        $escaped = $Lines[$index].Replace('\', '\\').Replace('(', '\(').Replace(')', '\)')
        $parts.Add("($escaped) Tj")
    }

    $parts.Add("ET")

    return (($parts -join "`n") + "`n")
}

$pageOneContent = New-PdfTextContent -Lines @(
    "Socratic AI Tutor - Test Document",
    "",
    "Data Structures and Algorithms",
    "This PDF is used to verify server-side text extraction.",
    "A binary search tree stores keys so that search costs O(log n)."
) -StartY 760 -LineHeight 26 -FontSize 12

$pageTwoContent = New-PdfTextContent -Lines @(
    "Page 2 - Retrieval Basics",
    "",
    "Chunking splits a document into passages that fit a context window.",
    "Embeddings let the tutor find passages that match a student question."
) -StartY 760 -LineHeight 26 -FontSize 12

$objects = @(
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Length $($pageOneContent.Length) >>`nstream`n$pageOneContent`nendstream",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    "<< /Length $($pageTwoContent.Length) >>`nstream`n$pageTwoContent`nendstream"
)

$pdf = "%PDF-1.4`n"
$offsets = New-Object System.Collections.Generic.List[int]

for ($index = 0; $index -lt $objects.Count; $index++) {
    $offsets.Add($pdf.Length)
    $pdf += "$($index + 1) 0 obj`n$($objects[$index])`nendobj`n"
}

$xrefOffset = $pdf.Length
$pdf += "xref`n0 $($objects.Count + 1)`n"
$pdf += "0000000000 65535 f `n"

foreach ($offset in $offsets) {
    $pdf += ("{0:D10} 00000 n `n" -f $offset)
}

$pdf += "trailer`n<< /Size $($objects.Count + 1) /Root 1 0 R >>`nstartxref`n$xrefOffset`n%%EOF`n"

$bytes = [System.Text.Encoding]::ASCII.GetBytes($pdf)
[System.IO.File]::WriteAllBytes($OutputPath, $bytes)

Write-Host "Created test PDF: $OutputPath ($($bytes.Length) bytes)" -ForegroundColor Green
