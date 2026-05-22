// ============================================================
// Grid Image Server Utilities — Sharp-based Splitting
// ⚠️ SERVER-ONLY: This file imports 'sharp' which requires
// Node.js native modules (child_process, fs). Do NOT import
// from client components — use grid.ts for client-safe utils.
// ============================================================

import sharp from 'sharp'

// ============================================================
// Grid Image Splitting
// ============================================================

/**
 * Split a grid image buffer into individual cell image buffers
 * using Sharp.
 *
 * The grid is assumed to be evenly divided: each cell has
 * (imageWidth / cols) x (imageHeight / rows) pixels.
 *
 * Cells are numbered left-to-right, top-to-bottom:
 *   0 | 1 | 2
 *   3 | 4 | 5
 *   6 | 7 | 8
 *
 * @param imageBuffer  The full grid image as a Buffer
 * @param rows         Number of rows in the grid
 * @param cols         Number of columns in the grid
 * @returns Array of cell image Buffers in row-major order
 */
export async function splitGridImage(
  imageBuffer: Buffer,
  rows: number,
  cols: number
): Promise<Buffer[]> {
  if (rows < 1 || cols < 1) {
    throw new Error('Rows and cols must be at least 1')
  }

  const image = sharp(imageBuffer)
  const metadata = await image.metadata()

  const imageWidth = metadata.width || 0
  const imageHeight = metadata.height || 0

  if (imageWidth === 0 || imageHeight === 0) {
    throw new Error('Could not determine image dimensions')
  }

  const cellWidth = Math.floor(imageWidth / cols)
  const cellHeight = Math.floor(imageHeight / rows)

  if (cellWidth < 10 || cellHeight < 10) {
    throw new Error(
      `Cell dimensions too small (${cellWidth}x${cellHeight}). ` +
        `Image: ${imageWidth}x${imageHeight}, Grid: ${rows}x${cols}`
    )
  }

  const cells: Buffer[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = col * cellWidth
      const top = row * cellHeight

      const cellBuffer = await sharp(imageBuffer)
        .extract({
          left,
          top,
          width: cellWidth,
          height: cellHeight,
        })
        .png()
        .toBuffer()

      cells.push(cellBuffer)
    }
  }

  return cells
}
