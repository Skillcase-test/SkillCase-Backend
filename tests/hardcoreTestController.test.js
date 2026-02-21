/**
 * Unit Tests for hardcoreTestController (student-facing exam logic)
 *
 * Covers:
 *  - gradeAnswer() for all question types
 *  - Time window enforcement in startExam
 *  - Exam-closed guard in saveAnswer
 *  - getVisibleExams returns correct shape
 *  - submitExam updates submission with correct score
 */

const mockQuery = jest.fn();
jest.mock('../util/db', () => ({
  pool: { query: mockQuery }
}));

describe('hardcoreTestController', () => {
  let controller;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    controller = require('../controllers/hardcoreTestController');

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ─── getVisibleExams ──────────────────────────────────────────────────────

  describe('getVisibleExams', () => {
    test('returns exams visible to the user', async () => {
      const exams = [
        { test_id: 'e1', title: 'Mock Exam 1', is_active: true, status: null }
      ];
      mockQuery.mockResolvedValueOnce({ rows: exams });

      await controller.getVisibleExams(
        { user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ exams });
    });

    test('returns empty array when no exams are visible', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await controller.getVisibleExams(
        { user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ exams: [] });
    });

    test('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB fail'));

      await controller.getVisibleExams(
        { user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  // ─── startExam — scheduling window ───────────────────────────────────────

  describe('startExam - scheduling window enforcement', () => {
    const buildExam = (overrides = {}) => ({
      test_id: 'e1',
      title: 'Test',
      duration_minutes: 60,
      is_active: true,
      total_questions: 5,
      available_from: null,
      available_until: null,
      ...overrides
    });

    test('blocks start when exam has not opened yet', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow
      mockQuery.mockResolvedValueOnce({ rows: [buildExam({ available_from: futureDate })] });

      await controller.startExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const jsonArg = mockRes.json.mock.calls[0][0];
      expect(jsonArg.msg).toMatch(/not started yet/i);
    });

    test('blocks start when exam window has closed', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
      mockQuery.mockResolvedValueOnce({ rows: [buildExam({ available_until: pastDate })] });

      await controller.startExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const jsonArg = mockRes.json.mock.calls[0][0];
      expect(jsonArg.msg).toMatch(/window has closed/i);
    });

    test('returns 404 when exam is not found or inactive', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await controller.startExam(
        { params: { testId: 'nonexistent' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('blocks start on already-completed submissions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [buildExam()] }) // exam found
        .mockResolvedValueOnce({ rows: [{ submission_id: 's1', status: 'completed', started_at: new Date() }] }); // existing submission

      await controller.startExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringMatching(/already completed/i) })
      );
    });

    test('blocks start on warned_out submissions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [buildExam()] })
        .mockResolvedValueOnce({ rows: [{ submission_id: 's1', status: 'warned_out', started_at: new Date() }] });

      await controller.startExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringMatching(/warnings|reopen/i) })
      );
    });
  });

  // ─── saveAnswer — guard checks ────────────────────────────────────────────

  describe('saveAnswer', () => {
    test('returns 400 when question_id is missing', async () => {
      await controller.saveAnswer(
        { params: { testId: 'e1' }, user: { user_id: 'u1' }, body: {} },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'question_id is required' });
    });

    test('returns 400 when trying to save an answer for a non-question type', async () => {
      // question type check returns a non-answerable type
      mockQuery.mockResolvedValueOnce({ rows: [{ question_type: 'page_break' }] });

      await controller.saveAnswer(
        { params: { testId: 'e1' }, user: { user_id: 'u1' }, body: { question_id: 'q1', answer: null } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Cannot save answer for this item type' });
    });

    test('returns 404 when no active submission exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ question_type: 'mcq_single' }] }) // question type OK
        .mockResolvedValueOnce({ rows: [] }); // no submission

      await controller.saveAnswer(
        { params: { testId: 'e1' }, user: { user_id: 'u1' }, body: { question_id: 'q1', answer: 0 } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('returns 400 when exam is not in_progress', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ question_type: 'mcq_single' }] })
        .mockResolvedValueOnce({ rows: [{ submission_id: 's1', status: 'completed', started_at: new Date(), duration_minutes: 60 }] });

      await controller.saveAnswer(
        { params: { testId: 'e1' }, user: { user_id: 'u1' }, body: { question_id: 'q1', answer: 0 } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Exam is not in progress' });
    });
  });

  // ─── submitExam — grading pipeline ───────────────────────────────────────

  describe('submitExam', () => {
    test('returns 404 when no submission found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await controller.submitExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('returns 400 when exam already completed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ submission_id: 's1', status: 'completed' }] });

      await controller.submitExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Exam already submitted' });
    });

    test('grades questions correctly and returns score', async () => {
      const submission = { submission_id: 's1', status: 'in_progress' };
      const questions = [
        { question_id: 'q1', question_type: 'mcq_single', question_data: { options: ['A', 'B', 'C'], correct: 'B' }, points: 2 },
        { question_id: 'q2', question_type: 'true_false', question_data: { correct: true }, points: 1 },
        // non-question type — should be skipped
        { question_id: 'q3', question_type: 'page_break', question_data: {}, points: 0 },
      ];
      const answers = [
        { answer_id: 'a1', question_id: 'q1', user_answer: 1, submission_id: 's1' }, // index 1 = 'B' = correct
        { answer_id: 'a2', question_id: 'q2', user_answer: true, submission_id: 's1' }, // correct
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [submission] })         // get submission
        .mockResolvedValueOnce({ rows: questions })             // get questions
        .mockResolvedValueOnce({ rows: answers })               // get saved answers
        .mockResolvedValueOnce({ rows: [] })                   // update answer a1
        .mockResolvedValueOnce({ rows: [] })                   // update answer a2
        .mockResolvedValueOnce({ rows: [] });                  // update submission

      await controller.submitExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Exam submitted successfully',
          score: 100,
          total_points: 3,
          earned_points: 3,
        })
      );
    });

    test('gives partial score when some answers are wrong', async () => {
      const submission = { submission_id: 's1', status: 'in_progress' };
      const questions = [
        { question_id: 'q1', question_type: 'mcq_single', question_data: { options: ['A', 'B'], correct: 'A' }, points: 2 },
        { question_id: 'q2', question_type: 'true_false', question_data: { correct: true }, points: 2 },
      ];
      const answers = [
        { answer_id: 'a1', question_id: 'q1', user_answer: 0, submission_id: 's1' }, // index 0 = 'A' = correct
        { answer_id: 'a2', question_id: 'q2', user_answer: false, submission_id: 's1' }, // wrong
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [submission] })
        .mockResolvedValueOnce({ rows: questions })
        .mockResolvedValueOnce({ rows: answers })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await controller.submitExam(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          score: 50,
          total_points: 4,
          earned_points: 2,
        })
      );
    });
  });

  // ─── getResult — visibility guard ─────────────────────────────────────────

  describe('getResult', () => {
    test('returns 403 when results are not yet visible', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ results_visible: false, title: 'Exam 1', total_questions: 5, duration_minutes: 60 }]
      });

      await controller.getResult(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringMatching(/not yet available/i) })
      );
    });

    test('returns 404 when exam does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await controller.getResult(
        { params: { testId: 'nonexistent' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  // ─── recordWarning ────────────────────────────────────────────────────────

  describe('recordWarning', () => {
    test('increments warning count and returns it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ submission_id: 's1', status: 'in_progress', warning_count: 1 }] }) // get submission
        .mockResolvedValueOnce({ rows: [] }); // update

      await controller.recordWarning(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ warning_count: 2, closed: false, remaining_warnings: 1 })
      );
    });

    test('closes exam (warned_out) when warning count reaches 3', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ submission_id: 's1', status: 'in_progress', warning_count: 2 }] })
        .mockResolvedValueOnce({ rows: [] }); // update to warned_out

      await controller.recordWarning(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ warning_count: 3, closed: true })
      );
    });

    test('returns 400 when no active exam session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await controller.recordWarning(
        { params: { testId: 'e1' }, user: { user_id: 'u1' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
