import type { TransformFnParams } from "class-transformer";

export function transformStatusBoolean({ value }: TransformFnParams) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}
