import { CanvasScoreRenderer, PRINT_WIDTH } from '@sudobility/music_drawing';
import type { PrintPlan } from '@sudobility/music_drawing';
import { SvgDrawingContext } from '@sudobility/music_ui_rn';

/** A page rendered as portable SVG for the Windows print bridge. */
export type RenderedWindowsPage = {
  svg: string;
  width: number;
  height: number;
};

/**
 * Render the shared print plan without Skia. The SVG is intentionally kept as
 * vector data until WebView2's print pipeline rasterises it for the selected
 * printer/PDF driver.
 */
export function renderPrintPages(plan: PrintPlan): RenderedWindowsPage[] {
  const { score, slices, pages, pageHeight, renderOptions } = plan;
  const height = Math.round(pageHeight);
  const renderer = new CanvasScoreRenderer();

  return pages.map(page => {
    const first = slices[page.systemIndices[0]!]!;
    const last = slices[page.systemIndices[page.systemIndices.length - 1]!]!;
    const context = new SvgDrawingContext(PRINT_WIDTH, height);
    context.translate(0, -first.top);
    renderer.render(score, context, {
      ...renderOptions,
      viewport: { top: first.top, bottom: last.bottom },
    });
    return { svg: context.toSvg(), width: PRINT_WIDTH, height };
  });
}
