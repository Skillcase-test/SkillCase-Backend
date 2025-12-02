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
};
