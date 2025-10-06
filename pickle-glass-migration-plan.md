# Pickle → Whisper Migration Plan

## Summary

This plan outlines the complete rebranding of the codebase from "Pickle Glass" to "Whisper". We'll systematically rename all references across **50+ files** and **7 phases** over 2-4 weeks.

**What we're changing:**

- `pickle-glass` → `whisper` (package names, bundle ID)
- `pickleglass_web/` → `whisper_web/` (directory structure)
- `pickleglass_*` → `whisper_*` (environment variable **names in code** - no .env files exist)
- `pickleglass://` → `whisper://` (protocol scheme)
- `pickleglass.db` → `whisper.db` (database file)
- `pickleglass_user` → `whisper_user` (localStorage keys)
- All UI text, documentation, and external references

**Why phased approach:** High-risk changes (bundle ID, env vars) must be done first, followed by directory structure, then cosmetic changes. Each phase includes testing and rollback strategies.

**External scope:** App stores, GitHub repo, website, social media will need manual updates post-migration.

## Discovery Phase

### Complete Inventory of References by Category

#### String Literals and Variables (165+ instances)

- **Environment Variables**: `pickleglass_API_PORT`, `pickleglass_API_URL`, `pickleglass_WEB_PORT`, `pickleglass_WEB_URL`, `pickleglass_API_TIMEOUT`, `pickleglass_ENABLE_JWT`, `pickleglass_CACHE_TIMEOUT`, `pickleglass_LOG_LEVEL`, `pickleglass_DEBUG`
- **LocalStorage Keys**: `localStorage.pickleglass_user` (auth, api, login files)
- **Protocol URLs**: `pickleglass://` scheme (auth-success, login callbacks)
- **Database References**: `pickleglass.db` path, `contact@pickle.com` email
- **UI Text**: `"Pickle Free System"`, `"Pickle Glass works"`

#### File Names and Folder Names (Critical)

- **Directory Structure**: `pickleglass_web/` → `webapp/`
- **Import Paths**: `../pickleglass_web/backend_node/dist`, `../pickleglass_web/out`
- **File References**: `src/ui/app/PickleGlassApp.js` comments

#### Configuration Files (High Risk)

- **electron-builder.yml**: `appId: com.pickle.glass`, `owner: pickle-com`, protocol `pickleglass`
- **package.json files**: `"pickle-glass"`, `"pickleglass-frontend"`
- **Settings Service**: `pickle-glass-settings` name
- **Config Directory**: `.pickleglass` user data folder

#### API Endpoints and URLs

- **Protocol Handlers**: `pickleglass://auth-success`, `pickleglass://login`
- **External Links**: `https://www.pickle.com/privacy-policy`, `https://www.pickle.com/terms-of-service`
- **API Messages**: `'pickleglass API is running'`

#### Database References

- **SQLite Path**: `pickleglass.db`
- **Default User**: `contact@pickle.com`
- **Config Directory**: `~/.pickleglass`

#### Comments and Documentation (41 files)

- **README.md**: "Glass by Pickle", pickle.com links
- **CONTRIBUTING.md**: "Glass by Pickle"
- **Docs**: All `.md` files reference `pickleglass_web/`, env vars, protocols
- **CSS Comments**: `[ GLASS BYPASS ]`, `[ GLASSMORPHISM ENHANCEMENTS ]`
- **Code Comments**: `PickleGlass (${releaseName})` update messages

#### UI/UX References

- **Settings**: `handleUsePicklesKey` method
- **CSS Classes**: `body.has-glass` glassmorphism bypass
- **Component Names**: Various glass-related CSS selectors

#### External/Deployment Scope

- **GitHub**: `github.com/pickle-com/glass`
- **Domain**: `pickle.com` website and branding
- **App Stores**: Apple App Store, Microsoft Store listings
- **Update System**: Auto-updater references `PickleGlass`
- **Third-party**: Analytics, error reporting, CDN assets

### Risk Assessment

#### Critical Risk (App Breaking)

- **Bundle ID**: `com.pickle.glass` → `com.whisper.app` (breaks updates)
- **Protocol Scheme**: `pickleglass://` → `whisper://` (breaks auth flows)
- **Environment Variables**: All `pickleglass_*` → `whisper_*` (breaks API)
- **Directory Structure**: `pickleglass_web/` → `webapp/` (breaks imports)

#### High Risk (User Impact)

- **Database Migration**: `pickleglass.db` → `whisper.db` (data persistence)
- **LocalStorage**: `pickleglass_user` → `whisper_user` (breaks sessions)
- **Config Directory**: `.pickleglass` → `.whisper` (user data location)

#### Medium Risk (Development)

- **Package Names**: npm publishing and dependencies
- **Build Configuration**: electron-builder.yml changes
- **Documentation**: Developer experience impact

#### Low Risk (Cosmetic)

- **UI Text**: User-facing strings
- **CSS Classes**: Glassmorphism styling (keep as-is for UI)
- **Comments**: Code documentation

### Dependencies and Interconnections

#### Build Pipeline Chain

```
electron-builder.yml → src/index.js → pickleglass_web/ → package.json
       ↓                    ↓              ↓
   notarize.js      config.js        backend_node/dist
       ↓                    ↓              ↓
   bundle ID        env vars         import paths
```

#### Runtime Dependencies

```
Protocol Handlers → Auth Service → LocalStorage → API Calls
       ↓              ↓              ↓            ↓
   pickleglass://   callbacks      keys        headers
```

#### Storage Dependencies

```
Database Path → SQLite Client → User Data → Auth State
     ↓              ↓              ↓         ↓
pickleglass.db   queries       profile   sessions
```

## Execution Phases

### Phase 1: Configuration Foundation (1-2 days)

**Risk**: Critical | **Files**: 4 | **Test**: Build validation

#### Files to Modify

- [x] `electron-builder.yml`: `appId`, `owner`, `protocols.name`, `schemes`
- [x] `package.json`: `name`, `author`
- [x] `pickleglass_web/package.json`: `name`
- [x] `notarize.js`: `appBundleId` (if exists)

#### Order of Operations

1. Update electron-builder.yml bundle ID first
2. Update package.json names
3. Update notarize.js to match bundle ID
4. Test: `npm run build` succeeds

#### Rollback Strategy

- Git revert all config changes
- Clear npm cache: `npm cache clean --force`
- Reinstall dependencies: `npm install`

### Phase 2: Environment Variables (1 day)

**Risk**: Critical | **Files**: 5 | **Test**: Environment loading

**Note**: Environment variables are defined in code only (src/index.js) - no .env files exist to update.

#### Files to Modify

- [x] `src/index.js`: Lines 667-674 (env var assignments), 673-674 (export object)
- [x] `src/features/common/config/config.js`: Lines 10,13,55-61,70-87,113
- [x] `src/bridge/featureBridge.js`: Line 71
- [x] `src/window/windowManager.js`: Line 448
- [x] `pickleglass_web/backend_node/index.ts`: Line 9

#### Order of Operations

1. Update env var names in main process
2. Update config service references
3. Update bridge and window manager
4. Test: App starts with correct env vars

#### Rollback Strategy

- Temporarily maintain dual env var support
- Add fallback mappings: `old_var || new_var`

### Phase 3: Protocol and Deep Links (2 days)

**Risk**: High | **Files**: 8 | **Test**: Auth flow E2E

#### Files to Modify

- [x] `src/index.js`: Lines 25,32,78,83,85,88,93,109,141,182,527
- [x] `docs/auth-pipeline.md`: Protocol documentation
- [x] `docs/dev-mock-mode.md`: Protocol references
- [x] `docs/dev-mock-mode-webapp.md`: Protocol references
- [x] `docs/llm-pipeline.md`: Base URL references
- [x] `docs/presets-pipeline.md`: Directory references

#### Order of Operations

1. Update protocol registration in main process
2. Update all protocol handling logic
3. Update documentation references
4. Test: Auth login → callback → session persistence

#### Rollback Strategy

- Implement dual protocol support
- Redirect old `pickleglass://` URLs to `whisper://`

### Phase 4: Storage and Database (3 days)

**Risk**: High | **Files**: 8 | **Test**: Data migration

#### Files to Modify

- [x] `src/features/common/services/databaseInitializer.js`: Line 16,21-22
- [x] `src/features/common/services/sqliteClient.js`: Line 222
- [x] `src/features/common/services/authService.js`: Lines 313,341
- [x] `pickleglass_web/utils/auth.ts`: Lines 87,121,147
- [x] `pickleglass_web/utils/api.ts`: Lines 150,156,166,168
- [x] `pickleglass_web/app/login/page.tsx`: Line 62
- [x] `src/features/settings/settingsService.js`: Line 11

#### Order of Operations

1. Create database migration script
2. Update localStorage key references
3. Update default data values
4. Test: User login → data persistence → logout

#### Rollback Strategy

- Backup existing database files
- Implement localStorage migration (old → new keys)
- Support backward compatibility for existing data

### Phase 5: Directory Structure (2 days)

**Risk**: High | **Files**: 15+ | **Test**: Full build pipeline

#### Files to Modify

- [x] Rename `pickleglass_web/` → `whisper_web/` directory
- [x] `src/index.js`: Lines 677,680 (import paths)
- [x] `electron-builder.yml`: Lines 26,32 (file paths)
- [x] All relative imports within whisper_web directory
- [x] `docs/dev-mock-mode.md`: Directory references
- [x] `docs/dev-mock-mode-webapp.md`: Directory references

#### Order of Operations

1. Update all import/export statements first
2. Update build configuration paths
3. Rename directory structure
4. Test: Complete build → install → run pipeline

#### Rollback Strategy

- Directory rename is atomic (easily reverted)
- Keep old import paths as temporary fallbacks

### Phase 6: UI Text and Branding (1 day)

**Risk**: Low | **Files**: 6 | **Test**: Visual verification

#### Files to Modify

- [ ] `pickleglass_web/components/Sidebar.tsx`: Line 529
- [ ] `pickleglass_web/app/settings/billing/page.tsx`: Line 63
- [ ] `src/ui/settings/SettingsView.js`: Lines 30,98,478
- [ ] `src/index.js`: Line 770 (update message)
- [ ] `pickleglass_web/backend_node/index.ts`: Line 22

#### Order of Operations

1. Update user-facing text strings
2. Update update notification messages
3. Update API status messages
4. Test: UI displays correct branding

#### Rollback Strategy

- String replacements are easily reversible
- No functional dependencies

### Phase 7: Documentation Cleanup (1 day)

**Risk**: Low | **Files**: 10+ | **Test**: Documentation review

#### Files to Modify

- [ ] `README.md`: Product name, links, branding
- [ ] `CONTRIBUTING.md`: Product name references
- [ ] `pickleglass_web/public/README.md`: App name references
- [ ] All `.md` files in `docs/` directory
- [ ] Code comments referencing "PickleGlass"

#### Order of Operations

1. Update README and contributing docs
2. Update all pipeline documentation
3. Update code comments
4. Test: Documentation renders correctly

#### Rollback Strategy

- Documentation changes are non-functional
- Easy git revert if needed

## External/Manual Items

### Deployment and Distribution

- [ ] **App Store Submissions**: Update bundle ID in Apple App Store, Microsoft Store
- [ ] **Code Signing Certificates**: New certificates for `com.whisper.app`
- [ ] **Auto-Update System**: Update Sparkle (macOS) and electron-updater configs
- [ ] **GitHub Repository**: Rename `pickle-com/glass` → new owner/repo
- [ ] **Release Automation**: Update CI/CD pipelines and build scripts

### Third-Party Integrations

- [ ] **Analytics Services**: Update app identifiers and tracking domains
- [ ] **Error Reporting**: Update Sentry/Crashlytics app IDs
- [ ] **CDN Assets**: Update asset URLs and cache invalidation
- [ ] **API Endpoints**: Backend services referencing old app identifiers

### Marketing and External Assets

- [ ] **Website**: Migrate `pickle.com` → `whisper.com` or update branding
- [ ] **Social Media**: Update handles, bios, profile descriptions
- [ ] **Documentation Sites**: Update all external documentation
- [ ] **Support Channels**: Discord, forums, help center branding
- [ ] **Press Releases**: Update product names in public announcements

### User-Facing Materials

- [ ] **Download Links**: Update all distribution and download URLs
- [ ] **Installation Guides**: Update setup instructions and screenshots
- [ ] **Video Tutorials**: Update branding in video content
- [ ] **Marketing Images**: Update UI strings in promotional materials

## Validation Checklist

### Pre-Migration Testing

- [ ] Full application build: `npm run build` succeeds
- [ ] Installation package creation works
- [ ] Basic app launch and window management
- [ ] API communication with backend services
- [ ] Authentication flow (login/logout)
- [ ] Database operations (create, read, update)

### Phase-by-Phase Validation

- [x] **Phase 1**: Build succeeds with new bundle ID and package names
- [x] **Phase 2**: Environment variables load correctly at startup
- [x] **Phase 3**: Deep link callbacks work end-to-end
- [x] **Phase 4**: User data persists across app restarts
- [x] **Phase 5**: All imports resolve, build pipeline complete
- [ ] **Phase 6**: UI displays correct product branding
- [ ] **Phase 7**: No outdated references in documentation

### Critical Path Testing

- [ ] **Authentication Flow**: Login → OAuth redirect → session storage → API calls
- [ ] **Data Persistence**: User data → database → app restart → data integrity
- [ ] **Build Pipeline**: Code changes → build process → packaged app → installation
- [ ] **Update Mechanism**: Version check → download → installation → migration
- [ ] **Cross-Platform**: Works on Windows, macOS, Linux with new identifiers

### Post-Migration Verification

- [ ] **Code Search**: `grep -r "pickle\|glass\|pickexxx" --exclude-dir=node_modules` returns zero results
- [ ] **Runtime Inspection**: Check environment variables, localStorage keys, database paths
- [ ] **Integration Testing**: End-to-end user workflows function correctly
- [ ] **Performance Testing**: No regression in startup time, memory usage, or responsiveness
- [ ] **Compatibility Testing**: Works with all supported operating systems and versions

### Rollback Testing

- [ ] **Configuration**: Environment variables can be reverted to old values
- [ ] **Data Migration**: Can restore from database backups
- [ ] **User Sessions**: localStorage migration is reversible
- [ ] **Protocol Handlers**: Dual scheme support works during transition
- [ ] **Build System**: Can revert directory structure changes

---

**Total Migration Time**: 2-4 weeks | **Files Affected**: 50+ | **Risk Level**: High but manageable
