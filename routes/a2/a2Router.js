const express = require("express");
const router = express.Router();

const a2Flashcard = require("../../controllers/a2/a2FlashcardController");
const a2Grammar = require("../../controllers/a2/a2GrammarController");
const a2Listening = require("../../controllers/a2/a2ListeningController");
const a2Speaking = require("../../controllers/a2/a2SpeakingController");
const a2Reading = require("../../controllers/a2/a2ReadingController");
const a2Test = require("../../controllers/a2/a2TestController");

// Flashcard routes
router.get("/flashcard/chapters", a2Flashcard.getChapters);
router.get("/flashcard/cards/:chapterId", a2Flashcard.getCards);
router.post("/flashcard/progress", a2Flashcard.saveProgress);
router.get("/flashcard/quiz/mini/:setId", a2Flashcard.generateMiniQuiz);
router.get("/flashcard/quiz/final/:setId", a2Flashcard.generateFinalQuiz);
router.post("/flashcard/quiz/submit", a2Flashcard.submitQuiz);

// Grammar routes
router.get("/grammar/topics", a2Grammar.getTopics);
router.get("/grammar/topic/:topicId", a2Grammar.getTopicDetail);
router.get("/grammar/questions/:topicId", a2Grammar.getQuestions);
router.post("/grammar/progress", a2Grammar.saveProgress);
router.post("/grammar/check", a2Grammar.checkAnswer);

// Listening routes
router.get("/listening/chapters", a2Listening.getChapters);
router.get("/listening/content/:chapterId", a2Listening.getContent);
router.post("/listening/progress", a2Listening.saveProgress);
router.post("/listening/check", a2Listening.checkAnswers);

// Speaking routes
router.get("/speaking/chapters", a2Speaking.getChapters);
router.get("/speaking/content/:chapterId", a2Speaking.getContent);
router.post("/speaking/progress", a2Speaking.saveProgress);
router.post("/speaking/assessment", a2Speaking.saveAssessment);

// Reading routes
router.get("/reading/chapters", a2Reading.getChapters);
router.get("/reading/content/:chapterId", a2Reading.getContent);
router.post("/reading/progress", a2Reading.saveProgress);
router.post("/reading/check", a2Reading.checkAnswers);

// Test routes
router.get("/test/topics", a2Test.getTopics);
router.get("/test/progress/:topicId", a2Test.getTopicProgress);
router.get("/test/set/:topicId/:level/:setNumber", a2Test.getTestSet);
router.post("/test/submit", a2Test.submitTest);
router.get("/test/review/:topicId", a2Test.getReviewData);
router.get("/test/:topicId/:level/results", a2Test.getTestResults);

module.exports = router;
