/**
 * AI Math & Engineering Exam Storage & Firebase Sync Service (Book 21701)
 * - Uses isolated Firestore collections (python_ai_exam_config / python_ai_exam_submissions)
 *   and isolated LocalStorage keys so it never conflicts with sql_exam
 * - Supports single & bulk selected student deletion (deleteSubmission / deleteSelectedSubmissions)
 */
(function (global) {
  'use strict';

  const CATEGORIES = (global.AI_MATH_EXAM_CATEGORIES && global.AI_MATH_EXAM_CATEGORIES.length) ? global.AI_MATH_EXAM_CATEGORIES : [
    '1. 파이썬 프로그래밍의 기초, 자료형',
    '2. 프로그램의 구조를 쌓는다! 제어문',
    '3. 파이썬의 입출력',
    '4. 파이썬 날개 달기',
    '5. 파이썬 프로그래밍, 어떻게 시작해야 할까?',
    '6. 판다스',
    '7. 넘파이',
    '8. ML/DL'
  ];

  const LS_KEYS = {
    SUBMISSIONS: 'dmdg_python_ai_exam_submissions_v1',
    SETTINGS: 'dmdg_python_ai_exam_settings_v1',
    CUSTOM_QUESTIONS: 'dmdg_python_ai_exam_custom_questions_v1',
    DEVICE_ID: 'dmdg_python_ai_exam_device_id_v1',
    ACTIVE_SESSION: 'dmdg_python_ai_exam_active_session_v1',
  };

  const ALLOWED_STUDENTS = [
    '구명회', '김윤준', '김제형', '김지선', '남유진', '방호원',
    '백선병', '신상아', '오주원', '이인애', '정호연', '조진훈'
  ];

  const ALLOWED_EXAM_DATE = '2026-11-05';

  const DEFAULT_SETTINGS = {
    examTitle: '파이썬 판다스·넘파이·ML/DL 역량 평가 (총 145문항)',
    choiceTimeLimit: 60,        // 객관식 1문항 1분 (60초)
    passScore: 80,              // 합격 기준 점수 (100점 환산 기준 80점)
    shuffleQuestions: true,     // 응시자마다 문제 순서 섞기
    blockDuplicateDevice: true, // 동일인(동일 이름 또는 동일 기기) 재응시 차단
    enforceAllowedStudents: true, // 12명 지정 명단 외 응시 불가
    enforceExamDate: true,      // 2026-11-05 당일만 응시 허용
    allowedExamDate: ALLOWED_EXAM_DATE,
    allowedStudents: ALLOWED_STUDENTS,
    examOpen: true,             // 시험 응시 열림/닫힘
    showExplanationOnResult: true,
    updatedAt: new Date().toISOString(),
  };

  const firebaseConfig = {
    apiKey: 'AIzaSyBcS8aS5yHk2KFNYPImXslsFkSyoBwYrKI',
    authDomain: 'dmdg-live.firebaseapp.com',
    projectId: 'dmdg-live',
    storageBucket: 'dmdg-live.firebasestorage.app',
    messagingSenderId: '357433220336',
    appId: '1:357433220336:web:1a8914811da09123a0f635',
  };

  let firestoreDb = null;
  let broadcastChannel = null;

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel('dmdg_python_ai_exam_channel');
    }
  } catch (_) {}

  function initFirebase() {
    if (firestoreDb) return firestoreDb;
    try {
      if (typeof global.firebase !== 'undefined') {
        if (!global.firebase.apps || !global.firebase.apps.length) {
          global.firebase.initializeApp(firebaseConfig);
        }
        if (typeof global.firebase.firestore === 'function') {
          firestoreDb = global.firebase.firestore();
        }
      }
    } catch (err) {
      console.warn('[StorageService] Firebase init notice:', err);
    }
    return firestoreDb;
  }

  function getDeviceId() {
    let devId = localStorage.getItem(LS_KEYS.DEVICE_ID);
    if (!devId) {
      const rand = Math.random().toString(36).substring(2, 10);
      devId = 'DEV-' + Date.now().toString(36).toUpperCase() + '-' + rand.toUpperCase();
      localStorage.setItem(LS_KEYS.DEVICE_ID, devId);
    }
    return devId;
  }

  function getSettings() {
    try {
      const raw = localStorage.getItem(LS_KEYS.SETTINGS);
      if (raw) {
        return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
      }
    } catch (_) {}
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  async function fetchSettingsFromCloud() {
    const db = initFirebase();
    if (!db) return getSettings();
    try {
      const doc = await db.collection('python_ai_exam_config').doc('settings').get();
      if (doc.exists) {
        const merged = Object.assign({}, DEFAULT_SETTINGS, doc.data());
        localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(merged));
        return merged;
      }
    } catch (_) {}
    return getSettings();
  }

  async function saveSettings(newSettings) {
    const merged = Object.assign({}, getSettings(), newSettings, {
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(merged));
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SETTINGS_UPDATED', payload: merged });
    }
    const db = initFirebase();
    if (db) {
      try {
        await db.collection('python_ai_exam_config').doc('settings').set(merged, { merge: true });
      } catch (err) {
        console.warn('[StorageService] Cloud settings save skipped:', err.message);
      }
    }
    return merged;
  }

  function normalizeQuestionsList(rawArr) {
    if (!Array.isArray(rawArr) || rawArr.length === 0) return [];
    const isZeroBased = rawArr.some(function (q) { return Number(q.answer) === 0; });
    return rawArr.map(function (q, idx) {
      const rawAns = Number(q.answer);
      const ans1Based = isZeroBased ? (rawAns + 1) : rawAns;
      return {
        id: typeof q.id === 'number' ? ('Q-' + String(q.id).padStart(3, '0')) : String(q.id || ('Q-' + (idx + 1))),
        no: q.no || (idx + 1),
        category: q.category || '',
        chapter: q.chapter || q.day || ('Part ' + (idx + 1)),
        type: 'choice',
        timeLimit: q.timeLimit || 60,
        points: q.points || 2,
        title: q.title || q.question || '',
        description: q.description !== undefined ? q.description : (q.code || ''),
        options: Array.isArray(q.options) ? q.options : [],
        answer: ans1Based,
        explanation: q.explanation || ''
      };
    });
  }

  function getQuestions() {
    try {
      const customRaw = localStorage.getItem(LS_KEYS.CUSTOM_QUESTIONS);
      if (customRaw) {
        const parsed = JSON.parse(customRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeQuestionsList(parsed);
        }
      }
    } catch (_) {}
    const src = global.SQL_EXAM_QUESTIONS || global.AI_DATA_EXAM_QUESTIONS || global.PYTHON_AI_EXAM_QUESTIONS || global.AI_MATH_EXAM_QUESTIONS || [];
    return normalizeQuestionsList(src);
  }

  function saveCustomQuestions(questionsArray) {
    if (!Array.isArray(questionsArray)) return false;
    localStorage.setItem(LS_KEYS.CUSTOM_QUESTIONS, JSON.stringify(questionsArray));
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'QUESTIONS_UPDATED' });
    }
    return true;
  }

  function resetQuestionsToDefault() {
    localStorage.removeItem(LS_KEYS.CUSTOM_QUESTIONS);
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'QUESTIONS_UPDATED' });
    }
    return getQuestions();
  }

  function getLocalSubmissions() {
    try {
      const raw = localStorage.getItem(LS_KEYS.SUBMISSIONS);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (_) {}
    return [];
  }

  function saveLocalSubmissions(list) {
    localStorage.setItem(LS_KEYS.SUBMISSIONS, JSON.stringify(list));
  }

  function recomputeSubmissionSummary(submission, passScoreOverride) {
    const settings = getSettings();
    const passScore = typeof passScoreOverride === 'number' ? passScoreOverride : settings.passScore;
    const details = Array.isArray(submission.details) ? submission.details : [];

    let earnedPoints = 0;
    let maxPoints = 0;
    let correctCount = 0;
    let timeoutCount = 0;
    let totalElapsedSec = 0;

    const areaStats = {};
    CATEGORIES.forEach(function (c) {
      areaStats[c] = { earned: 0, max: 0, correct: 0, total: 0 };
    });

    details.forEach(function (d) {
      const pts = Number(d.score) || 0;
      const mPts = Number(d.maxPoints) || 2;
      earnedPoints += pts;
      maxPoints += mPts;
      if (pts >= mPts) correctCount += 1;
      if (d.timedOut) timeoutCount += 1;
      totalElapsedSec += Number(d.elapsedSec) || 0;

      const cat = d.category || CATEGORIES[0];
      if (!areaStats[cat]) {
        areaStats[cat] = { earned: 0, max: 0, correct: 0, total: 0 };
      }
      areaStats[cat].earned += pts;
      areaStats[cat].max += mPts;
      if (pts >= mPts) areaStats[cat].correct += 1;
      areaStats[cat].total += 1;
    });

    const normalizedScore = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 1000) / 10 : 0;
    const passed = normalizedScore >= passScore;

    submission.earnedPoints = earnedPoints;
    submission.maxPoints = maxPoints;
    submission.score100 = normalizedScore;
    submission.correctCount = correctCount;
    submission.totalQuestions = details.length;
    submission.passed = passed;
    submission.choiceEarned = earnedPoints;
    submission.choiceMax = maxPoints;
    submission.sqlEarned = 0;
    submission.sqlMax = 0;
    submission.timeoutCount = timeoutCount;
    submission.totalElapsedSec = totalElapsedSec;
    submission.pendingReviewCount = 0;
    submission.areaStats = areaStats;
    return submission;
  }

  async function saveSubmission(submissionData) {
    const list = getLocalSubmissions();
    const deviceId = getDeviceId();
    const cleanName = String(submissionData.studentName || '').trim();

    const isDuplicateName = list.some(function (s) {
      return String(s.studentName || '').trim() === cleanName;
    });
    const isDuplicateDevice = list.some(function (s) {
      return s.deviceId === deviceId;
    });

    const record = Object.assign({}, submissionData, {
      id: submissionData.id || 'AIMATH-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      deviceId: deviceId,
      isDuplicateName: isDuplicateName,
      isDuplicateDevice: isDuplicateDevice,
      submittedAt: submissionData.submittedAt || new Date().toISOString(),
    });

    recomputeSubmissionSummary(record);

    list.unshift(record);
    saveLocalSubmissions(list);

    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SUBMISSION_ADDED', payload: record });
    }

    const db = initFirebase();
    if (db) {
      try {
        await db.collection('python_ai_exam_submissions').doc(record.id).set(record);
      } catch (err) {
        console.warn('[StorageService] Firestore save skipped (local saved):', err.message);
      }
    }

    return record;
  }

  async function fetchAllSubmissions() {
    const localList = getLocalSubmissions();
    const db = initFirebase();
    if (!db) return localList;

    try {
      const snap = await db
        .collection('python_ai_exam_submissions')
        .orderBy('submittedAt', 'desc')
        .limit(500)
        .get();

      if (!snap.empty) {
        const mapById = new Map();
        localList.forEach(function (item) {
          mapById.set(item.id, item);
        });
        snap.docs.forEach(function (doc) {
          const cloudData = doc.data();
          if (cloudData && cloudData.id) {
            mapById.set(cloudData.id, cloudData);
          }
        });
        const merged = Array.from(mapById.values()).sort(function (a, b) {
          return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
        });
        saveLocalSubmissions(merged);
        return merged;
      }
    } catch (err) {
      console.warn('[StorageService] Using local submissions cache:', err.message);
    }

    return localList;
  }

  async function deleteSubmission(submissionId) {
    const list = getLocalSubmissions().filter(function (s) {
      return s.id !== submissionId;
    });
    saveLocalSubmissions(list);
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SUBMISSION_DELETED', payload: submissionId });
    }
    const db = initFirebase();
    if (db) {
      try {
        await db.collection('python_ai_exam_submissions').doc(submissionId).delete();
      } catch (_) {}
    }
    return list;
  }

  async function deleteSelectedSubmissions(submissionIds) {
    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return getLocalSubmissions();
    }
    const idSet = new Set(submissionIds);
    const list = getLocalSubmissions().filter(function (s) {
      return !idSet.has(s.id);
    });
    saveLocalSubmissions(list);
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SUBMISSIONS_BULK_DELETED', payload: submissionIds });
    }
    const db = initFirebase();
    if (db) {
      try {
        const batch = db.batch();
        submissionIds.forEach(function (id) {
          const ref = db.collection('python_ai_exam_submissions').doc(id);
          batch.delete(ref);
        });
        await batch.commit();
      } catch (err) {
        console.warn('[StorageService] Cloud batch delete warning:', err.message);
      }
    }
    return list;
  }

  async function clearAllSubmissions() {
    saveLocalSubmissions([]);
    localStorage.setItem('dmdg_python_ai_exam_demo_seeded_v1', '1');
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SUBMISSIONS_CLEARED' });
    }
    const db = initFirebase();
    if (db) {
      try {
        const snap = await db.collection('python_ai_exam_submissions').limit(500).get();
        if (!snap.empty) {
          const batch = db.batch();
          snap.docs.forEach(function (doc) {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
      } catch (err) {
        console.warn('[StorageService] Cloud clear warning:', err.message);
      }
    }
    return [];
  }

  function seedDemoSubmissions() {
    const allQs = getQuestions();
    const sampleStudents = [
      { name: '김민준', accuracy: 0.94, mode: '전체 5대 파트 (75문항)', targetQs: allQs },
      { name: '이서연', accuracy: 0.88, mode: '전체 5대 파트 (75문항)', targetQs: allQs },
      { name: '박지훈', accuracy: 0.83, mode: '전체 5대 파트 (75문항)', targetQs: allQs },
      { name: '최수빈', accuracy: 0.76, mode: 'Part 1. 선형대수학 (15문항)', targetQs: allQs.slice(0, 15) },
      { name: '정우성', accuracy: 0.91, mode: '전체 5대 파트 (75문항)', targetQs: allQs },
      { name: '강하늘', accuracy: 0.65, mode: 'Part 2. 미적분 & 최적화 (15문항)', targetQs: allQs.slice(15, 30) },
      { name: '윤채원', accuracy: 0.85, mode: '전체 5대 파트 (75문항)', targetQs: allQs },
      { name: '임도현', accuracy: 0.54, mode: 'Part 4. 이산수학 & 상태 그래프 (15문항)', targetQs: allQs.slice(45, 60) },
    ];

    const now = Date.now();
    const list = getLocalSubmissions();

    sampleStudents.forEach(function (stu, idx) {
      const details = stu.targetQs.map(function (q, qIdx) {
        const difficultyMod = (q.no % 7 === 0) ? -0.22 : (q.no % 5 === 0 ? -0.1 : 0.05);
        const prob = Math.min(0.98, Math.max(0.15, stu.accuracy + difficultyMod));
        const deterministicSeed = Math.sin((idx + 1) * 97 + (qIdx + 1) * 31) * 10000;
        const randVal = deterministicSeed - Math.floor(deterministicSeed);
        const isCorrect = randVal < prob;
        const timedOut = !isCorrect && randVal > 0.92;
        const maxPts = q.points || 2;
        const score = isCorrect ? maxPts : 0;
        const elapsedSec = timedOut ? 60 : Math.max(8, Math.min(57, Math.round(22 + randVal * 30)));
        const userAns = timedOut ? null : (isCorrect ? q.answer : ((q.answer % 4) + 1));

        return {
          questionId: q.id,
          no: q.no,
          category: q.category,
          chapter: q.chapter,
          type: 'choice',
          userAnswer: userAns,
          correctAnswer: q.answer,
          isCorrect: isCorrect,
          score: score,
          maxPoints: maxPts,
          methodUsed: isCorrect ? '정답 일치' : '오답 선택',
          elapsedSec: elapsedSec,
          timedOut: timedOut,
          needsReview: false,
          adminReviewed: false,
        };
      });

      const sub = {
        id: 'DEMO-SUB-' + (idx + 1) + '-' + Date.now().toString(36),
        studentName: stu.name,
        examCategoryFilter: 'ALL',
        examTypeFilter: 'choice',
        examModeLabel: stu.mode,
        deviceId: 'DEMO-DEV-0' + (idx + 1),
        isDuplicateName: false,
        isDuplicateDevice: false,
        submittedAt: new Date(now - (sampleStudents.length - idx) * 15 * 60 * 1000).toISOString(),
        details: details,
      };

      recomputeSubmissionSummary(sub);
      list.unshift(sub);
    });

    saveLocalSubmissions(list);
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SUBMISSION_ADDED' });
    }
    return list;
  }

  function getActiveSession() {
    try {
      const raw = sessionStorage.getItem(LS_KEYS.ACTIVE_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveActiveSession(sessionObj) {
    try {
      if (!sessionObj) {
        sessionStorage.removeItem(LS_KEYS.ACTIVE_SESSION);
      } else {
        sessionStorage.setItem(LS_KEYS.ACTIVE_SESSION, JSON.stringify(sessionObj));
      }
    } catch (_) {}
  }

  function onSyncMessage(callback) {
    if (broadcastChannel && typeof callback === 'function') {
      broadcastChannel.addEventListener('message', function (ev) {
        callback(ev.data);
      });
    }
    global.addEventListener('storage', function (ev) {
      if (
        ev.key === LS_KEYS.SUBMISSIONS ||
        ev.key === LS_KEYS.SETTINGS ||
        ev.key === LS_KEYS.CUSTOM_QUESTIONS
      ) {
        if (typeof callback === 'function') {
          callback({ type: 'STORAGE_EVENT', key: ev.key });
        }
      }
    });
  }

  global.SqlExamStorage = {
    CATEGORIES: CATEGORIES,
    ALLOWED_STUDENTS: ALLOWED_STUDENTS,
    ALLOWED_EXAM_DATE: ALLOWED_EXAM_DATE,
    getDeviceId: getDeviceId,
    getSettings: getSettings,
    fetchSettingsFromCloud: fetchSettingsFromCloud,
    saveSettings: saveSettings,
    getQuestions: getQuestions,
    saveCustomQuestions: saveCustomQuestions,
    resetQuestionsToDefault: resetQuestionsToDefault,
    getLocalSubmissions: getLocalSubmissions,
    fetchAllSubmissions: fetchAllSubmissions,
    saveSubmission: saveSubmission,
    deleteSubmission: deleteSubmission,
    deleteSelectedSubmissions: deleteSelectedSubmissions,
    clearAllSubmissions: clearAllSubmissions,
    seedDemoSubmissions: seedDemoSubmissions,
    recomputeSubmissionSummary: recomputeSubmissionSummary,
    getActiveSession: getActiveSession,
    saveActiveSession: saveActiveSession,
    onSyncMessage: onSyncMessage,
  };
})(window);
