<#
.SYNOPSIS
    End-to-end test of the PDF upload endpoint.

.DESCRIPTION
    Starts no server itself: point it at a running instance (for example
    `npm run dev`) and it will exercise the happy path and every error path
    the endpoint promises to handle.

    The script works on both Windows PowerShell 5.1 and PowerShell 7, so it
    does not rely on `Invoke-RestMethod -Form`, which only exists in
    PowerShell 6+.

.EXAMPLE
    .\scripts\test-pdf-upload.ps1
    .\scripts\test-pdf-upload.ps1 -BaseUrl http://localhost:3000
#>
[CmdletBinding()]
param(
    [Parameter()]
    [string]$BaseUrl = "http://localhost:3000"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$endpoint = "$($BaseUrl.TrimEnd('/'))/api/documents/upload"
$projectRoot = Split-Path -Parent $PSScriptRoot
$workDirectory = Join-Path $projectRoot "tmp"

if (-not (Test-Path -LiteralPath $workDirectory)) {
    New-Item -ItemType Directory -Path $workDirectory -Force | Out-Null
}

$script:passed = 0
$script:failed = 0

function Write-Result {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [bool]$Ok,

        [Parameter(Mandatory)]
        [string]$Details
    )

    if ($Ok) {
        $script:passed++
        Write-Host "  PASS  $Name" -ForegroundColor Green
    }
    else {
        $script:failed++
        Write-Host "  FAIL  $Name" -ForegroundColor Red
    }

    Write-Host "        $Details" -ForegroundColor DarkGray
}

function New-MultipartBody {
    param(
        [Parameter()]
        [string]$FilePath = "",

        [Parameter()]
        [string]$FieldName = "file"
    )

    $boundary = "----SocraticBoundary$([guid]::NewGuid().ToString('N'))"

    if ([string]::IsNullOrWhiteSpace($FilePath)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("--$boundary--`r`n")
        return @{ Boundary = $boundary; Body = $body }
    }

    $fileName = [System.IO.Path]::GetFileName($FilePath)
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)

    $header = "--$boundary`r`n" +
    "Content-Disposition: form-data; name=`"$FieldName`"; filename=`"$fileName`"`r`n" +
    "Content-Type: application/pdf`r`n`r`n"

    $footer = "`r`n--$boundary--`r`n"

    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
    $footerBytes = [System.Text.Encoding]::UTF8.GetBytes($footer)

    $body = New-Object byte[] ($headerBytes.Length + $fileBytes.Length + $footerBytes.Length)
    [Array]::Copy($headerBytes, 0, $body, 0, $headerBytes.Length)
    [Array]::Copy($fileBytes, 0, $body, $headerBytes.Length, $fileBytes.Length)
    [Array]::Copy($footerBytes, 0, $body, $headerBytes.Length + $fileBytes.Length, $footerBytes.Length)

    return @{ Boundary = $boundary; Body = $body }
}

function Invoke-Upload {
    param(
        [Parameter()]
        [string]$FilePath = "",

        [Parameter()]
        [string]$FieldName = "file"
    )

    $multipart = New-MultipartBody -FilePath $FilePath -FieldName $FieldName

    $request = [System.Net.HttpWebRequest]::Create($endpoint)
    $request.Method = "POST"
    $request.ContentType = "multipart/form-data; boundary=$($multipart.Boundary)"
    $request.ContentLength = $multipart.Body.Length
    $request.Timeout = 60000
    $request.ReadWriteTimeout = 60000

    $stream = $request.GetRequestStream()
    $stream.Write($multipart.Body, 0, $multipart.Body.Length)
    $stream.Close()

    try {
        $response = $request.GetResponse()
    }
    catch [System.Net.WebException] {
        $response = $_.Exception.Response
    }

    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $body = $reader.ReadToEnd()
    $reader.Close()

    return @{ StatusCode = [int]$response.StatusCode; Body = $body }
}

function Get-ErrorCode {
    param([string]$Body)

    try {
        return ($Body | ConvertFrom-Json).error.code
    }
    catch {
        return "<unparsable body>"
    }
}

Write-Host ""
Write-Host "PDF upload endpoint test" -ForegroundColor Cyan
Write-Host "Endpoint: $endpoint" -ForegroundColor DarkGray
Write-Host ""

try {
    $descriptor = Invoke-WebRequest -Uri $endpoint -Method GET -UseBasicParsing -TimeoutSec 10
    Write-Result -Name "GET describes the contract" -Ok ($descriptor.StatusCode -eq 200) `
        -Details "status $($descriptor.StatusCode)"
}
catch {
    Write-Result -Name "GET describes the contract" -Ok $false `
        -Details "the server at $BaseUrl is not reachable. Start it with 'npm run dev'."
}

Write-Host ""
Write-Host "1. Valid PDF" -ForegroundColor Cyan

$samplePdf = Join-Path $workDirectory "test-document.pdf"
& (Join-Path $PSScriptRoot "make-test-pdf.ps1") -OutputPath $samplePdf | Out-Null

$response = Invoke-Upload -FilePath $samplePdf
$json = $response.Body | ConvertFrom-Json

$textLooksRight = $json.success -and
$json.data.text -like "*Socratic AI Tutor*" -and
$json.data.text -like "*binary search tree*"

Write-Result -Name "returns 200 with extracted text" `
    -Ok ($response.StatusCode -eq 200 -and $json.success -eq $true -and $textLooksRight) `
    -Details "status $($response.StatusCode), $($json.data.characterCount) characters, $($json.data.pageCount) pages"

Write-Result -Name "reports a page count" `
    -Ok ($json.data.pageCount -eq 2) `
    -Details "pageCount = $($json.data.pageCount)"

Write-Result -Name "character count matches the text" `
    -Ok ($json.data.characterCount -eq $json.data.text.Length) `
    -Details "characterCount = $($json.data.characterCount)"

Write-Host ""
Write-Host "2. Invalid uploads" -ForegroundColor Cyan

$response = Invoke-Upload
$code = Get-ErrorCode -Body $response.Body
Write-Result -Name "rejects a request with no file" `
    -Ok ($response.StatusCode -eq 400 -and $code -in @("NO_FILE_PROVIDED", "INVALID_REQUEST")) `
    -Details "status $($response.StatusCode), code $code"

$textFile = Join-Path $workDirectory "not-a-pdf.txt"
Set-Content -LiteralPath $textFile -Value "This is a plain text file, not a PDF." -Encoding ASCII

$response = Invoke-Upload -FilePath $textFile
$code = Get-ErrorCode -Body $response.Body
Write-Result -Name "rejects a non-PDF file" `
    -Ok ($response.StatusCode -eq 415 -and $code -eq "UNSUPPORTED_MEDIA_TYPE") `
    -Details "status $($response.StatusCode), code $code"

$fakePdf = Join-Path $workDirectory "fake.pdf"
Set-Content -LiteralPath $fakePdf -Value "This file is named .pdf but is plain text." -Encoding ASCII

$response = Invoke-Upload -FilePath $fakePdf
$code = Get-ErrorCode -Body $response.Body
Write-Result -Name "rejects a .pdf file without a PDF header" `
    -Ok ($response.StatusCode -eq 415 -and $code -eq "UNSUPPORTED_MEDIA_TYPE") `
    -Details "status $($response.StatusCode), code $code"

$emptyFile = Join-Path $workDirectory "empty.pdf"
Set-Content -LiteralPath $emptyFile -Value "" -Encoding ASCII -NoNewline

$response = Invoke-Upload -FilePath $emptyFile
$code = Get-ErrorCode -Body $response.Body
Write-Result -Name "rejects an empty file" `
    -Ok ($response.StatusCode -eq 400 -and $code -eq "EMPTY_FILE") `
    -Details "status $($response.StatusCode), code $code"

$largeFile = Join-Path $workDirectory "too-large.pdf"
$largeBytes = New-Object byte[] (10 * 1024 * 1024 + 1)
$largeBytes[0] = 0x25
$largeBytes[1] = 0x50
$largeBytes[2] = 0x44
$largeBytes[3] = 0x46
$largeBytes[4] = 0x2D
[System.IO.File]::WriteAllBytes($largeFile, $largeBytes)

$response = Invoke-Upload -FilePath $largeFile
$code = Get-ErrorCode -Body $response.Body
Write-Result -Name "rejects a file over 10 MB" `
    -Ok ($response.StatusCode -eq 413 -and $code -eq "FILE_TOO_LARGE") `
    -Details "status $($response.StatusCode), code $code"

Remove-Item -LiteralPath $largeFile -Force
Remove-Item -LiteralPath $textFile -Force
Remove-Item -LiteralPath $fakePdf -Force
Remove-Item -LiteralPath $emptyFile -Force

Write-Host ""
Write-Host "Result: $script:passed passed, $script:failed failed" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($script:failed -gt 0) {
    exit 1
}
