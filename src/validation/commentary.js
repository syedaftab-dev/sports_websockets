import { z } from 'zod';

/**
 * Schema for validating query parameters when listing commentary.
 */
export const listCommentaryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * Schema for validating the payload when creating a new commentary entry.
 */
export const createCommentarySchema = z.object({
  minute: z.number().int().nonnegative(),
  sequence: z.string(),
  eventTypes: z.string(),
  actor: z.string(),
  team: z.string(),
  message: z.string().min(1, 'Message is required'),
  metadata: z.record(z.string(),z.any()).optional(),
  tags: z.array(z.string()),
});