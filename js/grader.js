/**
 * AI Math & Engineering Exam Auto-Grader Engine (Book 21701)
 * - Objective (choice): Exact option index match (1..4)
 */
(function (global) {
  'use strict';

  async function initSqlEngine() {
    return null;
  }

  async function gradeQuestion(question, userAnswer, meta) {
    const extra = meta || {};
    const maxPts = question.points || 2;
    const elapsedSec = typeof extra.elapsedSec === 'number' ? extra.elapsedSec : 0;
    const timedOut = Boolean(extra.timedOut);

    const userChoice = Number(userAnswer);
    const correctChoice = Number(question.answer);
    const isCorrect = !Number.isNaN(userChoice) && userChoice === correctChoice;

    return {
      questionId: question.id,
      no: question.no,
      category: question.category,
      chapter: question.chapter,
      type: 'choice',
      userAnswer: Number.isNaN(userChoice) || userChoice === 0 ? null : userChoice,
      correctAnswer: correctChoice,
      isCorrect: isCorrect,
      score: isCorrect ? maxPts : 0,
      maxPoints: maxPts,
      elapsedSec: elapsedSec,
      timedOut: timedOut,
      methodUsed: isCorrect ? '정답 일치' : userChoice ? '오답 선택' : '미선택(시간초과)',
      needsReview: false,
    };
  }

  global.SqlExamGrader = {
    initSqlEngine: initSqlEngine,
    gradeQuestion: gradeQuestion,
  };
})(window);

