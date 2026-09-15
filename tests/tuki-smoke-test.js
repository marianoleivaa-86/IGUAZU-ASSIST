const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require("puppeteer");

const BASE_URL = process.env.TUKI_TEST_URL || "http://127.0.0.1:4173/index.html";
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuki-smoke-"));
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.CHROME_BIN || "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-features=ServiceWorker"],
        userDataDir
    });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);
    const consoleErrors = [];
    const pageErrors = [];

    await page.evaluateOnNewDocument(() => {
        window.__tukiSmokeErrors = [];
        window.__tukiSmokeUnhandled = [];
        window.addEventListener("error", event => window.__tukiSmokeErrors.push(event.message));
        window.addEventListener("unhandledrejection", event => window.__tukiSmokeUnhandled.push(String(event.reason)));
    });
    page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", error => pageErrors.push(error.message));

    const checks = [];
    const check = (name, condition, details = "") => {
        assert.ok(condition, `${name}${details ? ` — ${details}` : ""}`);
        checks.push(name);
        console.log(`PASS ${name}`);
    };

    try {
        await page.goto(BASE_URL, { waitUntil: "networkidle0" });
        await page.evaluate(async () => {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        });
        await page.reload({ waitUntil: "networkidle0" });
        await page.click("#tuki-fab");
        await sleep(250);
        check("a) FAB abre Tuki", await page.$eval("#tuki-panel", panel => panel.getAttribute("aria-hidden") === "false" && document.querySelector("#tuki-fab").getAttribute("aria-expanded") === "true"));

        await page.click("#tuki-close");
        await sleep(150);
        check("b) botón cierra Tuki", await page.$eval("#tuki-panel", panel => panel.getAttribute("aria-hidden") === "true"));

        await page.click("#tuki-fab");
        await sleep(150);
        await page.mouse.click(10, 10);
        await sleep(150);
        check("c) backdrop cierra Tuki", await page.$eval("#tuki-panel", panel => panel.getAttribute("aria-hidden") === "true"));

        await page.click("#tuki-fab");
        await sleep(150);
        await page.click('button[data-tuki-question="¿Dónde puedo comer?"]');
        await page.waitForSelector(".tuki-place-card", { visible: true, timeout: 5000 });
        check("d) pregunta rápida genera tarjetas", await page.$$eval(".tuki-place-card", cards => cards.length >= 1));

        const computed = await page.$eval(".tuki-place-card", card => {
            const styles = getComputedStyle(card);
            return {
                background: styles.backgroundColor,
                color: styles.color,
                text: card.innerText.trim()
            };
        });
        check("e) fondo computado de tarjeta", computed.background === "rgb(74, 44, 26)", JSON.stringify(computed));
        check("e) color computado de tarjeta", computed.color === "rgb(255, 255, 255)", JSON.stringify(computed));

        await page.click(".tuki-place-card");
        await sleep(250);
        const navigation = await page.$eval("#tuki-panel", panel => ({
            closed: panel.getAttribute("aria-hidden") === "true",
            detailVisible: !document.querySelector("#detail").classList.contains("hidden"),
            hash: window.location.hash
        }));
        check("f) clic en tarjeta cierra Tuki", navigation.closed);
        check("f) clic en tarjeta navega al detalle", navigation.detailVisible && navigation.hash.startsWith("#detail"), JSON.stringify(navigation));

        const runtimeErrors = await page.evaluate(() => ({
            errors: window.__tukiSmokeErrors,
            unhandled: window.__tukiSmokeUnhandled
        }));
        const allErrors = [...consoleErrors, ...pageErrors, ...runtimeErrors.errors];
        check("g) sin errores de consola", allErrors.length === 0, allErrors.join(" | "));
        check("g) sin unhandledrejection", runtimeErrors.unhandled.length === 0, runtimeErrors.unhandled.join(" | "));

        console.log(`OK ${checks.length} checks passed`);
    } finally {
        await context.close();
        await browser.close();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
});
