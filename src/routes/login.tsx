import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { user, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!loading && user) return <Navigate to="/admin/integrations" />;

  const handle = async (mode: 'in' | 'up') => {
    setBusy(true); setErr(null); setInfo(null);
    const { error } = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) setErr(error);
    else if (mode === 'up') setInfo('Account created. If email confirmation is on, check your inbox. Otherwise sign in.');
    else navigate({ to: '/admin/integrations' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Ops Dashboard</CardTitle>
          <CardDescription>Sign in to manage integrations and sync data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="in">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="in">Sign in</TabsTrigger>
              <TabsTrigger value="up">Sign up</TabsTrigger>
            </TabsList>
            {(['in', 'up'] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
                </div>
                {err && <p className="text-sm text-destructive">{err}</p>}
                {info && <p className="text-sm text-muted-foreground">{info}</p>}
                <Button className="w-full" disabled={busy} onClick={() => handle(mode)}>
                  {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
                </Button>
                {mode === 'up' && (
                  <p className="text-xs text-muted-foreground">
                    The first account created becomes the admin.
                  </p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
