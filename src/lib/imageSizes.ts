// Curated "optimized" output sizes for hero/in-body images -- these are the actual delivered
// dimensions after sharp's cover-crop, independent of whatever raw size the AI provider generated
// (gpt-image-1/DALL-E/Gemini each have their own fixed input sizes; sharp crops any of them down
// to whichever of these the admin picks). Kept to a short, genuinely useful list rather than
// letting the admin type arbitrary pixels -- every option here is a real, common web/social size.

export interface ImageSizeOption {
  value: string;
  label: string;
  width: number;
  height: number;
}

export const IMAGE_SIZES: ImageSizeOption[] = [
  { value: '1200x675', label: '16:9 Standard (1200×675)', width: 1200, height: 675 },
  { value: '1600x900', label: '16:9 Large (1600×900)', width: 1600, height: 900 },
  { value: '800x450', label: '16:9 Compact / fast-loading (800×450)', width: 800, height: 450 },
  { value: '1200x630', label: 'Social share / OG (1200×630)', width: 1200, height: 630 },
  { value: '1080x1080', label: 'Square (1080×1080)', width: 1080, height: 1080 },
];

export const DEFAULT_IMAGE_SIZE = '1200x675';

export function parseImageSize(value?: string | null): ImageSizeOption {
  return IMAGE_SIZES.find((s) => s.value === value) ?? IMAGE_SIZES[0];
}
