const createFlashCardSet = `
CREATE TABLE IF NOT EXISTS flash_card_set (
  set_id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  number_of_cards INT DEFAULT 0,
  set_name VARCHAR(255) NOT NULL,
  proficiency_level VARCHAR(255) NOT NULL,
  language VARCHAR(255) NOT NULL,
  UNIQUE(set_name,proficiency_level,language)
);
`;

const createCards = `
CREATE TABLE IF NOT EXISTS card (
  card_id SERIAL PRIMARY KEY,
  set_id INT NOT NULL,
  front_content TEXT NOT NULL,
  back_content TEXT NOT NULL,
  hint TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (set_id) REFERENCES flash_card_set(set_id) ON DELETE CASCADE
);
`;

const createUser = `
CREATE TABLE IF NOT EXISTS app_user (
  user_id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  number VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  current_profeciency_level VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
`;

const createUserFlashSubmission = `
CREATE TABLE IF NOT EXISTS user_chapter_submissions (
  user_id VARCHAR(50),
  set_id INT NOT NULL,
  last_reviewed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  progress INT DEFAULT 0,
  current_order JSONB NOT NULL,
  current_index INTEGER DEFAULT 0,  
  useDefault boolean DEFAULT true,
  test_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, set_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
  FOREIGN KEY (set_id) REFERENCES flash_card_set(set_id) ON DELETE CASCADE
);
`;

const createPronounceSubmission = `
CREATE TABLE IF NOT EXISTS user_chapter_submissions (
  user_id VARCHAR(50),
  set_id INT NOT NULL,
  last_reviewed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  progress INT DEFAULT 0,
  current_index INTEGER DEFAULT 0,
  test_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, set_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
  FOREIGN KEY (set_id) REFERENCES flash_card_set(set_id) ON DELETE CASCADE
);
`;

const createPronounceSet = `
CREATE TABLE IF NOT EXISTS pronounce_card_set (
  pronounce_id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  number_of_cards INT DEFAULT 0,
  pronounce_name VARCHAR(255) NOT NULL,
  proficiency_level VARCHAR(255) NOT NULL,
  language VARCHAR(255) NOT NULL,
  UNIQUE(pronounce_name,proficiency_level,language)
);
`;

const createPronounceCards = `
CREATE TABLE IF NOT EXISTS pronounce_card (
  pronounce_card_id SERIAL PRIMARY KEY,
  pronounce_id INT NOT NULL,
  front_content TEXT NOT NULL,
  back_content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pronounce_id) REFERENCES pronounce_card_set(pronounce_id) ON DELETE CASCADE
);
`;

const createChTest = `
  CREATE TABLE IF NOT EXISTS chapter_test (
    test_id SERIAL PRIMARY KEY,
    proficiency_level VARCHAR(255) NOT NULL,
    easy_test_link TEXT DEFAULT '/not-found',
    medium_test_link TEXT DEFAULT '/not-found',
    hard_test_link TEXT DEFAULT '/not-found',
    test_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proficiency_level, test_name)
  );
`;

const createFinalTest = `
CREATE TABLE IF NOT EXISTS final_test(
  test_id SERIAL PRIMARY KEY,
  test_name VARCHAR(255) NOT NULL,
  proficiency_level VARCHAR(255) NOT NULL,
  test_link TEXT DEFAULT '/not-found',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(proficiency_level, test_name)
);
`;

const createInterview = `
  CREATE TABLE IF NOT EXISTS interview (
  interview_id SERIAL PRIMARY KEY,
  proficiency_level VARCHAR(255) NOT NULL,
  difficulty VARCHAR(255) NOT NULL,
  interview_link TEXT NOT NULL,
  UNIQUE(proficiency_level,difficulty)
  );
`;

const createAgreement = `
CREATE TABLE IF NOT EXISTS agreement (
  agreement_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  agree BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const createStory = `
CREATE TABLE IF NOT EXISTS story (
  story_id SERIAL PRIMARY KEY,
  slug VARCHAR(255) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  cover_image_url TEXT DEFAULT '',
  hero_image_url TEXT DEFAULT '',
  story TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const createResume = `
CREATE TABLE IF NOT EXISTS resume(
  resume_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(50) NOT NULL,
  resume_name VARCHAR(255) NOT NULL,
  resume_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resume_user_id ON resume(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_created_at ON resume(created_at DESC);
`;

const createConversation = `
CREATE TABLE IF NOT EXISTS conversation(
  conversation_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  topic VARCHAR(255),
  proficiency_level VARCHAR(50) NOT NULL,
  audio_url TEXT NOT NULL,
  audio_duration FLOAT NOT NULL,
  total_sentences INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversation_level ON conversation(proficiency_level);
`;

const createConversationSentence = `
CREATE TABLE IF NOT EXISTS conversation_sentence(
  sentence_id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  sentence_order INT NOT NULL,
  sentence_text TEXT NOT NULL,
  speaker VARCHAR(100),
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sentence_conversation ON conversation_sentence(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sentence_order ON conversation_sentence(conversation_id, sentence_order);
`;

const createUserConversationProgress = `
CREATE TABLE IF NOT EXISTS user_conversation_progress(
  user_id VARCHAR(50) NOT NULL,
  conversation_id INT NOT NULL,
  current_sentence INT DEFAULT 0,
  last_sentence_completed INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, conversation_id),
  FOREIGN KEY(user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversation(conversation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conv_progress ON user_conversation_progress(user_id); 
`;

const createUserPronounceProgress = `
CREATE TABLE IF NOT EXISTS user_pronounce_progress(
  user_id VARCHAR(50) NOT NULL,
  pronounce_id INT NOT NULL,
  current_card_index INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, pronounce_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
  FOREIGN KEY (pronounce_id) REFERENCES pronounce_card_set(pronounce_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_pronounce_progress ON user_pronounce_progress(user_id);
`;

const createUserStoryProgress = `
CREATE TABLE IF NOT EXISTS user_story_progress (
  user_id VARCHAR(50) NOT NULL,
  story_id INT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, story_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES story(story_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_story_progress ON user_story_progress(user_id);
`;

//creating new materialized views below

const createPronounceAnalyticsView = `
CREATE MATERIALIZED VIEW IF NOT EXISTS pronounce_analytics AS
SELECT 
  pcs.pronounce_id,
  pcs.pronounce_name,
  pcs.proficiency_level,
  pcs.number_of_cards,
  COUNT(DISTINCT upp.user_id) as total_users,
  COUNT(DISTINCT CASE WHEN upp.completed = TRUE THEN upp.user_id END) as completed_users,
  ROUND(
    (COUNT(DISTINCT CASE WHEN upp.completed = TRUE THEN upp.user_id END)::numeric / 
     NULLIF(COUNT(DISTINCT upp.user_id), 0) * 100), 
    1
  ) as completion_rate
FROM pronounce_card_set pcs
LEFT JOIN user_pronounce_progress upp ON pcs.pronounce_id = upp.pronounce_id
GROUP BY pcs.pronounce_id, pcs.pronounce_name, pcs.proficiency_level, pcs.number_of_cards
ORDER BY total_users DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pronounce_analytics ON pronounce_analytics(pronounce_id);
`;

const createConversationAnalyticsView = `
CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_analytics AS
SELECT 
  c.conversation_id,
  c.title,
  c.topic,
  c.proficiency_level,
  c.total_sentences,
  COUNT(DISTINCT ucp.user_id) as total_listeners,
  COUNT(DISTINCT CASE WHEN ucp.completed = TRUE THEN ucp.user_id END) as completed_listeners,
  ROUND(
    (COUNT(DISTINCT CASE WHEN ucp.completed = TRUE THEN ucp.user_id END)::numeric / 
     NULLIF(COUNT(DISTINCT ucp.user_id), 0) * 100), 
    1
  ) as completion_rate
FROM conversation c
LEFT JOIN user_conversation_progress ucp ON c.conversation_id = ucp.conversation_id
GROUP BY c.conversation_id, c.title, c.topic, c.proficiency_level, c.total_sentences
ORDER BY total_listeners DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_analytics ON conversation_analytics(conversation_id);
`;

const createStoryAnalyticsView = `
CREATE MATERIALIZED VIEW IF NOT EXISTS story_analytics AS
SELECT 
  s.story_id,
  s.title as story_title,
  'A1' as proficiency_level,
  COUNT(DISTINCT usp.user_id) as total_readers,
  COUNT(DISTINCT CASE WHEN usp.completed = TRUE THEN usp.user_id END) as completed_readers,
  ROUND(
    (COUNT(DISTINCT CASE WHEN usp.completed = TRUE THEN usp.user_id END)::numeric / 
     NULLIF(COUNT(DISTINCT usp.user_id), 0) * 100), 
    1
  ) as completion_rate
FROM story s
LEFT JOIN user_story_progress usp ON s.story_id = usp.story_id
GROUP BY s.story_id, s.title
ORDER BY total_readers DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_analytics ON story_analytics(story_id);
`;

const createNotificationAnalytics = `
CREATE TABLE IF NOT EXISTS notification_analytics (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  notification_type VARCHAR(50) NOT NULL, -- 'morning_reminder' or 'evening_reminder'
  sent_at TIMESTAMP NOT NULL,
  opened_at TIMESTAMP,
  opened BOOLEAN DEFAULT FALSE,
  deep_link_data TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notification_analytics_user 
  ON notification_analytics(user_id);
  
CREATE INDEX IF NOT EXISTS idx_notification_analytics_sent_at 
  ON notification_analytics(sent_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_notification_analytics_type 
  ON notification_analytics(notification_type);
`;

const createConversationTimestamp = `
CREATE TABLE IF NOT EXISTS conversation_timestamp(
  timestamp_id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL,
  label VARCHAR(255),
  time_seconds FLOAT NOT NULL,
  display_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_timestamp_conversation ON conversation_timestamp(conversation_id);
`;

const createUserDailyActivity = `
CREATE TABLE IF NOT EXISTS user_daily_activity (
  activity_id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  activity_date DATE NOT NULL,
  flashcards_practiced INT DEFAULT 0,
  daily_goal_met BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, activity_date),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user ON user_daily_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON user_daily_activity(activity_date);
`;
const createUserStreak = `
CREATE TABLE IF NOT EXISTS user_streak (
  user_id VARCHAR(50) PRIMARY KEY,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_goal_date DATE,
  streak_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);
`;

const createUserFlippedCards = `
CREATE TABLE IF NOT EXISTS user_flipped_cards (
  user_id VARCHAR(50) NOT NULL,
  set_id INT NOT NULL,
  card_index INT NOT NULL,
  flipped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, set_id, card_index),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
  FOREIGN KEY (set_id) REFERENCES flash_card_set(set_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_flipped_cards_user_set 
ON user_flipped_cards(user_id, set_id);
`;

//leads

const createLeads = `
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  qualification VARCHAR(100),
  experience VARCHAR(100),
  source VARCHAR(50) NOT NULL DEFAULT 'website',
  facebook_lead_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
`;

const createScheduledMessages = `
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  template_name VARCHAR(100) NOT NULL,
  campaign_name VARCHAR(100) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  sent_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending 
ON scheduled_messages(scheduled_at, status) 
WHERE status = 'pending';
`;

const createOtaUpdateLog = `
CREATE TABLE IF NOT EXISTS ota_update_log (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) REFERENCES app_user(user_id) ON DELETE CASCADE,
  event VARCHAR(30) NOT NULL,
  target_version VARCHAR(20),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ota_log_event ON ota_update_log(event);
CREATE INDEX IF NOT EXISTS idx_ota_log_created ON ota_update_log(created_at);
`;

//For compatibility
const alterAppUser = `
ALTER TABLE app_user 
  ADD COLUMN IF NOT EXISTS fullname VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS countrycode VARCHAR(10) DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS qualification VARCHAR(255),
  ADD COLUMN IF NOT EXISTS language_level VARCHAR(100),
  ADD COLUMN IF NOT EXISTS experience VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zohoid VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS article_education_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(20);

  UPDATE app_user SET phone = number WHERE phone IS NULL AND number IS NOT NULL;
  UPDATE app_user SET fullname = username WHERE fullname IS NULL;
  UPDATE app_user SET status = 1 WHERE status IS NULL OR status = 0;
  
  CREATE INDEX IF NOT EXISTS idx_app_user_last_activity 
  ON app_user(last_activity_at);
`;

// OTP table
const createUserOtp = `
CREATE TABLE IF NOT EXISTS user_otp (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50),
  phone VARCHAR(20) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  status SMALLINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_otp_phone ON user_otp(phone);
CREATE INDEX IF NOT EXISTS idx_user_otp_created ON user_otp(created_at);
`;

// Event management tables
const createEvent = `
CREATE TABLE IF NOT EXISTS event (
  event_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  cover_image_url TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  meeting_link TEXT NOT NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('one_time', 'recurring')),
  start_datetime TIMESTAMP,
  end_datetime TIMESTAMP,
  timezone VARCHAR(50),
  recurrence_rule TEXT,
  recurrence_timezone VARCHAR(50),
  created_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_event_slug ON event(slug);
CREATE INDEX IF NOT EXISTS idx_event_featured ON event(is_featured);
CREATE INDEX IF NOT EXISTS idx_event_active ON event(is_active);
`;

const createEventRegistration = `
CREATE TABLE IF NOT EXISTS event_registration (
  registration_id SERIAL PRIMARY KEY,
  event_id INT NOT NULL,
  user_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmation_sent BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (event_id) REFERENCES event(event_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_registration_event ON event_registration(event_id);
CREATE INDEX IF NOT EXISTS idx_registration_email ON event_registration(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_registration ON event_registration(event_id, email);
`;

const createEventSubscription = `
CREATE TABLE IF NOT EXISTS event_subscription (
  subscription_id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  unsubscribe_token VARCHAR(255) UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscription_email ON event_subscription(email);
CREATE INDEX IF NOT EXISTS idx_subscription_active ON event_subscription(is_active);
`;

const alterTable = `
ALTER TABLE event_registration ADD COLUMN IF NOT EXISTS instance_date TIMESTAMP;
ALTER TABLE event_registration ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE event_registration ALTER COLUMN registered_at DROP DEFAULT;
-- Add new default with IST timezone
ALTER TABLE event_registration ALTER COLUMN registered_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
CREATE INDEX IF NOT EXISTS idx_registration_reminder ON event_registration(reminder_sent, instance_date);
`;

const createEventOverride = `
CREATE TABLE IF NOT EXISTS event_instance_override (
  override_id SERIAL PRIMARY KEY,
  event_id INT NOT NULL,
  instance_date DATE NOT NULL,
  custom_start_time TIME,
  custom_end_time TIME,
  is_cancelled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, instance_date),
  FOREIGN KEY (event_id) REFERENCES event(event_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_override_event_date ON event_instance_override(event_id, instance_date);
`;

module.exports = {
  createFlashCardSet,
  createCards,
  createUser,
  createUserFlashSubmission,
  createChTest,
  createFinalTest,
  createInterview,
  createPronounceCards,
  createPronounceSet,
  createAgreement,
  createStory,
  createResume,
  createConversation,
  createConversationSentence,
  createUserConversationProgress,
  createUserPronounceProgress,
  createUserStoryProgress,
  createPronounceAnalyticsView,
  createConversationAnalyticsView,
  createStoryAnalyticsView,
  createConversationTimestamp,
  createUserDailyActivity,
  createUserStreak,
  createUserFlippedCards,
  createLeads,
  createScheduledMessages,
  alterAppUser,
  createUserOtp,
  createNotificationAnalytics,
  createOtaUpdateLog,
  createEvent,
  createEventRegistration,
  createEventSubscription,
  alterTable,
  createEventOverride,
};
