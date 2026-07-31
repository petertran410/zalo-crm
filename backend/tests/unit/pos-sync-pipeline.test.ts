import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeVnMobile, phoneVariants } from '../../src/shared/utils/phone.js';

describe('POS Sync Pipeline & 2-Stage Customer Mapping Unit Tests', () => {
  describe('Phone Normalization Logic', () => {
    it('should correctly normalize Vietnamese 10-digit mobile number starting with 0', () => {
      const result = normalizePhone('0901234567');
      expect(result).toBe('84901234567');
    });

    it('should correctly handle phone with international prefix 84', () => {
      const result = normalizePhone('84901234567');
      expect(result).toBe('84901234567');
    });

    it('should correctly handle phone with E.164 format (+84)', () => {
      const result = normalizePhone('+84901234567');
      expect(result).toBe('84901234567');
    });

    it('should correctly handle phone numbers with spaces, dashes, or dots', () => {
      const result = normalizePhone('090-123.4567');
      expect(result).toBe('84901234567');
    });

    it('should return null for invalid phone numbers', () => {
      expect(normalizePhone('123')).toBeNull();
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
    });

    it('should generate accurate phone variants for matching', () => {
      const variants = phoneVariants('0901234567');
      expect(variants).toContain('84901234567');
      expect(variants).toContain('+84901234567');
      expect(variants).toContain('0901234567');
    });
  });

  describe('Strict VN Mobile Normalization', () => {
    it('should accept valid VN mobile numbers', () => {
      expect(normalizeVnMobile('0987654321')).toBe('84987654321');
      expect(normalizeVnMobile('0351234567')).toBe('84351234567');
    });

    it('should reject landlines or non-mobile prefixes', () => {
      expect(normalizeVnMobile('02838221234')).toBeNull();
    });
  });
});
