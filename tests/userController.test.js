/**
 * Unit Tests for userController
 * Tests the A1/A2 signup level mapping and /user/me endpoint
 */

// Mock the database pool
const mockQuery = jest.fn();
jest.mock('../util/db', () => ({
  pool: { query: mockQuery }
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn()
}));

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_token')
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234')
}));

// Mock config
jest.mock('../config/configuration', () => ({
  JWT_SECRET_KEY: 'test_secret_key'
}));

describe('userController', () => {
  let userController;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear module cache to get fresh controller
    jest.resetModules();
    userController = require('../controllers/userController');
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('signup - Proficiency Level Mapping', () => {
    beforeEach(() => {
      // User doesn't exist
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert succeeds
      mockQuery.mockResolvedValueOnce({ rows: [] });
    });

    test('should keep A1 level as A1', async () => {
      mockReq = {
        body: {
          number: '1234567890',
          username: 'testuser',
          password: 'password123',
          proficiency_level: 'A1'
        }
      };

      await userController.signup(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A1'
          })
        })
      );
    });

    test('should keep A2 level as A2', async () => {
      mockReq = {
        body: {
          number: '1234567891',
          username: 'testuser2',
          password: 'password123',
          proficiency_level: 'A2'
        }
      };

      await userController.signup(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A2'
          })
        })
      );
    });

    test('should map B1 level to A2', async () => {
      mockReq = {
        body: {
          number: '1234567892',
          username: 'testuser3',
          password: 'password123',
          proficiency_level: 'B1'
        }
      };

      await userController.signup(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A2'
          })
        })
      );
    });

    test('should map B2 level to A2', async () => {
      mockReq = {
        body: {
          number: '1234567893',
          username: 'testuser4',
          password: 'password123',
          proficiency_level: 'B2'
        }
      };

      await userController.signup(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A2'
          })
        })
      );
    });

    test('should map C1 level to A2', async () => {
      mockReq = {
        body: {
          number: '1234567894',
          username: 'testuser5',
          password: 'password123',
          proficiency_level: 'C1'
        }
      };

      await userController.signup(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A2'
          })
        })
      );
    });

    test('should map C2 level to A2', async () => {
      mockReq = {
        body: {
          number: '1234567895',
          username: 'testuser6',
          password: 'password123',
          proficiency_level: 'C2'
        }
      };

      await userController.signup(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A2'
          })
        })
      );
    });

    test('should handle lowercase level input (b1 -> A2)', async () => {
      mockReq = {
        body: {
          number: '1234567896',
          username: 'testuser7',
          password: 'password123',
          proficiency_level: 'b1'
        }
      };

      await userController.signup(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A2'
          })
        })
      );
    });
  });

  describe('me - Returns user_prof_level', () => {
    test('should return user_prof_level in response', async () => {
      mockReq = {
        user: { user_id: 'test-user-id' }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'test-user-id',
          username: 'testuser',
          role: 'user',
          current_profeciency_level: 'A2',
          onboarding_completed: true,
          a2_onboarding_completed: false
        }]
      });

      await userController.me(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        user: {
          user_id: 'test-user-id',
          username: 'testuser',
          role: 'user',
          user_prof_level: 'A2',
          onboarding_completed: true,
          a2_onboarding_completed: false
        }
      });
    });

    test('should return A1 level for A1 users', async () => {
      mockReq = {
        user: { user_id: 'test-user-id-a1' }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'test-user-id-a1',
          username: 'a1user',
          role: 'user',
          current_profeciency_level: 'A1',
          onboarding_completed: true
        }]
      });

      await userController.me(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            user_prof_level: 'A1'
          })
        })
      );
    });

    test('should return 401 when no user in request', async () => {
      mockReq = {};

      await userController.me(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    test('should return 404 when user not found in DB', async () => {
      mockReq = {
        user: { user_id: 'non-existent-user' }
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await userController.me(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });
});
