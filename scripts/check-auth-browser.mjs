// Isolated browser tests of callbacks. All Auth and Data API responses are simulated.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5226'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
const b = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN })
try {
  for (const flow of ['confirm', 'recovery', 'unverified']) {
    const page = await b.newPage()
    const user = {
      id: crypto.randomUUID(),
      email: 'controlled@example.invalid',
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: {},
      app_metadata: {},
      email_confirmed_at: flow === 'unverified' ? null : new Date().toISOString(),
    }
    const jwt = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
    const session = {
      access_token: [
        jwt({ alg: 'HS256', typ: 'JWT' }),
        jwt({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, session_id: crypto.randomUUID() }),
        'fixture',
      ].join('.'),
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: crypto.randomUUID(),
      user,
    }
    let verified = false, wrote = false, reads = 0
    await page.route('**/auth/v1/**', async (r) => {
      const path = new URL(r.request().url()).pathname
      let body = {}
      if (path.endsWith('/verify')) {
        const data = r.request().postDataJSON()
        assert.equal(data.type, flow === 'recovery' ? 'recovery' : 'email')
        assert.equal(data.token_hash, 'local-fixture')
        verified = true
        body = session
      } else if (path.endsWith('/token')) body = session
      else if (path.endsWith('/user')) {
        body = user
        if (r.request().method() === 'PUT') wrote = true
      }
      await r.fulfill({ json: body })
    })
    await page.route('**/rest/v1/**', (r) => {
      reads++
      return r.fulfill({ json: [] })
    })
    if (flow === 'unverified') {
      await page.goto(origin + '/invoices')
      await page.getByLabel('Email', { exact: true }).fill(user.email)
      await page.getByLabel('Password', { exact: true }).fill(crypto.randomUUID())
      await page.getByRole('button', { name: 'Log in', exact: true }).click()
      await page.getByRole('heading', { name: 'Verify your email' }).waitFor()
      assert.equal(reads, 0)
    } else {
      await page.goto(
        origin + (flow === 'recovery' ? '/reset-password' : '/auth/callback') + '?token_hash=local-fixture',
      )
      await page.getByText('Continue securely').click()
      if (flow === 'confirm') await page.getByRole('heading', { name: 'Create your restaurant' }).waitFor()
      else {
        const value = crypto.randomUUID()
        await page.getByLabel('New password', { exact: true }).fill(value)
        await page.getByLabel('Confirm new password').fill(value)
        await page.getByRole('button', { name: 'Set a new password' }).click()
        await page.getByRole('heading', { name: 'Password updated' }).waitFor()
        assert.ok(wrote)
      }
      assert.ok(verified && !page.url().includes('token_hash'))
    }
    await page.close()
  }
  console.log(
    'Simulated valid confirmation and recovery callbacks, password update, onboarding and unverified workspace denial passed.',
  )
} finally {
  await b.close()
}
