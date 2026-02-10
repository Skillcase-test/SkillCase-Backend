/**
 * Unit Tests for streakController
 * Tests the getLastChapterProgress endpoint for A2 user support
 */

// Mock the database pool
const mockQuery = jest.fn();
jest.mock('../util/db', () => ({
  pool: { query: mockQuery }
}));

describe('streakController - getLastChapterProgress', () => {
  let streakController;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    streakController = require('../controllers/streakController');
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('A2 User Handling', () => {
    test('should return isA2: true for A2 users', async () => {
      mockReq = {
        user: { user_id: 'a2-user-id' }
      };

      // First query: get user proficiency level
      mockQuery.mockResolvedValueOnce({
        rows: [{ current_profeciency_level: 'A2' }]
      });

      // Second query: get A2 flashcard progress
      mockQuery.mockResolvedValueOnce({
        rows: [{
          set_id: 1,
          set_name: 'A2 Chapter 1',
          chapter_id: 101,
          total_cards: 20,
          current_index: 5
        }]
      });

      await streakController.getLastChapterProgress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasProgress: true,
          isA2: true,
          chapterId: 101,
          proficiencyLevel: 'A2'
        })
      );
    });

    test('should return isA2: false for A1 users', async () => {
      mockReq = {
        user: { user_id: 'a1-user-id' }
      };

      // First query: get user proficiency level
      mockQuery.mockResolvedValueOnce({
        rows: [{ current_profeciency_level: 'A1' }]
      });

      // Second query: get A1 flashcard progress
      mockQuery.mockResolvedValueOnce({
        rows: [{
          set_id: 1,
          set_name: 'Chapter 1',
          number_of_cards: 30,
          proficiency_level: 'A1',
          flipped_count: 10
        }]
      });

      // Third query: get first unflipped card
      mockQuery.mockResolvedValueOnce({
        rows: [{ first_unflipped: 10 }]
      });

      await streakController.getLastChapterProgress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasProgress: true,
          isA2: false,
          setId: 1,
          proficiencyLevel: 'A1'
        })
      );
    });

    test('should return chapterId for A2 users for ContinuePractice redirect', async () => {
      mockReq = {
        user: { user_id: 'a2-user-redirect' }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ current_profeciency_level: 'A2' }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          set_id: 5,
          set_name: 'Kapitel 3',
          chapter_id: 203,
          total_cards: 25,
          current_index: 12
        }]
      });

      await streakController.getLastChapterProgress(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      
      // ContinuePractice.jsx relies on these fields for A2 redirect
      expect(response.isA2).toBe(true);
      expect(response.chapterId).toBe(203);
      expect(response.hasProgress).toBe(true);
    });

    test('should handle A2 user with no progress', async () => {
      mockReq = {
        user: { user_id: 'a2-no-progress' }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ current_profeciency_level: 'A2' }]
      });

      // All sets completed
      mockQuery.mockResolvedValueOnce({
        rows: [{
          set_id: 1,
          set_name: 'A2 Chapter 1',
          chapter_id: 101,
          total_cards: 20,
          current_index: 20  // All cards done
        }]
      });

      await streakController.getLastChapterProgress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ hasProgress: false });
    });

    test('should return 400 when user not authenticated', async () => {
      mockReq = {
        user: undefined
      };

      await streakController.getLastChapterProgress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        msg: 'User not authenticated'
      });
    });

    test('should default to A1 when proficiency level is null', async () => {
      mockReq = {
        user: { user_id: 'null-level-user' }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ current_profeciency_level: null }]
      });

      // A1 query (since null defaults to A1)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          set_id: 1,
          set_name: 'Chapter 1',
          number_of_cards: 20,
          proficiency_level: 'A1',
          flipped_count: 5
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ first_unflipped: 5 }]
      });

      await streakController.getLastChapterProgress(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          isA2: false
        })
      );
    });
  });
});
