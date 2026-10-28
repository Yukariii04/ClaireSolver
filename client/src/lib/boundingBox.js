/**
 * Bounding Box Math Helper for Canvas Selection
 *
 * Computes bounding boxes from pen/marker points, applies padding buffers,
 * and clamps coordinates to canvas/page boundaries.
 */

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} BoundingBox
 * @property {number} minX - Left boundary (pixels)
 * @property {number} minY - Top boundary (pixels)
 * @property {number} maxX - Right boundary (pixels)
 * @property {number} maxY - Bottom boundary (pixels)
 * @property {number} width - Box width (pixels)
 * @property {number} height - Box height (pixels)
 * @property {number} centerX - Center X coordinate
 * @property {number} centerY - Center Y coordinate
 * @property {boolean} [isHeader] - Whether this selection targets the pinned question header
 * @property {Object} raw - Unpadded bounding box
 */

/**
 * Compute the bounding box enclosing a set of points with an optional padding buffer.
 *
 * @param {Point[]} points - Array of { x, y } coordinates from the marker stroke.
 * @param {Object} [options]
 * @param {number} [options.paddingRatio=0.20] - Padding expansion ratio (default 20%).
 * @param {number} [options.minSize=32] - Minimum width/height in pixels (prevents zero-sized clicks).
 * @param {Object} [options.bounds] - Container boundary constraints { width, height }.
 * @returns {BoundingBox|null}
 */
export function computeStrokeBoundingBox(points, options = {}) {
  const {
    paddingRatio = 0.20,
    minSize = 32,
    bounds = { width: 0, height: 0 },
  } = options;

  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  // Handle single tap or minimal stroke by enforcing minSize
  let rawW = maxX - minX;
  let rawH = maxY - minY;

  if (rawW < minSize) {
    const diff = (minSize - rawW) / 2;
    minX -= diff;
    maxX += diff;
    rawW = minSize;
  }

  if (rawH < minSize) {
    const diff = (minSize - rawH) / 2;
    minY -= diff;
    maxY += diff;
    rawH = minSize;
  }

  // 20% padding buffer
  const padX = rawW * paddingRatio;
  const padY = rawH * paddingRatio;

  let paddedMinX = minX - padX;
  let paddedMinY = minY - padY;
  let paddedMaxX = maxX + padX;
  let paddedMaxY = maxY + padY;

  // Clamp to bounds if provided
  paddedMinX = Math.max(0, paddedMinX);
  paddedMinY = Math.max(0, paddedMinY);
  if (bounds.width > 0) paddedMaxX = Math.min(bounds.width, paddedMaxX);
  if (bounds.height > 0) paddedMaxY = Math.min(bounds.height, paddedMaxY);

  const finalW = Math.max(1, paddedMaxX - paddedMinX);
  const finalH = Math.max(1, paddedMaxY - paddedMinY);

  return {
    minX: Math.round(paddedMinX),
    minY: Math.round(paddedMinY),
    maxX: Math.round(paddedMaxX),
    maxY: Math.round(paddedMaxY),
    width: Math.round(finalW),
    height: Math.round(finalH),
    centerX: Math.round((paddedMinX + paddedMaxX) / 2),
    centerY: Math.round((paddedMinY + paddedMaxY) / 2),
    raw: {
      minX: Math.round(minX),
      minY: Math.round(minY),
      maxX: Math.round(maxX),
      maxY: Math.round(maxY),
      width: Math.round(rawW),
      height: Math.round(rawH),
    },
  };
}

/**
 * Creates a bounding box representation for the locked question header.
 *
 * @param {DOMRect} headerRect - getBoundingClientRect of the header element
 * @param {DOMRect} pageRect - getBoundingClientRect of the page container
 * @returns {BoundingBox}
 */
export function computeHeaderBoundingBox(headerRect, pageRect) {
  const minX = Math.max(0, headerRect.left - pageRect.left);
  const minY = Math.max(0, headerRect.top - pageRect.top);
  const width = headerRect.width;
  const height = headerRect.height;

  return {
    minX: Math.round(minX),
    minY: Math.round(minY),
    maxX: Math.round(minX + width),
    maxY: Math.round(minY + height),
    width: Math.round(width),
    height: Math.round(height),
    centerX: Math.round(minX + width / 2),
    centerY: Math.round(minY + height / 2),
    isHeader: true,
    raw: {
      minX: Math.round(minX),
      minY: Math.round(minY),
      maxX: Math.round(minX + width),
      maxY: Math.round(minY + height),
      width: Math.round(width),
      height: Math.round(height),
    },
  };
}

