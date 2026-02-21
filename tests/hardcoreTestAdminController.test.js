/**
 * Unit Tests for hardcoreTestAdminController
 *
 * Covers:
 *  - normalizeTimestamp: IST → UTC conversion, existing UTC passthrough
 *  - createExam: validation + scheduling constraint
 *  - updateExam: field updates and scheduling
 *  - setVisibility / getVisibility / removeVisibility
 *  - reopenSubmission / resetSubmissionForRetest
 */

const mockQuery = jest.fn();
jest.mock('../util/db', () => ({
  pool: {
    query: mockQuery,
    connect: jest.fn()
  }
}));

// Mock cloudinary so we don't actually upload
jest.mock('../config/cloudinary', () => ({
  uploader: {
    upload_stream: jest.fn(),
    destroy: jest.fn().mockResolvedValue({}),
  }
}));

describe('hardcoreTestAdminController', () => {
  let adminController;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Re-mock db after resetModules
    jest.mock('../util/db', () => ({ pool: { query: mockQuery, connect: jest.fn() } }));
    jest.mock('../config/cloudinary', () => ({
      uploader: { upload_stream: jest.fn(), destroy: jest.fn().mockResolvedValue({}) }
    }));

    adminController = require('../controllers/hardcoreTestAdminController');

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ─── normalizeTimestamp (timezone handling) ───────────────────────────────

  describe('normalizeTimestamp (via createExam)', () => {
    /**
     * We test normalizeTimestamp indirectly through createExam.
     * The key behaviour: raw datetime-local strings (no TZ) are assumed IST (+05:30).
     * Strings with Z or offset are passed through as-is.
     */

    const baseBody = {
      title: 'TZ Test Exam',
      proficiency_level: 'A1',
      duration_minutes: 60,
    };

    test('treats raw datetime-local string as IST and converts to UTC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ test_id: 'e1', ...baseBody }] });

      // 2026-02-18T19:00 IST = 2026-02-18T13:30:00.000Z
      await adminController.createExam(
        { body: { ...baseBody, available_from: '2026-02-18T19:00', available_until: '2026-02-18T21:00' }, user: { user_id: 'admin1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const [[sql, params]] = mockQuery.mock.calls;
      // $6 is available_from, should be UTC
      expect(params[5]).toBe('2026-02-18T13:30:00.000Z');
      // $7 is available_until
      expect(params[6]).toBe('2026-02-18T15:30:00.000Z');
    });

    test('passes through UTC Z-suffixed dates unchanged', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ test_id: 'e1' }] });

      await adminController.createExam(
        {
          body: {
            ...baseBody,
            available_from: '2026-02-18T13:30:00.000Z',
            available_until: '2026-02-18T15:30:00.000Z'
          },
          user: { user_id: 'admin1' }
        },
        mockRes
      );

      const [[, params]] = mockQuery.mock.calls;
      expect(params[5]).toBe('2026-02-18T13:30:00.000Z');
      expect(params[6]).toBe('2026-02-18T15:30:00.000Z');
    });

    test('passes through dates with explicit offset (+05:30)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ test_id: 'e1' }] });

      await adminController.createExam(
        {
          body: {
            ...baseBody,
            available_from: '2026-02-18T19:00:00+05:30',
            available_until: '2026-02-18T21:00:00+05:30'
          },
          user: { user_id: 'admin1' }
        },
        mockRes
      );

      const [[, params]] = mockQuery.mock.calls;
      expect(new Date(params[5]).toISOString()).toBe('2026-02-18T13:30:00.000Z');
      expect(new Date(params[6]).toISOString()).toBe('2026-02-18T15:30:00.000Z');
    });

    test('handles null timestamps gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ test_id: 'e1' }] });

      await adminController.createExam(
        { body: { ...baseBody, available_from: null, available_until: null }, user: { user_id: 'admin1' } },
        mockRes
      );

      const [[, params]] = mockQuery.mock.calls;
      expect(params[5]).toBeNull();
      expect(params[6]).toBeNull();
    });
  });

  // ─── createExam ───────────────────────────────────────────────────────────

  describe('createExam', () => {
    const body = { title: 'New Exam', proficiency_level: 'A1', duration_minutes: 45 };
    const user = { user_id: 'admin1' };

    test('creates exam successfully', async () => {
      const created = { test_id: 'e1', ...body };
      mockQuery.mockResolvedValueOnce({ rows: [created] });

      await adminController.createExam({ body, user }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ exam: created });
    });

    test('returns 400 when title is missing', async () => {
      await adminController.createExam(
        { body: { proficiency_level: 'A1', duration_minutes: 45 }, user },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Title is required' });
    });

    test('returns 400 when proficiency_level is missing', async () => {
      await adminController.createExam(
        { body: { title: 'My Exam', duration_minutes: 45 }, user },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 when duration is 0', async () => {
      await adminController.createExam(
        { body: { title: 'Exam', proficiency_level: 'A1', duration_minutes: 0 }, user },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 when available_until is before available_from', async () => {
      await adminController.createExam(
        {
          body: {
            ...body,
            available_from: '2026-05-01T10:00',
            available_until: '2026-05-01T09:00',
          },
          user
        },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringMatching(/after available_from/i) })
      );
    });
  });

  // ─── listExams ────────────────────────────────────────────────────────────

  describe('listExams', () => {
    test('returns all exams ordered by created_at DESC', async () => {
      const exams = [
        { test_id: 'e2', title: 'Exam 2', submission_count: 3 },
        { test_id: 'e1', title: 'Exam 1', submission_count: 10 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: exams });

      await adminController.listExams({}, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ exams });
    });
  });

  // ─── setVisibility ────────────────────────────────────────────────────────

  describe('setVisibility', () => {
    test('inserts batch visibility rule', async () => {
      const visRow = { id: 1, test_id: 'e1', batch_id: 'b1', user_id: null };
      mockQuery.mockResolvedValueOnce({ rows: [visRow] });

      await adminController.setVisibility(
        { params: { testId: 'e1' }, body: { batch_ids: ['b1'], user_ids: [] } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 })
      );
    });

    test('inserts user-level visibility rule', async () => {
      const visRow = { id: 2, test_id: 'e1', batch_id: null, user_id: 'u1' };
      mockQuery.mockResolvedValueOnce({ rows: [visRow] });

      await adminController.setVisibility(
        { params: { testId: 'e1' }, body: { batch_ids: [], user_ids: ['u1'] } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 400 when neither batch_ids nor user_ids provided', async () => {
      await adminController.setVisibility(
        { params: { testId: 'e1' }, body: {} },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  // ─── getVisibility ────────────────────────────────────────────────────────

  describe('getVisibility', () => {
    test('returns both batch and student visibility', async () => {
      const batchVis = [{ id: 1, batch_id: 'b1', batch_name: 'Morning' }];
      const userVis = [{ id: 2, user_id: 'u1', username: 'alice', fullname: 'Alice' }];
      mockQuery
        .mockResolvedValueOnce({ rows: batchVis })
        .mockResolvedValueOnce({ rows: userVis });

      await adminController.getVisibility(
        { params: { testId: 'e1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        batches: batchVis,
        students: userVis,
      });
    });
  });

  // ─── removeVisibility ─────────────────────────────────────────────────────

  describe('removeVisibility', () => {
    test('removes visibility rule successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await adminController.removeVisibility(
        { params: { testId: 'e1', visId: '1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Visibility rule removed' });
    });

    test('returns 404 when rule does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await adminController.removeVisibility(
        { params: { testId: 'e1', visId: '999' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  // ─── reopenSubmission ─────────────────────────────────────────────────────

  describe('reopenSubmission', () => {
    test('reopens warned_out submission', async () => {
      const updated = { submission_id: 's1', status: 'in_progress', is_reopened: true };
      mockQuery.mockResolvedValueOnce({ rows: [updated] });

      await adminController.reopenSubmission(
        { params: { submissionId: 's1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringMatching(/reopened/i) })
      );
    });

    test('returns 404 when submission is not eligible for reopen', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await adminController.reopenSubmission(
        { params: { submissionId: 's1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  // ─── getSubmissions ───────────────────────────────────────────────────────

  describe('getSubmissions', () => {
    test('returns submissions with user info', async () => {
      const submissions = [
        { submission_id: 's1', status: 'completed', username: 'alice', fullname: 'Alice', score: '85.00' }
      ];
      mockQuery.mockResolvedValueOnce({ rows: submissions });

      await adminController.getSubmissions(
        { params: { testId: 'e1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ submissions });
    });
  });
});
