/**
 * AI Math & Engineering Exam Administrator Console Logic (Book 21701)
 * - 5 Parts × 15 Questions = 75 Questions Analytics
 * - Supports Multi-Select Checkboxes & Bulk Deletion of Selected Students
 */
(function (global) {
  'use strict';

  const ALLOWED_PASSCODES = ['tuesvonita', 'TUESVONITA'];
  const SESSION_AUTH_KEY = 'dmdg_ai_math_exam_admin_authed';

  const SHORT_CAT_LABELS = {
    '선형대수학: 인공지능의 다차원 공간 언어': 'P1.선형대수',
    '미적분 & 최적화: 딥러닝과 머신러닝의 학습 엔진': 'P2.미적분',
    '확률통계 & 정보이론: 불확실성과 데이터의 본질 정량화': 'P3.확률/정보',
    '이산수학 & 상태 그래프: 자율 에이전트 아키텍처의 뼈대': 'P4.이산/그래프',
    '실전 AI 파이썬 엔지니어링: 코드로 구현하는 차세대 시스템': 'P5.AI파이썬',
  };

  let allSubmissions = [];
  let selectedSubmissionIds = new Set();
  let histogramChartInstance = null;
  let areaChartInstance = null;
  let activeTab = 'dashboard';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + min;
  }

  function unlockAdminConsole() {
    sessionStorage.setItem(SESSION_AUTH_KEY, '1');
    const overlay = document.getElementById('admin-auth-overlay');
    if (overlay) overlay.classList.add('hidden');
    loadAdminDataAndRender();
  }

  function handleAdminPasscodeLogin() {
    const input = document.getElementById('admin-passcode-input');
    const errEl = document.getElementById('admin-auth-error');
    const val = input ? input.value.trim() : '';
    const upperVal = val.toUpperCase();
    if (ALLOWED_PASSCODES.includes(upperVal) || ALLOWED_PASSCODES.includes(val)) {
      if (errEl) errEl.classList.add('hidden');
      unlockAdminConsole();
    } else {
      if (errEl) {
        errEl.textContent = '관리자 접속 암호가 올바르지 않습니다.';
        errEl.classList.remove('hidden');
      }
    }
  }

  async function handleGoogleAdminLogin() {
    const errEl = document.getElementById('admin-auth-error');
    try {
      if (typeof global.firebase === 'undefined' || !global.firebase.auth) {
        throw new Error('Firebase Auth SDK를 초기화할 수 없습니다.');
      }
      const provider = new global.firebase.auth.GoogleAuthProvider();
      await global.firebase.auth().signInWithPopup(provider);
      unlockAdminConsole();
    } catch (err) {
      if (errEl) {
        errEl.textContent = 'Google 인증에 실패했습니다. 관리자 접속 암호를 입력해 주세요.';
        errEl.classList.remove('hidden');
      }
    }
  }

  function switchAdminTab(tabName) {
    activeTab = tabName;
    const tabs = ['dashboard', 'candidates', 'questions', 'settings'];
    tabs.forEach(function (t) {
      const sec = document.getElementById('tab-' + t);
      if (sec) {
        if (t === tabName) sec.classList.remove('hidden');
        else sec.classList.add('hidden');
      }
    });

    const btns = document.querySelectorAll('.admin-tab-btn');
    btns.forEach(function (b) {
      if (b.getAttribute('data-tab') === tabName) b.classList.add('active');
      else b.classList.remove('active');
    });

    if (tabName === 'dashboard') {
      renderDashboardTab();
    } else if (tabName === 'candidates') {
      renderCandidatesTable();
    } else if (tabName === 'questions') {
      renderQuestionStatsTable();
    } else if (tabName === 'settings') {
      populateSettingsForm();
    }
  }

  async function loadAdminDataAndRender() {
    allSubmissions = await global.SqlExamStorage.fetchAllSubmissions();
    // Clean up any stale selected IDs that no longer exist
    const validIds = new Set(allSubmissions.map(function (s) { return s.id; }));
    Array.from(selectedSubmissionIds).forEach(function (id) {
      if (!validIds.has(id)) selectedSubmissionIds.delete(id);
    });
    switchAdminTab(activeTab);
  }

  function computeRankedSubmissions() {
    const sorted = allSubmissions.slice().sort(function (a, b) {
      if (b.score100 !== a.score100) return b.score100 - a.score100;
      return (a.totalElapsedSec || 0) - (b.totalElapsedSec || 0);
    });
    sorted.forEach(function (s, i) {
      s.rank = i + 1;
    });
    return sorted;
  }

  function computePerQuestionStats() {
    const questions = global.SqlExamStorage.getQuestions();
    const statMap = new Map();

    questions.forEach(function (q) {
      statMap.set(q.id, {
        question: q,
        attempts: 0,
        correct: 0,
        totalElapsedSec: 0,
        timeouts: 0,
      });
    });

    allSubmissions.forEach(function (sub) {
      (sub.details || []).forEach(function (d) {
        const entry = statMap.get(d.questionId);
        if (!entry) return;
        entry.attempts += 1;
        if (d.isCorrect) entry.correct += 1;
        entry.totalElapsedSec += Number(d.elapsedSec) || 0;
        if (d.timedOut) entry.timeouts += 1;
      });
    });

    return Array.from(statMap.values()).map(function (st) {
      const accuracy = st.attempts > 0 ? Math.round((st.correct / st.attempts) * 1000) / 10 : 0;
      const avgSec = st.attempts > 0 ? Math.round(st.totalElapsedSec / st.attempts) : 0;
      const timeoutRate = st.attempts > 0 ? Math.round((st.timeouts / st.attempts) * 100) : 0;
      return Object.assign({}, st, {
        accuracy: accuracy,
        avgSec: avgSec,
        timeoutRate: timeoutRate,
      });
    });
  }

  // =====================================================================
  // TAB 1: DASHBOARD RENDERING
  // =====================================================================
  function renderDashboardTab() {
    const ranked = computeRankedSubmissions();
    const total = ranked.length;

    const uniqueNames = new Set(
      ranked.map(function (s) {
        return String(s.studentName || '').trim();
      })
    ).size;

    let sumScore = 0;
    let passCount = 0;
    let choiceEarnedSum = 0;
    let choiceMaxSum = 0;

    ranked.forEach(function (s) {
      sumScore += Number(s.score100) || 0;
      if (s.passed) passCount += 1;
      choiceEarnedSum += Number(s.earnedPoints) || 0;
      choiceMaxSum += Number(s.maxPoints) || 0;
    });

    const avgScore = total > 0 ? (sumScore / total).toFixed(1) : '0.0';
    const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : '0.0';
    const maxSub = total > 0 ? ranked[0] : null;
    const minSub = total > 0 ? ranked[total - 1] : null;
    const choiceRate = choiceMaxSum > 0 ? Math.round((choiceEarnedSum / choiceMaxSum) * 100) : 0;

    document.getElementById('kpi-total-count').textContent = total + '명';
    document.getElementById('kpi-unique-names').textContent = '고유 이름 ' + uniqueNames + '명';
    document.getElementById('kpi-avg-score').textContent = avgScore + '점';
    document.getElementById('kpi-pass-rate').textContent = passRate + '%';
    document.getElementById('kpi-pass-count').textContent =
      '합격 ' + passCount + '명 / 미달 ' + (total - passCount) + '명';
    document.getElementById('kpi-max-score').textContent = maxSub ? maxSub.score100 + '점' : '0.0점';
    document.getElementById('kpi-max-student').textContent = maxSub ? maxSub.studentName : '-';
    document.getElementById('kpi-min-score').textContent = minSub ? minSub.score100 + '점' : '0.0점';
    document.getElementById('kpi-min-student').textContent = minSub ? minSub.studentName : '-';
    document.getElementById('kpi-type-compare').textContent = choiceRate + '%';

    renderScoreHistogramChart(ranked);
    renderAreaScoresChart(ranked);
    renderDashboardTopCandidates(ranked.slice(0, 7));
    renderDashboardHardestQuestions();
  }

  function renderScoreHistogramChart(submissions) {
    const canvas = document.getElementById('chart-score-histogram');
    if (!canvas || typeof global.Chart === 'undefined') return;

    const buckets = [0, 0, 0, 0, 0, 0];
    submissions.forEach(function (s) {
      const sc = Number(s.score100) || 0;
      if (sc < 50) buckets[0] += 1;
      else if (sc < 60) buckets[1] += 1;
      else if (sc < 70) buckets[2] += 1;
      else if (sc < 80) buckets[3] += 1;
      else if (sc < 90) buckets[4] += 1;
      else buckets[5] += 1;
    });

    if (histogramChartInstance) {
      histogramChartInstance.destroy();
    }

    histogramChartInstance = new global.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['50점 미만', '50~59점', '60~69점', '70~79점', '80~89점 (합격)', '90~100점 (최우수)'],
        datasets: [
          {
            label: '응시자 수 (명)',
            data: buckets,
            backgroundColor: [
              'rgba(244, 63, 94, 0.55)',
              'rgba(244, 63, 94, 0.7)',
              'rgba(245, 158, 11, 0.65)',
              'rgba(245, 158, 11, 0.85)',
              'rgba(16, 185, 129, 0.75)',
              'rgba(6, 182, 212, 0.85)',
            ],
            borderColor: ['#f43f5e', '#f43f5e', '#f59e0b', '#f59e0b', '#10b981', '#06b6d4'],
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: '#94a3b8' },
            grid: { color: 'rgba(51, 65, 85, 0.4)' },
          },
          x: {
            ticks: { color: '#cbd5e1', font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
  }

  function renderAreaScoresChart(submissions) {
    const canvas = document.getElementById('chart-area-scores');
    if (!canvas || typeof global.Chart === 'undefined') return;

    const areas = global.SqlExamStorage.CATEGORIES || [];
    const sums = {};
    areas.forEach(function (a) {
      sums[a] = { earned: 0, max: 0 };
    });

    submissions.forEach(function (sub) {
      (sub.details || []).forEach(function (d) {
        const cat = sums[d.category] ? d.category : areas[0];
        if (sums[cat]) {
          sums[cat].earned += Number(d.score) || 0;
          sums[cat].max += Number(d.maxPoints) || 2;
        }
      });
    });

    const choiceData = areas.map(function (a) {
      return sums[a] && sums[a].max > 0 ? Math.round((sums[a].earned / sums[a].max) * 1000) / 10 : 0;
    });

    if (areaChartInstance) {
      areaChartInstance.destroy();
    }

    areaChartInstance = new global.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Part 1. 선형대수', 'Part 2. 미적분/최적화', 'Part 3. 확률/정보이론', 'Part 4. 이산/상태그래프', 'Part 5. AI 파이썬'],
        datasets: [
          {
            label: '파트별 평균 득점률 (%)',
            data: choiceData,
            backgroundColor: [
              'rgba(99, 102, 241, 0.8)',
              'rgba(6, 182, 212, 0.8)',
              'rgba(16, 185, 129, 0.8)',
              'rgba(245, 158, 11, 0.8)',
              'rgba(168, 85, 247, 0.8)',
            ],
            borderColor: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7'],
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#94a3b8', callback: function (v) { return v + '%'; } },
            grid: { color: 'rgba(51, 65, 85, 0.4)' },
          },
          x: {
            ticks: { color: '#cbd5e1', font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
  }

  function renderDashboardTopCandidates(topList) {
    const el = document.getElementById('dash-top-candidates');
    if (!el) return;
    if (topList.length === 0) {
      el.innerHTML = '<div class="text-xs text-slate-500 py-6 text-center">아직 제출된 응시 데이터가 없습니다.</div>';
      return;
    }

    el.innerHTML = topList
      .map(function (s) {
        const medal =
          s.rank === 1
            ? '🥇 1위'
            : s.rank === 2
            ? '🥈 2위'
            : s.rank === 3
            ? '🥉 3위'
            : s.rank + '위';
        const passCls = s.passed ? 'text-emerald-400' : 'text-rose-400';
        return (
          '<div class="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs">' +
          '<div class="flex items-center gap-3">' +
          '<span class="code-font font-extrabold text-amber-300 w-12">' + medal + '</span>' +
          '<span class="font-bold text-white">' + escapeHtml(s.studentName) + '</span>' +
          '<span class="text-slate-400 hidden sm:inline">' + escapeHtml(s.examModeLabel || '') + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-3">' +
          '<span class="code-font font-extrabold text-sm ' + passCls + '">' + s.score100 + '점</span>' +
          '<button type="button" onclick="openCandidateModal(\'' + escapeHtml(s.id) + '\')" class="text-slate-400 hover:text-cyan-300"><i class="fa-solid fa-eye"></i></button>' +
          '</div></div>'
        );
      })
      .join('');
  }

  function renderDashboardHardestQuestions() {
    const el = document.getElementById('dash-hardest-questions');
    if (!el) return;
    const stats = computePerQuestionStats()
      .filter(function (st) {
        return st.attempts > 0;
      })
      .sort(function (a, b) {
        return a.accuracy - b.accuracy;
      })
      .slice(0, 7);

    if (stats.length === 0) {
      el.innerHTML = '<div class="text-xs text-slate-500 py-6 text-center">응시 데이터가 쌓이면 오답률 상위 문항이 표시됩니다.</div>';
      return;
    }

    el.innerHTML = stats
      .map(function (st) {
        const q = st.question;
        return (
          '<div class="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">' +
          '<div class="truncate">' +
          '<span class="code-font font-bold text-cyan-400 mr-2">[' + escapeHtml(q.id) + ']</span>' +
          '<span class="text-slate-200">' + escapeHtml(q.title) + '</span>' +
          '</div>' +
          '<div class="shrink-0 flex items-center gap-2">' +
          '<span class="text-[11px] text-slate-400">정답률</span>' +
          '<span class="code-font font-extrabold text-rose-400">' + st.accuracy + '%</span>' +
          '</div></div>'
        );
      })
      .join('');
  }

  // =====================================================================
  // TAB 2: CANDIDATES TABLE & MULTI-SELECT DELETION
  // =====================================================================
  function getFilteredCandidateList() {
    const searchQ = (document.getElementById('cand-search-input')?.value || '').trim().toLowerCase();
    const passFilter = document.getElementById('cand-pass-filter')?.value || 'ALL';
    const sortMode = document.getElementById('cand-sort-select')?.value || 'rank';

    let list = computeRankedSubmissions().filter(function (s) {
      const nameMatch = !searchQ || String(s.studentName || '').toLowerCase().includes(searchQ);
      const passMatch =
        passFilter === 'ALL' ||
        (passFilter === 'PASS' && s.passed) ||
        (passFilter === 'FAIL' && !s.passed);
      return nameMatch && passMatch;
    });

    if (sortMode === 'latest') {
      list.sort(function (a, b) {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      });
    } else if (sortMode === 'name') {
      list.sort(function (a, b) {
        return String(a.studentName || '').localeCompare(String(b.studentName || ''), 'ko');
      });
    }
    return list;
  }

  function updateSelectedCandidatesUI() {
    const labelEl = document.getElementById('selected-cands-label');
    const btnEl = document.getElementById('btn-delete-selected-cands');
    const selectAllEl = document.getElementById('select-all-candidates');
    const count = selectedSubmissionIds.size;

    if (labelEl) {
      labelEl.textContent = '선택 학생 삭제 (' + count + '명)';
    }
    if (btnEl) {
      btnEl.className = count > 0
        ? 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 text-xs font-extrabold px-3.5 py-1.5 rounded-lg shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5'
        : 'bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-extrabold px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5';
    }
    if (selectAllEl) {
      const visibleList = getFilteredCandidateList();
      selectAllEl.checked = visibleList.length > 0 && visibleList.every(function (s) {
        return selectedSubmissionIds.has(s.id);
      });
    }
  }

  function toggleCandidateSelection(submissionId, isChecked) {
    if (isChecked) {
      selectedSubmissionIds.add(submissionId);
    } else {
      selectedSubmissionIds.delete(submissionId);
    }
    updateSelectedCandidatesUI();
  }

  function toggleSelectAllCandidates(isChecked) {
    const visibleList = getFilteredCandidateList();
    visibleList.forEach(function (s) {
      if (isChecked) selectedSubmissionIds.add(s.id);
      else selectedSubmissionIds.delete(s.id);
    });
    renderCandidatesTable();
  }

  async function handleDeleteSelectedSubmissions() {
    const ids = Array.from(selectedSubmissionIds);
    if (ids.length === 0) {
      alert('삭제할 학생을 왼쪽 체크박스에서 먼저 선택해 주세요.');
      return;
    }
    const selectedNames = allSubmissions
      .filter(function (s) { return selectedSubmissionIds.has(s.id); })
      .map(function (s) { return s.studentName; });

    if (!confirm('선택한 ' + ids.length + '명(' + selectedNames.join(', ') + ')의 응시 데이터를 삭제하시겠습니까?\n(삭제 시 해당 학생들은 재응시가 가능해집니다)')) {
      return;
    }

    await global.SqlExamStorage.deleteSelectedSubmissions(ids);
    selectedSubmissionIds.clear();
    allSubmissions = await global.SqlExamStorage.fetchAllSubmissions();
    switchAdminTab(activeTab);
  }

  function renderCandidatesTable() {
    const tbody = document.getElementById('candidates-table-body');
    if (!tbody) return;

    const list = getFilteredCandidateList();
    updateSelectedCandidatesUI();

    if (list.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="10" class="py-8 text-center text-slate-500">조건에 해당하는 응시 기록이 없습니다.</td></tr>';
      return;
    }

    const cats = global.SqlExamStorage.CATEGORIES || [];

    tbody.innerHTML = list
      .map(function (s) {
        const isChecked = selectedSubmissionIds.has(s.id);
        const partPcts = cats.map(function (c) {
          const st = s.areaStats && s.areaStats[c] ? s.areaStats[c] : { earned: 0, max: 0 };
          return st.max > 0 ? Math.round((st.earned / st.max) * 100) + '%' : '-';
        });

        const passBadge = s.passed
          ? '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">PASS</span>'
          : '<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">FAIL</span>';

        const dupBadge = s.isDuplicateName
          ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">중복이름</span>'
          : '';

        const mins = Math.floor((s.totalElapsedSec || 0) / 60);
        const secs = (s.totalElapsedSec || 0) % 60;

        return (
          '<tr class="hover:bg-slate-900/60 transition ' + (isChecked ? 'bg-rose-950/20' : '') + '">' +
          '<td class="py-3 px-3 text-center">' +
          '<input type="checkbox" class="cand-row-checkbox accent-rose-500 w-4 h-4 cursor-pointer rounded" ' +
          (isChecked ? 'checked ' : '') +
          'onchange="toggleCandidateSelection(\'' + escapeHtml(s.id) + '\', this.checked)">' +
          '</td>' +
          '<td class="py-3 px-3 code-font font-extrabold text-amber-300">' + s.rank + '위</td>' +
          '<td class="py-3 px-3 font-bold text-white">' + escapeHtml(s.studentName) + dupBadge + '</td>' +
          '<td class="py-3 px-3 text-slate-300">' + escapeHtml(s.examModeLabel || '') + '</td>' +
          '<td class="py-3 px-3 code-font font-black text-sm text-cyan-300">' +
          s.score100 + '점 <span class="text-[11px] text-slate-500 font-normal">(' + s.earnedPoints + '/' + s.maxPoints + ')</span></td>' +
          '<td class="py-3 px-3">' + passBadge + '</td>' +
          '<td class="py-3 px-3 code-font text-slate-300">' + partPcts.join(' / ') + '</td>' +
          '<td class="py-3 px-3 code-font text-slate-400">' + mins + '분 ' + secs + '초 (초과 ' + (s.timeoutCount || 0) + ')</td>' +
          '<td class="py-3 px-3 text-slate-400 code-font">' + formatDateTime(s.submittedAt) + '</td>' +
          '<td class="py-3 px-3 text-right space-x-1.5">' +
          '<button type="button" onclick="openCandidateModal(\'' + escapeHtml(s.id) + '\')" class="bg-slate-800 hover:bg-cyan-600 hover:text-slate-950 text-cyan-300 px-2.5 py-1 rounded-md font-bold transition">답안지</button>' +
          '<button type="button" onclick="handleDeleteSubmission(\'' + escapeHtml(s.id) + '\')" class="bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white px-2 py-1 rounded-md transition" title="이 학생 기록 삭제"><i class="fa-solid fa-trash"></i></button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  // =====================================================================
  // TAB 3: PER-QUESTION ANALYTICS TABLE (75 QUESTIONS)
  // =====================================================================
  function renderQuestionStatsTable() {
    const tbody = document.getElementById('question-stats-table-body');
    if (!tbody) return;

    const catFilter = document.getElementById('qstat-cat-filter')?.value || 'ALL';
    const sortFilter = document.getElementById('qstat-sort-filter')?.value || 'no';

    let stats = computePerQuestionStats().filter(function (st) {
      const q = st.question;
      return catFilter === 'ALL' || q.category === catFilter;
    });

    if (sortFilter === 'hardest') {
      stats.sort(function (a, b) {
        return a.accuracy - b.accuracy;
      });
    } else if (sortFilter === 'easiest') {
      stats.sort(function (a, b) {
        return b.accuracy - a.accuracy;
      });
    } else if (sortFilter === 'slowest') {
      stats.sort(function (a, b) {
        return b.avgSec - a.avgSec;
      });
    }

    tbody.innerHTML = stats
      .map(function (st) {
        const q = st.question;
        const shortCat = SHORT_CAT_LABELS[q.category] || q.category;
        const accColor =
          st.accuracy >= 80
            ? 'text-emerald-400'
            : st.accuracy >= 60
            ? 'text-amber-300'
            : 'text-rose-400';

        return (
          '<tr class="hover:bg-slate-900/60 transition">' +
          '<td class="py-3 px-3 code-font font-bold text-cyan-400">' + escapeHtml(q.id) + '</td>' +
          '<td class="py-3 px-3">' + escapeHtml(shortCat) + ' · <span class="text-indigo-300 code-font">' + escapeHtml(q.chapter || '') + '</span></td>' +
          '<td class="py-3 px-3 text-slate-200 max-w-md truncate" title="' + escapeHtml(q.title) + '">' + escapeHtml(q.title) + '</td>' +
          '<td class="py-3 px-3 code-font text-slate-300">' + st.attempts + '회</td>' +
          '<td class="py-3 px-3">' +
          '<div class="flex items-center gap-2">' +
          '<span class="code-font font-extrabold ' + accColor + ' w-12">' + st.accuracy + '%</span>' +
          '<div class="w-20 bg-slate-800 h-2 rounded-full overflow-hidden hidden sm:block">' +
          '<div class="bg-cyan-400 h-full" style="width:' + st.accuracy + '%"></div>' +
          '</div></div></td>' +
          '<td class="py-3 px-3 code-font text-slate-300">' + st.avgSec + '초</td>' +
          '<td class="py-3 px-3 code-font text-slate-400">' + st.timeoutRate + '% (' + st.timeouts + '건)</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  // =====================================================================
  // TAB 4: SETTINGS, CSV EXPORT & QUESTION BANK
  // =====================================================================
  function populateSettingsForm() {
    const s = global.SqlExamStorage.getSettings();
    document.getElementById('set-choice-time').value = s.choiceTimeLimit || 60;
    document.getElementById('set-pass-score').value = s.passScore || 80;
    document.getElementById('set-shuffle').checked = s.shuffleQuestions !== false;
    document.getElementById('set-block-dup').checked = s.blockDuplicateDevice !== false;
    const elStudents = document.getElementById('set-enforce-students');
    if (elStudents) elStudents.checked = s.enforceAllowedStudents !== false;
    const elDate = document.getElementById('set-enforce-date');
    if (elDate) elDate.checked = s.enforceExamDate !== false;
    document.getElementById('set-exam-open').checked = s.examOpen !== false;
  }

  async function saveAdminSettingsForm() {
    const choiceTime = Math.max(15, Number(document.getElementById('set-choice-time').value) || 60);
    const passScore = Math.max(10, Math.min(100, Number(document.getElementById('set-pass-score').value) || 80));
    const shuffleQuestions = document.getElementById('set-shuffle').checked;
    const blockDuplicateDevice = document.getElementById('set-block-dup').checked;
    const elStudents = document.getElementById('set-enforce-students');
    const enforceAllowedStudents = elStudents ? elStudents.checked : true;
    const elDate = document.getElementById('set-enforce-date');
    const enforceExamDate = elDate ? elDate.checked : true;
    const examOpen = document.getElementById('set-exam-open').checked;

    await global.SqlExamStorage.saveSettings({
      choiceTimeLimit: choiceTime,
      passScore: passScore,
      shuffleQuestions: shuffleQuestions,
      blockDuplicateDevice: blockDuplicateDevice,
      enforceAllowedStudents: enforceAllowedStudents,
      enforceExamDate: enforceExamDate,
      examOpen: examOpen,
    });

    alert('시험 설정이 저장되어 즉시 반영되었습니다!');
  }

  function exportSubmissionsCsv() {
    const ranked = computeRankedSubmissions();
    if (ranked.length === 0) {
      alert('다운로드할 응시 기록이 없습니다.');
      return;
    }

    const cats = global.SqlExamStorage.CATEGORIES || [];
    const headers = [
      '순위',
      '응시자이름',
      '응시구성',
      '환산총점(100점만점)',
      '합격여부(80점기준)',
      '획득점수',
      '만점',
      '정답문항수',
      '총문항수',
      'P1_선형대수',
      'P2_미적분최적화',
      'P3_확률정보이론',
      'P4_이산상태그래프',
      'P5_AI파이썬',
      '총소요시간(초)',
      '시간초과문항수',
      '제출일시',
    ];

    const rows = ranked.map(function (s) {
      const partScores = cats.map(function (c) {
        const st = s.areaStats && s.areaStats[c] ? s.areaStats[c] : { earned: 0, max: 0 };
        return '"' + st.earned + '/' + st.max + '"';
      });

      return [
        s.rank,
        '"' + String(s.studentName || '').replace(/"/g, '""') + '"',
        '"' + String(s.examModeLabel || '').replace(/"/g, '""') + '"',
        s.score100,
        s.passed ? 'PASS(합격)' : 'FAIL(미달)',
        s.earnedPoints,
        s.maxPoints,
        s.correctCount,
        s.totalQuestions,
        partScores[0] || '"0/0"',
        partScores[1] || '"0/0"',
        partScores[2] || '"0/0"',
        partScores[3] || '"0/0"',
        partScores[4] || '"0/0"',
        s.totalElapsedSec || 0,
        s.timeoutCount || 0,
        '"' + formatDateTime(s.submittedAt) + '"',
      ].join(',');
    });

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'python_ai_exam_채점통계_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportQuestionsJson() {
    const qs = global.SqlExamStorage.getQuestions();
    const blob = new Blob([JSON.stringify(qs, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'python_ai_exam_questions_145.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleImportQuestionsJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('유효한 문제 배열 형식이 아닙니다.');
        }
        global.SqlExamStorage.saveCustomQuestions(parsed);
        alert('총 ' + parsed.length + '문항이 성공적으로 업로드되어 반영되었습니다!');
        renderQuestionStatsTable();
      } catch (err) {
        alert('JSON 파싱 오류: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleResetQuestionsDefault() {
    global.SqlExamStorage.resetQuestionsToDefault();
    alert('기본 145문항으로 복원되었습니다.');
    renderQuestionStatsTable();
  }

  function openCandidateModal(submissionId) {
    const sub = allSubmissions.find(function (s) {
      return s.id === submissionId;
    });
    if (!sub) return;

    const modal = document.getElementById('candidate-detail-modal');
    const titleEl = document.getElementById('modal-cand-title');
    const subTitleEl = document.getElementById('modal-cand-subtitle');
    const bodyEl = document.getElementById('modal-cand-body');

    titleEl.textContent = sub.studentName + '님의 상세 채점표 (' + sub.score100 + '점)';
    subTitleEl.textContent =
      (sub.examModeLabel || '') + ' | 제출일시: ' + formatDateTime(sub.submittedAt);

    const qMap = new Map();
    global.SqlExamStorage.getQuestions().forEach(function (q) {
      qMap.set(q.id, q);
    });

    bodyEl.innerHTML = (sub.details || [])
      .map(function (d, i) {
        const q = qMap.get(d.questionId) || {};
        const badge = d.isCorrect
          ? '<span class="text-emerald-400 font-bold">정답 (+' + d.score + ')</span>'
          : '<span class="text-rose-400 font-bold">오답 (0)</span>';
        const shortCat = SHORT_CAT_LABELS[d.category] || d.category;

        return (
          '<div class="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1.5">' +
          '<div class="flex justify-between items-center">' +
          '<span class="code-font font-bold text-cyan-400">#' + (i + 1) + ' [' + escapeHtml(d.questionId) + '] ' + escapeHtml(shortCat) + '</span>' +
          '<div>' + badge + ' <span class="text-slate-500 ml-2">' + d.elapsedSec + '초</span></div>' +
          '</div>' +
          '<div class="text-slate-200 font-semibold">' + escapeHtml(q.title || '') + '</div>' +
          '<div class="text-slate-400">제출 답안: <span class="code-font text-white">' + escapeHtml(d.userAnswer === null ? '미선택' : d.userAnswer + '번') + '</span></div>' +
          '<div class="text-slate-400">모범 정답: <span class="code-font text-emerald-400">' + escapeHtml(d.correctAnswer + '번') + '</span></div>' +
          '</div>'
        );
      })
      .join('');

    modal.classList.remove('hidden');
  }

  function closeCandidateModal() {
    const modal = document.getElementById('candidate-detail-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function handleSeedDemoData() {
    global.SqlExamStorage.seedDemoSubmissions();
    allSubmissions = await global.SqlExamStorage.fetchAllSubmissions();
    switchAdminTab(activeTab);
  }

  async function handleDeleteSubmission(submissionId) {
    const target = allSubmissions.find(function (s) { return s.id === submissionId; });
    const nameStr = target ? target.studentName : submissionId;
    if (!confirm('[' + nameStr + '] 학생의 응시 기록을 삭제하시겠습니까?\n(삭제 시 해당 학생은 재응시가 가능해집니다)')) return;
    await global.SqlExamStorage.deleteSubmission(submissionId);
    selectedSubmissionIds.delete(submissionId);
    allSubmissions = await global.SqlExamStorage.fetchAllSubmissions();
    switchAdminTab(activeTab);
  }

  async function handleClearAllSubmissions() {
    if (!confirm('테스트 데이터를 포함한 모든 응시 기록과 통계를 0건으로 완전히 초기화하시겠습니까?')) return;
    await global.SqlExamStorage.clearAllSubmissions();
    selectedSubmissionIds.clear();
    allSubmissions = [];
    switchAdminTab(activeTab);
    alert('모든 응시 데이터와 통계 지표가 0건으로 깨끗하게 초기화되었습니다!');
  }

  document.addEventListener('DOMContentLoaded', function () {
    const passInput = document.getElementById('admin-passcode-input');
    if (passInput) passInput.value = '';

    if (sessionStorage.getItem(SESSION_AUTH_KEY) === '1') {
      unlockAdminConsole();
    }

    global.SqlExamStorage.onSyncMessage(function () {
      if (sessionStorage.getItem(SESSION_AUTH_KEY) === '1') {
        loadAdminDataAndRender();
      }
    });
  });

  global.handleAdminPasscodeLogin = handleAdminPasscodeLogin;
  global.handleGoogleAdminLogin = handleGoogleAdminLogin;
  global.switchAdminTab = switchAdminTab;
  global.renderCandidatesTable = renderCandidatesTable;
  global.toggleCandidateSelection = toggleCandidateSelection;
  global.toggleSelectAllCandidates = toggleSelectAllCandidates;
  global.handleDeleteSelectedSubmissions = handleDeleteSelectedSubmissions;
  global.renderQuestionStatsTable = renderQuestionStatsTable;
  global.saveAdminSettingsForm = saveAdminSettingsForm;
  global.exportSubmissionsCsv = exportSubmissionsCsv;
  global.exportQuestionsJson = exportQuestionsJson;
  global.handleImportQuestionsJson = handleImportQuestionsJson;
  global.handleResetQuestionsDefault = handleResetQuestionsDefault;
  global.openCandidateModal = openCandidateModal;
  global.closeCandidateModal = closeCandidateModal;
  global.handleSeedDemoData = handleSeedDemoData;
  global.handleDeleteSubmission = handleDeleteSubmission;
  global.handleClearAllSubmissions = handleClearAllSubmissions;
})(window);
