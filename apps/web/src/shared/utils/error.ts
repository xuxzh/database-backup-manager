export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "操作失败";
}