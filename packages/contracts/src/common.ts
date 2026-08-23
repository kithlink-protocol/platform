import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const cursorPageSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type CursorPage = z.infer<typeof cursorPageSchema>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});
export type Problem = z.infer<typeof problemSchema>;
