import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
    it('renders a button with the label it is given', () => {
        render(<Button>Save</Button>);

        expect(screen.getByRole('button', { name: 'Save' }).tagName).toBe('BUTTON');
    });

    it('with asChild, gives its look to the child element instead of rendering a button', () => {
        render(
            <Button asChild variant="link">
                <a href="/settings">Settings</a>
            </Button>
        );

        const link = screen.getByRole('link', { name: 'Settings' });
        expect(link.getAttribute('href')).toBe('/settings');
        expect(link.className).toContain('underline-offset-4');
        expect(screen.queryByRole('button')).toBeNull();
    });
});
