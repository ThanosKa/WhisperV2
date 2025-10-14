# AGENTS.md - Web App (Next.js)

## Header

Title: WhisperV2 Web App Agent Manifest
Version: v2.0.0
Author: Web Team <web@whisper.com>
Maintainer: Frontend Team <frontend@whisper.com>
Created: 2025-01-15
Last Updated: 2025-10-14

## Overview

Next.js web application providing user management, activity tracking, billing, and desktop app companion features. Built with modern React architecture, TypeScript, and comprehensive testing. Integrates with desktop app via API backend for seamless user experience across platforms.

## Configuration

Framework: Next.js 14 (App Router), React 18, TypeScript 5.x
Styling: Tailwind CSS 3.x, shadcn/ui components
Backend: Node.js/Express with TypeScript
Testing: Playwright for E2E, Jest for unit tests
ENV:

- NEXT_PUBLIC_API_URL (backend API endpoint)
- NEXTAUTH_URL (authentication callback URL)
- NEXTAUTH_SECRET (authentication secret)
- DATABASE_URL (if direct database access needed)
- STRIPE_PUBLIC_KEY (billing integration)
  Dependencies:
- Next.js 14.x.x
- React 18.x.x
- TypeScript 5.x.x
- Tailwind CSS 3.x.x
- shadcn/ui 0.9.x
- Playwright 1.47.x
  Security:
- JWT authentication with NextAuth.js
- API route protection with middleware
- CORS configuration for desktop app communication
- Secure environment variable management

## Capabilities

Tools:

- Development: Next.js dev server with hot reload
- Build System: Next.js compiler with optimization
- Testing: Playwright for E2E, component testing
- Linting: ESLint with Next.js rules
- Styling: Tailwind CSS with custom design system
- API Development: Next.js API routes and middleware

Functions:

- On user login: Authenticate via JWT, sync with desktop app
- On activity view: Fetch and display user session data
- On settings update: Persist preferences via API
- On billing action: Process payments and update subscriptions
- On download request: Generate and serve desktop app builds
- On help access: Provide contextual documentation

Behavior:

- Responsive design across all device sizes
- Progressive Web App capabilities
- Offline-first data synchronization
- Real-time updates via WebSocket integration
- Accessibility-first component development
- SEO optimization for marketing pages

Limitations:

- Requires desktop app for full functionality
- Some features need backend API availability
- Browser compatibility limited to modern browsers
- Mobile PWA features require service worker setup
- Real-time features depend on WebSocket connectivity

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
- API Routes: app/api/ (backend API endpoints)
- Styles: globals.css, component CSS modules
- Utils: lib/ (utility functions and configurations)
- Tests: E2E tests in root directory
- Build Output: out/ (static export)

Integration:

- Desktop App: API communication via HTTP/WebSocket
- Authentication: NextAuth.js with JWT strategy
- Database: API calls to backend_node services
- Payments: Stripe integration for billing
- Analytics: User activity tracking and reporting
- Email: Notification system for user communications

Testing:

- Unit Tests: Component and utility function testing
- Integration Tests: API route testing with mocked services
- E2E Tests: Playwright for complete user journey testing
- Visual Tests: Component and page screenshot comparison
- Performance Tests: Lighthouse CI for automated scoring

## Usage

### Development Workflow

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
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

### API Route Development

```typescript
// Example: API route with authentication
// app/api/user/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user profile from backend
    const profile = await fetch(`${process.env.API_URL}/api/user/profile`, {
        headers: {
            Authorization: `Bearer ${session.accessToken}`,
        },
    });

    return NextResponse.json(await profile.json());
}
```

### Page Development (App Router)

```typescript
// Example: Activity page
// app/activity/page.tsx
import { Suspense } from 'react';
import { ActivityList } from '@/components/ActivityList';
import { ActivitySkeleton } from '@/components/ActivitySkeleton';

export default function ActivityPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Activity</h1>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityList />
      </Suspense>
    </div>
  );
}
```

### Styling with Tailwind

```typescript
// Example: Component styling
// components/Button.tsx
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        {
          'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
          'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
          'border border-input bg-background hover:bg-accent': variant === 'outline',
        },
        {
          'h-9 px-3 text-sm': size === 'sm',
          'h-10 px-4 py-2': size === 'md',
          'h-11 px-8': size === 'lg',
        },
        className
      )}
      {...props}
    />
  );
}
```

### Testing with Playwright

```typescript
// Example: E2E test
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test('user can login and access dashboard', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Fill login form
    await page.fill('[data-testid="email"]', 'user@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Verify dashboard access
    await expect(page).toHaveURL('/activity');
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
});
```

### API Integration

```typescript
// Example: API client utility
// lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
}

// Usage in components
export function useUserProfile() {
    return useSWR('/api/user/profile', apiRequest);
}
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
│       └── [id]/
│           └── page.tsx
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
├── help/
│   └── page.tsx
└── api/
    ├── auth/[...nextauth]/
    │   └── route.ts
    ├── user/
    │   └── route.ts
    ├── conversations/
    │   └── route.ts
    ├── presets/
    │   └── route.ts
    └── sync/
        └── status/
            └── route.ts
```

### Component Architecture

```
components/
├── ui/ (shadcn/ui components)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   └── ...
├── AuthGuard.tsx (authentication wrapper)
├── ClientLayout.tsx (main layout component)
├── Markdown.tsx (markdown renderer)
├── SearchPopup.tsx (search functionality)
├── Sidebar.tsx (navigation sidebar)
└── settings/
    └── SettingsForm.tsx
```

## Build and Deployment

### Development Builds

```bash
# Development server with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

### Production Builds

```bash
# Build static export
npm run build

# Preview production build
npm run start

# Export static files (if needed)
npx next export
```

### Environment Configuration

```bash
# .env.local for development
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# .env.production for production
NEXT_PUBLIC_API_URL=https://api.whisper.com
NEXTAUTH_URL=https://whisper.com
NEXTAUTH_SECRET=production-secret
```

## Testing Strategy

### Unit Testing

```typescript
// Example: Component testing
// __tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
});
```

### E2E Testing with Playwright

```typescript
// playwright.config.ts
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
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
    ],
});
```

### API Testing

```typescript
// Example: API route testing
// __tests__/api/user.test.ts
import { createMocks } from 'node-mocks-http';
import { GET } from '@/app/api/user/route';

describe('/api/user', () => {
    it('returns user data', async () => {
        const { req, res } = createMocks({
            method: 'GET',
            headers: {
                authorization: 'Bearer token123',
            },
        });

        await GET(req, res);
        expect(res._getStatusCode()).toBe(200);
    });
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

```bash
# Analyze bundle size
npx @next/bundle-analyzer

# Check lighthouse scores
npx lighthouse http://localhost:3000 --output html
```

## Troubleshooting

### Common Development Issues

- Build failing: Check TypeScript errors and missing dependencies
- Styling not applying: Verify Tailwind configuration and CSS imports
- API calls failing: Check environment variables and CORS settings
- Authentication issues: Validate NextAuth configuration and JWT secrets
- Testing timeouts: Increase timeout values for E2E tests

### Performance Issues

- Slow page loads: Check bundle size and implement code splitting
- Hydration mismatches: Ensure server and client rendering consistency
- Memory leaks: Monitor React components and clean up event listeners
- API bottlenecks: Implement caching and optimize database queries

### Deployment Issues

- Environment variables not loading: Check .env file naming and placement
- Static assets not loading: Verify next.config.mjs export configuration
- API routes not working: Check API route file structure and naming
- Authentication failing: Validate production auth provider settings

## Maintenance

### Version Control

- Align with root project semantic versioning
- Tag web-specific releases for UI/UX improvements
- Maintain separate changelog for web app features

### Update Procedures

Web App Update Checklist:

- [ ] Test all pages load correctly across devices
- [ ] Verify API integration works with backend changes
- [ ] Check authentication flow end-to-end
- [ ] Validate responsive design on mobile devices
- [ ] Test accessibility with screen readers
- [ ] Check performance scores meet targets
- [ ] Verify E2E tests pass on all browsers
- [ ] Test offline functionality and PWA features
- [ ] Validate SEO and meta tags
- [ ] Check bundle size and loading performance

### Monitoring

- Next.js analytics and error tracking
- User session monitoring and heatmaps
- API response time tracking
- Core Web Vitals monitoring
- Conversion funnel analysis
- Error reporting and alerting

### Security Updates

- Next.js security patches and updates
- Authentication provider security reviews
- Dependency vulnerability scanning
- SSL certificate renewal
- CORS policy updates
- Content Security Policy maintenance

## Update History

| Date       | Version | Author   | Description                                       |
| ---------- | ------- | -------- | ------------------------------------------------- |
| 2025-10-14 | v2.0.0  | Web Team | Major refactor: Next.js 14, App Router migration  |
| 2025-09-15 | v1.8.0  | Web Team | Enhanced activity tracking, improved billing UI   |
| 2025-08-01 | v1.7.0  | Web Team | Authentication system overhaul, PWA features      |
| 2025-07-15 | v1.6.0  | Web Team | Settings personalization, user profile management |
| 2025-06-15 | v1.5.0  | Web Team | Download functionality, help system               |
| 2025-05-01 | v1.4.0  | Web Team | Billing integration, subscription management      |
| 2025-04-01 | v1.3.0  | Web Team | Activity dashboard, real-time updates             |
| 2025-03-01 | v1.2.0  | Web Team | Responsive design improvements                    |
| 2025-02-01 | v1.1.0  | Web Team | Component library standardization                 |
| 2025-01-15 | v1.0.0  | Web Team | Initial web app launch                            |
