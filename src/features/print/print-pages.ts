/**
 * Drawing the pages.
 *
 * Printing on every platform here works the same way: the OS gives the app a
 * page to draw on and serialises the result itself — `PrintedPdfDocument` on
 * Android, `UIPrintInteractionController` on iOS, `NSPrintOperation` on macOS.
 * None of them wants a PDF *from* the app. What they want is a drawing.
 *
 * So this produces one PNG per page with the renderer the editor already draws
 * with. The memory-managed, yield-between-pages render loop is
 * `@sudobility/printing_rn`'s `renderPagesToPng` (shared, domain-free); this
 * file is the music-specific half it cannot own — it wires in the Skia 2D
 * context (`createSkiaContext2D`) and the score renderer, and computes the
 * plan's per-page band.
 *
 * What goes on which page — and which score, a part written for its instrument
 * or the marked full score — is music_drawing's `printPlan`, the one the web
 * print view uses.
 */
// The whole module (for `createSkiaContext2D`, which wants the enums beside the
// factory — the same shape `ScoreView` passes it) and the `Skia` factory itself
// (which carries `Surface`/`Color` for the render loop).
import * as skia from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import {
  CanvasScoreRenderer,
  PRINT_SCALE,
  PRINT_WIDTH,
} from '@sudobility/music_drawing';
import { createSkiaContext2D } from '@sudobility/music_drawing/skia';
import type { PrintPlan } from '@sudobility/music_drawing';
import { renderPagesToPng } from '@sudobility/printing_rn';
import type { PrintablePage } from '@sudobility/printing_rn';

/** One rendered page, as base64 PNG — which is what the native side wants. */
export type RenderedPage = PrintablePage;

/**
 * Renders the plan's pages one at a time, yielding between them and releasing
 * each page's GPU surface and snapshot as soon as its PNG is taken (see
 * `renderPagesToPng`). `isCancelled` is asked between pages; a cancelled render
 * answers null.
 *
 * A page is drawn by rendering the score with that page's band at the top.
 * `viewport` keeps it cheap: the renderer draws only the systems intersecting
 * it, which is what the scrolling editor does every frame, so printing needs no
 * new renderer path.
 */
export function renderPrintPages(
  plan: PrintPlan,
  isCancelled: () => boolean = () => false,
): Promise<RenderedPage[] | null> {
  const { score, slices, pages, pageHeight, renderOptions } = plan;
  const height = Math.round(pageHeight);
  const renderer = new CanvasScoreRenderer();

  return renderPagesToPng({
    // Drawn far larger than it is displayed: the backing store is print
    // resolution, the reported page size is the layout's.
    skia: Skia,
    pageCount: pages.length,
    pixelWidth: PRINT_WIDTH * PRINT_SCALE,
    pixelHeight: height * PRINT_SCALE,
    pageWidth: PRINT_WIDTH,
    pageHeight: height,
    isCancelled,
    drawPage: (canvas, pageIndex) => {
      const page = pages[pageIndex]!;
      const first = slices[page.systemIndices[0]!]!;
      const last = slices[page.systemIndices[page.systemIndices.length - 1]!]!;
      const ctx = createSkiaContext2D({
        skia,
        canvas,
        width: PRINT_WIDTH,
        height,
      });
      ctx.translate(0, -first.top);
      // The plan's score — the part or the marked full score, lenses applied —
      // never the stored one: slices were measured from it.
      renderer.render(score, ctx, {
        ...renderOptions,
        viewport: { top: first.top, bottom: last.bottom },
      });
    },
  });
}
