/**Jobs utility tests focused on achieving 95% branch coverage.*/

import {
  normalizeRequiredTrade,
  isMissingJobId,
  isValidJobUuid,
  parseNumeric,
  normalizeJobStatus,
  computePulseMetrics,
  formatJobDate,
  type JobListItem,
  type JobLineItem,
} from '../jobs';

describe('Jobs Branch Coverage Tests', () => {
  describe('normalizeRequiredTrade', () => {
    it('should normalize PLUMBING', () => {
      expect(normalizeRequiredTrade('plumbing')).toBe('PLUMBING');
      expect(normalizeRequiredTrade('PLUMBING')).toBe('PLUMBING');
      expect(normalizeRequiredTrade('  plumbing  ')).toBe('PLUMBING');
    });

    it('should normalize ANY', () => {
      expect(normalizeRequiredTrade('any')).toBe('ANY');
      expect(normalizeRequiredTrade('ANY')).toBe('ANY');
      expect(normalizeRequiredTrade('  any  ')).toBe('ANY');
    });

    it('should default to ELECTRICAL for other values', () => {
      expect(normalizeRequiredTrade('electrical')).toBe('ELECTRICAL');
      expect(normalizeRequiredTrade('ELECTRICAL')).toBe('ELECTRICAL');
      expect(normalizeRequiredTrade('  electrical  ')).toBe('ELECTRICAL');
      expect(normalizeRequiredTrade('OTHER')).toBe('ELECTRICAL');
      expect(normalizeRequiredTrade('')).toBe('ELECTRICAL');
      expect(normalizeRequiredTrade(null)).toBe('ELECTRICAL');
      expect(normalizeRequiredTrade(undefined)).toBe('ELECTRICAL');
    });
  });

  describe('isMissingJobId', () => {
    it('should return true for non-string values', () => {
      expect(isMissingJobId(null)).toBe(true);
      expect(isMissingJobId(undefined)).toBe(true);
      expect(isMissingJobId(123)).toBe(true);
      expect(isMissingJobId({})).toBe(true);
      expect(isMissingJobId([])).toBe(true);
    });

    it('should return true for empty string', () => {
      expect(isMissingJobId('')).toBe(true);
      expect(isMissingJobId('   ')).toBe(true);
    });

    it('should return true for undefined/null strings', () => {
      expect(isMissingJobId('undefined')).toBe(true);
      expect(isMissingJobId('null')).toBe(true);
      expect(isMissingJobId('UNDEFINED')).toBe(true);
      expect(isMissingJobId('NULL')).toBe(true);
      expect(isMissingJobId('  undefined  ')).toBe(true);
      expect(isMissingJobId('  NULL  ')).toBe(true);
    });

    it('should return false for valid job IDs', () => {
      expect(isMissingJobId('job-123')).toBe(false);
      expect(isMissingJobId('abc')).toBe(false);
      expect(isMissingJobId('123')).toBe(false);
    });
  });

  describe('isValidJobUuid', () => {
    it('should return false for missing job IDs', () => {
      expect(isValidJobUuid('')).toBe(false);
      expect(isValidJobUuid('undefined')).toBe(false);
      expect(isValidJobUuid('null')).toBe(false);
      expect(isValidJobUuid(null)).toBe(false);
      expect(isValidJobUuid(undefined)).toBe(false);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isValidJobUuid('invalid-uuid')).toBe(false);
      expect(isValidJobUuid('123-456-789')).toBe(false);
      expect(isValidJobUuid('not-a-uuid')).toBe(false);
      expect(isValidJobUuid('123e4567-e89b-12d3-a456-42661417400')).toBe(false); // Too short
    });

    it('should return true for valid UUIDs', () => {
      expect(isValidJobUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidJobUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidJobUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });
  });

  describe('parseNumeric', () => {
    it('should return valid numbers as-is', () => {
      expect(parseNumeric(123)).toBe(123);
      expect(parseNumeric(0)).toBe(0);
      expect(parseNumeric(-45)).toBe(-45);
      expect(parseNumeric(123.45)).toBe(123.45);
    });

    it('should return 0 for invalid numbers', () => {
      expect(parseNumeric(Number.NaN)).toBe(0);
      expect(parseNumeric(Number.POSITIVE_INFINITY)).toBe(0);
      expect(parseNumeric(Number.NEGATIVE_INFINITY)).toBe(0);
    });

    it('should parse numeric strings', () => {
      expect(parseNumeric('123')).toBe(123);
      expect(parseNumeric('45.67')).toBe(45.67);
      expect(parseNumeric('-123')).toBe(-123);
      expect(parseNumeric('  123  ')).toBe(123);
    });

    it('should handle currency and formatted numbers', () => {
      expect(parseNumeric('$123.45')).toBe(123.45);
      expect(parseNumeric('1,234.56')).toBe(1234.56);
      expect(parseNumeric('NZ$ 123.45')).toBe(123.45);
      expect(parseNumeric('123.45 USD')).toBe(123.45);
    });

    it('should return 0 for non-numeric strings', () => {
      expect(parseNumeric('abc')).toBe(0);
      expect(parseNumeric('')).toBe(0);
      expect(parseNumeric('not a number')).toBe(0);
      expect(parseNumeric('12abc34')).toBe(1234); // Numbers extracted from mixed string
    });

    it('should handle edge cases', () => {
      expect(parseNumeric(null)).toBe(0);
      expect(parseNumeric(undefined)).toBe(0);
      expect(parseNumeric({})).toBe(0);
      expect(parseNumeric([])).toBe(0);
    });
  });

  describe('normalizeJobStatus', () => {
    it('should normalize known statuses', () => {
      expect(normalizeJobStatus('draft')).toBe('DRAFT');
      expect(normalizeJobStatus('DRAFT')).toBe('DRAFT');
      expect(normalizeJobStatus('syncing')).toBe('SYNCING');
      expect(normalizeJobStatus('SYNCING')).toBe('SYNCING'); // Actual behavior
      expect(normalizeJobStatus('done')).toBe('DONE');
      expect(normalizeJobStatus('DONE')).toBe('DONE');
    });

    it('should return uppercase for unknown statuses', () => {
      expect(normalizeJobStatus('unknown')).toBe('UNKNOWN');
      expect(normalizeJobStatus('custom')).toBe('CUSTOM');
      expect(normalizeJobStatus('Mixed')).toBe('MIXED');
    });
  });

  describe('computePulseMetrics', () => {
    it('should compute metrics for empty job list', () => {
      const result = computePulseMetrics([]);
      expect(result).toEqual({
        pendingJobs: 0,
        totalBillableHours: 0,
        materialSpend: 0,
      });
    });

    it('should count pending jobs correctly', () => {
      const jobs: JobListItem[] = [
        { id: '1', status: 'DRAFT', client_name: 'Client 1', created_at: '2023-01-01' },
        { id: '2', status: 'SYNCING', client_name: 'Client 2', created_at: '2023-01-01' },
        { id: '3', status: 'DONE', client_name: 'Client 3', created_at: '2023-01-01' },
        { id: '4', status: 'UNKNOWN', client_name: 'Client 4', created_at: '2023-01-01' },
      ];

      const result = computePulseMetrics(jobs);
      expect(result.pendingJobs).toBe(3); // DRAFT, SYNCING, UNKNOWN
    });

    it('should compute labor hours correctly', () => {
      const jobs: JobListItem[] = [
        {
          id: '1',
          status: 'DONE',
          client_name: 'Client 1',
          created_at: '2023-01-01',
          extracted_data: {
            line_items: [
              { type: 'LABOR', qty: 2.5 },
              { type: 'LABOR', qty: 1.5 },
            ],
          },
        },
      ];

      const result = computePulseMetrics(jobs);
      expect(result.totalBillableHours).toBe(4);
    });

    it('should compute material spend from line_total', () => {
      const jobs: JobListItem[] = [
        {
          id: '1',
          status: 'DONE',
          client_name: 'Client 1',
          created_at: '2023-01-01',
          extracted_data: {
            line_items: [
              { type: 'MATERIAL', line_total: 150.50 },
              { type: 'MATERIAL', line_total: 75.25 },
            ],
          },
        },
      ];

      const result = computePulseMetrics(jobs);
      expect(result.materialSpend).toBe(225.75);
    });

    it('should compute material spend from unit_price * qty', () => {
      const jobs: JobListItem[] = [
        {
          id: '1',
          status: 'DONE',
          client_name: 'Client 1',
          created_at: '2023-01-01',
          extracted_data: {
            line_items: [
              { type: 'MATERIAL', unit_price: 25.00, qty: 3 },
              { type: 'MATERIAL', unit_price: 15.50, qty: 2 },
            ],
          },
        },
      ];

      const result = computePulseMetrics(jobs);
      expect(result.materialSpend).toBe(106); // (25 * 3) + (15.5 * 2)
    });

    it('should handle mixed line items', () => {
      const jobs: JobListItem[] = [
        {
          id: '1',
          status: 'DONE',
          client_name: 'Client 1',
          created_at: '2023-01-01',
          extracted_data: {
            line_items: [
              { type: 'LABOR', qty: 2 },
              { type: 'MATERIAL', line_total: 100 },
              { type: 'MATERIAL', unit_price: 20, qty: 3 },
              { type: 'OTHER', qty: 5 }, // Should be ignored
            ],
          },
        },
      ];

      const result = computePulseMetrics(jobs);
      expect(result.totalBillableHours).toBe(2);
      expect(result.materialSpend).toBe(160); // 100 + (20 * 3)
    });

    it('should handle missing line_items', () => {
      const jobs: JobListItem[] = [
        {
          id: '1',
          status: 'DONE',
          client_name: 'Client 1',
          created_at: '2023-01-01',
          extracted_data: {},
        },
        {
          id: '2',
          status: 'DRAFT',
          client_name: 'Client 2',
          created_at: '2023-01-01',
        },
      ];

      const result = computePulseMetrics(jobs);
      expect(result).toEqual({
        pendingJobs: 1,
        totalBillableHours: 0,
        materialSpend: 0,
      });
    });
  });

  describe('formatJobDate', () => {
    it('should format valid dates correctly', () => {
      const result1 = formatJobDate('2023-01-01T10:30:00Z');
      const result2 = formatJobDate('2023-01-02T14:45:00Z');
      const result3 = formatJobDate('2023-01-03T09:15:00Z');
      const result4 = formatJobDate('2023-01-04T16:20:00Z');
      
      // Check that they follow the expected pattern: Weekday Month DaySuf, Time am/pm
      expect(result1).toMatch(/\w{3} \w{3} \d{1,2}(st|nd|rd|th), \d{1,2}:\d{2} [ap]m/);
      expect(result2).toMatch(/\w{3} \w{3} \d{1,2}(st|nd|rd|th), \d{1,2}:\d{2} [ap]m/);
      expect(result3).toMatch(/\w{3} \w{3} \d{1,2}(st|nd|rd|th), \d{1,2}:\d{2} [ap]m/);
      expect(result4).toMatch(/\w{3} \w{3} \d{1,2}(st|nd|rd|th), \d{1,2}:\d{2} [ap]m/);
    });

    it('should handle special date suffixes', () => {
      // Test 11th, 12th, 13th (should use 'th')
      const result11 = formatJobDate('2023-01-11T10:00:00Z');
      const result12 = formatJobDate('2023-01-12T10:00:00Z');
      const result13 = formatJobDate('2023-01-13T10:00:00Z');
      
      expect(result11).toMatch(/\w{3} \w{3} 11th, \d{1,2}:\d{2} [ap]m/);
      expect(result12).toMatch(/\w{3} \w{3} 12th, \d{1,2}:\d{2} [ap]m/);
      expect(result13).toMatch(/\w{3} \w{3} 13th, \d{1,2}:\d{2} [ap]m/);
      
      // Test 21st, 22nd, 23rd (should use 'st', 'nd', 'rd')
      const result21 = formatJobDate('2023-01-21T10:00:00Z');
      const result22 = formatJobDate('2023-01-22T10:00:00Z');
      const result23 = formatJobDate('2023-01-23T10:00:00Z');
      
      expect(result21).toMatch(/\w{3} \w{3} 21st, \d{1,2}:\d{2} [ap]m/);
      expect(result22).toMatch(/\w{3} \w{3} 22nd, \d{1,2}:\d{2} [ap]m/);
      expect(result23).toMatch(/\w{3} \w{3} 23rd, \d{1,2}:\d{2} [ap]m/);
    });

    it('should handle invalid dates', () => {
      expect(formatJobDate('invalid-date')).toBe('Unknown date');
      expect(formatJobDate('not-a-date')).toBe('Unknown date');
      expect(formatJobDate('')).toBe('Unknown date');
    });
  });
});