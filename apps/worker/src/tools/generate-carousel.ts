import { randomUUID } from 'node:crypto';
import {
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_MIN_SLIDES,
  DEFAULT_BRAND_GUIDE,
  type CarouselSlide,
} from '@intelligo/shared';
import { z } from 'zod';
import { proposeAction } from './propose';
import { defineTool, ToolError, type ToolContext } from './types';

/** Parallel image requests; keeps a 7-slide carousel well inside the task time limit. */
const IMAGE_CONCURRENCY = 3;

export const GenerateCarouselInput = z.object({
  title: z.string().min(3).max(160).describe('Judul carousel, misal "Promo Bootcamp Batch 21"'),
  caption: z.string().max(2200).describe('Caption Instagram dari copywriter'),
  planned_at: z
    .string()
    .max(60)
    .optional()
    .describe('Jadwal tayang yang direncanakan, misal 2026-10-24T19:00:00+07:00'),
  slides: z
    .array(
      z.object({
        headline: z.string().min(1).max(80).describe('Judul slide, persis dari copywriter'),
        body: z.string().max(200).default('').describe('Isi slide, persis dari copywriter'),
        visual: z
          .string()
          .min(3)
          .max(400)
          .describe('Deskripsi visual singkat dalam bahasa Inggris, tanpa teks'),
      }),
    )
    .min(CAROUSEL_MIN_SLIDES)
    .max(CAROUSEL_MAX_SLIDES),
});
type Input = z.infer<typeof GenerateCarouselInput>;

/** One image prompt per slide: brand guide, the exact text to render, and the visual. */
export function buildSlidePrompt(
  brandGuide: string,
  slide: Input['slides'][number],
  position: number,
  total: number,
): string {
  return [
    `Instagram carousel slide ${position} of ${total}, square 1:1.`,
    'Brand guide:',
    brandGuide,
    '',
    'Render exactly this Indonesian text, spelled exactly as written, and no other text:',
    `Headline: "${slide.headline}"`,
    ...(slide.body ? [`Body: "${slide.body}"`] : []),
    '',
    `Visual: ${slide.visual}`,
    position === total ? 'This is the last slide: make the call to action stand out.' : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function brandGuideFor(ctx: ToolContext): Promise<string> {
  const result = await ctx.db.query<{ brand_guide: string }>(
    'select brand_guide from public.settings where org_id = $1',
    [ctx.orgId],
  );
  return result.rows[0]?.brand_guide.trim() || DEFAULT_BRAND_GUIDE;
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index] as T;
      out[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Designer-only (Fase 9): generates every slide with the image model, stores them in Supabase
 * Storage, and queues the carousel for human review. Nothing is posted anywhere.
 */
export const generateCarousel = defineTool({
  name: 'generate_carousel',
  description:
    'Desain slide carousel Instagram (2 sampai 10 slide) dengan model gambar sesuai brand Intelligo. Hasilnya masuk antrean review manusia, tidak diposting.',
  inputSchema: GenerateCarouselInput,
  statusText: (input) => `Mendesain ${input.slides.length} slide carousel`,
  requiresApproval: true,
  async execute(input, ctx) {
    const brandGuide = await brandGuideFor(ctx);
    const version = ctx.task.revision_count;
    const total = input.slides.length;
    let slides: CarouselSlide[];
    try {
      slides = await mapLimited(input.slides, IMAGE_CONCURRENCY, async (slide, index) => {
        const position = index + 1;
        const prompt = buildSlidePrompt(brandGuide, slide, position, total);
        const image = await ctx.images.generate({ prompt, seed: position });
        const ext = image.contentType === 'image/png' ? 'png' : 'jpg';
        const path = `${ctx.orgId}/${ctx.task.id}/v${version}-${position}-${randomUUID().slice(0, 8)}.${ext}`;
        const url = await ctx.media.upload(path, image.bytes, image.contentType);
        await ctx.db.query(
          `insert into public.media_assets
             (org_id, task_id, agent_id, version, position, headline, body, prompt, storage_path, url, content_type)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            ctx.orgId,
            ctx.task.id,
            ctx.agent.id,
            version,
            position,
            slide.headline,
            slide.body,
            prompt,
            path,
            url,
            image.contentType,
          ],
        );
        await ctx.db.query(
          `insert into public.llm_usage (org_id, agent_id, task_id, purpose, model, input_tokens, output_tokens, cost_usd)
           values ($1, $2, $3, 'image', $4, 0, 0, $5)`,
          [
            ctx.orgId,
            ctx.agent.id,
            ctx.task.id,
            image.model,
            ctx.images.mode === 'scripted' ? 0 : ctx.env.IMAGE_COST_USD,
          ],
        );
        return { position, headline: slide.headline, body: slide.body, url };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.log.warn({ taskId: ctx.task.id, err: message }, 'desain carousel gagal');
      throw new ToolError(`Gambar gagal dibuat: ${message}`);
    }

    // A revision replaces the earlier proposal: only the latest carousel waits for review.
    await ctx.db.query(
      `delete from public.actions where task_id = $1 and kind = 'design_review' and status = 'proposed'`,
      [ctx.task.id],
    );
    const proposal = await proposeAction(ctx, 'design_review', {
      title: input.title,
      caption: input.caption,
      ...(input.planned_at ? { planned_at: input.planned_at } : {}),
      slides,
    });
    return {
      content: {
        slides: slides.map((s) => ({ position: s.position, headline: s.headline, url: s.url })),
        review: 'Carousel menunggu review manusia di halaman Approval. Tidak ada yang diposting.',
        action: proposal.content,
      },
      summary: `${total} slide carousel dibuat, menunggu review`,
    };
  },
});
