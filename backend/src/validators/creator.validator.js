import { z } from 'zod';
const text=maximum=>z.string().trim().max(maximum).transform(value=>value||null).nullable().default(null);
function tags(maximum){return z.array(z.string().trim().min(2).max(60)).max(maximum).refine(values=>new Set(values.map(value=>value.toLowerCase())).size===values.length,'Remove duplicate entries').default([]);}
export const creatorProfileSchema=z.strictObject({bio:text(3000),location:text(160),languages:tags(10),skills:tags(20),categoryIds:z.array(z.number().int().positive().max(2147483647)).max(10).refine(values=>new Set(values).size===values.length,'Remove duplicate categories').default([]),revision:z.number().int().min(0).max(2147483646)});
export const creatorEmptyQuery=z.strictObject({});
export const creatorCategoryQuery=z.strictObject({q:z.string().trim().max(100).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(50)});
