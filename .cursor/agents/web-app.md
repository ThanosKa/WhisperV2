# AGENTS.md - Web App (Next.js)

## Header

Title: WhisperV2 Web App Agent Manifest
Version: 0.1.0
Author: Web Team <web@whisper.com>
Maintainer: Frontend Team <frontend@whisper.com>
Created: 2025-01-15
Last Updated: 2025-01-27

## Overview

Next.js web application providing user management, activity tracking, and desktop app companion features. Built with modern React architecture, TypeScript, and E2E testing. Integrates with desktop app via backend_node API server for seamless user experience across platforms.

## Configuration

Framework: Next.js 14 (App Router), React 18, TypeScript 5.x
Styling: Tailwind CSS 3.x, shadcn/ui components
Backend: Node.js/Express with TypeScript (backend_node/)
Testing: Playwright for E2E tests
ENV:

- NEXT_PUBLIC_DEV_MOCK (enable dev mock mode, set to '1' for development without backend, used in utils/devMock.ts)
- whisper_WEB_URL (backend CORS origin, default: http://localhost:3000, used in backend_node/index.ts)
- NODE_ENV (development/production, used in utils/api.ts to determine API origin)
  Dependencies:
- Next.js ^14.2.30
- React ^18
- TypeScript ^5
- Tailwind CSS ^3.3.0
- shadcn/ui ^0.9.5
- Playwright ^1.47.2
- Framer Motion ^12.23.24
- Lucide React ^0.294.0
  Security:
- localStorage-based user authentication
- API route protection via backend_node middleware
- CORS configuration for desktop app communication
- Secure environment variable management

## Code Style and Conventions

Language Standards:

- TypeScript: 5.x with strict mode
- JavaScript: ES6+ (ECMAScript 2018+)
- React: 18.x with functional components and hooks
- Node.js: 20.x.x

Formatting Rules (Prettier):

- Indentation: 4 spaces (tabWidth: 4)
- Quotes: Single quotes for strings
- Semicolons: Required
- Print Width: 150 characters per line
- Trailing Commas: ES5 style
- Arrow Parens: Avoid parentheses when possible
- End of Line: LF (Unix-style)

Linting Rules:

- Web App (whisper_web/): ESLint with Next.js core-web-vitals and TypeScript rules (.eslintrc.json)
- Run linting: `npm run lint` (whisper_web directory)

Naming Conventions:

- Components: PascalCase (e.g., `ActivityCard.tsx`, `AuthGuard.tsx`)
- Files: camelCase for utilities, PascalCase for components
- Variables/Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- TypeScript Interfaces/Types: PascalCase

UI and Styling:

- CSS Framework: Tailwind CSS for all styling
- Component Library: Shadcn UI (New York style)
- Animations: Framer Motion
- Icons: Lucide React
- Import Aliases: @/components, @/lib, @/utils, @/hooks

TypeScript Usage:

- Strict typing enabled
- Prefer type inference where possible
- Use interfaces for object shapes
- Avoid `any` type
- Run type checking: `npx tsc --noEmit` (includes TypeScript validation)

Code Organization:

- Components: `components/` directory with `ui/` subdirectory for Shadcn components
- Utilities: `lib/` or `utils/` directories
- Hooks: `hooks/` directory
- Pages: `app/` (Next.js App Router)
- Backend: `backend_node/` (TypeScript source and compiled dist/)

Commit Messages:

- Format: `<type>(<scope>): <short summary>`
- Types: feat, fix, docs, style, refactor, test, chore
- Scope: Optional component/feature name
- Example: `feat(auth): add localStorage-based authentication`

Development Guidelines:

- Always run TypeScript type checking on changes
- Use Windows PowerShell commands (not Unix/Mac commands)
- Write complete implementations (no placeholder code)
- Keep responses concise and actionable
- Use TODO lists for complex multi-step tasks
- Compile backend_node TypeScript before building web app (`npm run build:backend`)

## Capabilities

Tools:

- Development: Next.js dev server with hot reload
- Build System: Next.js compiler with optimization, backend_node TypeScript compilation
- Testing: Playwright for E2E tests
- Linting: ESLint with Next.js rules
- Styling: Tailwind CSS with custom design system
- Backend Development: Express server in backend_node/ with TypeScript

Functions:

- On user login: Store user info in localStorage, sync with desktop app via backend_node
- On activity view: Fetch and display user session data from backend_node API
- On settings update: Persist preferences via backend_node API
- On dev mock mode: Use localStorage-based mock data for development
- On download request: Serve desktop app download links
- On help access: Provide contextual documentation

Behavior:

- Responsive design across all device sizes
- Static export for deployment (output: 'export' in next.config.mjs)
- Dev mock mode for development without backend
- API communication via backend_node Express server
- localStorage-based user session management
- Accessibility-first component development

Limitations:

- Requires desktop app for full functionality
- Backend API (backend_node) must be running for production features
- Browser compatibility limited to modern browsers
- Static export mode (no server-side API routes)
- Real-time features depend on backend_node WebSocket connectivity

Performance:

- First Contentful Paint: < 1.5 seconds
- Largest Contentful Paint: < 2.5 seconds
- First Input Delay: < 100ms
- Bundle size: < 500KB for main chunks
- API response time: < 500ms for common operations

## Implementation

Paths:

- Source Root: whisper_web/
- Pages: app/ (App Router structure)
- Components: components/ (reusable UI components)
- Backend: backend_node/ (TypeScript source and compiled dist/)
- Styles: app/globals.css
- Utils: lib/ and utils/ (utility functions and configurations)
- Hooks: hooks/ (React hooks)
- Tests: E2E tests (if configured)
- Build Output: out/ (static export)

Integration:

- Desktop App: API communication via HTTP to backend_node server
- Authentication: localStorage-based user management
- Database: API calls to backend_node services (which access SQLite via IPC)
- Backend Node: Express server in backend_node/ compiled to dist/
- Dev Mock: localStorage-based mock data for development

### Build Configuration

Next.js (next.config.mjs):

- output: 'export' (static export mode)
- distDir: 'out'
- trailingSlash: true
- images: unoptimized (for static export)
- webpack: Windows-specific watch options

TypeScript (tsconfig.json):

- strict: true
- moduleResolution: bundler
- jsx: preserve
- baseUrl: '.'
- paths: @/_ maps to ./_

Backend Node (backend_node/tsconfig.json):

- Compiles TypeScript to JavaScript in dist/
- Separate config from web app TypeScript

Testing:

- E2E Tests: Playwright (if configured) - `npm run test:e2e`
- Test Setup: Playwright configuration (if exists)
- Test Mocks: utils/devMock.ts (dev mock data)

## Usage

### Development Setup

```powershell
# Full project setup (recommended)
cd whisper_web
npm install

# Individual component development
npm run dev                 # Start development server
npm run build:backend       # Compile backend_node TypeScript
npm run build               # Build web app (includes backend compilation)
npm run lint                # Run ESLint
```

### Testing Commands

```powershell
# E2E tests (if configured)
npm run test:e2e           # Run Playwright E2E tests
npm run test:e2e:headed    # Run with browser UI
npm run test:e2e:ui        # Playwright UI mode
```

### Build Commands

```powershell
# Development builds
npm run dev                 # Development server with hot reload
npm run build:backend       # Compile backend_node TypeScript only
npm run lint                # Run linting

# Production builds
npm run build               # Full production build (compiles backend_node, then builds Next.js)
npm run start               # Preview production build (requires Next.js server mode, not available in static export)
```

### Environment Management

```powershell
# Set environment variables (Windows PowerShell)
# These are the actual environment variables used in the codebase

# Enable dev mock mode (used in utils/devMock.ts)
$env:NEXT_PUBLIC_DEV_MOCK="1"

# Backend CORS origin (used in backend_node/index.ts, default: http://localhost:3000)
$env:whisper_WEB_URL="http://localhost:3000"

# Node environment (used in utils/api.ts to determine API origin)
$env:NODE_ENV="development"
```

### Component Development

```typescript
// Example: Creating a new component
// components/ActivityCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ActivityCardProps {
    title: string;
    description: string;
    timestamp: Date;
}

export function ActivityCard({ title, description, timestamp }: ActivityCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p>{description}</p>
                <time>{timestamp.toLocaleDateString()}</time>
            </CardContent>
        </Card>
    );
}
```

### Page Development (App Router)

```typescript
// Example: Activity page (client component)
// app/activity/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { getMeetingsPage, getQuestionsPage } from '@/utils/api';
import { useRedirectIfNotAuth } from '@/utils/auth';

export default function ActivityPage() {
    const userInfo = useRedirectIfNotAuth();
    const [meetings, setMeetings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Load data on mount
        loadMeetings();
    }, []);

    const loadMeetings = async () => {
        const result = await getMeetingsPage(0, 10);
        setMeetings(result.items);
        setIsLoading(false);
    };

    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Activity</h1>
            {/* Session list rendering */}
        </div>
    );
}
```

### Styling with Tailwind

```typescript
// Example: Component styling with class-variance-authority
// components/ui/button.tsx (simplified example)
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
                destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
                outline: 'border border-input bg-background shadow-sm hover:bg-accent',
            },
            size: {
                default: 'h-9 px-4 py-2',
                sm: 'h-8 rounded-md px-3 text-xs',
                lg: 'h-10 rounded-md px-8',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
    return (
        <button
            className={cn(buttonVariants({ variant, size }), className)}
            {...props}
        />
    );
}
```

### API Integration

```typescript
// Example: Using API utilities from utils/api.ts
import { getSessions, getUserProfile, updateUserProfile, apiCall } from '@/utils/api';

// Fetch user sessions (handles dev mock mode automatically)
const sessions = await getSessions();

// Get user profile
const profile = await getUserProfile();

// Update user profile
await updateUserProfile({ displayName: 'New Name' });

// Direct API call (only works when not in dev mock mode)
const response = await apiCall('/api/user/profile', {
    method: 'GET',
});

// Dev mock mode handling (automatic via utils/api.ts)
// When NEXT_PUBLIC_DEV_MOCK=1, API calls use localStorage mock data
// Functions like getSessions(), getUserProfile() automatically use mocks when enabled
```

## Page Structure

### App Router Architecture

```
app/
├── layout.tsx (root layout with providers)
├── page.tsx (home/dashboard page)
├── globals.css (global styles)
├── login/
│   └── page.tsx
├── activity/
│   ├── page.tsx
│   └── details/
│       └── page.tsx
├── settings/
│   ├── page.tsx
│   ├── billing/
│   │   └── page.tsx
│   └── privacy/
│       └── page.tsx
├── personalize/
│   └── page.tsx
├── download/
│   └── page.tsx
└── help/
    └── page.tsx
```

### Component Architecture

```
components/
├── ui/ (shadcn/ui components)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── dialog.tsx
│   ├── tabs.tsx
│   └── ...
├── activity/
│   ├── MessageBubble.tsx
│   ├── TranscriptSidebar.tsx
│   └── TranscriptViewer.tsx
├── settings/
│   └── SettingsTabs.tsx
├── AuthGuard.tsx (authentication wrapper)
├── ClientLayout.tsx (main layout component)
├── Markdown.tsx (markdown renderer)
├── SearchPopup.tsx (search functionality)
└── Sidebar.tsx (navigation sidebar)
```

## Build and Deployment

### Development Builds

```powershell
# Development server with hot reload
npm run dev

# Compile backend_node TypeScript
npm run build:backend

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

### Production Builds

```powershell
# Build static export (automatically compiles backend_node)
npm run build

# Note: npm run start is not available in static export mode
# Use a static file server to serve the out/ directory
```

### Environment Configuration

```powershell
# Environment variables used in the codebase (Windows PowerShell)
# Set these before running the application

# Enable dev mock mode (utils/devMock.ts)
$env:NEXT_PUBLIC_DEV_MOCK="1"

# Backend CORS origin (backend_node/index.ts, default: http://localhost:3000)
$env:whisper_WEB_URL="http://localhost:3000"

# Node environment (utils/api.ts, checks for 'development')
$env:NODE_ENV="development"
```

## Testing Strategy

### E2E Testing

E2E testing infrastructure can be set up with Playwright. Configuration file (`playwright.config.ts`) should be created in the root directory if E2E testing is needed.

```typescript
// Example: playwright.config.ts (to be created if needed)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
```

## Performance Optimization

### Image Optimization

```typescript
// Next.js Image component usage
import Image from 'next/image';

export function OptimizedImage({ src, alt }: { src: string; alt: string }) {
    return (
        <Image
            src={src}
            alt={alt}
            width={800}
            height={600}
            priority
            placeholder="blur"
            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
        />
    );
}
```

### Bundle Analysis

```powershell
# Analyze bundle size
npx @next/bundle-analyzer

# Check lighthouse scores
npx lighthouse http://localhost:3000 --output html
```

## Troubleshooting

### Common Development Issues

- Build failing: Check TypeScript errors and missing dependencies, ensure backend_node is compiled
- Backend compilation: Run `npm run build:backend` before building web app
- Styling not applying: Verify Tailwind configuration and CSS imports in app/globals.css
- API calls failing: Check backend_node server is running, verify CORS settings, check dev mock mode
- Static export issues: Verify next.config.mjs has `output: 'export'`, check for server-side code

### Performance Issues

- Slow page loads: Check bundle size and implement code splitting
- Hydration mismatches: Ensure server and client rendering consistency (static export mode)
- Memory leaks: Monitor React components and clean up event listeners
- API bottlenecks: Check backend_node server performance and database queries

### Deployment Issues

- Environment variables not loading: Check .env file naming and placement (use PowerShell $env: for runtime)
- Static assets not loading: Verify next.config.mjs export configuration, check out/ directory
- Backend not compiling: Ensure backend_node/tsconfig.json exists and TypeScript is installed
- Build fails: Check that backend_node TypeScript compiles successfully before web build

## Maintenance

### Version Control

- Semantic versioning (MAJOR.MINOR.PATCH)
- Major version: Breaking API/architecture changes
- Minor version: New features, UI/UX improvements
- Patch version: Bug fixes, security updates

### Update Procedures

Web App Update Checklist:

- [ ] Test all pages load correctly across devices
- [ ] Verify backend_node API integration works correctly
- [ ] Compile backend_node TypeScript (`npm run build:backend`)
- [ ] Check authentication flow (localStorage-based)
- [ ] Validate responsive design on mobile devices
- [ ] Test accessibility with screen readers
- [ ] Check performance scores meet targets
- [ ] Verify static export builds successfully
- [ ] Test dev mock mode functionality
- [ ] Check bundle size and loading performance

### Monitoring

- Next.js build output and error tracking
- Backend_node API response time tracking
- User session monitoring via localStorage
- Core Web Vitals monitoring
- Error reporting and alerting

### Security Updates

- Next.js security patches and updates
- Backend_node dependency vulnerability scanning
- SSL certificate renewal (for production deployment)
- CORS policy updates in backend_node
- Content Security Policy maintenance
- localStorage security best practices

## Update History

| Date       | Version | Author   | Description                                              |
| ---------- | ------- | -------- | -------------------------------------------------------- |
| 2025-01-27 | 0.1.0   | Web Team | Updated documentation to match actual codebase structure |
| 2025-10-14 | v2.0.0  | Web Team | Major refactor: Next.js 14, App Router migration         |
| 2025-09-15 | v1.8.0  | Web Team | Enhanced activity tracking, improved billing UI          |
| 2025-08-01 | v1.7.0  | Web Team | Authentication system overhaul, PWA features             |
| 2025-07-15 | v1.6.0  | Web Team | Settings personalization, user profile management        |
| 2025-06-15 | v1.5.0  | Web Team | Download functionality, help system                      |
| 2025-05-01 | v1.4.0  | Web Team | Billing integration, subscription management             |
| 2025-04-01 | v1.3.0  | Web Team | Activity dashboard, real-time updates                    |
| 2025-03-01 | v1.2.0  | Web Team | Responsive design improvements                           |
| 2025-02-01 | v1.1.0  | Web Team | Component library standardization                        |
| 2025-01-15 | v1.0.0  | Web Team | Initial web app launch                                   |

