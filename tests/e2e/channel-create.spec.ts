import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("channel growth loop", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD for a real test user.");

  test("creates a channel and lands on its detail page after login", async ({ page }) => {
    const channelName = `Canal E2E ${Date.now()}`;

    await page.goto("/channels/new");
    await expect(page).toHaveURL(/\/auth/);
    await page.getByLabel("Correo").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    await expect(page).toHaveURL(/\/channels\/new$/);

    await page.getByPlaceholder("Mañanas brutales").fill(channelName);
    await page.getByPlaceholder("De qué va tu canal").fill("Canal creado desde el flujo E2E.");
    await page.getByRole("button", { name: /^Crear canal$/ }).click();

    await expect(page).toHaveURL(/\/channels\/(?!new|mine)[^/?#]+$/);
    await expect(page.getByRole("heading", { name: channelName })).toBeVisible();
    await expect(page.getByText("Invitar a este canal")).toBeVisible();
  });
});