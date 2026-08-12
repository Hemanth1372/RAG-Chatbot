const DEFAULT_CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 350);

const DEFAULT_OVERLAP = Number(process.env.CHUNK_OVERLAP || 70);

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoWords(text) {
  return text.split(/\s+/).filter(Boolean);
}

function createChunk(text, metadata) {
  return {
    text: text.trim(),

    chunkIndex: metadata.chunkIndex,

    pageStart: metadata.pageStart,
    pageEnd: metadata.pageEnd,

    section: metadata.section ?? null,

    wordCount: splitIntoWords(text).length,
  };
}

export function chunkDocument(pages, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP) {
  if (!Array.isArray(pages)) {
    throw new Error("chunkDocument expects an array of pages.");
  }

  if (chunkSize <= overlap) {
    throw new Error("CHUNK_SIZE must be greater than CHUNK_OVERLAP.");
  }

  const chunks = [];

  let globalChunkIndex = 0;

  for (const page of pages) {
    const text = normalizeText(page.text);

    if (!text) {
      continue;
    }

    const words = splitIntoWords(text);

    const step = chunkSize - overlap;

    for (let start = 0; start < words.length; start += step) {
      const end = Math.min(start + chunkSize, words.length);

      const chunkWords = words.slice(start, end);

      if (chunkWords.length === 0) {
        break;
      }

      chunks.push(
        createChunk(chunkWords.join(" "), {
          chunkIndex: globalChunkIndex,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          section: null,
        })
      );

      globalChunkIndex++;

      if (end >= words.length) {
        break;
      }
    }
  }

  return chunks;
}
