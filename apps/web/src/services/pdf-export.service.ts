export async function exportCurrentReportAsPdf(title: string): Promise<void> {
  if (typeof window === "undefined" || typeof window.print !== "function") {
    throw new Error("PDF printing is not available in this environment.");
  }

  const previousTitle = document.title;
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, "-").trim();
  document.title = safeTitle || "Taher-Accounting-Report";

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    window.print();
  } finally {
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  }
}
