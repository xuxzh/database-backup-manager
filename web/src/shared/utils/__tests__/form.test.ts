import { describe, it, expect } from "vitest";
import { stringField, optionalStringField, numberField } from "../form";
import { validatePort, validateRetentionDays, validateRequiredString, validateCronExpression } from "../validators";

describe("form utils", () => {
  describe("stringField", () => {
    it("should trim and return string value", () => {
      const form = new FormData();
      form.set("name", "  test  ");
      expect(stringField(form, "name")).toBe("test");
    });

    it("should return empty string for missing field", () => {
      const form = new FormData();
      expect(stringField(form, "name")).toBe("");
    });
  });

  describe("optionalStringField", () => {
    it("should return undefined for empty string", () => {
      const form = new FormData();
      form.set("name", "   ");
      expect(optionalStringField(form, "name")).toBe(undefined);
    });

    it("should return value for non-empty string", () => {
      const form = new FormData();
      form.set("name", "test");
      expect(optionalStringField(form, "name")).toBe("test");
    });
  });

  describe("numberField", () => {
    it("should return number value", () => {
      const form = new FormData();
      form.set("port", "3306");
      expect(numberField(form, "port")).toBe(3306);
    });
  });
});

describe("validators", () => {
  describe("validatePort", () => {
    it("should accept valid port", () => {
      expect(validatePort(3306).valid).toBe(true);
      expect(validatePort(1).valid).toBe(true);
      expect(validatePort(65535).valid).toBe(true);
    });

    it("should reject port below 1", () => {
      expect(validatePort(0).valid).toBe(false);
    });

    it("should reject port above 65535", () => {
      expect(validatePort(65536).valid).toBe(false);
    });
  });

  describe("validateRetentionDays", () => {
    it("should accept 0 and positive numbers", () => {
      expect(validateRetentionDays(0).valid).toBe(true);
      expect(validateRetentionDays(30).valid).toBe(true);
    });

    it("should reject negative numbers", () => {
      expect(validateRetentionDays(-1).valid).toBe(false);
    });
  });

  describe("validateRequiredString", () => {
    it("should reject empty string", () => {
      expect(validateRequiredString("", "名称").valid).toBe(false);
    });

    it("should reject whitespace only string", () => {
      expect(validateRequiredString("   ", "名称").valid).toBe(false);
    });

    it("should accept non-empty string", () => {
      expect(validateRequiredString("test", "名称").valid).toBe(true);
    });
  });

  describe("validateCronExpression", () => {
    it("should accept valid 5-field cron", () => {
      expect(validateCronExpression("0 0 2 * *").valid).toBe(true);
    });

    it("should accept valid 6-field cron", () => {
      expect(validateCronExpression("0 0 2 * * *").valid).toBe(true);
    });

    it("should reject empty cron", () => {
      expect(validateCronExpression("").valid).toBe(false);
    });

    it("should reject cron with wrong number of fields", () => {
      expect(validateCronExpression("0 0 2 *").valid).toBe(false);
      expect(validateCronExpression("0 0 2 * * * *").valid).toBe(false);
    });
  });
});