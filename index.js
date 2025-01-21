const express = require("express");
const puppeteer = require("puppeteer");
const { PDFDocument, degrees } = require("pdf-lib");

const app = express();
app.use(express.json());

async function combinePdfs(pdfs,rotar = 0) {
  const combinedPdf = await PDFDocument.create();

  for (const pdf of pdfs) {
    const existingPdf = await PDFDocument.load(pdf);
    const pages = await combinedPdf.copyPages(existingPdf, existingPdf.getPageIndices());
    pages.forEach((page) => {
      if (rotar) page.setRotation(degrees(-90)); // Rota la página 90 grados
      combinedPdf.addPage(page);
    });
  }

  const combinedPdfBytes = await combinedPdf.save();
  return combinedPdfBytes;
}

app.post("/", async (req, res) => {
  const { url, rotar = 0 } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL es requerida" });
  }

  try {
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Configurar tamaño de viewport
    await page.setViewport({ width: 1280, height: 720 });

    // Navegar a la URL
    await page.goto(url, { waitUntil: "networkidle2" });

    const pdf_html = await page.evaluate(() => {
      return document.querySelector("#pdf").innerHTML;
    });

    const pages_count = await page.evaluate(() => {
      return document.querySelectorAll("#pdf .page").length;
    });

    const pdfs = [];

    for (let i = 0; i < pages_count; i++) {
      const { width, height } = await page.evaluate(
        (pdf_html, i) => {
          const pdf = document.querySelector("#pdf");
          pdf.innerHTML = pdf_html;
          pdf.querySelectorAll(".page").forEach((p, index) => {
            if (index != i) {
              p.remove();
            } else {
              p.style.top = 0;
              p.style.left = 0;
              p.style.transform = "";
            }
          });
          const p = pdf.querySelector(".page");
          const size = p.getBoundingClientRect();
          return {
            width: size.width,
            height: size.height,
          };
        },
        pdf_html,
        i
      );
      const pdf = await page.pdf({
        printBackground: true,
        width,
        height,
      });
      pdfs.push(pdf);
    }

    await browser.close();

    const combinedPdf = await combinePdfs(pdfs, rotar);

    // Enviar el PDF como respuesta
    res.contentType("application/pdf");
    res.end(combinedPdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando el PDF" });
  }
});

// Iniciar servidor
const PORT = 2563;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
