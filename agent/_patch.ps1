$c = Get-Content '..\server\server.cjs' -Raw  
$old = 'const { selfAgentStream } = require(''../core/agent/self_agent.cjs'');'  
$new = 'const { selfAgentStream } = require(''../agent/self_agent.cjs'');'  
if ($c.Contains($old)) { $c = $c.Replace($old, $new); Set-Content '..\server\server.cjs' -Value $c -NoNewline; Write-Host 'OK' } else { Write-Host 'SKIP' } 
