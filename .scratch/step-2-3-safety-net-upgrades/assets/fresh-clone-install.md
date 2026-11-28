# Fresh clone install check (ticket 04)

A fresh clone of branch `step-2-3-04-pnpm-node-26-electron-45` at commit `80c2634`, in an empty folder, on the owner's Mac, 2026-11-28. Output of the one-off check script, verbatim. The packages came from the machine's pnpm store, so the install took 3 s; the lockfile and the result are the same as a download.

```
$ date -u
Sat Nov 28 11:22:18 UTC 2026
$ sw_vers -productVersion
15.6.1
$ node -v
v26.13.1
$ pnpm -v
12.23.0
$ ls package-lock.json whisper_web/package-lock.json .npmrc .gitmodules
ls: .gitmodules: No such file or directory
ls: .npmrc: No such file or directory
ls: package-lock.json: No such file or directory
ls: whisper_web/package-lock.json: No such file or directory
$ ls node_modules
ls: node_modules: No such file or directory
$ pnpm install --frozen-lockfile
Scope: all 2 workspace projects
✓ Lockfile passes supply-chain policies (verified 45s ago)
Lockfile is up to date, resolution step is skipped
Packages are cloned from the content-addressable store to the virtual store.
  Content-addressable store is at: /Users/thaka/Library/pnpm/store/v11
  Virtual store is at:             node_modules/.pnpm
Packages: +1117
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Done in 2.9s using pnpm v12.23.0
exit: 0
$ node -e (open better-sqlite3 in memory)
better-sqlite3 loads on Node v26.13.1
$ ls node_modules/@img
colour
sharp-darwin-arm64
sharp-darwin-x64
sharp-libvips-darwin-arm64
sharp-libvips-darwin-x64
```

The Electron binary is not part of the install (Electron 42+ has no install script). It downloads on the first `require('electron')`, or ahead of time with `pnpm exec install-electron --no`.
