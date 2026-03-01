import { z } from 'zod';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  internal: z.object({ message: z.string() }),
};

export const FormatSchema = z.object({
  format_id: z.string(),
  ext: z.string(),
  resolution: z.string().optional(),
  filesize: z.number().optional(),
  url: z.string(),
  vcodec: z.string().optional(),
  acodec: z.string().optional(),
  format_note: z.string().optional(),
});

export const ImageSchema = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  filename: z.string().optional(),
  ext: z.string(),
});

export const TrackItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().optional(),
  album: z.string().optional(),
  thumbnail: z.string().optional(),
  duration: z.number().optional(),
  url: z.string().optional(),
});

export const AudioFormatSchema = z.object({
  format_id: z.string(),  // e.g. "mp3", "m4a", "wav", "flac"
  label: z.string(),       // e.g. "MP3 320kbps"
  ext: z.string(),         // e.g. "mp3"
  quality: z.string(),     // e.g. "320kbps"
});

export const ExtractorResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumbnail: z.string().optional(),
  extractor: z.string().optional(),
  mediaType: z.enum(["video", "image", "gallery", "audio", "playlist"]).default("video"),
  formats: z.array(FormatSchema),
  images: z.array(ImageSchema).optional(),
  audioFormats: z.array(AudioFormatSchema).optional(),
  tracks: z.array(TrackItemSchema).optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  year: z.string().optional(),
  duration: z.number().optional(),
});

export const api = {
  extract: {
    method: 'POST' as const,
    path: '/api/extract' as const,
    input: z.object({ url: z.string().url() }),
    responses: {
      200: ExtractorResponseSchema,
      400: errorSchemas.validation,
      500: errorSchemas.internal,
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type ExtractorResponse = z.infer<typeof ExtractorResponseSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type ImageItem = z.infer<typeof ImageSchema>;
export type TrackItem = z.infer<typeof TrackItemSchema>;
export type AudioFormat = z.infer<typeof AudioFormatSchema>;
export type ExtractInput = z.infer<typeof api.extract.input>;
