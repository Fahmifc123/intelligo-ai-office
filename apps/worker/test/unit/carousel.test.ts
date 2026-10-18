import { DEFAULT_BRAND_GUIDE, DesignReviewPayload } from '@intelligo/shared';
import { describe, expect, it } from 'vitest';
import { placeholderPng } from '../../src/llm/image';
import { buildSlidePrompt, GenerateCarouselInput } from '../../src/tools/generate-carousel';

describe('buildSlidePrompt', () => {
  const slide = {
    headline: 'Mulai 3 November 2026',
    body: 'Investasi Rp 7.500.000',
    visual: 'laptop',
  };

  it('asks for the exact text, the brand guide, and the visual', () => {
    const prompt = buildSlidePrompt(DEFAULT_BRAND_GUIDE, slide, 1, 3);
    expect(prompt).toContain('slide 1 of 3');
    expect(prompt).toContain('Headline: "Mulai 3 November 2026"');
    expect(prompt).toContain('Body: "Investasi Rp 7.500.000"');
    expect(prompt).toContain('#023047');
    expect(prompt).toContain('Visual: laptop');
    expect(prompt).not.toContain('call to action');
  });

  it('highlights the call to action on the last slide', () => {
    expect(buildSlidePrompt(DEFAULT_BRAND_GUIDE, slide, 3, 3)).toContain('call to action');
  });
});

describe('carousel limits', () => {
  const slide = { headline: 'Judul', visual: 'abstract shapes' };
  it('accepts 2 to 10 slides only', () => {
    const input = (n: number) => ({ title: 'Promo', caption: '', slides: Array(n).fill(slide) });
    expect(GenerateCarouselInput.safeParse(input(1)).success).toBe(false);
    expect(GenerateCarouselInput.safeParse(input(2)).success).toBe(true);
    expect(GenerateCarouselInput.safeParse(input(10)).success).toBe(true);
    expect(GenerateCarouselInput.safeParse(input(11)).success).toBe(false);
  });

  it('validates the human review payload', () => {
    const slides = [1, 2].map((position) => ({
      position,
      headline: 'Judul',
      url: `https://x.supabase.co/storage/v1/object/public/posters/${position}.jpg`,
    }));
    expect(DesignReviewPayload.safeParse({ title: 'Promo', slides }).success).toBe(true);
    expect(
      DesignReviewPayload.safeParse({ title: 'Promo', slides: [{ ...slides[0], url: 'x' }] })
        .success,
    ).toBe(false);
  });
});

describe('placeholderPng', () => {
  it('is a valid PNG and differs per slide', () => {
    const a = placeholderPng(1);
    expect(a.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(a.readUInt32BE(16)).toBe(320);
    expect(a.equals(placeholderPng(2))).toBe(false);
  });
});
