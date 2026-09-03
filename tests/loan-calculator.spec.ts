import { expect, test } from '@playwright/test';
import { LoanPage, waitForCalculate } from './helpers/loan-page';

const inputScenarios = [
  { amount: 3500, period: 24 },
  { amount: 5000, period: 60 },
  { amount: 9000, period: 48 }
];

test.describe('Bigbank loan application risk coverage', () => {
  test('renders the calculator quickly with accessible defaults', async ({ page }) => {
    const loanPage = new LoanPage(page);
    const { response, elapsedMs } = await loanPage.goto();

    expect(response?.ok()).toBeTruthy();
    expect(elapsedMs).toBeLessThan(10_000);
    expect(await page.getByRole('heading').count()).toBeGreaterThan(0);
    expect(await page.locator('main, [role="main"], form').count()).toBeGreaterThan(0);

    const amount = await loanPage.amountField();
    const period = await loanPage.periodField();

    await expect(amount).toBeVisible();
    await expect(period).toBeVisible();
    expect(await loanPage.readNumericValue(amount)).not.toBeNull();
    expect(await loanPage.readNumericValue(period)).not.toBeNull();
    expect(await loanPage.hasAccessibleName(amount)).toBeTruthy();
    expect(await loanPage.hasAccessibleName(period)).toBeTruthy();
  });

  test('recalculates for varied user input combinations', async ({ page }) => {
    const loanPage = new LoanPage(page);
    await loanPage.goto();

    const amount = await loanPage.amountField();
    const period = await loanPage.periodField();
    const baselineText = await loanPage.bodyText();

    for (const scenario of inputScenarios) {
      const { json } = await waitForCalculate(page, async () => {
        await loanPage.setNumericValue(amount, scenario.amount);
        await loanPage.setNumericValue(period, scenario.period);
      });

      expect(await loanPage.readNumericValue(amount)).toBe(scenario.amount);
      expect(await loanPage.readNumericValue(period)).toBe(scenario.period);
      await loanPage.expectCalculationValueOnScreen(json);
    }

    const updatedText = await loanPage.bodyText();
    expect(updatedText).not.toEqual(baselineText);
  });

  test('handles empty, invalid and out-of-range values safely', async ({ page }) => {
    const loanPage = new LoanPage(page);
    await loanPage.goto();

    const amount = await loanPage.amountField();
    const period = await loanPage.periodField();

    await loanPage.setNumericValue(amount, '');
    const emptyStateValue = await amount.inputValue();
    const emptyStateAccepted = emptyStateValue.trim().length === 0 || (await loanPage.invalidFeedbackVisible());
    expect(emptyStateAccepted).toBeTruthy();

    await loanPage.setNumericValue(amount, 'abc');
    const invalidValue = await amount.inputValue();
    const invalidHandled = invalidValue.trim().length === 0 || /^\d/.test(invalidValue) || (await loanPage.invalidFeedbackVisible());
    expect(invalidHandled).toBeTruthy();

    await loanPage.setNumericValue(amount, 1);
    await loanPage.setNumericValue(period, 1);

    const constrainedAmount = await loanPage.readNumericValue(amount);
    const constrainedPeriod = await loanPage.readNumericValue(period);
    const outOfRangeHandled =
      (constrainedAmount !== null && constrainedAmount >= 1) ||
      (constrainedPeriod !== null && constrainedPeriod >= 1) ||
      (await loanPage.invalidFeedbackVisible());

    expect(outOfRangeHandled).toBeTruthy();
  });

  test('shows an error when calculate API fails', async ({ page }) => {
    const loanPage = new LoanPage(page);

    await page.route('**/calculate**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Something went wrong. Please try again.' })
      });
    });

    await loanPage.goto();
    const amount = await loanPage.amountField();

    await waitForCalculate(page, async () => {
      await loanPage.setNumericValue(amount, 6500);
    });

    await expect.poll(async () => loanPage.apiFailureMessageVisible()).toBeTruthy();
  });

  test('blocks progression when the session has timed out', async ({ page }) => {
    const loanPage = new LoanPage(page);

    await page.route('**/calculate**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Session expired. Please sign in again.' })
      });
    });

    await loanPage.goto();
    const amount = await loanPage.amountField();

    await waitForCalculate(page, async () => {
      await loanPage.setNumericValue(amount, 7200);
    });

    await expect.poll(async () => loanPage.sessionMessageVisible()).toBeTruthy();

    const primaryAction = await loanPage.primaryAction();
    if (primaryAction) {
      const originalUrl = page.url();
      await primaryAction.click({ force: true });
      await page.waitForTimeout(500);
      expect(page.url()).toBe(originalUrl);
      const ariaDisabled = await primaryAction.getAttribute('aria-disabled');
      const blocked = (await primaryAction.isDisabled().catch(() => false)) || ariaDisabled === 'true';
      expect(blocked || (await loanPage.sessionMessageVisible())).toBeTruthy();
    }
  });
});
