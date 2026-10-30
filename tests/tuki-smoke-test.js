const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require("puppeteer");

let effectiveBaseUrl = process.env.TUKI_TEST_URL || "";
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function resolveExecutablePath() {
    if (process.env.CHROME_BIN) {
        return process.env.CHROME_BIN;
    }
    if (typeof puppeteer.executablePath === "function") {
        try {
            const detected = await puppeteer.executablePath();
            if (detected && fs.existsSync(detected)) {
                return detected;
            }
        } catch {
            // fallback
        }
    }
    return undefined;
}

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg"
};

function startStaticServer(projectRoot, port = 4173) {
    const server = http.createServer((req, res) => {
        try {
            const urlPath = req.url.split("?")[0];
            const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
            let filePath = path.join(projectRoot, safePath === "/" ? "index.html" : safePath);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, "index.html");
            }
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found");
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": contentType });
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(err.message);
        }
    });

    return new Promise((resolve, reject) => {
        server.listen(port, "127.0.0.1", () => resolve(server));
        server.on("error", reject);
    });
}

async function main() {
    let localServer = null;
    let userDataDir = null;
    let browser = null;
    let context = null;
    const projectRoot = path.resolve(__dirname, "..");

    try {
        if (process.env.TUKI_TEST_URL) {
            effectiveBaseUrl = process.env.TUKI_TEST_URL;
        } else {
            localServer = await startStaticServer(projectRoot, 0);
            effectiveBaseUrl = `http://127.0.0.1:${localServer.address().port}/index.html`;
        }

        const smokeRunsRoot = path.join(os.tmpdir(), "tuki-smoke-runs");
        fs.mkdirSync(smokeRunsRoot, { recursive: true });
        fs.accessSync(smokeRunsRoot, fs.constants.W_OK);
        userDataDir = fs.mkdtempSync(path.join(smokeRunsRoot, "tuki-smoke-"));

        const executablePath = await resolveExecutablePath();
        browser = await puppeteer.launch({
            headless: true,
            executablePath,
            args: ["--no-sandbox", "--disable-features=ServiceWorker"],
            userDataDir
        });
        context = await browser.createBrowserContext();
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

        await page.goto(effectiveBaseUrl, { waitUntil: "networkidle0" });
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

        const posicionInicial = await page.$eval("#tuki-fab", fab => {
            const rect = fab.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: rect.left, top: rect.top };
        });
        await page.mouse.move(posicionInicial.x, posicionInicial.y);
        await page.mouse.down();
        await page.mouse.move(posicionInicial.x - 110, posicionInicial.y - 90, { steps: 8 });
        await page.mouse.up();
        await sleep(50);
        const despuesDelArrastre = await page.evaluate(() => {
            const fab = document.querySelector("#tuki-fab");
            const rect = fab.getBoundingClientRect();
            return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: window.innerWidth,
                height: window.innerHeight,
                panelCerrado: document.querySelector("#tuki-panel").getAttribute("aria-hidden") === "true",
                guardada: localStorage.getItem("iguazu-tuki-fab-position-v1"),
                diagnostico: {
                    rect: { left: rect.left, top: rect.top },
                    inline: { left: fab.style.left, top: fab.style.top },
                    transform: getComputedStyle(fab).transform,
                    hover: fab.matches(":hover"),
                    dragging: fab.classList.contains("is-dragging")
                }
            };
        });
        check("c) arrastrar con mouse mueve el FAB sin abrir el chat", despuesDelArrastre.panelCerrado
            && Math.abs(despuesDelArrastre.left - posicionInicial.left) > 5
            && Math.abs(despuesDelArrastre.top - posicionInicial.top) > 5);
        check("c) FAB queda dentro del viewport y guarda su posición", despuesDelArrastre.left >= 0
            && despuesDelArrastre.top >= 0
            && despuesDelArrastre.right <= despuesDelArrastre.width
            && despuesDelArrastre.bottom <= despuesDelArrastre.height
            && Boolean(despuesDelArrastre.guardada));
        const leerEstadoPosicionFab = () => page.$eval("#tuki-fab", fab => {
            const rect = fab.getBoundingClientRect();
            return {
                rect: { left: rect.left, top: rect.top },
                inline: { left: fab.style.left, top: fab.style.top },
                stored: localStorage.getItem("iguazu-tuki-fab-position-v1"),
                transform: getComputedStyle(fab).transform,
                hover: fab.matches(":hover"),
                dragging: fab.classList.contains("is-dragging")
            };
        });
        await page.reload({ waitUntil: "networkidle0" });
        const estadoDespuesDeRecargar = await leerEstadoPosicionFab();
        let coordenadasGuardadas = null;
        if (despuesDelArrastre.guardada) {
            try {
                coordenadasGuardadas = JSON.parse(despuesDelArrastre.guardada);
            } catch (_) {
                // El valor almacenado debe ser JSON válido para considerarse restaurado.
            }
        }
        const coordenadasGuardadasValidas = coordenadasGuardadas
            && Number.isFinite(coordenadasGuardadas.x)
            && Number.isFinite(coordenadasGuardadas.y);
        const leftRestaurada = Number.parseFloat(estadoDespuesDeRecargar.inline.left);
        const topRestaurada = Number.parseFloat(estadoDespuesDeRecargar.inline.top);
        const restauracionCorrecta = Boolean(coordenadasGuardadasValidas)
            && Number.isFinite(leftRestaurada)
            && Number.isFinite(topRestaurada)
            && Math.abs(leftRestaurada - coordenadasGuardadas.x) <= 1
            && Math.abs(topRestaurada - coordenadasGuardadas.y) <= 1;
        if (!restauracionCorrecta) {
            console.error("DIAGNÓSTICO FAB antes/después de recargar:", JSON.stringify({
                antes: {
                    ...despuesDelArrastre.diagnostico,
                    stored: despuesDelArrastre.guardada
                },
                despues: estadoDespuesDeRecargar,
                despuesDelArrastre
            }, null, 2));
        }
        check("c) posición del FAB se restaura tras recargar", restauracionCorrecta);

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
        const geometry = await page.$eval(".tuki-place-card", card => {
            const icon = card.querySelector(".tuki-place-icon")?.getBoundingClientRect();
            const info = card.querySelector(".tuki-place-info")?.getBoundingClientRect();
            const arrow = card.querySelector(".tuki-place-arrow")?.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            return {
                icon: icon && { left: icon.left, right: icon.right, width: icon.width },
                info: info && { left: info.left, right: info.right, width: info.width },
                arrow: arrow && { left: arrow.left, right: arrow.right, width: arrow.width },
                card: { left: cardRect.left, right: cardRect.right }
            };
        });
        check("e) columnas separadas de tarjeta", geometry.icon && geometry.info && geometry.arrow
            && geometry.icon.right <= geometry.info.left
            && geometry.info.right <= geometry.arrow.left
            && geometry.info.width > 80
            && geometry.arrow.width > 0,
        JSON.stringify(geometry));

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
        await verifyDesktopCardStyle(browser);
        await verifyTouchDrag(browser);

        console.log(`OK ${checks.length} checks passed`);
    } finally {
        const cleanup = async (label, action) => {
            try {
                await action();
            } catch (cleanupError) {
                console.error(`CLEANUP ${label} failed: ${cleanupError.message}`);
            }
        };

        if (context) {
            await cleanup("browser context", () => context.close());
        }
        if (browser) {
            await cleanup("browser", () => browser.close());
        }
        if (userDataDir) {
            await cleanup("temporary profile", () => {
                fs.rmSync(userDataDir, { recursive: true, force: true });
            });
        }
        if (localServer) {
            await cleanup("HTTP server", () => new Promise((resolve, reject) => {
                localServer.close(error => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            }));
        }
    }
}

async function verifyDesktopCardStyle(browser) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);
    try {
        await page.goto(effectiveBaseUrl, { waitUntil: "networkidle0" });
        await page.click("#tuki-fab");
        await sleep(150);
        await page.click('button[data-tuki-question="¿Dónde puedo comer?"]');
        await page.waitForSelector(".tuki-place-card", { visible: true, timeout: 5000 });
        const styles = await page.$eval(".tuki-place-card", card => {
            const computed = getComputedStyle(card);
            return {
                background: computed.backgroundColor,
                color: computed.color,
                fill: computed.webkitTextFillColor,
                border: computed.border
            };
        });
        assert.deepEqual(styles, {
            background: "rgb(74, 44, 26)",
            color: "rgb(255, 255, 255)",
            fill: "rgb(255, 255, 255)",
            border: "1px solid rgb(184, 138, 82)"
        });
        console.log("PASS desktop 1280px .tuki-place-card computed style");
    } finally {
        await context.close();
    }
}

async function verifyTouchDrag(browser) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    try {
        await page.goto(effectiveBaseUrl, { waitUntil: "networkidle0" });
        const client = await page.createCDPSession();
        await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
        const start = await page.$eval("#tuki-fab", fab => {
            const rect = fab.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: rect.left, top: rect.top };
        });
        await client.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: start.x, y: start.y, id: 1 }]
        });
        await client.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: start.x - 90, y: start.y - 70, id: 1 }]
        });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(50);
        const dragged = await page.evaluate(() => {
            const rect = document.querySelector("#tuki-fab").getBoundingClientRect();
            return {
                left: rect.left,
                top: rect.top,
                closed: document.querySelector("#tuki-panel").getAttribute("aria-hidden") === "true"
            };
        });
        assert.ok(Math.abs(dragged.left - start.left) > 5 && Math.abs(dragged.top - start.top) > 5,
            "touch drag should move the floating button");
        assert.ok(dragged.closed, "touch drag must not open the chat");
        console.log("PASS touch drag moves the FAB without opening the chat");

        await page.evaluate(() => localStorage.setItem("iguazu-tuki-fab-position-v1", JSON.stringify({ x: 99999, y: -99999 })));
        await page.reload({ waitUntil: "networkidle0" });
        const clamped = await page.$eval("#tuki-fab", fab => {
            const rect = fab.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
        });
        assert.ok(clamped.left >= 0 && clamped.top >= 0 && clamped.right <= clamped.width && clamped.bottom <= clamped.height,
            `restored position must be clamped to the viewport: ${JSON.stringify(clamped)}`);
        console.log("PASS invalid saved position is clamped on restore");

        await page.setViewport({ width: 320, height: 600, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        await sleep(50);
        const resized = await page.$eval("#tuki-fab", fab => {
            const rect = fab.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
        });
        assert.ok(resized.left >= 0 && resized.top >= 0 && resized.right <= resized.width && resized.bottom <= resized.height,
            `position after viewport resize must remain visible: ${JSON.stringify(resized)}`);
        console.log("PASS FAB remains within viewport after resizing");
    } finally {
        await context.close();
    }
}

main().catch(error => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
});
