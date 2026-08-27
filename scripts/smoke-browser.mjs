import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sampleDir = path.join(root, 'fixtures', 'sample-pack')
const base = process.env.GTB_URL ?? 'http://127.0.0.1:5173'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const uploads = []
  page.on('request', (req) => {
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && !req.url().startsWith(base)) {
      uploads.push(`${req.method()} ${req.url()}`)
    }
  })

  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Guess the Bass' }).waitFor()

  // Force fallback folder input so we can set files without native picker
  await page.evaluate(() => {
    const input = document.querySelector('input[type="file"]')
    if (!input) throw new Error('file input missing')
    input.style.position = 'fixed'
    input.style.opacity = '1'
    input.style.pointerEvents = 'auto'
    input.style.left = '0'
    input.style.top = '0'
    input.style.width = '200px'
    input.style.height = '40px'
    input.classList.remove('sr-only')
  })

  const files = [
    path.join(sampleDir, 'Noisia - Could This Be.wav'),
    path.join(sampleDir, 'Chase and Status - Blind Faith.wav'),
    path.join(sampleDir, 'Sub Focus - Rock It.wav'),
    path.join(sampleDir, 'Dimension - UK.wav'),
  ]
  await page.setInputFiles('input[type="file"]', files)
  await page.getByText(/4 tracks/i).waitFor({ timeout: 15000 })

  await page.getByPlaceholder('Player name').fill('Alex')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByPlaceholder('Player name').fill('Sam')
  await page.getByRole('button', { name: 'Add' }).click()

  await page.getByRole('button', { name: 'Start game' }).click()
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 15000 })
  await page.getByText('100 ms').waitFor()

  await page.getByRole('button', { name: 'Play' }).click()

  await page.getByRole('button', { name: /Skip/i }).click()
  await page.getByText('500 ms').waitFor()

  for (let i = 0; i < 5; i++) {
    const reveal = page.getByRole('button', { name: 'Next track' })
    if (await reveal.isVisible().catch(() => false)) break
    const skip = page.getByRole('button', { name: /Skip/i })
    if (await skip.isEnabled()) {
      await skip.click()
      await page.waitForTimeout(200)
    } else {
      break
    }
  }

  await page.getByRole('button', { name: 'Next track' }).waitFor({ timeout: 10000 })
  const titleText = await page.locator('.reveal-title').innerText()
  if (!titleText.trim()) throw new Error('empty reveal title')

  await page.getByRole('button', { name: 'Next track' }).click()
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 15000 })

  await page.getByPlaceholder('Type artist or title').fill('dimension')
  const hit = page.getByRole('option').first()
  if (await hit.isVisible().catch(() => false)) {
    await hit.click()
    await page.getByText(/Nailed it/i).waitFor({ timeout: 5000 }).catch(() => null)
    const alex = page.getByRole('button', { name: 'Alex' })
    if (await alex.isVisible().catch(() => false)) {
      await alex.click()
    }
  }

  if (uploads.length) {
    throw new Error(`Unexpected non-local requests: ${uploads.join(', ')}`)
  }

  console.log('Browser smoke test passed.')
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
