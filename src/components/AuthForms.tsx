import { type FormEvent, useEffect, useState } from 'react'
import { db } from '../services/supabase'
type Mode = 'login' | 'signup' | 'reset' | 'recovery'
const labels = {
  login: 'Log in',
  signup: 'Create account',
  reset: 'Reset password',
  recovery: 'Set a new password',
}
export function AuthForms({ initial = 'login' }: { initial?: Mode }) {
  const [mode, setMode] = useState(initial),
    [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [cool, setCool] = useState(0),
    [notice, say] = useState(''),
    [error, fail] = useState('')
  useEffect(() => {
    if (!cool) return
    const id = setTimeout(() => setCool((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [cool])
  const callback = location.origin + '/auth/callback', recovery = location.origin + '/reset-password'
  async function resend() {
    setBusy(true)
    fail('')
    try {
      const r = mode === 'reset'
        ? await db!.auth.resetPasswordForEmail(email, { redirectTo: recovery })
        : await db!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: callback } })
      if (r.error) throw r.error
      setCool(60)
      say('If your account is eligible, another link is on its way.')
    } catch {
      fail('Unable to send another link right now. Please try again later.')
    } finally {
      setBusy(false)
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    fail('')
    say('')
    const f = new FormData(e.currentTarget), password = String(f.get('password') ?? '')
    try {
      if (mode === 'recovery') {
        if (password !== f.get('confirm')) throw Error('The new passwords do not match.')
        const r = await db!.auth.updateUser({ password })
        if (r.error) throw r.error
        setSent(true)
        return
      }
      if (mode === 'login') {
        const r = await db!.auth.signInWithPassword({ email, password })
        if (r.error) {
          if (r.error.code === 'email_not_confirmed') {
            setMode('signup')
            setSent(true)
            return
          }
          throw Error('Unable to sign in. Check your email and password.')
        }
        return
      }
      if (mode === 'reset') {
        const r = await db!.auth.resetPasswordForEmail(email, { redirectTo: recovery })
        if (r.error) throw Error('Password reset is unavailable. Please try again later.')
      } else {
        const r = await db!.auth.signUp({ email, password, options: { emailRedirectTo: callback } })
        if (r.error && r.error.code !== 'user_already_exists') {
          throw Error('Registration could not be completed. Check your password or try again later.')
        }
        if (r.data.session) return
      }
      setSent(true)
      setCool(60)
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Authentication is temporarily unavailable.')
    } finally {
      setBusy(false)
    }
  }
  if (sent && mode === 'recovery') {
    return (
      <>
        <h2>Password updated</h2>
        <a className='authPrimary' href='/'>Continue to InvoiceEye</a>
      </>
    )
  }
  if (sent) {
    return (
      <>
        <h2>Check your email</h2>
        <p>
          If eligible, {email} will receive a {mode === 'reset' ? 'password reset' : 'confirmation'}{' '}
          link. Already verified? You can log in.
        </p>
        <div className='authLinks'>
          <button disabled={busy || cool > 0} onClick={resend}>
            {busy ? 'Sending…' : cool ? 'Resend in ' + cool + 's' : 'Resend email'}
          </button>
          <button
            onClick={() => {
              setSent(false)
              setMode('login')
              fail('')
              say('')
            }}
          >
            Back to login
          </button>
        </div>
        <p role='status'>{notice}</p>
        <p role='alert'>{error}</p>
      </>
    )
  }
  return (
    <>
      <h2>{labels[mode]}</h2>
      <form onSubmit={submit} key={mode}>
        {mode !== 'recovery' && (
          <label>
            Email<input
              type='email'
              required
              autoComplete='email'
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
            />
          </label>
        )}
        {mode !== 'reset' && (
          <label>
            {mode === 'recovery' ? 'New password' : 'Password'}
            <input
              type='password'
              name='password'
              required
              minLength={mode === 'login' ? 1 : 8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
        )}
        {mode === 'recovery' && (
          <label>
            Confirm new password<input
              name='confirm'
              type='password'
              required
              minLength={8}
              autoComplete='new-password'
            />
          </label>
        )}
        <button disabled={busy}>{busy ? 'Please wait…' : labels[mode]}</button>
      </form>
      {mode !== 'recovery' && (
        <div className='authLinks'>
          {(['login', 'signup', 'reset'] as const).filter((x) => x !== mode).map((x) => (
            <button
              key={x}
              onClick={() => {
                setMode(x)
                fail('')
              }}
            >
              {x === 'reset' ? 'Forgot password?' : labels[x]}
            </button>
          ))}
        </div>
      )}
      <p role='alert'>{error}</p>
    </>
  )
}
export function EmailCallback({ recovery, onVerified }: { recovery: boolean; onVerified: () => void }) {
  const [token] = useState(() => new URLSearchParams(location.search).get('token_hash')),
    [busy, wait] = useState(false),
    [bad, invalid] = useState(!token)
  useEffect(() => {
    history.replaceState(null, '', location.pathname)
  }, [])
  async function verify() {
    if (!token) return
    wait(true)
    try {
      const result = await db!.auth.verifyOtp({ type: recovery ? 'recovery' : 'email', token_hash: token })
      if (result.error || !result.data.session) invalid(true)
      else onVerified()
    } catch {
      invalid(true)
    } finally {
      wait(false)
    }
  }
  if (bad) {
    return (
      <>
        <h2>This link is unavailable</h2>
        <p>It may have expired or already been used.</p>
        <AuthForms initial={recovery ? 'reset' : 'login'} />
      </>
    )
  }
  return (
    <>
      <h2>{recovery ? 'Reset your password' : 'Confirm your email'}</h2>
      <button className='authPrimary' disabled={busy} onClick={verify}>
        {busy ? 'Verifying…' : 'Continue securely'}
      </button>
    </>
  )
}
