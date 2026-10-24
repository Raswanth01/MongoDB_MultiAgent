```bat
@echo off
title AgentTrace CLI

cd /d "D:\Databyte_Projects\MongoDB_MultiAgent"

echo Starting AgentTrace CLI...
call npx tsx src/interactive.ts

pause
```