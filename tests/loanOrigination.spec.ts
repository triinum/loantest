import { expect, test, type Request } from '@playwright/test';
import { HAPPY_CASES, NON_HAPPY_CASES } from './data/calculatorData';
import { LoanPage } from './pages/LoanPage';

test.describe.configure({ mode: 'parallel' });

const DOM_CONTENT_LOADED_BUDGET_MS = 8_000;

test('UI renders within a basic performance budget and exposes accessible primary controls', async ({ page }) => {
  const loanPage = new LoanPage(page);
  await loanPage.openApplication();

  await expect(loanPage.continueButton).toHaveAccessibleName(/jätka/i);
  await expect(loanPage.amountInput).toBeEditable();
  await expect(loanPage.periodInput).toBeEditable();
  await expect(loanPage.monthlyPaymentSummary).toBeVisible();
  await expect(loanPage.aprcSummary).toBeVisible();

  const domContentLoaded = await page.evaluate(() => {
    const [navigationEntry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return navigationEntry?.domContentLoadedEventEnd ?? 0;
  });

  expect(domContentLoaded).toBeGreaterThan(0);
  expect(domContentLoaded).toBeLessThan(DOM_CONTENT_LOADED_BUDGET_MS);
});

test('captureApplicationSubmission ignores calculate and GET requests', async ({ page }) => {
  const loanPage = new LoanPage(page);
  const capturedRequests: Request[] = [];
  const stopCapturing = await loanPage.captureApplicationSubmission(capturedRequests);

  await page.route('https://example.test/**', async (route) => {
    await route.fulfill({ status: 200, body: 'ok' });
  });

  try {
    await page.goto('data:text/html,<html><body>capture test</body></html>');
    await page.evaluate(async () => {
      await Promise.all([
        fetch('https://example.test/calculate', { method: 'POST' }),
        fetch('https://example.test/apply', { method: 'POST' }),
        fetch('https://example.test/read', { method: 'GET' }),
      ]);
    });

    await expect.poll(() => capturedRequests.length).toBe(1);
    expect(capturedRequests[0].method()).toBe('POST');
    expect(capturedRequests[0].url()).toContain('/apply');
  } finally {
    stopCapturing();
    await page.unroute('https://example.test/**');
  }
});

for (const scenario of HAPPY_CASES) {
  test(`Happy path: ${scenario.name}`, async ({ page }) => {
    const loanPage = new LoanPage(page);
    await loanPage.openApplication();

    const beforeText = await loanPage.readVisibleText();
    const beforePayment = await loanPage.readMetricText('monthlyPayment');
    const beforeAprc = await loanPage.readMetricText('aprc');
    const beforeSelection = await loanPage.getUrlSelection();
    const submissions: Request[] = [];
    const stopCapturing = await loanPage.captureApplicationSubmission(submissions);
    try {
      const calculateResponses = await loanPage.changeCalculatorAndWaitForCalculation(scenario.amount, scenario.period);

      await expect(loanPage.amountInput).toHaveValue(String(scenario.amount));
      await expect(loanPage.periodInput).toHaveValue(String(scenario.period));
      await expect(loanPage.monthlyPaymentSummary).toBeVisible();
      await expect(loanPage.aprcSummary).toBeVisible();

      const afterText = await loanPage.readVisibleText();
      const afterPayment = await loanPage.readMetricText('monthlyPayment');
      const afterAprc = await loanPage.readMetricText('aprc');
      expect(afterText).not.toEqual(beforeText);
      expect(afterPayment).not.toEqual('');
      expect(afterAprc).not.toEqual('');
      if (beforeSelection.amount !== String(scenario.amount) || beforeSelection.period !== String(scenario.period)) {
        expect(`${afterPayment}|${afterAprc}`).not.toEqual(`${beforePayment}|${beforeAprc}`);
      }

      const requestSnapshots = calculateResponses.map(
        (response) => `${response.request().url()} ${response.request().postData() ?? ''}`,
      );
      if (beforeSelection.amount !== String(scenario.amount)) {
        expect(requestSnapshots.some((snapshot) => snapshot.includes(String(scenario.amount)))).toBeTruthy();
      }
      if (beforeSelection.period !== String(scenario.period)) {
        expect(requestSnapshots.some((snapshot) => snapshot.includes(String(scenario.period)))).toBeTruthy();
      }

      expect(submissions).toHaveLength(0);

      await loanPage.clickContinue();

      await expect
        .poll(async () => loanPage.hasAppliedSelection(scenario.amount, scenario.period), {
          message: 'Expected chosen amount and period to be applied after clicking Jätka',
        })
        .toBeTruthy();

      const signatures = submissions.map(
        (request) => `${request.method()} ${request.url()} ${request.postData() ?? ''}`,
      );
      if (signatures.length > 0) {
        expect(signatures.some((signature) => signature.includes(String(scenario.amount)))).toBeTruthy();
        expect(signatures.some((signature) => signature.includes(String(scenario.period)))).toBeTruthy();
      }
    } finally {
      stopCapturing();
    }
  });
}

for (const scenario of NON_HAPPY_CASES) {
  test(`Non-happy path: ${scenario.name}`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    const loanPage = new LoanPage(page);
    await loanPage.openApplication();

    if (scenario.field === 'amount') {
      await loanPage.fillAmount(scenario.value);
      await loanPage.fillPeriod(scenario.counterpart);
    } else {
      await loanPage.fillAmount(scenario.counterpart);
      await loanPage.fillPeriod(scenario.value);
    }

    await expect(loanPage.amountInput).toBeVisible();
    await expect(loanPage.periodInput).toBeVisible();
    await expect(loanPage.continueButton).toBeVisible();

    const activeInput = scenario.field === 'amount' ? loanPage.amountInput : loanPage.periodInput;
    const renderedValue = await activeInput.inputValue();
    const validationTriggered = await loanPage.hasValidationFeedback();
    const continueDisabled = await loanPage.isContinueDisabled();

    expect(pageErrors).toHaveLength(0);
    expect(
      renderedValue !== scenario.value || validationTriggered || continueDisabled,
      'Expected the UI to sanitize the invalid input or block continuation.',
    ).toBeTruthy();
  });
}

test('Accidental Double Click does not create duplicate API submissions', async ({ page }) => {
  const loanPage = new LoanPage(page);
  await loanPage.openApplication();
  await loanPage.changeCalculatorAndWaitForCalculation(15000, 60);

  const submissions: string[] = [];
  const capturedRequests: Request[] = [];
  const stopCapturing = await loanPage.captureApplicationSubmission(capturedRequests);

  try {
    const startUrl = page.url();
    await loanPage.continueButton.dblclick({ delay: 20 });
    await expect.poll(() => capturedRequests.length, { message: 'Expected at least one application submission request.' }).toBeGreaterThan(0);
    await Promise.race([
      page.waitForURL((url) => url.toString() !== startUrl, { timeout: 5_000 }),
      page.waitForLoadState('networkidle'),
    ]).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);

    submissions.push(
      ...capturedRequests.map((request) => `${request.method()} ${request.url()} ${request.postData() ?? ''}`),
    );
    expect(submissions.length).toBeGreaterThan(0);

    const submissionCounts = submissions.reduce<Record<string, number>>((acc, signature) => {
      acc[signature] = (acc[signature] ?? 0) + 1;
      return acc;
    }, {});

    for (const duplicateCount of Object.values(submissionCounts)) {
      expect(duplicateCount).toBe(1);
    }
  } finally {
    stopCapturing();
  }
});

test('The Coffee Break Scenario blocks progression on session timeout', async ({ page }) => {
  const loanPage = new LoanPage(page);
  const calculateEndpointPattern = /\/calculate(?:\?|$)/;
  await loanPage.openApplication();
  await page.route(calculateEndpointPattern, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Session expired' }),
    });
  });

  try {
    const amountCalculateResponse = await loanPage.fillAmountAndWaitForCalculation(9000, { expectOk: false });
    expect(amountCalculateResponse.status()).toBe(401);
    const periodCalculateResponse = await loanPage.fillPeriodAndWaitForCalculation(72, { expectOk: false });
    expect(periodCalculateResponse.status()).toBe(401);

    const blockedByDisabledButton = await loanPage.isContinueDisabled();
    const beforeContinueUrl = page.url();

    if (!blockedByDisabledButton) {
      await loanPage.clickContinue({ noWaitAfter: true });
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    await expect
      .poll(
        async () =>
          (await loanPage.sessionExpiredIndicators.first().isVisible().catch(() => false)) ||
          (await loanPage.isContinueDisabled()) ||
          (page.url() === beforeContinueUrl && (await loanPage.amountInput.isVisible().catch(() => false))),
        {
          message: 'Expected session expiration feedback or blocked progression after a mocked 401 /calculate response.',
        },
      )
      .toBeTruthy();
  } finally {
    await page.unroute(calculateEndpointPattern);
  }
});
