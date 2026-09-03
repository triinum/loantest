import { expect, Locator, Page, Request, Response } from '@playwright/test';

export class LoanPage {
  readonly page: Page;
  readonly amountInput: Locator;
  readonly periodInput: Locator;
  readonly continueButton: Locator;
  readonly cookieConsentButton: Locator;
  readonly monthlyPaymentSummary: Locator;
  readonly aprcSummary: Locator;
  readonly validationMessages: Locator;
  readonly sessionExpiredIndicators: Locator;

  constructor(page: Page) {
    this.page = page;
    this.amountInput = page.locator('input[name="amount"]').first();
    this.periodInput = page.locator('input[name="period"]').first();
    this.continueButton = page
      .locator('button:has-text("Jätka"), [role="button"]:has-text("Jätka"), input[type="submit"][value="Jätka"]')
      .first();
    this.cookieConsentButton = page.locator('button:has-text("Nõustun"), [role="button"]:has-text("Nõustun")').first();
    this.monthlyPaymentSummary = page.getByText(/kuumakse|monthly payment/i).first();
    this.aprcSummary = page.getByText(/aprc|kkm|annual percentage rate/i).first();
    this.validationMessages = page.locator('[aria-invalid="true"], [role="alert"], .error, .invalid, [data-testid*="error"]');
    this.sessionExpiredIndicators = page.getByText(
      /sessioon|session expired|session has expired|logi sisse|login|unauthorized|volitus/i,
    );
  }

  async openApplication(): Promise<void> {
    await this.page.goto('', { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    await this.dismissCookiesIfVisible();
    await this.waitForCalculatorReady();
  }

  async dismissCookiesIfVisible(): Promise<void> {
    if (await this.cookieConsentButton.isVisible().catch(() => false)) {
      await this.cookieConsentButton.click();
      await this.page.waitForLoadState('networkidle').catch(() => undefined);
    }
  }

  async waitForCalculatorReady(timeout = 15_000): Promise<void> {
    await expect
      .poll(
        async () => {
          await this.dismissCookiesIfVisible();
          const [amountVisible, periodVisible, continueVisible] = await Promise.all([
            this.amountInput.isVisible().catch(() => false),
            this.periodInput.isVisible().catch(() => false),
            this.continueButton.isVisible().catch(() => false),
          ]);

          return amountVisible && periodVisible && continueVisible;
        },
        {
          timeout,
          message: 'Expected the loan calculator controls to be visible.',
        },
      )
      .toBeTruthy();

    await expect(this.amountInput).toBeVisible();
    await expect(this.periodInput).toBeVisible();
    await expect(this.continueButton).toBeVisible();
  }

  async fillAmount(value: string | number): Promise<void> {
    await this.amountInput.click();
    await this.amountInput.fill(String(value));
    await this.blurField();
  }

  async fillPeriod(value: string | number): Promise<void> {
    await this.periodInput.click();
    await this.periodInput.fill(String(value));
    await this.blurField();
  }

  async updateCalculator(amount: string | number, period: string | number): Promise<void> {
    await this.fillAmount(amount);
    await this.fillPeriod(period);
  }

  async waitForCalculation(
    fieldName: 'amount' | 'period',
    expectedValue: string | number,
    options: { expectOk?: boolean; timeout?: number } = {},
  ): Promise<Response> {
    const { expectOk = true, timeout = 15_000 } = options;

    const requestPromise = this.page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/calculate') &&
        candidate.method() !== 'OPTIONS' &&
        this.matchesFieldValue(candidate, fieldName, expectedValue),
      { timeout },
    );
    const request = await requestPromise;
    const response = await this.page.waitForResponse((candidate) => candidate.request() === request, { timeout });

    if (expectOk) {
      expect(response.ok(), `Expected /calculate to succeed, got ${response.status()}`).toBeTruthy();
    }

    return response;
  }

  async fillAmountAndWaitForCalculation(
    value: string | number,
    options: { expectOk?: boolean; timeout?: number } = {},
  ): Promise<Response> {
    const calculation = this.waitForCalculation('amount', value, options);
    await this.fillAmount(value);
    return calculation;
  }

  async fillPeriodAndWaitForCalculation(
    value: string | number,
    options: { expectOk?: boolean; timeout?: number } = {},
  ): Promise<Response> {
    const calculation = this.waitForCalculation('period', value, options);
    await this.fillPeriod(value);
    return calculation;
  }

  async changeCalculatorAndWaitForCalculation(amount: string | number, period: string | number): Promise<Response[]> {
    const responses: Response[] = [];
    const currentAmount = await this.amountInput.inputValue();
    const currentPeriod = await this.periodInput.inputValue();

    if (currentAmount !== String(amount)) {
      responses.push(await this.fillAmountAndWaitForCalculation(amount));
    }

    if (currentPeriod !== String(period)) {
      responses.push(await this.fillPeriodAndWaitForCalculation(period));
    }

    return responses;
  }

  async clickContinue(options: { noWaitAfter?: boolean } = {}): Promise<void> {
    await this.continueButton.click(options);
  }

  async blurField(): Promise<void> {
    await this.page.keyboard.press('Tab');
  }

  async readMetricText(metric: 'monthlyPayment' | 'aprc'): Promise<string> {
    const locator = metric === 'monthlyPayment' ? this.monthlyPaymentSummary : this.aprcSummary;
    return (await locator.textContent().catch(() => ''))?.trim() ?? '';
  }

  async readVisibleText(): Promise<string> {
    return this.page.locator('body').innerText();
  }

  async getUrlSelection(): Promise<{ amount: string | null; period: string | null }> {
    const current = new URL(this.page.url());
    return {
      amount: current.searchParams.get('amount'),
      period: current.searchParams.get('period'),
    };
  }

  async isContinueDisabled(): Promise<boolean> {
    return this.continueButton.isDisabled();
  }

  async hasValidationFeedback(): Promise<boolean> {
    if (await this.validationMessages.first().isVisible().catch(() => false)) {
      return true;
    }

    const amountInvalid = await this.amountInput.getAttribute('aria-invalid');
    const periodInvalid = await this.periodInput.getAttribute('aria-invalid');
    return amountInvalid === 'true' || periodInvalid === 'true';
  }

  async captureApplicationSubmission(requests: Request[]): Promise<() => void> {
    const listener = (request: Request) => {
      if (request.url().includes('/calculate')) {
        return;
      }

      if (!['POST', 'PUT', 'PATCH'].includes(request.method())) {
        return;
      }

      requests.push(request);
    };

    this.page.on('request', listener);
    return () => this.page.off('request', listener);
  }

  matchesFieldValue(request: Request, fieldName: 'amount' | 'period', expectedValue: string | number): boolean {
    const expected = String(expectedValue);

    try {
      const requestUrl = new URL(request.url());
      if (requestUrl.searchParams.get(fieldName) === expected) {
        return true;
      }
    } catch {
      // Ignore malformed URLs and continue with payload parsing.
    }

    const payload = request.postData();
    if (!payload) {
      return false;
    }

    try {
      const json = JSON.parse(payload) as Record<string, unknown>;
      if (String(json[fieldName] ?? '') === expected) {
        return true;
      }
    } catch {
      // Ignore non-JSON payloads and continue with form parsing.
    }

    const params = new URLSearchParams(payload);
    return params.get(fieldName) === expected;
  }

  async hasAppliedSelection(amount: number, period: number): Promise<boolean> {
    const selection = await this.getUrlSelection();
    if (selection.amount === String(amount) && selection.period === String(period)) {
      return true;
    }

    const [amountVisible, periodVisible] = await Promise.all([
      this.amountInput.isVisible().catch(() => false),
      this.periodInput.isVisible().catch(() => false),
    ]);

    if (!amountVisible || !periodVisible) {
      return false;
    }

    const [currentAmount, currentPeriod] = await Promise.all([this.amountInput.inputValue(), this.periodInput.inputValue()]);
    return currentAmount === String(amount) && currentPeriod === String(period);
  }
}
