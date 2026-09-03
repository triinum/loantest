import { expect, Locator, Page, Response } from '@playwright/test';

const amountPatterns = [/loan amount/i, /amount/i, /summa/i, /laenusumma/i];
const periodPatterns = [/loan period/i, /repayment period/i, /period/i, /term/i, /months?/i, /periood/i, /kuud/i];
const submitPatterns = [/continue/i, /next/i, /apply/i, /proceed/i, /submit/i, /jätka/i, /edasi/i, /taotle/i, /järgmine/i];
const invalidPatterns = [/required/i, /invalid/i, /must/i, /error/i, /sisesta/i, /kohustuslik/i, /vigane/i, /vale/i];
const sessionPatterns = [/session\s*(has)?\s*expired/i, /unauthorized/i, /sessiooni\s*(aegumine|aegus|aegunud)/i, /seanss\s*(aegus|aegunud)/i, /logi\s*uuesti\s*sisse/i];
const apiFailurePatterns = [/something went wrong/i, /try again/i, /error/i, /failed/i, /technical/i, /not available/i, /viga/i, /proovi uuesti/i, /tehniline/i];

async function firstVisible(locators: Locator[]): Promise<Locator> {
  for (const locator of locators) {
    try {
      const candidate = locator.first();
      if (await candidate.isVisible({ timeout: 1_000 })) {
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error('Could not find a visible matching locator.');
}

async function findField(page: Page, patterns: RegExp[], selectorFragments: string[]): Promise<Locator> {
  const locators: Locator[] = [];

  for (const pattern of patterns) {
    locators.push(page.getByLabel(pattern));
    locators.push(page.getByRole('spinbutton', { name: pattern }));
    locators.push(page.getByRole('textbox', { name: pattern }));
    locators.push(page.getByPlaceholder(pattern));
  }

  for (const selector of selectorFragments) {
    locators.push(page.locator(selector));
  }

  return firstVisible(locators);
}

function parseNumberish(input: string | null | undefined): number | null {
  if (!input) {
    return null;
  }

  const compact = input.replace(/[^\d,.-]/g, '').trim();
  if (!compact) {
    return null;
  }

  const normalized = compact.includes(',') && compact.includes('.')
    ? compact.replace(/,/g, '')
    : compact.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatVariants(value: number): string[] {
  const fixed = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  const [whole, fraction] = fixed.split('.');
  const groups = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const thinSpaceGroups = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const commaGroups = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const variants = new Set<string>([
    fixed,
    fraction ? `${whole},${fraction}` : whole,
    groups,
    thinSpaceGroups,
    commaGroups,
    fraction ? `${groups}.${fraction}` : groups,
    fraction ? `${groups},${fraction}` : groups,
    fraction ? `${thinSpaceGroups},${fraction}` : thinSpaceGroups,
    fraction ? `${commaGroups}.${fraction}` : commaGroups
  ]);

  return [...variants].filter(Boolean);
}

function flattenNumericEntries(value: unknown, path = ''): Array<{ path: string; value: number }> {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [{ path, value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenNumericEntries(entry, `${path}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      flattenNumericEntries(entry, path ? `${path}.${key}` : key)
    );
  }

  return [];
}

export class LoanPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    const startedAt = Date.now();
    const response = await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator('body')).toBeVisible();
    return { response, elapsedMs: Date.now() - startedAt };
  }

  amountField() {
    return findField(this.page, amountPatterns, [
      'input[name*="amount" i]',
      'input[id*="amount" i]',
      'input[placeholder*="amount" i]',
      'input[name*="summa" i]',
      'input[id*="summa" i]',
      '[data-testid*="amount" i] input',
      '[data-test*="amount" i] input'
    ]);
  }

  periodField() {
    return findField(this.page, periodPatterns, [
      'input[name*="period" i]',
      'input[id*="period" i]',
      'input[name*="term" i]',
      'input[id*="term" i]',
      'input[name*="month" i]',
      'input[id*="month" i]',
      'input[name*="periood" i]',
      'input[id*="periood" i]',
      '[data-testid*="period" i] input',
      '[data-testid*="term" i] input'
    ]);
  }

  async primaryAction(): Promise<Locator | null> {
    const candidates: Locator[] = submitPatterns.flatMap((pattern) => [
      this.page.getByRole('button', { name: pattern }),
      this.page.getByRole('link', { name: pattern })
    ]);

    try {
      return await firstVisible(candidates);
    } catch {
      return null;
    }
  }

  async readNumericValue(field: Locator): Promise<number | null> {
    const value = await field.inputValue();
    return parseNumberish(value);
  }

  async setNumericValue(field: Locator, value: number | string): Promise<void> {
    await field.click();
    await field.fill('');
    await field.type(String(value), { delay: 30 });
    await field.blur();
  }

  async bodyText(): Promise<string> {
    return this.page.locator('body').innerText();
  }

  async invalidFeedbackVisible(): Promise<boolean> {
    for (const pattern of invalidPatterns) {
      if (await this.page.getByText(pattern).first().isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  async sessionMessageVisible(): Promise<boolean> {
    for (const pattern of sessionPatterns) {
      if (await this.page.getByText(pattern).first().isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  async apiFailureMessageVisible(): Promise<boolean> {
    for (const pattern of apiFailurePatterns) {
      if (await this.page.getByText(pattern).first().isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  async hasAccessibleName(field: Locator): Promise<boolean> {
    return field.evaluate((element) => {
      const input = element as HTMLInputElement;
      const ariaLabel = input.getAttribute('aria-label');
      const labelledBy = input.getAttribute('aria-labelledby');
      const placeholder = input.getAttribute('placeholder');
      const id = input.id;
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      return Boolean(ariaLabel || labelledBy || placeholder || label?.textContent?.trim());
    });
  }

  async expectCalculationValueOnScreen(payload: unknown): Promise<void> {
    const preferredEntry = flattenNumericEntries(payload)
      .filter((entry) => /payment|install|monthly|repay|total|amount|sum/i.test(entry.path) && entry.value > 0)
      .sort((left, right) => right.path.length - left.path.length)[0];

    if (!preferredEntry) {
      return;
    }

    const pageText = await this.bodyText();
    const hasMatch = formatVariants(preferredEntry.value).some((variant) => pageText.includes(variant));
    expect(hasMatch).toBeTruthy();
  }
}

export async function waitForCalculate(page: Page, action: () => Promise<void>) {
  const matches: Response[] = [];
  const listener = (response: Response) => {
    if (response.url().includes('/calculate')) {
      matches.push(response);
    }
  };

  page.on('response', listener);
  await action();
  await expect.poll(() => matches.length).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  page.off('response', listener);

  const response = matches.at(-1)!;

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { response, json };
}
