/**
 * Canvas Context Harvester
 *
 * Captures high-res 2x DPI snapshots from a <NotebookPage />:
 * 1. fullPagePng: Complete snapshot of the page (pinned header + user strokes).
 * 2. croppedTargetPng: Targeted high-res crop of the highlighted bounding box
 *    (or the pinned question header if selected).
 */

import html2canvas from 'html2canvas';

/**
 * Strips the "data:image/png;base64," prefix from a data URL.
 *
 * @param {string} dataUrl
 * @returns {string}
 */
export function stripDataUrlPrefix(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

/**
 * Harvests visual context from a NotebookPage element.
 *
 * @param {string} pageId - Target page identifier (e.g. "page_1").
 * @param {import('./boundingBox.js').BoundingBox|null} boundingBox - Selection bounding box.
 * @returns {Promise<{
 *   fullPagePng: string,
 *   fullPageBase64: string,
 *   croppedTargetPng: string,
 *   croppedTargetBase64: string,
 *   boundingBox: import('./boundingBox.js').BoundingBox|null,
 *   pageId: string,
 *   timestamp: number
 * }>}
 */
export async function harvestCanvasContext(pageId, boundingBox = null) {
  const pageEl = document.querySelector(
    `[data-notebook-page][data-page-id="${pageId}"]`
  );

  if (!pageEl) {
    throw new Error(`Notebook page element not found for id: ${pageId}`);
  }

  // 1. Capture Full Page Snapshot at 2x DPI
  const scale = 2;
  const fullCanvas = await html2canvas(pageEl, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: pageEl.scrollWidth,
    windowHeight: pageEl.scrollHeight,
  });

  const fullPagePng = fullCanvas.toDataURL('image/png');
  const fullPageBase64 = stripDataUrlPrefix(fullPagePng);

  let croppedTargetPng = fullPagePng;
  let croppedTargetBase64 = fullPageBase64;

  // 2. Capture or Crop the Selected Target
  if (boundingBox) {
    if (boundingBox.isHeader) {
      // Pinned question header target
      const headerEl = pageEl.querySelector('[data-question-header]');
      if (headerEl) {
        const headerCanvas = await html2canvas(headerEl, {
          scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        croppedTargetPng = headerCanvas.toDataURL('image/png');
        croppedTargetBase64 = stripDataUrlPrefix(croppedTargetPng);
      }
    } else {
      // Stroke selection within the drawing canvas area
      const canvasContainer = pageEl.querySelector('[data-canvas-container]') || pageEl;
      const pageRect = pageEl.getBoundingClientRect();
      const canvasRect = canvasContainer.getBoundingClientRect();

      // Compute offset of canvas relative to the top of pageEl
      const offsetX = Math.max(0, canvasRect.left - pageRect.left);
      const offsetY = Math.max(0, canvasRect.top - pageRect.top);

      // Map bounding box (in canvas local pixels) into fullCanvas (scaled by 2)
      const cropX = Math.round((offsetX + boundingBox.minX) * scale);
      const cropY = Math.round((offsetY + boundingBox.minY) * scale);
      const cropW = Math.max(1, Math.round(boundingBox.width * scale));
      const cropH = Math.max(1, Math.round(boundingBox.height * scale));

      // Clamp dimensions to source canvas
      const clampedX = Math.max(0, Math.min(cropX, fullCanvas.width - 1));
      const clampedY = Math.max(0, Math.min(cropY, fullCanvas.height - 1));
      const clampedW = Math.min(cropW, fullCanvas.width - clampedX);
      const clampedH = Math.min(cropH, fullCanvas.height - clampedY);

      if (clampedW > 0 && clampedH > 0) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = clampedW;
        cropCanvas.height = clampedH;
        const ctx = cropCanvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(
            fullCanvas,
            clampedX,
            clampedY,
            clampedW,
            clampedH,
            0,
            0,
            clampedW,
            clampedH
          );
          croppedTargetPng = cropCanvas.toDataURL('image/png');
          croppedTargetBase64 = stripDataUrlPrefix(croppedTargetPng);
        }
      }
    }
  }

  return {
    fullPagePng,
    fullPageBase64,
    croppedTargetPng,
    croppedTargetBase64,
    boundingBox,
    pageId,
    timestamp: Date.now(),
  };
}

