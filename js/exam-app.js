/**
 * AI Math & Engineering Exam Student Application Logic (Book 21701)
 * - Supports 5 Part filters (15 questions each) or ALL (75 questions)
 * - Per-question strict countdown timer (60s)
 * - Auto-submits and advances to the next question on timeout or '다음' button click
 * - Blocks backward navigation, hides explanations until finished, and blocks text selection/copying/shortcuts
 */
(function (global) {
  'use strict';

  const SHORT_CAT_LABELS = {
    ALL: '전체 8대 파트 (145문항)',
    '1. 파이썬 프로그래밍의 기초, 자료형': 'Part 1. 파이썬 기초·자료형',
    '파이썬 프로그래밍의 기초, 자료형': 'Part 1. 파이썬 기초·자료형',
    '2. 프로그램의 구조를 쌓는다! 제어문': 'Part 2. 파이썬 제어문',
    '프로그램의 구조를 쌓는다! 제어문': 'Part 2. 파이썬 제어문',
    '3. 파이썬의 입출력': 'Part 3. 파이썬 입출력·함수',
    '파이썬의 입출력': 'Part 3. 파이썬 입출력·함수',
    '4. 파이썬 날개 달기': 'Part 4. 클래스·모듈·예외·내장함수',
    '파이썬 날개 달기': 'Part 4. 클래스·모듈·예외·내장함수',
    '5. 파이썬 프로그래밍, 어떻게 시작해야 할까?': 'Part 5. 실전 문제해결·정규표현식',
    '파이썬 프로그래밍, 어떻게 시작해야 할까?': 'Part 5. 실전 문제해결·정규표현식',
    '6. 판다스': 'Part 6. 판다스 (Pandas)',
    '판다스': 'Part 6. 판다스 (Pandas)',
    '7. 넘파이': 'Part 7. 넘파이 (NumPy)',
    '넘파이': 'Part 7. 넘파이 (NumPy)',
    '8. ML/DL': 'Part 8. 머신러닝 & 딥러닝 (ML/DL)',
    'ML/DL': 'Part 8. 머신러닝 & 딥러닝 (ML/DL)'
  };

  let selectedCategory = 'ALL';
  let examSession = null;
  let timerIntervalId = null;
  let currentSelectedChoice = null;
  let isSubmittingQuestion = false;
  let lastFinishedSubmission = null;
  let currentReviewFilter = 'all';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function showToast(msg) {
    const toastEl = document.getElementById('toast-notification');
    const msgEl = document.getElementById('toast-message');
    if (!toastEl || !msgEl) return;
    msgEl.textContent = msg;
    toastEl.classList.remove('hidden');
    setTimeout(function () {
      toastEl.classList.add('hidden');
    }, 3200);
  }

  function normCat(str) {
    return String(str || '').replace(/^\d+\.\s*/, '').trim();
  }
  function getFilteredQuestions(categoryFilter) {
    const allQs = global.SqlExamStorage.getQuestions();
    return allQs.filter(function (q) {
      return categoryFilter === 'ALL' || q.category === categoryFilter || normCat(q.category) === normCat(categoryFilter);
    });
  }

  function updateStartFilterSummaryUI() {
    const settings = global.SqlExamStorage.getSettings();
    const catButtons = document.querySelectorAll('#category-select-group .cat-opt-btn');
    catButtons.forEach(function (btn) {
      const isSelected = btn.getAttribute('data-cat') === selectedCategory;
      btn.className = isSelected
        ? 'cat-opt-btn bg-indigo-600 text-white border border-indigo-400 font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-between shadow-md shadow-indigo-500/20'
        : 'cat-opt-btn bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-between';
    });

    const matchedQs = getFilteredQuestions(selectedCategory);
    const catLabel = SHORT_CAT_LABELS[selectedCategory] || selectedCategory;
    const perQuestionSec = settings.choiceTimeLimit || 60;
    const totalMinutes = Math.round((matchedQs.length * perQuestionSec) / 60);

    const titleEl = document.getElementById('start-summary-title');
    const timeEl = document.getElementById('start-summary-time');
    if (titleEl) {
      titleEl.textContent = catLabel + ' · 객관식 ' + matchedQs.length + '문항';
    }
    if (timeEl) {
      timeEl.textContent = '최대 ' + totalMinutes + '분 (문항당 ' + perQuestionSec + '초)';
    }
  }

  function selectStartFilter(kind, value) {
    if (kind === 'category') {
      selectedCategory = value;
    }
    updateStartFilterSummaryUI();
  }

  function quickSelectPreset(category) {
    selectedCategory = category;
    updateStartFilterSummaryUI();
    const nameInput = document.getElementById('input-student-name');
    if (nameInput) {
      nameInput.focus();
    }
    const shortName = SHORT_CAT_LABELS[category] || category;
    showToast('[' + shortName + ' - 선택 파트] 구성이 선택되었습니다. 이름을 입력하고 시작하세요!');
  }

  const ALLOWED_STUDENTS = [
    '구명회', '김윤준', '김제형', '김지선', '남유진', '방호원',
    '백선병', '신상아', '오주원', '이인애', '정호연', '조진훈'
  ];
  const ALLOWED_EXAM_DATE = '2026-11-09';

  function getKstDateString() {
    try {
      const now = new Date();
      const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      return kstTime.toISOString().slice(0, 10);
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  async function startExamSession() {
    const errorEl = document.getElementById('start-error-msg');
    if (errorEl) errorEl.classList.add('hidden');

    const nameInput = document.getElementById('input-student-name');
    const studentName = nameInput ? nameInput.value.trim() : '';
    if (!studentName) {
      if (errorEl) {
        errorEl.textContent = '응시자 성명을 입력해 주세요.';
        errorEl.classList.remove('hidden');
      }
      if (nameInput) nameInput.focus();
      return;
    }

    const normalizedInputName = studentName.replace(/\s+/g, '');
    const settings = await global.SqlExamStorage.fetchSettingsFromCloud();

    // 1. 12명 지정 응시자 명단 검증 (구명회, 김윤준, 김제형, 김지선, 남유진, 방호원, 백선병, 신상아, 오주원, 이인애, 정호연, 조진훈)
    const allowedList = Array.isArray(settings.allowedStudents) && settings.allowedStudents.length > 0
      ? settings.allowedStudents
      : ALLOWED_STUDENTS;
    if (settings.enforceAllowedStudents !== false) {
      if (!allowedList.includes(normalizedInputName)) {
        if (errorEl) {
          errorEl.textContent = '⛔ 사전 등록된 교육생 명단 이외의 사람은 응시할 수 없습니다. 성명을 정확히 입력해 주세요.';
          errorEl.classList.remove('hidden');
        }
        showToast('⛔ 사전 등록된 응시 대상자가 아닙니다.');
        return;
      }
    }

    // 2. 응시 지정일 (2026-11-09 하루만) 검증
    const targetDate = ALLOWED_EXAM_DATE;
    const todayKst = getKstDateString();
    if (settings.enforceExamDate !== false && todayKst !== targetDate) {
      if (errorEl) {
        errorEl.textContent = '⛔ 본 평가는 지정된 시험일(2026.11.09 하루만)에만 응시 가능합니다. (현재 한국 시각 기준 일자: ' + todayKst + ')';
        errorEl.classList.remove('hidden');
      }
      showToast('⛔ 2026.11.09 당일에만 응시할 수 있습니다.');
      return;
    }

    if (!settings.examOpen) {
      if (errorEl) {
        errorEl.textContent = '현재 관리자에 의해 시험 응시가 일시 마감되었습니다.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    if (settings.blockDuplicateDevice !== false) {
      const existingDeviceId = global.SqlExamStorage.getDeviceId();
      const allSubs = await global.SqlExamStorage.fetchAllSubmissions();
      const normName = studentName.replace(/\s+/g, '').toLowerCase();

      const dupNameSub = allSubs.find(function (s) {
        return String(s.studentName || '').replace(/\s+/g, '').toLowerCase() === normName;
      });
      if (dupNameSub) {
        if (errorEl) {
          errorEl.textContent =
            '이미 [' + studentName + '] 성명으로 제출된 응시 기록이 존재하여 재응시가 불가능합니다. (재응시가 필요한 경우 관리자에게 기록 삭제를 요청하세요)';
          errorEl.classList.remove('hidden');
        }
        return;
      }

      const dupDeviceSub = allSubs.find(function (s) {
        return s.deviceId && s.deviceId === existingDeviceId;
      });
      if (dupDeviceSub) {
        if (errorEl) {
          errorEl.textContent =
            '이미 이 기기(브라우저)에서 [' + dupDeviceSub.studentName + '] 성명으로 시험을 응시하셨습니다. 동일 기기 재응시는 불가능합니다.';
          errorEl.classList.remove('hidden');
        }
        return;
      }
    }

    let pool = getFilteredQuestions(selectedCategory);
    if (pool.length === 0) {
      if (errorEl) {
        errorEl.textContent = '선택한 조건에 해당하는 문제가 없습니다.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    pool = pool.map(function (q) {
      return Object.assign({}, q, {
        timeLimit: settings.choiceTimeLimit || 60,
      });
    });

    if (settings.shuffleQuestions !== false) {
      pool = shuffleArray(pool);
    }

    const catLabel = SHORT_CAT_LABELS[selectedCategory] || selectedCategory;

    examSession = {
      studentName: studentName,
      categoryFilter: selectedCategory,
      typeFilter: 'choice',
      modeLabel: catLabel + ' (' + pool.length + '문항)',
      questions: pool,
      currentIndex: 0,
      questionStartedAt: Date.now(),
      details: [],
      startedAt: new Date().toISOString(),
    };

    global.SqlExamStorage.saveActiveSession(examSession);
    enterExamView();
  }

  function enterExamView() {
    document.getElementById('view-start').classList.add('hidden');
    document.getElementById('view-result').classList.add('hidden');
    document.getElementById('view-exam').classList.remove('hidden');

    const headerStatus = document.getElementById('header-exam-status');
    headerStatus.classList.remove('hidden');
    headerStatus.classList.add('flex');

    document.getElementById('timer-bar-wrap').classList.remove('hidden');
    document.getElementById('header-student-name').textContent = examSession.studentName;
    document.getElementById('sidebar-mode-badge').textContent = examSession.modeLabel;

    renderCurrentExamQuestion();
  }

  function renderSidebarGrid() {
    const gridEl = document.getElementById('exam-q-grid');
    if (!gridEl || !examSession) return;
    gridEl.innerHTML = '';

    examSession.questions.forEach(function (q, idx) {
      const pill = document.createElement('div');
      const isDone = idx < examSession.currentIndex;
      const isCurrent = idx === examSession.currentIndex;

      let cls =
        'h-8 rounded-lg text-xs code-font font-bold flex items-center justify-center select-none border ';
      if (isCurrent) {
        cls += 'bg-cyan-500/25 text-cyan-300 border-cyan-400 ring-2 ring-cyan-500/30';
      } else if (isDone) {
        cls += 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 opacity-80';
      } else {
        cls += 'bg-slate-900/80 text-slate-500 border-slate-800';
      }
      pill.className = cls;
      pill.textContent = String(idx + 1).padStart(2, '0');
      gridEl.appendChild(pill);
    });
  }

  function renderCurrentExamQuestion() {
    if (!examSession) return;
    const idx = examSession.currentIndex;
    const total = examSession.questions.length;
    const q = examSession.questions[idx];
    if (!q) return;

    currentSelectedChoice = null;
    isSubmittingQuestion = false;

    renderSidebarGrid();

    document.getElementById('progress-text').textContent = (idx + 1) + ' / ' + total;

    const catBadge = document.getElementById('q-category-badge');
    const shortCat = SHORT_CAT_LABELS[q.category] || q.category;
    catBadge.textContent = shortCat + ' (' + (q.chapter || '') + ')';

    const typeBadge = document.getElementById('q-type-badge');
    const limitSec = q.timeLimit || 60;
    const limitMinLabel = limitSec % 60 === 0 ? (limitSec / 60) + '분' : limitSec + '초';
    typeBadge.textContent = '객관식 4지선다 (제한시간 ' + limitMinLabel + ')';

    document.getElementById('q-number-label').textContent =
      '문항 ' + String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');

    document.getElementById('q-title').textContent = q.title;
    const descBox = document.getElementById('q-desc-box');
    const descEl = document.getElementById('q-desc');
    if (q.description && q.description.trim()) {
      descEl.textContent = q.description;
      descBox.classList.remove('hidden');
    } else {
      descEl.textContent = '';
      descBox.classList.add('hidden');
    }

    const choiceContainer = document.getElementById('choice-options-container');
    choiceContainer.classList.remove('hidden');
    choiceContainer.innerHTML = '';

    (q.options || []).forEach(function (optText, optIndex) {
      const optNum = optIndex + 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'option-btn w-full text-left p-4 rounded-xl border border-slate-700 bg-slate-900/80 flex items-start gap-3.5 group select-none';
      btn.onclick = function () {
        selectChoiceOption(optNum);
      };
      btn.setAttribute('data-opt', String(optNum));

      const numCircle = document.createElement('span');
      numCircle.className =
        'opt-circle w-7 h-7 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 code-font text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 transition';
      numCircle.textContent = String(optNum);

      const textSpan = document.createElement('span');
      textSpan.className = 'text-sm sm:text-base text-slate-200 leading-relaxed flex-grow select-none';
      textSpan.textContent = optText;

      btn.appendChild(numCircle);
      btn.appendChild(textSpan);
      choiceContainer.appendChild(btn);
    });

    const nextBtnText = document.getElementById('next-submit-btn-text');
    if (nextBtnText) {
      if (idx === total - 1) {
        nextBtnText.textContent = '마지막 답안 제출 및 채점 결과 보기';
      } else {
        nextBtnText.textContent = '다음 문제 (자동 제출)';
      }
    }

    startQuestionTimer(limitSec);
  }

  function selectChoiceOption(optNum) {
    currentSelectedChoice = optNum;
    const buttons = document.querySelectorAll('#choice-options-container .option-btn');
    buttons.forEach(function (btn) {
      const n = Number(btn.getAttribute('data-opt'));
      const circle = btn.querySelector('.opt-circle');
      if (n === optNum) {
        btn.classList.add('selected');
        if (circle) {
          circle.className =
            'opt-circle w-7 h-7 rounded-lg bg-cyan-500 border border-cyan-300 text-slate-950 code-font text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 transition';
        }
      } else {
        btn.classList.remove('selected');
        if (circle) {
          circle.className =
            'opt-circle w-7 h-7 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 code-font text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 transition';
        }
      }
    });
  }

  function startQuestionTimer(limitSeconds) {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }

    function tick() {
      if (!examSession) return;
      const elapsedMs = Date.now() - examSession.questionStartedAt;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const remainingSec = Math.max(0, limitSeconds - elapsedSec);

      updateTimerDisplayUI(remainingSec, limitSeconds);

      if (remainingSec <= 0) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        submitCurrentQuestionAndAdvance(true);
      }
    }

    tick();
    timerIntervalId = setInterval(tick, 250);
  }

  function updateTimerDisplayUI(remainingSec, totalSec) {
    const dispEl = document.getElementById('timer-display');
    const barEl = document.getElementById('timer-bar');
    const ringEl = document.getElementById('timer-ring');

    const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const secs = String(remainingSec % 60).padStart(2, '0');
    if (dispEl) {
      dispEl.textContent = mins + ':' + secs;
    }

    const pct = totalSec > 0 ? Math.max(0, (remainingSec / totalSec) * 100) : 0;
    if (barEl) {
      barEl.style.width = pct + '%';
    }

    if (ringEl) {
      const offset = 94.2 - (94.2 * pct) / 100;
      ringEl.setAttribute('stroke-dashoffset', String(offset));
    }

    const isWarning = remainingSec <= 15;
    if (dispEl) {
      if (isWarning) dispEl.classList.add('timer-warning');
      else dispEl.classList.remove('timer-warning');
    }
    if (barEl) {
      barEl.className = isWarning
        ? 'bg-rose-500 h-full transition-all duration-300 ease-linear'
        : 'bg-gradient-to-r from-cyan-400 via-indigo-500 to-emerald-400 h-full transition-all duration-300 ease-linear';
    }
    if (ringEl) {
      ringEl.setAttribute('stroke', isWarning ? '#f43f5e' : '#22d3ee');
    }
  }

  function handleNextButtonClick() {
    submitCurrentQuestionAndAdvance(false);
  }

  async function submitCurrentQuestionAndAdvance(isTimedOut) {
    if (!examSession || isSubmittingQuestion) return;
    isSubmittingQuestion = true;

    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }

    const idx = examSession.currentIndex;
    const q = examSession.questions[idx];
    const limitSec = q.timeLimit || 60;
    const rawElapsed = Math.round((Date.now() - examSession.questionStartedAt) / 1000);
    const elapsedSec = Math.max(1, Math.min(limitSec, rawElapsed));

    if (isTimedOut) {
      showToast(
        (idx + 1) + '번 문항 제한 시간(' + limitSec + '초)이 경과하여 자동 제출 후 다음 문제로 이동합니다.'
      );
    }

    const graded = await global.SqlExamGrader.gradeQuestion(q, currentSelectedChoice, {
      elapsedSec: elapsedSec,
      timedOut: Boolean(isTimedOut),
    });

    examSession.details.push(graded);

    if (idx + 1 < examSession.questions.length) {
      examSession.currentIndex = idx + 1;
      examSession.questionStartedAt = Date.now();
      global.SqlExamStorage.saveActiveSession(examSession);
      renderCurrentExamQuestion();
    } else {
      await finalizeExamSubmission();
    }
  }

  async function finalizeExamSubmission() {
    if (!examSession) return;
    global.SqlExamStorage.saveActiveSession(null);

    const savedSubmission = await global.SqlExamStorage.saveSubmission({
      studentName: examSession.studentName,
      examCategoryFilter: examSession.categoryFilter,
      examTypeFilter: 'choice',
      examModeLabel: examSession.modeLabel,
      startedAt: examSession.startedAt,
      submittedAt: new Date().toISOString(),
      details: examSession.details,
    });

    lastFinishedSubmission = savedSubmission;
    examSession = null;

    renderResultView(savedSubmission);
  }

  function renderResultView(submission) {
    document.getElementById('view-start').classList.add('hidden');
    document.getElementById('view-exam').classList.add('hidden');
    document.getElementById('view-result').classList.remove('hidden');

    const headerStatus = document.getElementById('header-exam-status');
    headerStatus.classList.add('hidden');
    headerStatus.classList.remove('flex');
    document.getElementById('timer-bar-wrap').classList.add('hidden');

    document.getElementById('res-student-name').textContent = submission.studentName;
    document.getElementById('res-mode-label').textContent = submission.examModeLabel || '';
    document.getElementById('res-score-100').textContent = String(submission.score100);
    document.getElementById('res-correct-Summary').textContent =
      submission.correctCount + ' / ' + submission.totalQuestions + '문항 (' + submission.earnedPoints + '/' + submission.maxPoints + '점)';

    const totalSec = submission.totalElapsedSec || 0;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    document.getElementById('res-elapsed-summary').textContent =
      '총 소요 시간: ' + mins + '분 ' + secs + '초 (시간초과 ' + (submission.timeoutCount || 0) + '문항)';

    const passBadge = document.getElementById('res-pass-badge');
    if (submission.passed) {
      passBadge.textContent = 'PASS (합격 · 80점 이상)';
      passBadge.className =
        'px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    } else {
      passBadge.textContent = 'FAIL (미달 · 80점 기준)';
      passBadge.className =
        'px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40';
    }

    const areaContainer = document.getElementById('res-area-cards');
    areaContainer.innerHTML = '';
    const areas = global.SqlExamStorage.CATEGORIES || [];
    areas.forEach(function (areaName) {
      const st = (submission.areaStats && submission.areaStats[areaName]) || {
        earned: 0,
        max: 0,
        correct: 0,
        total: 0,
      };
      const pct = st.max > 0 ? Math.round((st.earned / st.max) * 100) : 0;
      const shortLabel = SHORT_CAT_LABELS[areaName] || areaName;
      const card = document.createElement('div');
      card.className = 'bg-slate-950/80 border border-slate-800 rounded-xl p-4';
      card.innerHTML =
        '<div class="flex justify-between items-center mb-2">' +
        '<span class="text-xs font-bold text-slate-300">' + escapeHtml(shortLabel) + '</span>' +
        '<span class="code-font text-xs font-extrabold text-cyan-400">' +
        (st.total > 0 ? pct + '% (' + st.correct + '/' + st.total + ')' : '미응시') +
        '</span>' +
        '</div>' +
        '<div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">' +
        '<div class="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full rounded-full" style="width:' + pct + '%"></div>' +
        '</div>';
      areaContainer.appendChild(card);
    });

    currentReviewFilter = 'all';
    renderResultReviewList();
  }

  function filterResultReview(mode) {
    currentReviewFilter = mode;
    const btns = document.querySelectorAll('.res-filter-btn');
    btns.forEach(function (b) {
      const isAct = b.getAttribute('data-rfilter') === mode;
      b.className = isAct
        ? 'res-filter-btn bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition'
        : 'res-filter-btn bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition';
    });
    renderResultReviewList();
  }

  function renderResultReviewList() {
    const listEl = document.getElementById('res-review-list');
    if (!listEl || !lastFinishedSubmission) return;
    listEl.innerHTML = '';

    const allQuestions = global.SqlExamStorage.getQuestions();
    const allQuestionsMap = new Map();
    const userDetailsMap = new Map();
    allQuestions.forEach(function (q) {
      allQuestionsMap.set(q.id, q);
    });
    (lastFinishedSubmission.details || []).forEach(function (d) {
      userDetailsMap.set(d.questionId, d);
    });

    if (currentReviewFilter === 'bank') {
      allQuestions.forEach(function (q, idx) {
        const d = userDetailsMap.get(q.id) || null;
        const item = document.createElement('div');
        const borderCls = d ? (d.isCorrect ? 'border-emerald-500/30' : 'border-rose-500/40') : 'border-slate-800';
        item.className = 'bg-slate-950/85 border ' + borderCls + ' rounded-xl p-5 space-y-3';

        const statusBadge = d
          ? (d.isCorrect
              ? '<span class="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-bold">응시: 정답 (+' + d.score + '점)</span>'
              : '<span class="px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-xs font-bold">응시: 오답 (0점)</span>')
          : '<span class="px-2.5 py-0.5 rounded bg-slate-800 text-slate-400 text-xs font-semibold">문제은행 정답·해설</span>';

        const opts = q.options || [];
        const optionsListHtml =
          '<div class="grid grid-cols-1 gap-2 text-xs">' +
          opts.map(function (optStr, optIdx) {
            const optNum = optIdx + 1;
            const isCorrectOpt = Number(q.answer) === optNum;
            const isUserOpt = d && Number(d.userAnswer) === optNum;
            const boxCls = isCorrectOpt
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200 font-bold'
              : (isUserOpt ? 'bg-rose-950/40 border-rose-500/50 text-rose-200' : 'bg-slate-900/80 border-slate-800 text-slate-300');
            const badgeStr =
              (isCorrectOpt ? '<span class="ml-2 px-2 py-0.5 rounded bg-emerald-500/25 text-emerald-300 text-[11px] font-extrabold">정답</span>' : '') +
              (isUserOpt ? '<span class="ml-1.5 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[11px] font-bold">내 선택</span>' : '');
            return (
              '<div class="p-2.5 rounded-lg border ' + boxCls + ' flex items-center justify-between gap-2">' +
              '<span><strong class="code-font mr-1.5">' + optNum + '번.</strong>' + escapeHtml(optStr) + '</span>' +
              '<div class="shrink-0">' + badgeStr + '</div>' +
              '</div>'
            );
          }).join('') +
          '</div>';

        const descBlockHtml = q.description
          ? '<pre class="text-xs text-cyan-200 whitespace-pre-wrap bg-slate-900 p-3.5 rounded-lg border border-slate-800 leading-relaxed code-font">' + escapeHtml(q.description) + '</pre>'
          : '';

        const shortCat = SHORT_CAT_LABELS[q.category] || q.category;

        item.innerHTML =
          '<div class="flex flex-wrap justify-between items-center gap-2">' +
          '<div class="flex items-center gap-2">' +
          '<span class="code-font text-xs font-bold text-slate-400">#' + (idx + 1) + ' (' + escapeHtml(q.id) + ')</span>' +
          '<span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-semibold">' + escapeHtml(shortCat) + ' · ' + escapeHtml(q.chapter || '') + '</span>' +
          statusBadge +
          '</div>' +
          '<div class="text-xs font-bold text-emerald-400 code-font">정답: ' + escapeHtml(q.answer + '번') + '</div>' +
          '</div>' +
          '<div class="text-sm sm:text-base font-bold text-white leading-relaxed">' + escapeHtml(q.title || '') + '</div>' +
          descBlockHtml +
          optionsListHtml +
          '<div class="bg-indigo-950/30 border border-indigo-500/25 rounded-lg p-3.5 text-xs text-slate-200 leading-relaxed">' +
          '<span class="font-bold text-amber-400 mr-1.5"><i class="fa-solid fa-lightbulb"></i> 핵심 해설:</span>' +
          escapeHtml(q.explanation || '') +
          '</div>';

        listEl.appendChild(item);
      });
      return;
    }

    const details = (lastFinishedSubmission.details || []).filter(function (d) {
      if (currentReviewFilter === 'wrong') {
        return !d.isCorrect;
      }
      return true;
    });

    if (details.length === 0) {
      listEl.innerHTML =
        '<div class="text-center py-10 text-sm text-emerald-400 font-bold">축하합니다! 틀린 문항이 없습니다.</div>';
      return;
    }

    details.forEach(function (d, idx) {
      const q = allQuestionsMap.get(d.questionId) || {};
      const item = document.createElement('div');
      const borderCls = d.isCorrect ? 'border-emerald-500/30' : 'border-rose-500/40';
      item.className = 'bg-slate-950/85 border ' + borderCls + ' rounded-xl p-5 space-y-3';

      const statusBadge = d.isCorrect
        ? '<span class="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-bold">정답 (+' + d.score + '점)</span>'
        : '<span class="px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-xs font-bold">오답 (0점)</span>';

      const timeoutTag = d.timedOut
        ? '<span class="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[11px] font-semibold">시간초과 자동제출</span>'
        : '<span class="text-xs text-slate-400 code-font">' + d.elapsedSec + '초 소요</span>';

      const opts = q.options || [];
      const userOptText = d.userAnswer ? d.userAnswer + '번 — ' + (opts[d.userAnswer - 1] || '') : '미선택 (무응답)';
      const corrOptText = d.correctAnswer + '번 — ' + (opts[d.correctAnswer - 1] || '');
      const answerCompareHtml =
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">' +
        '<div class="bg-slate-900 p-3 rounded-lg border border-slate-800">' +
        '<div class="text-slate-400 mb-1">내가 선택한 답안:</div>' +
        '<div class="font-bold ' + (d.isCorrect ? 'text-emerald-400' : 'text-rose-400') + '">' + escapeHtml(userOptText) + '</div>' +
        '</div>' +
        '<div class="bg-slate-900 p-3 rounded-lg border border-slate-800">' +
        '<div class="text-slate-400 mb-1">정답 보기:</div>' +
        '<div class="font-bold text-emerald-400">' + escapeHtml(corrOptText) + '</div>' +
        '</div>' +
        '</div>';

      const optionsListHtml =
        '<div class="grid grid-cols-1 gap-1.5 text-xs">' +
        opts.map(function (optStr, optIdx) {
          const optNum = optIdx + 1;
          const isCorrectOpt = Number(d.correctAnswer) === optNum;
          const isUserOpt = Number(d.userAnswer) === optNum;
          const boxCls = isCorrectOpt
            ? 'bg-emerald-950/35 border-emerald-500/50 text-emerald-200 font-bold'
            : (isUserOpt ? 'bg-rose-950/35 border-rose-500/50 text-rose-200' : 'bg-slate-900/60 border-slate-800/80 text-slate-400');
          const badgeStr =
            (isCorrectOpt ? '<span class="ml-2 px-2 py-0.5 rounded bg-emerald-500/25 text-emerald-300 text-[11px] font-extrabold">정답</span>' : '') +
            (isUserOpt ? '<span class="ml-1.5 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[11px] font-bold">내 선택</span>' : '');
          return (
            '<div class="px-3 py-2 rounded-lg border ' + boxCls + ' flex items-center justify-between gap-2">' +
            '<span><strong class="code-font mr-1.5">' + optNum + '번.</strong>' + escapeHtml(optStr) + '</span>' +
            '<div class="shrink-0">' + badgeStr + '</div>' +
            '</div>'
          );
        }).join('') +
        '</div>';

      const descBlockHtml = q.description
        ? '<pre class="text-xs text-cyan-200 whitespace-pre-wrap bg-slate-900 p-3.5 rounded-lg border border-slate-800 leading-relaxed code-font">' + escapeHtml(q.description) + '</pre>'
        : '';

      const shortCat = SHORT_CAT_LABELS[d.category] || d.category;

      item.innerHTML =
        '<div class="flex flex-wrap justify-between items-center gap-2">' +
        '<div class="flex items-center gap-2">' +
        '<span class="code-font text-xs font-bold text-slate-400">#' + (idx + 1) + ' (' + escapeHtml(d.questionId) + ')</span>' +
        '<span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-semibold">' + escapeHtml(shortCat) + ' · ' + escapeHtml(q.chapter || '') + '</span>' +
        statusBadge +
        '</div>' +
        '<div>' + timeoutTag + '</div>' +
        '</div>' +
        '<div class="text-sm sm:text-base font-bold text-white leading-relaxed">' + escapeHtml(q.title || '') + '</div>' +
        descBlockHtml +
        optionsListHtml +
        answerCompareHtml +
        '<div class="bg-indigo-950/30 border border-indigo-500/25 rounded-lg p-3.5 text-xs text-slate-200 leading-relaxed">' +
        '<span class="font-bold text-amber-400 mr-1.5"><i class="fa-solid fa-lightbulb"></i> 핵심 해설:</span>' +
        escapeHtml(q.explanation || '') +
        '</div>';

      listEl.appendChild(item);
    });
  }

  async function handleVerifyAndShowAnswers() {
    const errorEl = document.getElementById('start-error-msg');
    if (errorEl) errorEl.classList.add('hidden');

    // 1. 시험 응시 진행 중인 경우 차단
    const viewExamEl = document.getElementById('view-exam');
    if (examSession || (viewExamEl && !viewExamEl.classList.contains('hidden'))) {
      showToast('⛔ 시험 응시 진행 중에는 정답 및 해설을 볼 수 없습니다. 시험 제출을 먼저 완료해 주세요.');
      return;
    }

    // 2. 이미 결과 화면이 열려 있는 경우 해설 영역으로 스크롤
    const viewResultEl = document.getElementById('view-result');
    if (lastFinishedSubmission && viewResultEl && !viewResultEl.classList.contains('hidden')) {
      const reviewSec = document.getElementById('res-review-section');
      if (reviewSec) reviewSec.scrollIntoView({ behavior: 'smooth' });
      showToast('✅ 아래에서 문항별 정답과 상세 해설을 확인하세요.');
      return;
    }

    // 3. 시작 화면에서 클릭한 경우: 응시자 성명 확인 후 응시 완료 여부 검증
    const nameInput = document.getElementById('input-student-name');
    const studentName = nameInput ? nameInput.value.trim() : '';

    if (!studentName) {
      if (errorEl) {
        errorEl.textContent = '⚠️ 응시 완료 여부를 확인하기 위해 먼저 [응시자 성명] 입력란에 본인 성명을 입력한 뒤 [정답 확인] 버튼을 눌러주세요.';
        errorEl.classList.remove('hidden');
      }
      showToast('⚠️ 먼저 응시자 성명을 입력한 뒤 [정답 확인]을 눌러주세요.');
      if (nameInput) nameInput.focus();
      return;
    }

    const normInputName = studentName.replace(/\s+/g, '').toLowerCase();
    const allSubs = await global.SqlExamStorage.fetchAllSubmissions();
    const matchedSub = allSubs.find(function (s) {
      return String(s.studentName || '').replace(/\s+/g, '').toLowerCase() === normInputName;
    });

    if (!matchedSub) {
      if (errorEl) {
        errorEl.textContent = '⛔ 입력하신 성명으로는 아직 시험 응시 완료 기록이 확인되지 않습니다. 정답 및 해설은 시험 응시를 완료한 사람만 볼 수 있습니다.';
        errorEl.classList.remove('hidden');
      }
      showToast('⛔ 응시 완료 기록이 없어 정답 및 해설을 열람할 수 없습니다.');
      return;
    }

    lastFinishedSubmission = matchedSub;
    renderResultView(matchedSub);
    setTimeout(function () {
      const reviewSec = document.getElementById('res-review-section');
      if (reviewSec) reviewSec.scrollIntoView({ behavior: 'smooth' });
    }, 150);
    showToast('✅ 응시 완료 기록이 확인되어 정답 및 상세 해설을 표시합니다.');
  }

  function returnToStartScreen() {
    document.getElementById('view-result').classList.add('hidden');
    document.getElementById('view-exam').classList.add('hidden');
    document.getElementById('view-start').classList.remove('hidden');
    updateStartFilterSummaryUI();
  }

  // Anti-cheating & copy prevention: block selecting/copying questions and choices during exam & review
  function initAntiCopyProtection() {
    function isProtectedArea(target) {
      if (!target) return true;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return false;
      return true;
    }

    document.addEventListener('contextmenu', function (e) {
      if (isProtectedArea(e.target)) {
        e.preventDefault();
        showToast('⚠️ 시험 부정행위 방지를 위해 우클릭 및 문제/보기 복사가 제한됩니다.');
      }
    });

    document.addEventListener('selectstart', function (e) {
      if (isProtectedArea(e.target)) {
        e.preventDefault();
      }
    });

    document.addEventListener('dragstart', function (e) {
      if (isProtectedArea(e.target)) {
        e.preventDefault();
      }
    });

    document.addEventListener('copy', function (e) {
      if (isProtectedArea(e.target)) {
        e.preventDefault();
        showToast('⚠️ 시험 부정행위 방지를 위해 문제 및 보기 텍스트 복사가 제한됩니다.');
      }
    });

    document.addEventListener('cut', function (e) {
      if (isProtectedArea(e.target)) {
        e.preventDefault();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (!isProtectedArea(e.target)) return;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const k = (e.key || '').toLowerCase();

      if (e.key === 'F12' || (isCtrlOrCmd && e.shiftKey && (k === 'i' || k === 'j' || k === 'c'))) {
        e.preventDefault();
        showToast('⚠️ 시험 진행 중에는 개발자 도구를 사용할 수 없습니다.');
        return;
      }

      if (isCtrlOrCmd && (k === 'c' || k === 'a' || k === 'x' || k === 'u' || k === 's' || k === 'p')) {
        e.preventDefault();
        showToast('⚠️ 시험 부정행위 방지를 위해 복사/저장 단축키가 제한됩니다.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateStartFilterSummaryUI();
    initAntiCopyProtection();

    const savedSession = global.SqlExamStorage.getActiveSession();
    if (
      savedSession &&
      Array.isArray(savedSession.questions) &&
      savedSession.currentIndex < savedSession.questions.length
    ) {
      examSession = savedSession;
      enterExamView();
      showToast('진행 중이던 시험 세션과 남은 타이머를 이어서 복구했습니다.');
    }
  });

  global.selectStartFilter = selectStartFilter;
  global.quickSelectPreset = quickSelectPreset;
  global.startExamSession = startExamSession;
  global.handleNextButtonClick = handleNextButtonClick;
  global.filterResultReview = filterResultReview;
  global.returnToStartScreen = returnToStartScreen;
  global.handleVerifyAndShowAnswers = handleVerifyAndShowAnswers;
})(window);

