import { z } from 'zod';

export const analyticsEventSchema=z.strictObject({
  eventId:z.uuid(),
  sessionId:z.uuid(),
  screen:z.string().min(1).max(255).regex(/^\/[A-Za-z0-9/_:-]*$/),
  durationMs:z.number().int().min(0).max(1800000)
});
