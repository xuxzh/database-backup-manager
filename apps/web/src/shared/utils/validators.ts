export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validatePort(value: number): ValidationResult {
  if (value < 1 || value > 65535) {
    return { valid: false, message: "端口必须在 1 到 65535 之间" };
  }
  return { valid: true };
}

export function validateRetentionDays(value: number): ValidationResult {
  if (value < 0) {
    return { valid: false, message: "保留天数不能小于 0" };
  }
  return { valid: true };
}

export function validateRequiredString(value: string, fieldName: string): ValidationResult {
  if (!value.trim()) {
    return { valid: false, message: `${fieldName}不能为空` };
  }
  return { valid: true };
}

export function validateCronExpression(value: string): ValidationResult {
  if (!value.trim()) {
    return { valid: false, message: "Cron 表达式不能为空" };
  }
  const parts = value.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return {
      valid: false,
      message: "Cron 表达式格式不正确，示例：0 0 2 * * *",
    };
  }
  return { valid: true };
}