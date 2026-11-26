// Supply an installed Playwright module and Chrome executable locally. Mutating UI tests intercept writes.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5226'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true })
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
try {
  const p = await browser.newPage({ viewport: { width: 1360, height: 900 } })
  const heading = (s) => p.getByRole('heading', { name: s, exact: true }).first().waitFor()
  await p.goto(origin + '/settings/account')
  await heading('Log in')
  await p.getByLabel('Email', { exact: true }).fill(process.env.DEMO_EMAIL)
  await p.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD)
  await p.getByRole('button', { name: 'Log in', exact: true }).click()
  await heading('Personal information')
  assert.equal(await p.getByLabel('Display name').count(), 0)
  assert.equal(await p.getByRole('button', { name: 'Save changes' }).count(), 0)
  await p.waitForFunction(() => document.querySelector('aside .brand img')?.naturalWidth === 720)

  assert.equal(await p.locator('header').getByText('Log out').count(), 0)
  const trigger = p.getByRole('button', { name: 'Account menu' })
  await trigger.focus()
  await p.keyboard.press('Enter')
  await p.locator('.accountPop').waitFor()
  await p.keyboard.press('Escape')
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  await trigger.click()
  await p.locator('h1').click()
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  // The existing fixture reauthenticates; only the final password mutation is intercepted.
  const nextPassword = crypto.randomUUID()
  let updated = false
  await p.route('**/auth/v1/user**', async (r) => {
    if (r.request().method() !== 'PUT') return r.continue()
    const body = r.request().postDataJSON()
    assert.ok(body.password === nextPassword && body.current_password === process.env.DEMO_PASSWORD)
    updated = true
    return json(r, {
      id: process.env.DEMO_USER_ID,
      email: process.env.DEMO_EMAIL,
      email_confirmed_at: new Date().toISOString(),
      aud: 'authenticated',
      user_metadata: {},
      app_metadata: {},
    })
  })
  await p.getByLabel('Current password', { exact: true }).fill(process.env.DEMO_PASSWORD)
  await p.getByLabel('New password', { exact: true }).fill(nextPassword)
  await p.getByLabel('Confirm new password').fill(nextPassword)
  await p.locator('form[name=password] button').click()
  await p.getByText('Password updated.').waitFor()
  assert.ok(updated)
  await trigger.click()
  await p.locator('.accountPop').getByText('Restaurant settings').click()
  await heading('Restaurant settings')
  await p.route('**/rest/v1/restaurants?**', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    const id = new URL(route.request().url()).searchParams.get('id').slice(3)
    return json(route, {
      id,
      name: 'Browser fixture kitchen',
      is_demo: true,
      alerts_enabled: true,
      alert_threshold: 10,
    })
  })
  await p.getByLabel('Restaurant name').fill('Browser fixture kitchen')
  await p.getByRole('button', { name: 'Save changes' }).click()
  await p.locator('.identityText strong').filter({ hasText: 'Browser fixture kitchen' }).waitFor()
  await p.goto(origin + '/notifications')
  await heading('Price alerts')
  await p.locator('.noticeList article').first().waitFor()
  const receipts = []
  await p.route('**/rest/v1/alert_reads?**', async (route) => {
    if (route.request().method() === 'POST') {
      receipts.push(...[].concat(route.request().postDataJSON()))
      return json(route, [], 201)
    }
    return json(route, receipts)
  })
  await p.reload()
  await p.getByRole('button', { name: 'Mark as read', exact: true }).first().click()
  await p.getByLabel('Read status').selectOption('Read')
  await p.locator('.noticeList article').first().waitFor()
  assert.equal(await p.locator('.noticeList article').count(), 1)
  await p.reload()
  await p.getByLabel('Read status').selectOption('Read')
  await p.locator('.noticeList article').first().waitFor()
  await p.getByRole('button', { name: 'Mark all as read' }).click()
  await p.getByLabel('Read status').selectOption('Unread')
  await p.getByText('No matching price increases.').waitFor()
  assert.equal(
    receipts.length,
    new Set(receipts.map((r) => [r.period, r.supplier_id, r.ingredient_id].join('/'))).size,
  )
  await p.getByLabel('Read status').selectOption('Read')
  await p.getByText('View price history').first().click()
  await heading('Price Tracker')
  await p.getByRole('button', { name: 'Ask InvoiceEye' }).click()
  await p.getByRole('textbox', { name: 'Message' }).fill('Unsaved question')
  await p.getByRole('button', { name: 'Expand' }).click()
  assert.equal(await p.getByRole('textbox', { name: 'Message' }).inputValue(), 'Unsaved question')
  await p.locator('.chatHistory button').filter({ hasText: 'Verification · corrected price history' }).first()
    .click()
  await p.locator('.chatEvidence').first().waitFor()
  await p.getByRole('button', { name: 'Adjust question scope' }).first().click()
  const selector = p.getByRole('combobox', { name: 'Ingredients', exact: true })
  await p.getByRole('button', { name: 'Next', exact: true }).first().click()
  await p.waitForFunction(() => document.querySelector('select[aria-label=Ingredients]')?.options.length > 1)
  await p.getByRole('textbox', { name: 'Search Ingredients' }).fill('Carrots')
  await selector.getByRole('option', { name: /Carrots/ }).waitFor({ state: 'attached' })
  await p.reload()
  await p.locator('.chatEvidence').first().waitFor()
  await p.locator('.chatEvidence details summary').first().click()
  await p.locator('.chatSources a').first().click()
  await heading('Price Tracker')
  await p.setViewportSize({ width: 390, height: 844 })
  for (
    const path of [
      '/',
      '/invoices',
      '/price-tracker',
      '/ai-insights',
      '/ai-assistant',
      '/settings/account',
      '/notifications',
    ]
  ) {
    await p.goto(origin + path)
    await p.locator('h1').waitFor()
    assert.ok(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'overflow on ' + path,
    )
  }
  await p.getByRole('button', { name: /Notifications/ }).click()
  const notices = p.locator('.bell .noticeList')
  const bounds = await notices.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844)
  await notices.getByText('View all alerts').scrollIntoViewIfNeeded()
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Open navigation' }).click()
  await trigger.click()
  const box = await p.locator('.accountPop').boundingBox()
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0)
  await p.locator('.accountPop').getByRole('button', { name: 'Log out' }).click()
  await heading('Log in')
  await p.route('**/auth/v1/signup**', (r) => json(r, { id: crypto.randomUUID(), identities: [] }))
  await p.getByRole('button', { name: 'Create account' }).click()
  await p.getByLabel('Email', { exact: true }).fill('browser@example.invalid')
  await p.getByLabel('Password', { exact: true }).fill(crypto.randomUUID())
  await p.getByRole('button', { name: 'Create account' }).click()
  await heading('Check your email')
  await p.waitForFunction(() => document.querySelector('.access .brand img')?.naturalWidth === 720)
  assert.ok(await p.getByRole('button', { name: /Resend in/ }).isDisabled())
  await p.goto(origin + '/auth/callback?token_hash=invalid-test')
  await p.route('**/auth/v1/verify', (r) => json(r, { message: 'expired' }, 403))
  await p.getByText('Continue securely').click()
  await heading('This link is unavailable')
  await p.goto(origin + '/reset-password')
  await heading('Reset password')
  await p.route('**/auth/v1/recover**', (r) => json(r, {}))
  await p.getByLabel('Email', { exact: true }).fill('browser@example.invalid')
  await p.getByRole('button', { name: 'Reset password', exact: true }).click()
  await heading('Check your email')
  console.log(
    'Chrome desktop/mobile, account disclosure, fixture login/logout, intercepted rename and receipts, filter/navigation, mocked signup, cooldown, expired link and reset request passed.',
  )
} finally {
  await browser.close()
}
