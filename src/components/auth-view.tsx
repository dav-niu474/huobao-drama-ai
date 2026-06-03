'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { signIn } from 'next-auth/react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Film, Loader2, Mail, Lock, User, ArrowRight, Sparkles, Shield, Zap } from 'lucide-react'

// ============================================================
// Auth View — Login / Register
// ============================================================

export function AuthView() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const t = useTranslations('auth')
  const tn = useTranslations('nav')

  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form
  const [regEmail, setRegEmail] = useState('')
  const [regName, setRegName] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginEmail || !loginPassword) {
      toast({ title: t('enterEmailAndPassword'), variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      // Step 1: Validate credentials via our custom endpoint first
      // This gives us clear error messages before triggering NextAuth
      const validateRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const validateData = await validateRes.json()

      if (!validateRes.ok || !validateData.success) {
        toast({
          title: t('loginFailed'),
          description: validateData.error || t('loginError'),
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      // Step 2: Credentials are valid — use NextAuth signIn WITHOUT redirect:false
      // Let NextAuth handle the redirect naturally to establish the session cookie.
      // The page will reload and AuthGuard will detect the session.
      await signIn('credentials', {
        email: loginEmail,
        password: loginPassword,
        // No redirect:false — let NextAuth redirect naturally
        // This ensures the session cookie is properly set in the browser
        callbackUrl: window.location.origin + '/',
      })
      // Page will redirect — no need to do anything else
    } catch (err: any) {
      toast({ title: t('loginAbnormal'), description: err.message || t('networkError'), variant: 'destructive' })
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regEmail || !regName || !regPassword) {
      toast({ title: t('fillAllFields'), variant: 'destructive' })
      return
    }
    if (regPassword.length < 6) {
      toast({ title: t('passwordMinLength'), variant: 'destructive' })
      return
    }
    if (regPassword !== regConfirm) {
      toast({ title: t('passwordMismatch'), variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, name: regName, password: regPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: t('registerFailed'), description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: t('registerSuccess'), description: t('pleaseLogin') })
      setTab('login')
      setLoginEmail(regEmail)
      setLoginPassword('')
    } catch (err: any) {
      toast({ title: t('registerAbnormal'), description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background decoration — soft gradient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-primary/[0.04] rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-primary/[0.06] rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-56 h-56 bg-amber-500/[0.04] rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/10 border border-primary/10 mb-4">
            <Film className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{tn('appName')}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t('fromScriptToVideo')}</p>
        </div>

        {/* Auth Card */}
        <Card className="border-border/40 shadow-lg shadow-black/5 overflow-hidden">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
            <TabsList className="grid w-full grid-cols-2 h-11 rounded-none border-b border-border/40 bg-muted/30 p-0">
              <TabsTrigger
                value="login"
                className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:shadow-none text-sm font-medium transition-all"
              >
                {t('login')}
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:shadow-none text-sm font-medium transition-all"
              >
                {t('register')}
              </TabsTrigger>
            </TabsList>

            {/* Login Tab */}
            <TabsContent value="login" className="mt-0">
              <form onSubmit={handleLogin}>
                <CardHeader className="pb-4 pt-6 px-6">
                  <CardTitle className="text-lg">{t('welcomeBack')}</CardTitle>
                  <CardDescription>{t('loginToContinue')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-6">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm">{t('email')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-9"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm">{t('password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder={t('enterPassword')}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-9"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex-col gap-3 pb-6 px-6">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="size-4 mr-2" />
                    )}
                    {loading ? t('loggingIn') : t('login')}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            {/* Register Tab */}
            <TabsContent value="register" className="mt-0">
              <form onSubmit={handleRegister}>
                <CardHeader className="pb-4 pt-6 px-6">
                  <CardTitle className="text-lg">{t('createAccount')}</CardTitle>
                  <CardDescription>{t('startJourney')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-6">
                  <div className="space-y-2">
                    <Label htmlFor="reg-email" className="text-sm">{t('email')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="reg-email"
                        type="email"
                        placeholder="your@email.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="pl-9"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-name" className="text-sm">{t('username')}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="reg-name"
                        type="text"
                        placeholder={t('enterUsername')}
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password" className="text-sm">{t('password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="reg-password"
                        type="password"
                        placeholder={t('passwordMin6')}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="pl-9"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-confirm" className="text-sm">{t('confirmPassword')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="reg-confirm"
                        type="password"
                        placeholder={t('reEnterPassword')}
                        value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)}
                        className="pl-9"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex-col gap-3 pb-6 px-6">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="size-4 mr-2" />
                    )}
                    {loading ? t('registering') : t('register')}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Feature highlights */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/20 border border-border/20">
            <div className="size-9 rounded-lg bg-primary/10 border border-primary/10 flex items-center justify-center">
              <Sparkles className="size-4 text-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground leading-tight">{t('aiCreation')}</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/20 border border-border/20">
            <div className="size-9 rounded-lg bg-primary/10 border border-primary/10 flex items-center justify-center">
              <Zap className="size-4 text-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground leading-tight">{t('multiModel')}</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/20 border border-border/20">
            <div className="size-9 rounded-lg bg-primary/10 border border-primary/10 flex items-center justify-center">
              <Shield className="size-4 text-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground leading-tight">{t('rolePermissions')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
