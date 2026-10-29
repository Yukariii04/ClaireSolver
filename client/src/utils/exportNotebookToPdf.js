import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ---------------------------------------------------------------------------
// Temporary Print / Export Stylesheet Injection
// ---------------------------------------------------------------------------

const EXPORT_STYLE_ID = 'claire-pdf-export-overrides';

function injectExportStyles({ preset, paperBackground }) {
  let styleEl = document.getElementById(EXPORT_STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = EXPORT_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  let css = `
    /* Hide floating UI controls during PDF rendering */
    [data-notebook-page] button,
    [data-notebook-page] .animate-ping,
    [data-notebook-page] .animate-pulse,
    [data-notebook-page] [title*="Reset"],
    [data-notebook-page] .pointer-events-none .absolute {
      /* Keep essential overlays, hide interactive controls */
    }
  `;

  // Clean Submission Mode
  if (preset === 'submission') {
    css += `
      /* Clean Submission: Hide margin notes and tutor coaching chips */
      [data-notebook-page] [data-margin-note],
      [data-notebook-page] .handwriting-margin-note,
      [data-notebook-page] button,
      [data-notebook-page] input {
        display: none !important;
      }

      /* Unify Ghost Pen AI ink with student's dark blue-black pen */
      [data-notebook-page] [data-ghost-pen-step] .katex,
      [data-notebook-page] [data-ghost-pen-step] [class*="text-indigo"],
      [data-notebook-page] .handwriting-ink-ai {
        color: #1a1a2e !important;
      }
      [data-notebook-page] [data-ghost-pen-step] {
        border-color: transparent !important;
        background: transparent !important;
        box-shadow: none !important;
        ring: 0 !important;
      }
      [data-notebook-page] [data-ghost-pen-step] span.rounded-lg.bg-indigo-600 {
        background-color: #1a1a2e !important;
      }
    `;
  }

  // Clean White Paper Mode
  if (paperBackground === 'white') {
    css += `
      [data-notebook-page] [data-canvas-container] > div[style*="background"] {
        background-image: none !important;
        background-color: #ffffff !important;
      }
    `;
  }

  styleEl.textContent = css;
}

function removeExportStyles() {
  const styleEl = document.getElementById(EXPORT_STYLE_ID);
  if (styleEl) {
    styleEl.remove();
  }
}

// ---------------------------------------------------------------------------
// Multi-Page A4 PDF Exporter
// ---------------------------------------------------------------------------

/**
 * Exports all notebook pages to a crisp, high-resolution A4 PDF.
 *
 * @param {string} notebookTitle - Title for the downloaded PDF file.
 * @param {HTMLElement[]} pageElements - Array of <NotebookPage /> DOM nodes.
 * @param {Object} options
 * @param {'submission'|'study_guide'} [options.preset='study_guide'] - Export presentation preset.
 * @param {'keep'|'white'} [options.paperBackground='keep'] - Paper background style.
 * @param {Function} [options.onProgress] - Callback reporting (pageIndex, totalPages, statusText).
 * @returns {Promise<{ success: boolean, pageCount: number }>}
 */
export async function exportNotebookToPdf(
  notebookTitle = 'Homework',
  pageElements = [],
  options = {},
) {
  const {
    preset = 'study_guide',
    paperBackground = 'keep',
    onProgress = null,
  } = options;

  if (!pageElements || pageElements.length === 0) {
    throw new Error('No notebook pages found to export.');
  }

  // 1. Inject export CSS overrides
  injectExportStyles({ preset, paperBackground });

  try {
    // 2. Initialize jsPDF in A4 Portrait mode (210mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();   // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
    const totalPages = pageElements.length;

    // 3. Sequentially snapshot each page at 2x DPI
    for (let i = 0; i < totalPages; i++) {
      const pageEl = pageElements[i];
      const pageNumber = i + 1;

      onProgress?.(
        pageNumber,
        totalPages,
        `Rendering Page ${pageNumber} of ${totalPages} at 2x resolution...`,
      );

      // Brief layout reflow breath
      await new Promise((resolve) => setTimeout(resolve, 80));

      const canvas = await html2canvas(pageEl, {
        scale: 2, // 2x DPI ensures crisp math symbols, handwriting & graphs
        useCORS: true, // Enables Firebase Storage pinned question images
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1200, // Normalized desktop viewport width
      });

      const imgData = canvas.toDataURL('image/png', 1.0);

      // Add subsequent pages
      if (i > 0) {
        pdf.addPage('a4', 'p');
      }

      // Fill A4 sheet proportionally
      pdf.addImage(
        imgData,
        'PNG',
        0,
        0,
        pdfWidth,
        pdfHeight,
        undefined,
        'FAST',
      );
    }

    onProgress?.(totalPages, totalPages, 'Finalizing PDF document...');

    // 4. Save and trigger browser download
    const safeName =
      (notebookTitle || 'Homework')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim() || 'Homework';

    const suffix = preset === 'submission' ? 'Submission' : 'StudyGuide';
    pdf.save(`${safeName}_${suffix}.pdf`);

    return { success: true, pageCount: totalPages };
  } finally {
    // Clean up temporary style override element
    removeExportStyles();
  }
}

