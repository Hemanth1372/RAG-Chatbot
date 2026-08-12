import fs from "fs/promises";
import { PDFParse } from "pdf-parse";

export async function extractDocument(filePath, fileType) {
  if (fileType === "pdf") {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });

    const data = await parser.getText();
    const info = await parser.getInfo();

    await parser.destroy();

    return {
      totalPages: info.total,
      pages: data.text.split("\f").map((text, index) => ({
        pageNumber: index + 1,
        text,
      })),
    };
  }

  if (fileType === "txt") {
    const text = await fs.readFile(filePath, "utf-8");

    return {
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          text,
        },
      ],
    };
  }

  throw new Error(`Unsupported document type: ${fileType}`);
}
