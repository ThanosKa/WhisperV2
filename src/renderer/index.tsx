import React from 'react';
import ReactDOM from 'react-dom/client';

import './tailwind.css';
import { useBootstrapUser } from './hooks/useBootstrapUser';
import { useUserStore } from './state/useUserStore';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Renderer root element not found');
}

const root = ReactDOM.createRoot(rootElement);

const App: React.FC = () => {
    useBootstrapUser();

    const { user, status, error } = useUserStore();

    const statusLabel = (() => {
        switch (status) {
            case 'loading':
                return 'Loading user...';
            case 'ready':
                return user?.displayName || user?.email || 'Signed in';
            case 'error':
                return error ? `Error: ${error}` : 'Error fetching user';
            default:
                return 'Idle';
        }
    })();

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b bg-card px-6 py-4 shadow-sm">
                <h1 className="text-2xl font-semibold">Whisper React Renderer</h1>
                <p className="text-muted-foreground">React + Tailwind bootstrap mounted successfully.</p>
            </header>
            <main className="p-6">
                <div className="space-y-4">
                    <div className="rounded-lg border border-dashed bg-card/40 p-6 backdrop-blur">
                        <p className="text-sm text-muted-foreground">Replace this shell with migrated components when ready.</p>
                    </div>
                    <div className="rounded-lg border bg-card p-6 shadow-sm">
                        <h2 className="text-lg font-medium">Renderer User State</h2>
                        <p className="text-sm text-muted-foreground">Status: {statusLabel}</p>
                        {user && <pre className="mt-4 rounded-md bg-muted p-4 text-xs text-muted-foreground">{JSON.stringify(user, null, 2)}</pre>}
                    </div>
                </div>
            </main>
        </div>
    );
};

root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
