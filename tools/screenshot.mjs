
import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  try {
    await page.goto("http://localhost:3001/boms", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\27c6715a-24ed-44c3-b20e-bbf2fad270b4\\bom_screenshot.png", fullPage: true });
    console.log("Screenshot taken successfully!");
  } catch (error) {
    console.error("Error taking screenshot:", error);
  } finally {
    await browser.close();
  }
})();

