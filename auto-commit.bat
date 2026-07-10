@echo off 
cd /d C:\Users\dave\WOLFSPACE 
:loop 
git add -A 
git commit -m auto 
timeout /t 15 /nobreak >nul 
goto loop 

