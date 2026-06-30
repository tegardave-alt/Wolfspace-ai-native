$c = Get-Content '..\web\app.jsx' -Raw  
$old1 = 'const [theme, setTheme] = useState(() => { try { return localStorage.getItem(\"quantum_theme\") || \"dark\"; } catch(e){ return \"dark\"; } });'  
$new1 = 'const [theme, setTheme] = useState(() => { try { return localStorage.getItem(\"quantum_theme\") || \"dark\"; } catch(e){ return \"dark\"; } });' + \"`n\" + '  const [mode, setMode] = useState(() => { try { return localStorage.getItem(\"quantum_mode\") || \"plan\"; } catch (e) { return \"plan\"; } });'  
if ($c.Contains($old1)) { $c = $c.Replace($old1, $new1); Write-Host 'Change 3 OK' } else { Write-Host 'Change 3 SKIP' }  
$old2 = 'await streamSelfAgent({ history:newHist, cloud:getCloud(), port:modelVal }, (j)=>{'  
$new2 = 'await streamSelfAgent({ history:newHist, cloud:getCloud(), port:modelVal, mode }, (j)=>{'  
if ($c.Contains($old2)) { $c = $c.Replace($old2, $new2); Write-Host 'Change 4 OK' } else { Write-Host 'Change 4 SKIP' }  
Set-Content '..\web\app.jsx' -Value $c -NoNewline 
