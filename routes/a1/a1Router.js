const express = require("express");

const a1Flashcard = require("../../controllers/a1/a1FlashcardController");
const a1Grammar = require("../../controllers/a1/a1GrammarController");
const a1Listening = require("../../controllers/a1/a1ListeningController");
const a1Reading = require("../../controllers/a1/a1ReadingController");
const a1Speaking = require("../../controllers/a1/a1SpeakingController");
const a1Test = require("../../controllers/a1/a1TestController");

const router = express.Router();

// Flashcard routes
router.get("/flashcard/chapters", a1Flashcard.getChapters);
router.get("/flashcard/cards/:chapterId", a1Flashcard.getCards);
router.post("/flashcard/progress", a1Flashcard.saveProgress);
router.get("/flashcard/quiz/mini/:setId", a1Flashcard.generateMiniQuiz);
router.get("/flashcard/quiz/final/:setId", a1Flashcard.generateFinalQuiz);
router.post("/flashcard/quiz/submit", a1Flashcard.submitQuiz);

// Grammar routes
router.get("/grammar/topics", a1Grammar.getTopics);
router.get("/grammar/topic/:topicId", a1Grammar.getTopicDetail);
router.get("/grammar/questions/:topicId", a1Grammar.getQuestions);
router.post("/grammar/progress", a1Grammar.saveProgress);
router.post("/grammar/check", a1Grammar.checkAnswer);

// Reading routes
router.get("/reading/chapters", a1Reading.getChapters);
router.get("/reading/content/:chapterId", a1Reading.getContent);
router.post("/reading/progress", a1Reading.saveProgress);
router.post("/reading/check", a1Reading.checkAnswers);

// Listening routes
router.get("/listening/chapters", a1Listening.getChapters);
router.get("/listening/content/:chapterId", a1Listening.getContent);
router.post("/listening/progress", a1Listening.saveProgress);
router.post("/listening/check", a1Listening.checkAnswers);

// Speaking routes
router.get("/speaking/chapters", a1Speaking.getChapters);
router.get("/speaking/content/:chapterId", a1Speaking.getContent);
router.post("/speaking/progress", a1Speaking.saveProgress);
router.post("/speaking/assessment", a1Speaking.saveAssessment);

// Test routes
router.get("/test/topics", a1Test.getTopics);
router.get("/test/progress/:topicId", a1Test.getTopicProgress);
router.get("/test/set/:topicId/:level/:setNumber", a1Test.getTestSet);
router.post("/test/submit", a1Test.submitTest);
router.get("/test/review/:topicId", a1Test.getReviewData);
router.get("/test/:topicId/:level/results", a1Test.getTestResults);

module.exports = router;
