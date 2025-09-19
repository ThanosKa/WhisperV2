### Web build (PowerShell)

```powershell
Set-Location pickleglass_web; if (Test-Path .next) { Remove-Item -Recurse -Force .next }; if (Test-Path out) { Remove-Item -Recurse -Force out }; npm run build
```
