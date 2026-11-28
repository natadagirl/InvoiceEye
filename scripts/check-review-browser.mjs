// All Auth, Data API, Storage and Edge requests use synthetic intercepted responses.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5242'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN })
const pdf = await readFile(new URL('../public/samples/normal.pdf', import.meta.url))
const image = await readFile(new URL('../public/samples/increase.png', import.meta.url))
const longSupplier = 'Prairie Fresh Produce and Distinctive Specialty Food Distributors'
const longNumber = 'PF-DISTRIBUTION-2026-11-00008471'
const rid = crypto.randomUUID(), iid = crypto.randomUUID(), uid = crypto.randomUUID()
const roma = crypto.randomUUID(), carrots = crypto.randomUUID()
const line = {
  description: 'Synthetic pack',
  quantity: 2,
  unit: 'case',
  packageSize: 5,
  packageUnit: 'kg',
  unitPrice: 10,
  lineTotal: 20,
}
const draft = {
  supplier: longSupplier,
  number: longNumber,
  date: '2026-11-16',
  currency: 'CAD',
  subtotal: 40,
  tax: 2,
  discounts: 0,
  total: 42,
  items: [{ ...line, name: 'Roma Tomato' }, { ...line, name: 'Fresh Carrots' }],
  warnings: ['Check discounts.', 'Verify quantities.'],
}
const user = {
  id: uid,
  email: 'fixture@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: {},
  app_metadata: {},
  email_confirmed_at: new Date().toISOString(),
}
const jwt = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const session = {
  access_token: [
    jwt({ alg: 'HS256', typ: 'JWT' }),
    jwt({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
    'fixture',
  ].join('.'),
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: crypto.randomUUID(),
  user,
}
try {
  for (const width of [1440, 1280, 1024, 390, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 860 }, hasTouch: width < 500 })
    const fresh = width === 375
    const extracted = fresh
      ? {
        ...draft,
        items: [
          { ...line, name: 'Bell Pepper', ingredientKind: 'food' },
          { ...line, name: 'Item 238', ingredientKind: 'uncertain' },
        ],
      }
      : draft
    let confirmations = 0, extractionAttempts = 0
    await page.route('**/auth/v1/**', (route) => route.fulfill({ json: session }))
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
      if (table === 'confirm_invoice') {
        const body = request.postDataJSON()
        assert.equal(body.iid, iid)
        assert.equal(body.draft.supplier, width === 375 ? 'New Test Produce' : 'Cedar Valley Produce')
        if (fresh) {
          assert.equal(body.draft.items[0].newIngredientName, 'Red Bell Pepper')
          assert.equal(body.draft.items[0].name, 'Bell Pepper')
          assert.equal(body.draft.items[1].ingredientId, '')
          assert.equal(body.draft.items[1].newIngredientName, undefined)
        } else {
          assert.equal(body.draft.items[0].ingredientId, roma)
          assert.equal(body.draft.items[1].ingredientId, carrots)
        }
        assert.equal(body.draft.discounts, 0)
        confirmations++
        return route.fulfill({ json: iid })
      }
      assert.equal(request.method(), 'GET')
      let data = []
      if (table === 'restaurants') {
        data = [{ id: rid, name: 'Synthetic Kitchen', is_demo: true, alert_threshold: 10, alerts_enabled: true }]
      }
      if (['invoices', 'ingredients', 'suppliers'].includes(table)) {
        assert.equal(url.searchParams.get('restaurant_id'), 'eq.' + rid)
      }
      if (table === 'invoices') {
        const status = 'awaiting_review'
        data = url.searchParams.has('id')
          ? (url.searchParams.get('select') === 'processing_status'
            ? { processing_status: status }
            : { processing_status: status, extraction: extracted, extraction_error: null })
          : (url.searchParams.get('offset') === '0' || request.headers().range?.startsWith('0-'))
          ? [{
            id: iid,
            invoice_number: longNumber,
            invoice_date: draft.date,
            supplier_id: null,
            suppliers: null,
            processing_status: status,
            total_amount: null,
            currency: 'CAD',
            original_file_path: rid + '/' + iid + (width < 500 ? '.png' : '.pdf'),
          }]
          : []
      }
      if (table === 'ingredients' && !fresh) {
        data = [
          { id: roma, name: 'Roma Tomatoes', specification: 'Standard', base_unit: 'kg' },
          { id: carrots, name: 'Carrots', specification: 'Standard', base_unit: 'kg' },
        ]
      }
      if (table === 'suppliers' && width !== 375) data = [{ name: longSupplier }, { name: 'Cedar Valley Produce' }]
      return route.fulfill({ json: data })
    })
    await page.route('**/storage/v1/**', (route) => {
      assert.equal(route.request().method(), 'GET')
      return route.fulfill({
        body: width < 500 ? image : pdf,
        contentType: width < 500 ? 'image/png' : 'application/pdf',
      })
    })
    await page.route('**/functions/v1/extract-invoice', (route) => {
      extractionAttempts++
      return route.fulfill({
        status: 502,
        json: { error: 'AI extraction is temporarily unavailable. Please try again shortly.' },
      })
    })
    await page.goto(origin + '/invoices')
    await page.getByLabel('Email', { exact: true }).fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill('synthetic-browser-secret')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.getByRole('button', { name: longNumber }).click()
    const modal = page.getByRole('dialog', { name: 'Review invoice' })
    await modal.getByLabel('Invoice number').waitFor()
    assert.equal(await modal.getByLabel('Invoice number').inputValue(), longNumber)
    assert.equal(await modal.getByLabel('Invoice date').inputValue(), draft.date)
    assert.equal(await modal.getByLabel('Discounts').inputValue(), '0.00')
    assert.equal(await modal.locator('.reviewNotes').count(), 0)
    if (fresh) {
      const name = modal.getByLabel('New ingredient name')
      assert.equal(await name.inputValue(), 'Bell Pepper')
      await name.fill('Red Bell Pepper')
    } else {
      await modal.locator('.reviewLineSummary').nth(0).getByText('Line 1 · Automatic match').waitFor()
      assert.equal(await modal.locator('.reviewLineSummary').nth(0).getAttribute('aria-expanded'), 'false')
    }
    assert.equal(await modal.locator('.reviewLineSummary').nth(1).getAttribute('aria-expanded'), 'true')
    const vendor = modal.getByRole('button', { name: 'Supplier ' + longSupplier })
    if (process.env.SCREENSHOT_DIR && [1440, 390].includes(width)) {
      if (width < 500) {
        await page.waitForFunction(() => document.querySelector('.originalPane img')?.naturalWidth > 0)
      } else await modal.getByTitle('Original PDF').waitFor()
      await modal.locator('.reviewBody').evaluate((el) => {
        el.scrollTop = 0
      })
      await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/invoiceeye-review-' + width + '.png' })
    }
    if (width < 500) await vendor.tap()
    else await vendor.click()
    const search = modal.getByRole('textbox', { name: 'Search supplier' })
    if (width === 375) {
      await modal.getByText('No existing options in this restaurant.').waitFor()
      await search.fill('New Test Produce')
    } else {
      await modal.getByRole('button', { name: longSupplier + ' Existing supplier' }).waitFor()
      await search.fill('Cedar')
    }
    await search.press('ArrowDown')
    await page.keyboard.press('Enter')
    if (width === 1440) {
      page.once('dialog', (dialog) => dialog.dismiss())
      await modal.getByRole('button', { name: 'Retry extraction' }).click()
      assert.equal(extractionAttempts, 0)
      page.once('dialog', (dialog) => dialog.accept())
      await modal.getByRole('button', { name: 'Retry extraction' }).click()
      await modal.getByText('AI extraction is temporarily unavailable. Please try again shortly.').waitFor()
      assert.equal(extractionAttempts, 1)
      assert.equal(await modal.getByLabel('Invoice number').inputValue(), longNumber)
      await modal.getByRole('button', { name: 'Supplier Cedar Valley Produce' }).waitFor()
    }
    const ingredient = modal.getByRole('button', { name: 'Ingredient match row 2 Leave unmatched' })
    await ingredient.click()
    if (fresh) {
      await modal.getByRole('button', { name: 'Leave unmatched', exact: true }).click()
    } else {
      const ingredients = modal.getByRole('textbox', { name: 'Search ingredient match row 2' })
      await ingredients.fill('carrot')
      await modal.getByRole('button', { name: /Carrots.*Suggested match/ }).click()
    }
    await modal.getByRole('button', { name: 'Collapse all' }).click()
    assert.equal(await modal.locator('.reviewLineSummary[aria-expanded="true"]').count(), 0)
    await modal.getByRole('button', { name: 'Expand all' }).click()
    assert.equal(await modal.locator('.reviewLineSummary[aria-expanded="true"]').count(), 2)
    const footer = modal.locator('.reviewFooter'), before = await footer.boundingBox()
    await modal.locator('.reviewBody').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    const after = await footer.boundingBox()
    assert.equal(before.y, after.y)
    assert.ok(after.y + after.height <= 860)
    assert.ok(await modal.locator('.reviewBody').evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
    assert.equal(confirmations, 0)
    await modal.getByRole('button', { name: 'Confirm and save' }).click()
    await modal.waitFor({ state: 'hidden' })
    assert.equal(confirmations, 1)
    await page.close()
    console.log(width + 'px review, matching, selector, fixed footer and intercepted confirmation passed')
  }
} finally {
  await browser.close()
}
