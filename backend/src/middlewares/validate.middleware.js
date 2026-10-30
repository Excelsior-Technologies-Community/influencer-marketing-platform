import { ApiError } from '../utils/api-error.js';
export function parseInput(schema, input) {
  const result=schema.safeParse(input);
  if (!result.success) throw new ApiError(422,'Validation failed',result.error.issues.map(issue=>({field:issue.path.join('.'),message:issue.message})));
  return result.data;
}
