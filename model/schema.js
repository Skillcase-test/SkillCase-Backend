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
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS signup_source VARCHAR(10) DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS news_hint_seen BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS main_site_id INTEGER DEFAULT NULL;

  UPDATE app_user SET phone = number WHERE phone IS NULL AND number IS NOT NULL;
  UPDATE app_user SET fullname = username WHERE fullname IS NULL;
  UPDATE app_user SET status = 1 WHERE status IS NULL OR status = 0;
  UPDATE app_user SET signup_source = 'app' WHERE fcm_token IS NOT NULL AND signup_source IS NULL;
  UPDATE app_user SET signup_source = 'web' WHERE signup_source IS NULL;
  
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

ALTER TABLE user_daily_activity ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;ALTER TABLE app_user ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS profile_pic_url TEXT DEFAULT '';


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

const createA2Tables = `

-- A2 CHAPTER MANAGEMENT (Used by all modules)
CREATE TABLE IF NOT EXISTS a2_chapter (
  id SERIAL PRIMARY KEY,
  module VARCHAR(50) NOT NULL,  -- 'flashcard', 'grammar', 'listening', 'speaking', 'reading', 'test'
  chapter_name VARCHAR(255) NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_a2_chapter_module ON a2_chapter(module);
CREATE INDEX IF NOT EXISTS idx_a2_chapter_order ON a2_chapter(module, order_index);

-- A2 FLASHCARD TABLES
CREATE TABLE IF NOT EXISTS a2_flashcard_set (
  set_id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a2_chapter(id) ON DELETE CASCADE,
  set_name VARCHAR(255) NOT NULL,
  number_of_cards INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a2_flashcard (
  card_id SERIAL PRIMARY KEY,
  set_id INTEGER REFERENCES a2_flashcard_set(set_id) ON DELETE CASCADE,
  front_de TEXT NOT NULL,         -- German word
  front_meaning TEXT NOT NULL,     -- English meaning
  back_de TEXT NOT NULL,           -- German sentence
  back_en TEXT NOT NULL,           -- English sentence
  card_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2_flashcard_set ON a2_flashcard(set_id);

CREATE TABLE IF NOT EXISTS a2_flashcard_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  set_id INTEGER REFERENCES a2_flashcard_set(set_id) ON DELETE CASCADE,
  current_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  mini_quiz_passed BOOLEAN DEFAULT false,
  final_quiz_passed BOOLEAN DEFAULT false,
  last_reviewed TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, set_id)
);

CREATE TABLE IF NOT EXISTS a2_flashcard_quiz_result (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  set_id INTEGER REFERENCES a2_flashcard_set(set_id) ON DELETE CASCADE,
  quiz_type VARCHAR(20) NOT NULL,  -- 'mini' or 'final'
  score DECIMAL(5,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  answers JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- A2 GRAMMAR TABLES
CREATE TABLE IF NOT EXISTS a2_grammar_topic (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a2_chapter(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  explanation TEXT NOT NULL,       -- Full grammar explanation
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a2_grammar_question (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES a2_grammar_topic(id) ON DELETE CASCADE,
  question_type VARCHAR(50) NOT NULL,  -- 'mcq_single', 'mcq_multi', 'fill_typing', 'fill_options', 'true_false', 'sentence_ordering', 'sentence_correction', 'matching'
  question_data JSONB NOT NULL,        -- Contains question, options, correct answer(s)
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2_grammar_question_topic ON a2_grammar_question(topic_id);

CREATE TABLE IF NOT EXISTS a2_grammar_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  topic_id INTEGER REFERENCES a2_grammar_topic(id) ON DELETE CASCADE,
  current_question_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  score DECIMAL(5,2),
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- A2 LISTENING TABLES
CREATE TABLE IF NOT EXISTS a2_listening_content (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a2_chapter(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL,  -- 'monologue', 'dialogue', 'voicemail', 'announcement'
  audio_url TEXT NOT NULL,
  transcript TEXT,
  subtitles JSONB,                     -- [{start: 0, end: 2, text: "..."}]
  questions JSONB NOT NULL,            -- Array of questions with types
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a2_listening_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  content_id INTEGER REFERENCES a2_listening_content(id) ON DELETE CASCADE,
  current_question_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  score DECIMAL(5,2),
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

-- A2 SPEAKING TABLES
CREATE TABLE IF NOT EXISTS a2_speaking_content (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a2_chapter(id) ON DELETE CASCADE,
  text_de TEXT NOT NULL,              -- German text to pronounce
  text_en TEXT,                        -- English translation
  audio_url TEXT,                      -- Pre-recorded audio (optional)
  content_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2_speaking_chapter ON a2_speaking_content(chapter_id);

CREATE TABLE IF NOT EXISTS a2_speaking_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  chapter_id INTEGER REFERENCES a2_chapter(id) ON DELETE CASCADE,
  current_content_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS a2_speaking_assessment (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  content_id INTEGER REFERENCES a2_speaking_content(id) ON DELETE CASCADE,
  score DECIMAL(5,2) NOT NULL,
  accuracy_score DECIMAL(5,2),
  fluency_score DECIMAL(5,2),
  pronunciation_score DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- A2 READING TABLES
CREATE TABLE IF NOT EXISTS a2_reading_content (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a2_chapter(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL,   -- 'email', 'sms', 'article', 'story'
  content TEXT NOT NULL,               -- Main reading content with ##word(meaning)## markers
  hero_image_url TEXT,                 -- For story type
  vocabulary JSONB,                    -- Extracted [{word: "Geld", meaning: "money"}]
  questions JSONB NOT NULL,            -- Array of questions
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a2_reading_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  content_id INTEGER REFERENCES a2_reading_content(id) ON DELETE CASCADE,
  current_question_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  score DECIMAL(5,2),
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

-- A2 TEST TABLES
CREATE TABLE IF NOT EXISTS a2_test_topic (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a2_chapter(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prerequisites JSONB,                 -- Array of prerequisite topic names
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a2_test_set (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES a2_test_topic(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  set_number INTEGER NOT NULL CHECK (set_number BETWEEN 1 AND 3),
  questions JSONB NOT NULL,            -- Array of questions
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(topic_id, level, set_number)
);

CREATE TABLE IF NOT EXISTS a2_test_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  topic_id INTEGER REFERENCES a2_test_topic(id) ON DELETE CASCADE,
  current_level INTEGER DEFAULT 1,
  current_set INTEGER DEFAULT 1,
  attempts_on_current_set INTEGER DEFAULT 0,
  levels_completed INTEGER DEFAULT 0,
  is_fully_completed BOOLEAN DEFAULT false,
  completed_sets JSONB DEFAULT '[]',   -- [{level: 1, set: 1, score: 85, passed: true}]
  last_attempted TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS a2_user_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id),
  module VARCHAR(50) NOT NULL,
  chapter_id INTEGER NOT NULL REFERENCES a2_chapter(id),
  cards_flipped INTEGER DEFAULT 0,
  questions_completed INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  last_accessed TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, module, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_a2_progress_user ON a2_user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_a2_progress_module ON a2_user_progress(module, chapter_id);


-- For A2 Tour --
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS a2_onboarding_completed BOOLEAN DEFAULT FALSE;

-- For A1 Revamp Tour --
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS a1_onboarding_completed BOOLEAN DEFAULT FALSE;
`;

const createHardcoreTestTables = `
-- BATCH MANAGEMENT
CREATE TABLE IF NOT EXISTS batch (
  batch_id SERIAL PRIMARY KEY,
  batch_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_batch (
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES batch(batch_id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, batch_id)
);

-- HARDCORE TEST (EXAM METADATA)
CREATE TABLE IF NOT EXISTS hardcore_test (
  test_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  proficiency_level VARCHAR(50) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  total_questions INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  results_visible BOOLEAN DEFAULT false,
  created_by VARCHAR(50) REFERENCES app_user(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDIVIDUAL QUESTIONS (PER-QUESTION AUDIO)
CREATE TABLE IF NOT EXISTS hardcore_test_question (
  question_id SERIAL PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES hardcore_test(test_id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  question_type VARCHAR(50) NOT NULL,
  question_data JSONB NOT NULL,
  audio_url TEXT,
  audio_public_id TEXT,
  points INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hcq_test ON hardcore_test_question(test_id);
CREATE INDEX IF NOT EXISTS idx_hcq_order ON hardcore_test_question(test_id, question_order);

-- VISIBILITY RULES (BATCH + INDIVIDUAL)
CREATE TABLE IF NOT EXISTS hardcore_test_visibility (
  id SERIAL PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES hardcore_test(test_id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES batch(batch_id) ON DELETE CASCADE,
  user_id VARCHAR(50) REFERENCES app_user(user_id) ON DELETE CASCADE,
  CHECK (batch_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_hctv_test ON hardcore_test_visibility(test_id);
CREATE INDEX IF NOT EXISTS idx_hctv_batch ON hardcore_test_visibility(batch_id);
CREATE INDEX IF NOT EXISTS idx_hctv_user ON hardcore_test_visibility(user_id);

-- STUDENT EXAM SESSION
CREATE TABLE IF NOT EXISTS hardcore_test_submission (
  submission_id SERIAL PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES hardcore_test(test_id) ON DELETE CASCADE,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'not_started',
  warning_count INTEGER DEFAULT 0,
  score DECIMAL(5,2),
  total_points INTEGER,
  earned_points DECIMAL(10,4) DEFAULT 0,
  is_reopened BOOLEAN DEFAULT false,
  UNIQUE(test_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hcts_user ON hardcore_test_submission(user_id);
CREATE INDEX IF NOT EXISTS idx_hcts_test ON hardcore_test_submission(test_id);

-- PER-QUESTION ANSWERS
CREATE TABLE IF NOT EXISTS hardcore_test_answer (
  answer_id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES hardcore_test_submission(submission_id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES hardcore_test_question(question_id) ON DELETE CASCADE,
  user_answer JSONB,
  is_correct BOOLEAN,
  points_earned DECIMAL(10,4) DEFAULT 0,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_hcta_sub ON hardcore_test_answer(submission_id);

ALTER TABLE hardcore_test
  ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ DEFAULT NULL;

-- Ensure existing columns are TIMESTAMPTZ
ALTER TABLE hardcore_test
  ALTER COLUMN available_from TYPE TIMESTAMPTZ USING available_from AT TIME ZONE 'UTC',
  ALTER COLUMN available_until TYPE TIMESTAMPTZ USING available_until AT TIME ZONE 'UTC';
`;

//Dynamic Landing Page Components
const createLpDemoClass = `
CREATE TABLE IF NOT EXISTS lp_demo_class (
  level VARCHAR(10) PRIMARY KEY,
  heading VARCHAR(300) NOT NULL DEFAULT 'Free Demo Class for Nurses: Learn German Basics',
  subtitle TEXT NOT NULL DEFAULT 'Learn to greet and introduce yourself in German - in just 30 minutes!',
  check_item_1 VARCHAR(100) NOT NULL DEFAULT 'Today',
  check_item_2 VARCHAR(100) NOT NULL DEFAULT '9:00 PM',
  button_text VARCHAR(100) NOT NULL DEFAULT 'Register Now for Free',
  button_link TEXT NOT NULL DEFAULT 'https://luma.com/Skillcase.in',
  badge_text VARCHAR(200) NOT NULL DEFAULT 'Limited Seats available',
  image_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const createLpSalaryInfo = `
CREATE TABLE IF NOT EXISTS lp_salary_info (
  level VARCHAR(10) PRIMARY KEY,
  heading VARCHAR(300) NOT NULL DEFAULT 'Salary, Expenses and Savings in Germany',
  subtitle VARCHAR(300) NOT NULL DEFAULT 'Get real answers in 30 minutes:',
  benefit_1 VARCHAR(300) NOT NULL DEFAULT 'Exact salary in for Nurses in Germany',
  benefit_2 VARCHAR(300) NOT NULL DEFAULT 'Cost of living in various Cities',
  benefit_3 VARCHAR(300) NOT NULL DEFAULT 'Monthly expected savings',
  benefit_4 VARCHAR(300) NOT NULL DEFAULT 'Benefits: PR, Free Education & more',
  button_text VARCHAR(100) NOT NULL DEFAULT 'Register Now for Free',
  button_link TEXT NOT NULL DEFAULT 'https://luma.com/e4hfm8xk',
  image_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const createLpTalkToTeam = `
CREATE TABLE IF NOT EXISTS lp_talk_to_team (
  level VARCHAR(10) PRIMARY KEY,
  heading VARCHAR(300) NOT NULL DEFAULT 'Talk to our team',
  feature_1 VARCHAR(300) NOT NULL DEFAULT 'Personalized assistance',
  feature_2 VARCHAR(300) NOT NULL DEFAULT 'Step-by-step guidance',
  feature_3 VARCHAR(300) NOT NULL DEFAULT 'Clearing all your doubts with ease',
  button_text VARCHAR(100) NOT NULL DEFAULT 'Call us Now',
  phone_link VARCHAR(100) NOT NULL DEFAULT 'tel:9731462667',
  phone_display_text VARCHAR(100) NOT NULL DEFAULT 'Call Us @ 9731462667',
  badge_text VARCHAR(100) NOT NULL DEFAULT 'Online',
  avatar_image_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const seedLandingPageDefaults = `
INSERT INTO lp_demo_class (level) VALUES ('A1') ON CONFLICT (level) DO NOTHING;
INSERT INTO lp_demo_class (level) VALUES ('A2') ON CONFLICT (level) DO NOTHING;
INSERT INTO lp_salary_info (level) VALUES ('A1') ON CONFLICT (level) DO NOTHING;
INSERT INTO lp_salary_info (level) VALUES ('A2') ON CONFLICT (level) DO NOTHING;
INSERT INTO lp_talk_to_team (level) VALUES ('A1') ON CONFLICT (level) DO NOTHING;
INSERT INTO lp_talk_to_team (level) VALUES ('A2') ON CONFLICT (level) DO NOTHING;
`;

const createNewsTables = `
CREATE TABLE IF NOT EXISTS news_article (
  id SERIAL PRIMARY KEY,
  news_key VARCHAR(500) NOT NULL UNIQUE,
  source_name VARCHAR(255) DEFAULT '',
  article_url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  published_at TIMESTAMPTZ,
  english_title TEXT NOT NULL,
  english_summary TEXT DEFAULT '',
  english_content TEXT DEFAULT '',
  german_title TEXT DEFAULT '',
  german_summary TEXT DEFAULT '',
  german_content TEXT DEFAULT '',
  target_levels TEXT[] NOT NULL DEFAULT ARRAY['ALL','A1','A2'],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  translated_at TIMESTAMPTZ,
  raw_payload_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_news_article_published ON news_article(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_article_levels ON news_article USING GIN(target_levels);
CREATE INDEX IF NOT EXISTS idx_news_article_active ON news_article(is_active);
`;

const createInterviewToolTables = `
CREATE TABLE IF NOT EXISTS interview_position (
  position_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  role_title VARCHAR(255) NOT NULL,
  department VARCHAR(255) DEFAULT '',
  location VARCHAR(255) DEFAULT '',
  employment_type VARCHAR(100) DEFAULT '',
  short_description TEXT DEFAULT '',
  intro_video_key TEXT,
  intro_video_title VARCHAR(255) DEFAULT '',
  intro_video_description TEXT DEFAULT '',
  farewell_video_key TEXT,
  farewell_video_title VARCHAR(255) DEFAULT '',
  farewell_video_description TEXT DEFAULT '',
  thank_you_message TEXT DEFAULT '',
  thinking_time_seconds INTEGER DEFAULT 3,
  answer_time_seconds INTEGER,
  allowed_retakes INTEGER DEFAULT 0,
  slug VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published_open', 'published_closed')
  ),
  preview_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(50) REFERENCES app_user(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interview_position_question (
  question_id SERIAL PRIMARY KEY,
  position_id INTEGER NOT NULL REFERENCES interview_position(position_id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  short_description TEXT DEFAULT '',
  video_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(position_id, question_order)
);

CREATE INDEX IF NOT EXISTS idx_interview_position_status ON interview_position(status);
CREATE INDEX IF NOT EXISTS idx_interview_question_position ON interview_position_question(position_id, question_order);

CREATE TABLE IF NOT EXISTS interview_submission (
  submission_id SERIAL PRIMARY KEY,
  position_id INTEGER NOT NULL REFERENCES interview_position(position_id) ON DELETE CASCADE,
  candidate_name VARCHAR(255) NOT NULL,
  candidate_email VARCHAR(255) NOT NULL,
  candidate_phone VARCHAR(50) NOT NULL,
  session_token VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'started' CHECK (
    status IN ('started', 'completed', 'abandoned')
  ),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  last_saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  overall_review_status VARCHAR(30) DEFAULT 'completed' CHECK (
    overall_review_status IN ('completed', 'in_review', 'shortlisted', 'rejected')
  ),
  calculated_score NUMERIC(5,2),
  overall_score NUMERIC(5,2),
  total_questions INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_interview_submission_position ON interview_submission(position_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_submission_email ON interview_submission(position_id, LOWER(candidate_email));
CREATE INDEX IF NOT EXISTS idx_interview_submission_phone ON interview_submission(position_id, candidate_phone);

CREATE TABLE IF NOT EXISTS interview_submission_answer (
  answer_id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES interview_submission(submission_id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES interview_position_question(question_id) ON DELETE CASCADE,
  answer_order INTEGER NOT NULL,
  answer_video_key TEXT NOT NULL,
  answer_duration_seconds NUMERIC(10,2),
  retake_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  admin_score INTEGER CHECK (admin_score BETWEEN 1 AND 5),
  UNIQUE(submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_interview_answer_submission ON interview_submission_answer(submission_id, answer_order);
`;

const createWiseTranscripts = `
CREATE TABLE IF NOT EXISTS wise_transcripts (
  session_id VARCHAR(50) PRIMARY KEY,
  class_id   VARCHAR(50) NOT NULL,
  session_date DATE,
  instructor_name VARCHAR(255),
  student_words JSONB NOT NULL DEFAULT '{}',
  total_student_words INTEGER DEFAULT 0,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wise_transcripts_class ON wise_transcripts(class_id);
CREATE INDEX IF NOT EXISTS idx_wise_transcripts_date ON wise_transcripts(session_date);
`;

const createWiseBatchStatus = `
CREATE TABLE IF NOT EXISTS wise_batch_status (
  batch_id VARCHAR(50) PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wise_batch_status_active ON wise_batch_status(is_active);
`;

const createA1Tables = `

-- A1 USER MIGRATION STATE
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS a1_revamp_status VARCHAR(40);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS a1_revamp_opted_at TIMESTAMPTZ;

-- Backfill existing users as legacy, then set default for future users.
UPDATE app_user
SET a1_revamp_status = 'legacy_a1'
WHERE a1_revamp_status IS NULL;

ALTER TABLE app_user ALTER COLUMN a1_revamp_status SET DEFAULT 'revamp_opted_in';

CREATE INDEX IF NOT EXISTS idx_app_user_a1_revamp_status ON app_user(a1_revamp_status);

-- A1 CHAPTER MANAGEMENT (for flashcard, grammar, listening, speaking, reading, test)
CREATE TABLE IF NOT EXISTS a1_chapter (
  id SERIAL PRIMARY KEY,
  module VARCHAR(50) NOT NULL,  -- 'flashcard', 'grammar', 'listening', 'speaking', 'reading', 'test'
  chapter_name VARCHAR(255) NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a1_chapter_module ON a1_chapter(module);
CREATE INDEX IF NOT EXISTS idx_a1_chapter_order ON a1_chapter(module, order_index);

-- A1 FLASHCARD TABLES
CREATE TABLE IF NOT EXISTS a1_flashcard_set (
  set_id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a1_chapter(id) ON DELETE CASCADE,
  set_name VARCHAR(255) NOT NULL,
  number_of_cards INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a1_flashcard (
  card_id SERIAL PRIMARY KEY,
  set_id INTEGER REFERENCES a1_flashcard_set(set_id) ON DELETE CASCADE,
  word_de TEXT NOT NULL,
  meaning_en TEXT NOT NULL,
  sample_sentence_de TEXT NOT NULL,
  front_image_url TEXT,
  front_image_public_id TEXT,
  image_name VARCHAR(255),
  card_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a1_flashcard_set ON a1_flashcard(set_id);

CREATE TABLE IF NOT EXISTS a1_flashcard_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  set_id INTEGER REFERENCES a1_flashcard_set(set_id) ON DELETE CASCADE,
  current_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  mini_quiz_passed BOOLEAN DEFAULT false,
  final_quiz_passed BOOLEAN DEFAULT false,
  last_reviewed TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, set_id)
);

CREATE TABLE IF NOT EXISTS a1_flashcard_quiz_result (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  set_id INTEGER REFERENCES a1_flashcard_set(set_id) ON DELETE CASCADE,
  quiz_type VARCHAR(20) NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  answers JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- A1 GRAMMAR TABLES
CREATE TABLE IF NOT EXISTS a1_grammar_topic (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a1_chapter(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  explanation TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a1_grammar_question (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES a1_grammar_topic(id) ON DELETE CASCADE,
  question_type VARCHAR(50) NOT NULL,
  question_data JSONB NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a1_grammar_question_topic ON a1_grammar_question(topic_id);

CREATE TABLE IF NOT EXISTS a1_grammar_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES a1_grammar_topic(id) ON DELETE CASCADE,
  current_question_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  score DECIMAL(5,2),
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- A1 LISTENING TABLES
CREATE TABLE IF NOT EXISTS a1_listening_content (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a1_chapter(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL,  -- 'word', 'image_recognition', 'simple_sentence', 'dialogue', 'announcement', 'voicemail', 'interactive_task'
  audio_url TEXT,
  transcript TEXT,
  subtitles JSONB,
  questions JSONB NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a1_listening_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  content_id INTEGER REFERENCES a1_listening_content(id) ON DELETE CASCADE,
  current_question_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  score DECIMAL(5,2),
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

-- A1 SPEAKING TABLES
CREATE TABLE IF NOT EXISTS a1_speaking_content (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a1_chapter(id) ON DELETE CASCADE,
  text_de TEXT NOT NULL,
  text_en TEXT,
  audio_url TEXT,
  content_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a1_speaking_chapter ON a1_speaking_content(chapter_id);

CREATE TABLE IF NOT EXISTS a1_speaking_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES a1_chapter(id) ON DELETE CASCADE,
  current_content_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS a1_speaking_assessment (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  content_id INTEGER REFERENCES a1_speaking_content(id) ON DELETE CASCADE,
  score DECIMAL(5,2) NOT NULL,
  accuracy_score DECIMAL(5,2),
  fluency_score DECIMAL(5,2),
  pronunciation_score DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- A1 READING TABLES
CREATE TABLE IF NOT EXISTS a1_reading_content (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a1_chapter(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  hero_image_url TEXT,
  vocabulary JSONB,
  questions JSONB NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a1_reading_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  content_id INTEGER REFERENCES a1_reading_content(id) ON DELETE CASCADE,
  current_question_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  score DECIMAL(5,2),
  last_practiced TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

-- A1 TEST TABLES (5 levels x 3 sets)
CREATE TABLE IF NOT EXISTS a1_test_topic (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES a1_chapter(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prerequisites JSONB,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a1_test_set (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES a1_test_topic(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  set_number INTEGER NOT NULL CHECK (set_number BETWEEN 1 AND 3),
  questions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(topic_id, level, set_number)
);

CREATE TABLE IF NOT EXISTS a1_test_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES a1_test_topic(id) ON DELETE CASCADE,
  current_level INTEGER DEFAULT 1,
  current_set INTEGER DEFAULT 1,
  attempts_on_current_set INTEGER DEFAULT 0,
  levels_completed INTEGER DEFAULT 0,
  is_fully_completed BOOLEAN DEFAULT false,
  completed_sets JSONB DEFAULT '[]',
  last_attempted TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);


-- Alter table for dropdown question type and deterministic quiz
ALTER TABLE a1_flashcard_progress
ADD COLUMN IF NOT EXISTS mini_quiz_snapshot JSONB,
ADD COLUMN IF NOT EXISTS final_quiz_snapshot JSONB;
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
  createA2Tables,
  createHardcoreTestTables,
  createLpDemoClass,
  createLpSalaryInfo,
  createLpTalkToTeam,
  seedLandingPageDefaults,
  createNewsTables,
  createInterviewToolTables,
  createWiseTranscripts,
  createWiseBatchStatus,
  createA1Tables,
};
