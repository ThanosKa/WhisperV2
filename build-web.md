### Web build (PowerShell)

```powershell
Set-Location pickleglass_web; if (Test-Path .next) { Remove-Item -Recurse -Force .next }; if (Test-Path out) { Remove-Item -Recurse -Force out }; npm run build
```

### Goal

- Presets are editable on the web; defaults are editable but not deletable.
- Default `Personal` is included with others and selected by default.
- Electron Listen injects Role text for all presets over the shared base body.

### Role (current)

- Web shows a Role editor for each preset.
- New presets start with empty Role; user supplies it.
- Body is shared base (meeting analysis) for all presets.

### Changes implemented

- DB/Repos: default `Personal` added; editing allowed for defaults; deletion blocked only for defaults.
- Electron: selection persists; role injected for all (default selection is `personal`).
- Web: Personalize page labels Role and restores classic editor styling; Delete visible only for user presets.

### Phase 3 (optional)

- Load default mode from DB when no selection exists; remove any remaining hardcoded templates.
- Later: introduce per-preset body overrides if required.
