/**
 * Exports the first <svg> found inside a container element as a downloaded
 * PNG file. Works entirely client-side via the browser's native SVG/canvas
 * APIs — no extra dependency needed. Used for "export chart as image"
 * actions (Recharts renders each chart as an inline SVG).
 */
export function exportChartAsPng(
  container: HTMLElement | null,
  filename: string,
) {
  if (!container) return;
  const svg = container.querySelector("svg");
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width), 1);
  const height = Math.max(Math.round(rect.height), 1);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  // Recharts/shadcn charts use CSS variables (var(--chart-1) etc.) for
  // stroke/fill; those variables live on an ancestor, so resolve them to
  // concrete colors inline before serializing or the exported PNG will
  // render with missing colors.
  const computed = getComputedStyle(document.documentElement);
  const cssVarPattern = /var\((--[a-zA-Z0-9-]+)\)/g;
  const resolveVars = (value: string) =>
    value.replace(cssVarPattern, (_match, varName) => {
      const resolved = computed.getPropertyValue(varName).trim();
      return resolved || "#888888";
    });
  clone.querySelectorAll("*").forEach((el) => {
    for (const attr of ["fill", "stroke"]) {
      const val = el.getAttribute(attr);
      if (val?.includes("var(")) el.setAttribute(attr, resolveVars(val));
    }
    const style = el.getAttribute("style");
    if (style?.includes("var(")) el.setAttribute("style", resolveVars(style));
  });

  const bgColor = computed.getPropertyValue("--card").trim() || "#ffffff";
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const scale = 2; // export at 2x for a crisper image
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(scale, scale);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
    }
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
