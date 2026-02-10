/**
 * Unit Tests for notificationController
 * Tests the level-based user filtering for push notifications
 */

// Set env var BEFORE any imports so the controller uses the base64 branch
// and never tries to require the missing serviceAccountKey.json
const fakeServiceAccount = Buffer.from(JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'test',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRi\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'test@test.iam.gserviceaccount.com',
  client_id: '123',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token'
})).toString('base64');
process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = fakeServiceAccount;

// Mock firebase-admin
jest.mock('firebase-admin', () => ({
  messaging: jest.fn().mockReturnValue({
    sendEachForMulticast: jest.fn().mockResolvedValue({
      successCount: 5,
      failureCount: 0
    })
  })
}));

// Mock the database pool
const mockQuery = jest.fn();
jest.mock('../util/db', () => ({
  pool: { query: mockQuery }
}));

describe('notificationController - Level Filtering', () => {
  let notificationController;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Re-require to get fresh module with mocks
    notificationController = require('../controllers/notificationController');
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('broadcastNotification - Target Level', () => {
    test('should fetch ALL users when targetLevel is "all"', async () => {
      mockReq = {
        body: {
          title: 'Test Notification',
          body: 'Test body',
          targetLevel: 'all'
        }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [
          { fcm_token: 'token1' },
          { fcm_token: 'token2' },
          { fcm_token: 'token3' }
        ]
      });

      await notificationController.broadcastNotification(mockReq, mockRes);

      // Should query without level filter
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL',
        []
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('should filter A1 users only when targetLevel is "a1"', async () => {
      mockReq = {
        body: {
          title: 'A1 Notification',
          body: 'For A1 users only',
          targetLevel: 'a1'
        }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [
          { fcm_token: 'a1_token1' },
          { fcm_token: 'a1_token2' }
        ]
      });

      await notificationController.broadcastNotification(mockReq, mockRes);

      // Should query with A1 level filter
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL AND UPPER(current_profeciency_level) = $1',
        ['A1']
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('should filter A2 users only when targetLevel is "a2"', async () => {
      mockReq = {
        body: {
          title: 'A2 Notification',
          body: 'For A2 users only',
          targetLevel: 'a2'
        }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [
          { fcm_token: 'a2_token1' },
          { fcm_token: 'a2_token2' },
          { fcm_token: 'a2_token3' }
        ]
      });

      await notificationController.broadcastNotification(mockReq, mockRes);

      // Should query with A2 level filter
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL AND UPPER(current_profeciency_level) = $1',
        ['A2']
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('should default to ALL users when targetLevel is not specified', async () => {
      mockReq = {
        body: {
          title: 'Default Notification',
          body: 'No level specified'
          // targetLevel not provided
        }
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ fcm_token: 'token1' }]
      });

      await notificationController.broadcastNotification(mockReq, mockRes);

      // Should query without level filter (default to all)
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL',
        []
      );
    });

    test('should return 400 when no users have FCM tokens for A1', async () => {
      mockReq = {
        body: {
          title: 'A1 Notification',
          body: 'Test',
          targetLevel: 'a1'
        }
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await notificationController.broadcastNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No A1 users with FCM tokens'
      });
    });

    test('should return 400 when no users have FCM tokens for A2', async () => {
      mockReq = {
        body: {
          title: 'A2 Notification',
          body: 'Test',
          targetLevel: 'a2'
        }
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await notificationController.broadcastNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No A2 users with FCM tokens'
      });
    });

    test('should return 400 when title is missing', async () => {
      mockReq = {
        body: {
          body: 'Missing title'
        }
      };

      await notificationController.broadcastNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Title and body are required'
      });
    });

    test('should return 400 when body is missing', async () => {
      mockReq = {
        body: {
          title: 'Missing body'
        }
      };

      await notificationController.broadcastNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Title and body are required'
      });
    });
  });
});
