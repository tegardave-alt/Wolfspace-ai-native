$c = Get-Content 'public/styles.css'  
$c = $c -replace '  align-items: center;', '  align-items: flex-start;'  
$c = $c -replace '  padding: 6px 0;', '  padding: 8px 0 0;'  
$c | Set-Content 'public/styles.css' -Encoding UTF8 
