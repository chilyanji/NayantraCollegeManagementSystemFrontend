import { test, expect } from "@playwright/test";
for (const role of ["faculty", "hostel_warden", "hostel_guard"]) {
  test(`${role}: no session until verification succeeds`, async ({ page }) => {
    const user = {
      user_id: 1,
      username: "pending_user",
      role,
      full_name: "Test User",
      email_verified: true,
    };
    await page.routeWebSocket(/\/ws\/live/, () => {});
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: any = [],
        status = 200;
      if (path.endsWith("/login"))
        data = {
          verification_required: true,
          verification_token: "a".repeat(43),
          masked_email: "p***@gmail.com",
          role,
          expires_in: 600,
          resend_after: 60,
        };
      else if (path.endsWith("/auth/email/verify")) {
        if (route.request().postDataJSON().code !== "654321") {
          data = { detail: "Incorrect code." };
          status = 400;
        } else data = { access_token: "verified-session", user };
      } else if (path.includes("/users/")) data = user;
      else if (path.endsWith("/health")) data = { status: "ok" };
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await page.goto("/login");
    await page.getByLabel("Username", { exact: true }).fill("pending_user");
    await page
      .getByLabel("Password", { exact: true })
      .fill("PrivatePassword123!");
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(
      page.getByRole("heading", { name: "Verify your email" }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(() => sessionStorage.getItem("sentinel.session.v1")),
    ).toBeNull();
    await page.getByLabel("Verification code").fill("000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByText("Incorrect code.")).toBeVisible();
    expect(
      await page.evaluate(() => sessionStorage.getItem("sentinel.session.v1")),
    ).toBeNull();
    if (role === "hostel_guard") {
      await page.screenshot({
        path: "test-results/email-verification-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "test-results/email-verification-mobile.png",
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByLabel("Verification code").fill("654321");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(
      role === "faculty" ? /\/faculty$/ : /\/hostels$/,
    );
    const session = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("sentinel.session.v1")!),
    );
    expect(session.token).toBe("verified-session");
    expect(session.user.role).toBe(role);
  });
}
test("resend rotates ticket and back clears verification state", async ({
  page,
}) => {
  let verifiedTicket = "";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const pending = {
      verification_required: true,
      verification_token: "a".repeat(43),
      masked_email: "p***@gmail.com",
      role: "hostel_guard",
      expires_in: 600,
      resend_after: 1,
    };
    let data: any = pending;
    if (path.endsWith("/resend"))
      data = { ...pending, verification_token: "b".repeat(43) };
    if (path.endsWith("/verify")) {
      verifiedTicket = route.request().postDataJSON().verification_token;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Test invalid code" }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("pending_user");
  await page
    .getByLabel("Password", { exact: true })
    .fill("PrivatePassword123!");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(
    page.getByText("New code sent. Use the latest email."),
  ).toBeVisible();
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect.poll(() => verifiedTicket).toBe("b".repeat(43));
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(() => sessionStorage.getItem("sentinel.session.v1")),
  ).toBeNull();
});
