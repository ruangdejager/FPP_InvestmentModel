import { useState } from 'react';
import { Button, Card, Field, TextInput, Warning } from '../components/ui.js';
import { api } from '../lib/api.js';

export default function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/login', { email, password });
      onSignedIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 text-center">
          <h1 className="text-xl font-semibold">Five Peaks Properties</h1>
          <p className="text-sm text-ink-soft">Investment model</p>
        </div>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <TextInput
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <TextInput
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            {error && <Warning title="Not signed in">{error}</Warning>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-soft">
          Forgotten a password? There is no reset flow. An administrator runs the reset script.
        </p>
      </div>
    </div>
  );
}
