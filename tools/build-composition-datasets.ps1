$ErrorActionPreference = 'Stop'

$sangeetCommit = '494add42e254da10bb88a368b9110ed41fa508ea'
$raagBaseCommit = '2d6f2848d988b6cd831f70d8f1d5f1b2f3825a58'
$githubHeaders = @{ 'User-Agent' = 'HCMAI-DatasetLab/1.0' }

function Get-XmlText {
  param(
    [System.Xml.XmlNode]$Node,
    [string]$Path
  )
  $value = $Node.SelectSingleNode($Path)
  if ($null -eq $value) { return '' }
  return $value.InnerText.Trim()
}

function Convert-FeatureCsv {
  param(
    [string]$DatasetId,
    [string]$DatasetName,
    [string]$Repository,
    [string]$Commit,
    [string]$FilePath
  )

  $url = "https://raw.githubusercontent.com/$Repository/$Commit/$FilePath"
  $csvText = (Invoke-WebRequest -Uri $url -Headers $githubHeaders -UseBasicParsing).Content
  $parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new([System.IO.StringReader]::new($csvText))
  $parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
  $parser.SetDelimiters(',')
  $parser.HasFieldsEnclosedInQuotes = $true
  $headers = $parser.ReadFields()
  $raagColumnIndex = [Array]::IndexOf($headers, 'Raag')
  $rows = [System.Collections.Generic.List[object]]::new()
  $rowIndex = 0
  while (-not $parser.EndOfData) {
    $values = $parser.ReadFields()
    $rowIndex++
    $features = [System.Collections.Specialized.OrderedDictionary]::new([System.StringComparer]::Ordinal)
    for ($columnIndex = 0; $columnIndex -lt $headers.Length; $columnIndex++) {
      if ($columnIndex -eq $raagColumnIndex) { continue }
      $number = 0.0
      $rawValue = [string]$values[$columnIndex]
      if ([double]::TryParse($rawValue, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
        $features[$headers[$columnIndex]] = $number
      } else {
        $features[$headers[$columnIndex]] = $rawValue.Trim()
      }
    }
    $rows.Add([pscustomobject]@{
      id = ('row-{0:D3}' -f $rowIndex)
      sourceRecordId = ('row-{0:D3}' -f $rowIndex)
      rowIndex = $rowIndex
      raagLabel = if ($raagColumnIndex -ge 0) { ([string]$values[$raagColumnIndex]).Trim() } else { '' }
      features = $features
    })
  }
  $parser.Close()

  $counts = @{}
  foreach ($row in $rows) {
    if (-not $counts.ContainsKey($row.raagLabel)) { $counts[$row.raagLabel] = 0 }
    $counts[$row.raagLabel]++
  }
  $manifest = [pscustomobject]@{
    datasetId = $DatasetId
    name = $DatasetName
    datasetKind = 'composition-note-frequency'
    sourceName = $Repository
    sourceUrl = "https://github.com/$Repository/tree/$Commit/$FilePath"
    sourceCommit = $Commit
    license = 'User-confirmed permission (2026-10-04); no repository license stated'
    licenseStatus = 'user-confirmed'
    rightsBasis = 'The user confirmed they have the right to use this dataset.'
    visibility = 'admin-only-development'
    recordCount = $rows.Count
    featureColumns = @($rows[0].features.Keys)
    labelField = 'raagLabel'
    labelCounts = $counts
    description = 'Per-composition swara-frequency features with a source-provided Raag label. Rows are not guaranteed to align across releases.'
  }
  return [pscustomobject]@{ manifest = $manifest; records = $rows.ToArray() }
}

$sangeetXmlUrl = "https://api.github.com/repos/cmisra/Sangeet/contents/Bhatkhande%20Dataset?ref=$sangeetCommit"
$xmlListing = Invoke-RestMethod -Uri $sangeetXmlUrl -Headers $githubHeaders
$xmlFiles = @($xmlListing | Where-Object { $_.type -eq 'file' -and $_.name.EndsWith('.xml') })
$xmlRecords = [System.Collections.Generic.List[object]]::new()
$xmlFileCount = $xmlFiles.Count
for ($fileIndex = 0; $fileIndex -lt $xmlFileCount; $fileIndex++) {
  $xmlEntry = $xmlFiles[$fileIndex]
  $xmlFileName = [string]$xmlEntry.name
  $encodedFileName = [Uri]::EscapeDataString($xmlFileName)
  $xmlUrl = "https://raw.githubusercontent.com/cmisra/Sangeet/$sangeetCommit/Bhatkhande%20Dataset/$encodedFileName"
  try {
    $xmlText = (Invoke-WebRequest -Uri $xmlUrl -Headers $githubHeaders -UseBasicParsing).Content
  } catch {
    throw "Failed to fetch Sangeet XML '$xmlFileName': $($_.Exception.Message)"
  }
  $xml = [System.Xml.XmlDocument]::new()
  $xml.PreserveWhitespace = $false
  $xml.LoadXml($xmlText)

  $notationRows = [System.Collections.Generic.List[object]]::new()
  $lineIndex = 0
  foreach ($line in $xml.SelectNodes('/swarlipi/SHEET/LINES/LINE')) {
    $rowIndex = 0
    foreach ($row in $line.SelectNodes('./ROW')) {
      $rowIndex++
      $cells = [System.Collections.Generic.List[string]]::new()
      foreach ($column in $row.SelectNodes('./COL')) {
        $content = Get-XmlText -Node $column -Path './CONTENT'
        $cells.Add($content)
      }
      $notationRows.Add([pscustomobject]@{
        lineIndex = $lineIndex
        rowIndex = $rowIndex
        cells = ($cells -join ' ')
      })
    }
    $lineIndex++
  }

  $raag = $xml.SelectSingleNode('/swarlipi/RAAG')
  $taal = $xml.SelectSingleNode('/swarlipi/TAAL')
  $info = $xml.SelectSingleNode('/swarlipi/INFO')
  $recordId = [IO.Path]::GetFileNameWithoutExtension($xmlFileName)
  $xmlRecords.Add([pscustomobject]@{
    id = $recordId
    sourceRecordId = $recordId
    sourceFileName = $xmlFileName
    sourceGitBlob = $xmlEntry.sha
    title = Get-XmlText -Node $info -Path './TITLE'
    composer = Get-XmlText -Node $info -Path './COMPOSER'
    notationSystem = Get-XmlText -Node $info -Path './NOTATION_SYSTEM'
    year = Get-XmlText -Node $info -Path './YEAR'
    genre = Get-XmlText -Node $info -Path './GENRE'
    raagName = Get-XmlText -Node $raag -Path './RAAG_NAME'
    thaat = Get-XmlText -Node $raag -Path './THAAT'
    arohana = Get-XmlText -Node $raag -Path './AROHANA'
    avarohana = Get-XmlText -Node $raag -Path './AVAROHANA'
    vadi = Get-XmlText -Node $raag -Path './VADI'
    samvadi = Get-XmlText -Node $raag -Path './SAMVAADI'
    jati = Get-XmlText -Node $raag -Path './JAATI'
    pakad = Get-XmlText -Node $raag -Path './PAKAD'
    taalName = Get-XmlText -Node $taal -Path './TAAL_NAME'
    matra = Get-XmlText -Node $taal -Path './MAATRA'
    bibhaga = Get-XmlText -Node $taal -Path './BIBHAGA'
    avartana = Get-XmlText -Node $taal -Path './AVARTANA'
    beatPattern = Get-XmlText -Node $taal -Path './BEAT_PATTERN'
    totalLines = Get-XmlText -Node ($xml.SelectSingleNode('/swarlipi/SHEET')) -Path './TOTAL_LINE'
    notationRows = $notationRows.ToArray()
    sourceXml = $xmlText
  })
}

$sangeetXmlManifest = [pscustomobject]@{
  datasetId = 'sangeet-xml'
  name = 'Sangeet Bhatkhande notation XML'
  datasetKind = 'composition-notation'
  sourceName = 'cmisra/Sangeet'
  sourceUrl = "https://github.com/cmisra/Sangeet/tree/$sangeetCommit/Bhatkhande%20Dataset"
  sourceCommit = $sangeetCommit
  license = 'User-confirmed permission (2026-10-04); no repository license stated'
  licenseStatus = 'user-confirmed'
  rightsBasis = 'The user confirmed they have the right to use this dataset.'
  visibility = 'admin-only-development'
  recordCount = $xmlRecords.Count
  description = '116 composition XML files with INFO, TAAL, RAAG, and SHEET elements.'
}
$sangeetXmlBundle = [pscustomobject]@{ manifest = $sangeetXmlManifest; records = $xmlRecords.ToArray() }
$sangeetCsvBundle = Convert-FeatureCsv -DatasetId 'sangeet-frequency-csv' -DatasetName 'Sangeet composition swara-frequency CSV' -Repository 'cmisra/Sangeet' -Commit $sangeetCommit -FilePath 'Machine%20Learning/Bhatkhande-Dataset.csv'
$raagBaseCsvBundle = Convert-FeatureCsv -DatasetId 'raagbase-frequency-csv' -DatasetName 'RaagBase Bhatkhande composition swara-frequency CSV' -Repository 'cmisra/RaagBase' -Commit $raagBaseCommit -FilePath 'Bhatkhande-Dataset.csv'

$outputDirectory = Join-Path (Get-Location) '.firebase'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
foreach ($bundle in @($sangeetXmlBundle, $sangeetCsvBundle, $raagBaseCsvBundle)) {
  $json = ConvertTo-Json -InputObject $bundle -Depth 100 -Compress
  [System.IO.File]::WriteAllText((Join-Path $outputDirectory "$($bundle.manifest.datasetId).json"), $json, $utf8NoBom)
}

$summary = [pscustomobject]@{
  datasets = @($sangeetXmlManifest, $sangeetCsvBundle.manifest, $raagBaseCsvBundle.manifest)
  sangeetXmlRecords = $xmlRecords.Count
  sangeetCsvRecords = $sangeetCsvBundle.records.Count
  raagBaseCsvRecords = $raagBaseCsvBundle.records.Count
}
[System.IO.File]::WriteAllText((Join-Path $outputDirectory 'composition-dataset-summary.json'), (ConvertTo-Json -InputObject $summary -Depth 20), $utf8NoBom)
Write-Output "Built separate dataset bundles: Sangeet XML=$($xmlRecords.Count), Sangeet CSV=$($sangeetCsvBundle.records.Count), RaagBase CSV=$($raagBaseCsvBundle.records.Count)."