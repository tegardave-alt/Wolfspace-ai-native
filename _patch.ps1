$script = @'  
$content = Get-Content 'tools\index.cjs' -Raw  
$target = \"const { SELF_TOOLS } = require('./tool-definitions.cjs');\"  
$insert = \"const { validateOperation } = require('./sandbox-validator.cjs');\"  
if ($content -notmatch 'validateOperation') {  
  $content = $content.Replace($target, $target + \"`n\" + $insert)  
  Set-Content 'tools\index.cjs' -Value $content -NoNewline  
  Write-Host 'Added import'  
} else { Write-Host 'Already exists' }  
'@  
