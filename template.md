# AGENTS.md Template

Use this template when creating or updating AGENTS.md files for components in the WhisperV2 project.

## Structure

````markdown
# AGENTS.md - [Project/Component Name]

## Header

Title: [Project Name] - [Component Type] Agent Manifest
Version: [version number from package.json]
Author: [Team Name] <email@domain.com>
Maintainer: [Team Name] <email@domain.com>
Created: [YYYY-MM-DD]
Last Updated: [YYYY-MM-DD or YYYY-Mon-DD]

## Overview

[2-3 sentence description of what this component/project does, its main purpose, and key features. Mention integrations with other components if applicable.]

## Configuration

Models: [List AI models used, if applicable]
APIs: [List external APIs integrated]
ENV:

- [ENV_VAR_NAME] ([description, default value if applicable])
- [ENV_VAR_NAME] ([description, default value if applicable])
- [Continue listing all environment variables...]
  Dependencies:
- [Dependency Name] [version] ([purpose/notes])
- [Dependency Name] [version] ([purpose/notes])
- [Continue listing key dependencies with versions from package.json...]
  Security:
- [Security feature 1]
- [Security feature 2]
- [Continue listing security measures...]

## Code Style and Conventions

Language Standards:

- TypeScript: [version] with strict mode
- JavaScript: ES6+ (ECMAScript 2018+)
- React: [version] with functional components and hooks
- Node.js: [version]
- [Other relevant language/framework]: [version] ([notes])

Formatting Rules (Prettier):

- Indentation: 4 spaces (tabWidth: 4)
- Quotes: Single quotes for strings
- Semicolons: Required
- Print Width: 150 characters per line
- Trailing Commas: ES5 style
- Arrow Parens: Avoid parentheses when possible
- End of Line: LF (Unix-style)

Linting Rules:

- [Component/Path]: ESLint with [config name] ([config file])
- [Component/Path]: ESLint with [config name] ([config file])
- Run linting: `[command]` ([location/context])

Naming Conventions:

- Components: PascalCase (e.g., `ComponentName.tsx`)
- Files: camelCase for utilities, PascalCase for components
- Variables/Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- TypeScript Interfaces/Types: PascalCase

UI and Styling:

- CSS Framework: [Framework name] for all styling
- Component Library: [Library name] ([style/variant])
- Animations: [Library name]
- Icons: [Library name]
- Import Aliases: [@/alias1, @/alias2, etc.]

TypeScript Usage:

- Strict typing enabled
- Prefer type inference where possible
- Use interfaces for object shapes
- Avoid `any` type
- Run type checking: `[command]` ([includes/notes])

Code Organization:

- Components: `[path]/` directory with `[subdirectory]/` for [purpose]
- Utilities: `[path]/` or `[path]/` directories
- Hooks: `[path]/` directory
- API Routes: `[path]/` ([framework/architecture])
- Services: [Organization pattern] in `[path]/`

Commit Messages:

- Format: `<type>(<scope>): <short summary>`
- Types: feat, fix, docs, style, refactor, test, chore
- Scope: Optional component/feature name
- Example: `feat(auth): add JWT token refresh`

Development Guidelines:

- Always run TypeScript type checking on changes
- Use Windows PowerShell commands (not Unix/Mac commands)
- Write complete implementations (no placeholder code)
- Keep responses concise and actionable
- Use TODO lists for complex multi-step tasks
- [Add component-specific guidelines...]

## Capabilities

Tools:

- Build System: [description] ([tools/versions])
- Testing: [framework] [version] for [test types]
- Linting: [tool] with [config]
- Formatting: [tool] [version] with [notes]
- Packaging: [tool] [version] for [purpose]
- Deployment: [description]

Functions:

- On [event]: [what happens]
- On [event]: [what happens]
- [Continue listing key functions/behaviors...]

Behavior:

- [Behavior/requirement 1]
- [Behavior/requirement 2]
- [Continue listing important behaviors...]

Limitations:

- [Limitation 1]
- [Limitation 2]
- [Continue listing known limitations...]

Performance:

- [Metric]: < [target value]
- [Metric]: < [target value]
- [Continue listing performance targets...]

## Implementation

Paths:

- Root: [path]
- [Component Name]: [path]
- [Component Name]: [path] ([notes])
- Build Output: [path] ([purpose])
- Test Directories: [paths]
- Database: [location/description]

Integration:

- [Integration point]: [description] ([config file])
- [Integration point]: [description] ([config file])
- [Continue listing integrations...]

### Build Configuration

[Tool Name] ([config file]):

- [Setting]: [value]
- [Setting]: [value]
- [Continue with configuration details...]

[Another Tool] ([config file]):

- [Setting]: [value]
- [Continue...]

Testing:

- Unit Tests: [command] ([framework] - [path pattern])
- Integration Tests: [command] ([framework] - [path pattern])
- E2E Tests: [command] ([framework] - [path])
- Test Coverage: [command] ([description])
- Test Setup: [files/paths]
- Test Mocks: [path] ([files])

## Usage

### Development Setup

```powershell
# Full project setup (recommended)
[command]

# Individual component development
[command]    # [description]
[command]    # [description]
[command]    # [description]
```
````

### Testing Commands

```powershell
# Run all tests
[command]                  # [description]

# [Test type] commands
[command]        # [description]
[command]        # [description]
[command]        # [description]

# [Another test type] tests
[command]          # [description]
[command]          # [description]
[command]          # [description]
```

### Build Commands

```powershell
# Development builds
[command]         # [description]
[command]         # [description]
[command]         # [description]

# Production builds
[command]             # [description]
[command]             # [description]
[command]             # [description]
```

### Cross-Platform Builds

```powershell
# [Platform] ([architecture])
[command]

# [Platform] ([architecture])
[command]
# [Additional notes about build configuration]

# Build Configuration
# See [config file] for platform-specific settings:
# - [Platform]: [details]
# - [Platform]: [details]
```

### Environment Management

```powershell
# Set API keys (Windows PowerShell)
$env:[VAR_NAME]="your_key_here"
$env:[VAR_NAME]="your_key_here"

# Configure [purpose]
$env:[VAR_NAME]="[default value]"
$env:[VAR_NAME]="[default value]"

# Configure advanced settings
$env:[VAR_NAME]="[value]"
$env:[VAR_NAME]="[value]"

# [Optional setting] (optional, uses [default] if not set)
$env:[VAR_NAME]="[path]"
```

### Troubleshooting

Common Issues:

- [Issue 1]: [Solution]
- [Issue 2]: [Solution]
- [Issue 3]: [Solution]
- [Issue 4]: [Solution]
- [Issue 5]: [Solution]

Debug Commands:

```powershell
# Check [what] (Windows PowerShell)
[command]; [command]

# Validate dependencies
[command]
[command]

# Check build outputs
[command]
[command]

# Check [component] compilation
[command]
```

## Maintenance

### Version Control

- Semantic versioning (MAJOR.MINOR.PATCH)
- Major version: [Breaking change criteria]
- Minor version: [New feature criteria]
- Patch version: [Bug fix criteria]

### Update Procedures

Update Checklist:

- [ ] Test all npm scripts work correctly ([locations])
- [ ] Verify cross-platform builds succeed ([platforms])
- [ ] Update dependency versions in [package.json files]
- [ ] [Component-specific check]
- [ ] Test [component-specific tests]
- [ ] Validate [integrations]
- [ ] Run test suite ([test types])
- [ ] Update documentation ([files])
- [ ] Tag release with proper semantic version

### Monitoring

- [Monitoring method 1]: [description] ([command/tool])
- [Monitoring method 2]: [description]
- [Monitoring method 3]: [description]
- [Monitoring method 4]: [description]
- [Monitoring method 5]: [description]

### Security Updates

- [Security practice 1]: [schedule/description]
- [Security practice 2]: [schedule/description]
- [Security practice 3]: [schedule/description]
- [Security practice 4]: [schedule/description]
- [Security practice 5]: [schedule/description]

## Update History

| Date                                  | Version   | Author | Description              |
| ------------------------------------- | --------- | ------ | ------------------------ |
| [YYYY-MM-DD]                          | [version] | [Team] | [Description of changes] |
| [YYYY-MM-DD]                          | [version] | [Team] | [Description of changes] |
| [Continue with historical entries...] |

```

## Notes

- Always use Windows PowerShell syntax for commands (not bash/Unix)
- Escape glob patterns in markdown: `**/*` becomes `**/\*` or `**/_`
- Include actual versions from package.json files
- Verify all paths exist in the codebase
- Verify all npm scripts exist before documenting them
- Use consistent date format: YYYY-MM-DD or YYYY-Mon-DD
- Keep descriptions concise and actionable
- Update "Last Updated" date when making changes
- Add entries to Update History when making significant updates

```
