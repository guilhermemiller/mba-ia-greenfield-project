import { expect } from "@playwright/test";
import { test } from "./fixtures";

test.describe("Video Upload (E2E)", () => {
  test("successfully uploads a video file", async ({ page }) => {
    await page.goto("/upload");

    // The user should see the upload page
    await expect(
      page.locator("text=Selecione o vídeo para upload"),
    ).toBeVisible();

    // The upload input field
    const fileInput = page.locator('input[type="file"]');

    // Create a dummy video file and upload it
    await fileInput.setInputFiles({
      name: "test-video.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("dummy video content for E2E tests"),
    });

    // We should see the file selected and the start upload button
    await expect(page.locator("text=test-video.mp4")).toBeVisible();

    // Start the upload
    await page.getByRole("button", { name: /Iniciar Upload/i }).click();

    // Verify successful completion
    await expect(page.locator("text=Upload concluído!")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows validation error for a non-video file", async ({ page }) => {
    await page.goto("/upload");

    const fileInput = page.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: "test-text.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is just text, not a video"),
    });

    // In browsers, accept="video/*" filters files but if bypassed, our logic rejects it
    await expect(
      page.locator("text=Por favor, selecione um arquivo de vídeo válido"),
    ).toBeVisible();
  });

  test("shows 413 TOO LARGE error if file name signals it to MSW", async ({
    page,
  }) => {
    await page.goto("/upload");

    const fileInput = page.locator('input[type="file"]');

    // "too-big.mp4" is a reserved trigger in MSW mock that returns a 413 Payload Too Large
    await fileInput.setInputFiles({
      name: "too-big.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("some fake bytes"),
    });

    await page.getByRole("button", { name: /Iniciar Upload/i }).click();

    await expect(page.locator("text=Erro no upload")).toBeVisible({
      timeout: 5000,
    });
    // MSW trigger returns 413 with message
    await expect(page.locator("text=Payload Too Large")).toBeVisible();
  });
});
