/**
 * Unit Tests for batchController
 * Tests CRUD for batches, student assignment, and the updated listAllStudents
 * which no longer filters by role='user' (admins can now be added to batches).
 */

const mockQuery = jest.fn();
jest.mock('../util/db', () => ({
  pool: { query: mockQuery }
}));

describe('batchController', () => {
  let batchController;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    batchController = require('../controllers/batchController');

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ─── createBatch ──────────────────────────────────────────────────────────

  describe('createBatch', () => {
    test('creates a batch successfully', async () => {
      const created = { batch_id: 1, batch_name: 'Morning Batch', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [created] });

      await batchController.createBatch(
        { body: { batch_name: 'Morning Batch', description: null } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ batch: created });
    });

    test('returns 400 when batch_name is missing', async () => {
      await batchController.createBatch(
        { body: { batch_name: '', description: 'desc' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Batch name is required' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('returns 409 on duplicate batch name (unique constraint)', async () => {
      mockQuery.mockRejectedValueOnce({ code: '23505' });

      await batchController.createBatch(
        { body: { batch_name: 'Existing Batch' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        msg: 'A batch with this name already exists'
      });
    });

    test('returns 500 on unexpected DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));

      await batchController.createBatch(
        { body: { batch_name: 'Test Batch' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  // ─── listBatches ──────────────────────────────────────────────────────────

  describe('listBatches', () => {
    test('returns list of batches with student_count', async () => {
      const batches = [
        { batch_id: 1, batch_name: 'A1 Morning', student_count: 5 },
        { batch_id: 2, batch_name: 'A2 Evening', student_count: 3 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: batches });

      await batchController.listBatches({}, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ batches });
    });

    test('returns empty array when no batches exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await batchController.listBatches({}, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ batches: [] });
    });
  });

  // ─── updateBatch ──────────────────────────────────────────────────────────

  describe('updateBatch', () => {
    test('updates batch name and description', async () => {
      const updated = { batch_id: 1, batch_name: 'Updated Name', description: 'new desc' };
      mockQuery.mockResolvedValueOnce({ rows: [updated] });

      await batchController.updateBatch(
        { params: { batchId: '1' }, body: { batch_name: 'Updated Name', description: 'new desc' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ batch: updated });
    });

    test('returns 404 when batch does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await batchController.updateBatch(
        { params: { batchId: '999' }, body: { batch_name: 'Ghost' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('returns 400 when batch_name is empty', async () => {
      await batchController.updateBatch(
        { params: { batchId: '1' }, body: { batch_name: '   ' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  // ─── deleteBatch ──────────────────────────────────────────────────────────

  describe('deleteBatch', () => {
    test('deletes batch successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ batch_id: 1 }] });

      await batchController.deleteBatch({ params: { batchId: '1' } }, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Batch deleted successfully' });
    });

    test('returns 404 when batch does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await batchController.deleteBatch({ params: { batchId: '999' } }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  // ─── getBatchStudents ─────────────────────────────────────────────────────

  describe('getBatchStudents', () => {
    test('returns students in the batch', async () => {
      const students = [
        { user_id: 'u1', fullname: 'Alice', number: '9999999999' },
        { user_id: 'u2', fullname: 'Bob', number: '8888888888' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: students });

      await batchController.getBatchStudents(
        { params: { batchId: '1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ students });
    });

    test('returns empty array for batch with no students', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await batchController.getBatchStudents(
        { params: { batchId: '1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ students: [] });
    });
  });

  // ─── assignStudents ───────────────────────────────────────────────────────

  describe('assignStudents', () => {
    test('assigns students to a batch', async () => {
      // Batch exists check
      mockQuery.mockResolvedValueOnce({ rows: [{ batch_id: 1 }] });
      // Insert for each user (2 users)
      mockQuery.mockResolvedValue({ rows: [] });

      await batchController.assignStudents(
        { params: { batchId: '1' }, body: { user_ids: ['u1', 'u2'] } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ assigned: 2 })
      );
    });

    test('returns 400 if user_ids is empty', async () => {
      await batchController.assignStudents(
        { params: { batchId: '1' }, body: { user_ids: [] } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('returns 404 if batch does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // batch not found = empty

      await batchController.assignStudents(
        { params: { batchId: '999' }, body: { user_ids: ['u1'] } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  // ─── removeStudent ────────────────────────────────────────────────────────

  describe('removeStudent', () => {
    test('removes a student from the batch', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });

      await batchController.removeStudent(
        { params: { batchId: '1', userId: 'u1' } },
        mockRes
      );

      expect(mockRes.json).toHaveBeenCalledWith({ msg: 'Student removed from batch' });
    });

    test('returns 404 if student is not in this batch', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await batchController.removeStudent(
        { params: { batchId: '1', userId: 'ghost' } },
        mockRes
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  // ─── listAllStudents (KEY CHANGE: no role filter) ─────────────────────────

  describe('listAllStudents', () => {
    test('returns all users including admins (no role filter)', async () => {
      const allUsers = [
        { user_id: 'a1', username: 'admin1', fullname: 'Admin User', number: '1111111111', current_profeciency_level: 'A1', role: 'admin' },
        { user_id: 'u1', username: 'learner1', fullname: 'Learner One', number: '2222222222', current_profeciency_level: 'A2', role: 'user' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: allUsers });

      await batchController.listAllStudents({}, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ students: allUsers });

      // Verify the SQL does NOT contain a role filter
      const sqlCalled = mockQuery.mock.calls[0][0];
      expect(sqlCalled).not.toContain("role = 'user'");
      expect(sqlCalled).not.toContain("WHERE role");
    });

    test('returns empty array when no users exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await batchController.listAllStudents({}, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ students: [] });
    });

    test('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      await batchController.listAllStudents({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
