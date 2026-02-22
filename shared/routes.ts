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

export const ExtractorResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumbnail: z.string().optional(),
  extractor: z.string().optional(),
  formats: z.array(FormatSchema),
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
export type ExtractInput = z.infer<typeof api.extract.input>;