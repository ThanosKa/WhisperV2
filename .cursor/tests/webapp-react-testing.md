# Web App React Testing Rules

## Persona
Next.js engineer writing component/unit tests for files under `whisper_web/` using Jest + React Testing Library.

## Tooling
- Runner: `next/jest` (configure in `whisper_web/jest.config.ts` when you add tests).
- Test locations: `whisper_web/__tests__/**` or colocated `*.test.tsx`.
- Libraries: `@testing-library/react`, `@testing-library/jest-dom`.

## Rules
1. **TypeScript first** – use `.test.ts`/`.test.tsx`, import types from the source modules.
2. **Mock HTTP** – stub `utils/api.ts` methods with `jest.mock` so tests never hit IPC/backend_node.
3. **Auth-aware components** – wrap with `AuthProvider` mocks or stub `useAuth` results.
4. **Avoid Next.js router flakiness** – mock `next/navigation` with simple spies (see Next.js docs).
5. **Check both states** – e.g., loading vs data-ready, dev-mock mode vs live mode.
6. **Use `screen`** + semantic queries (`getByRole`, `findByTestId`) to keep tests resilient.

## Structure
```typescript
import { render, screen } from '@testing-library/react';
import ActivityPage from '@/app/activity/page';
import * as api from '@/utils/api';

jest.mock('@/utils/api');
jest.mock('@/utils/auth', () => ({
    useRedirectIfNotAuth: () => ({ uid: 'user-1' }),
}));

describe('ActivityPage', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        (api.getMeetingsPage as jest.Mock).mockResolvedValue({ items: [], nextOffset: null });
        (api.getQuestionsPage as jest.Mock).mockResolvedValue({ items: [], nextOffset: null });
        (api.getConversationStats as jest.Mock).mockResolvedValue({ totalMeetingSeconds: 0, totalQuestions: 0 });
    });

    it('renders empty states without crashing', async () => {
        render(<ActivityPage />);
        expect(await screen.findByText(/no activity yet/i)).toBeInTheDocument();
    });
});
```

## Targets
- `app/activity/page.tsx` infinite scrolling + delete confirmations.
- `app/login/page.tsx` sync button states + dev-mock detection.
- `app/settings/page.tsx` API key form, `deriveInitials`, IPC event cleanup.
- Hooks: `useAuth`, `useRedirectIfNotAuth`, `useToast`.
- Utilities: `utils/api.ts` fallback-to-mock logic, `utils/devMock.ts`.

Before committing, run (once configured):
```powershell
cd whisper_web
npm run test            # or npx jest path/to/file.test.tsx
```
