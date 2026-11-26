import { useEffect, useMemo, useRef, useState } from 'react';
import questions from '../questions.json';
import { dueRevisions, recordSubmission } from './revision.js';

const STORAGE_KEY = 'mcq-practice-progress-v1';
const freshState = () => ({
  totalAttempts: 0, currentId: questions[0]?.id ?? 1, records: {}, preservedIds: [],
  wrongIds: [], reattemptedIds: [], reviewIds: [], revisionQueue: [], optionOrders: {},
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return freshState();
    return { ...freshState(), ...saved };
  } catch { return freshState(); }
}

function shuffleOptions(question, stored) {
  if (stored?.length === 4) return stored;
  const arr = ['A', 'B', 'C', 'D'];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function validateImport(data) {
  return data && typeof data === 'object' && typeof data.totalAttempts === 'number' &&
    data.records && Array.isArray(data.preservedIds) && Array.isArray(data.wrongIds) &&
    Array.isArray(data.reattemptedIds) && Array.isArray(data.reviewIds) &&
    Array.isArray(data.revisionQueue) && data.optionOrders;
}

export default function App() {
  const [progress, setProgress] = useState(loadState);
  const [page, setPage] = useState('practice');
  const [mode, setMode] = useState('practice');
  const [goTo, setGoTo] = useState('');
  const [filter, setFilter] = useState('All');
  const [toast, setToast] = useState('');
  const [activeSubmission, setActiveSubmission] = useState(null);
  const importRef = useRef(null);
  const current = questions.find(q => q.id === progress.currentId) || questions[0];
  const record = progress.records[current.id];
  const order = progress.optionOrders[current.id] || ['A', 'B', 'C', 'D'];
  const due = dueRevisions(progress.revisionQueue, progress.totalAttempts);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }, [progress]);
  useEffect(() => {
    if (current && !progress.optionOrders[current.id]) {
      setProgress(p => ({ ...p, optionOrders: { ...p.optionOrders, [current.id]: shuffleOptions(current, p.optionOrders[current.id]) } }));
    }
  }, [current?.id]);
  useEffect(() => {
    if (!activeSubmission || activeSubmission.id !== current.id) return;
    const timer = setTimeout(() => {
      const remaining = questions.filter(q => q.id > current.id && !progress.preservedIds.includes(q.id));
      const next = remaining[0] || questions.find(q => !progress.preservedIds.includes(q.id));
      if (next) setQuestion(next.id, 'practice');
    }, 950);
    return () => clearTimeout(timer);
  }, [activeSubmission, current?.id, progress.preservedIds]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const statusOf = id => {
    if (progress.preservedIds.includes(id)) return 'Preserved';
    if (progress.wrongIds.includes(id)) return 'Wrong';
    if (progress.reattemptedIds.includes(id)) return 'Reattempted Correct';
    if (!progress.records[id]) return 'Unattempted';
    return 'Correct';
  };

  const stats = useMemo(() => {
    const unattempted = questions.filter(q => statusOf(q.id) === 'Unattempted').length;
    const correctUnpreserved = questions.filter(q => statusOf(q.id) === 'Correct').length;
    const correctAttempts = Object.values(progress.records).reduce((n, r) => n + r.history.filter(h => h.correct).length, 0);
    return {
      total: questions.length, unattempted, preserved: progress.preservedIds.length,
      wrong: progress.wrongIds.length, reattempted: progress.reattemptedIds.length,
      correctUnpreserved, review: progress.reviewIds.length, attempts: progress.totalAttempts,
      accuracy: progress.totalAttempts ? Math.round(correctAttempts / progress.totalAttempts * 100) : 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  function setQuestion(id, nextMode = 'practice') {
    const q = questions.find(x => x.id === Number(id));
    if (!q) { setToast(`Question number must be between 1 and ${questions.length}.`); return; }
    setProgress(p => ({ ...p, currentId: q.id, optionOrders: { ...p.optionOrders, [q.id]: shuffleOptions(q, p.optionOrders[q.id]) } }));
    setActiveSubmission(null);
    setMode(nextMode);
    setGoTo('');
    setPage('practice');
  }

  function move(delta) {
    let id = current.id + delta;
    while (id >= 1 && id <= questions.length && progress.preservedIds.includes(id)) id += delta;
    if (id >= 1 && id <= questions.length) setQuestion(id, 'practice');
  }

  function submit(displayLetter) {
    if (progress.preservedIds.includes(current.id)) return;
    if (activeSubmission?.id === current.id && activeSubmission?.mode === mode) return;
    const originalOption = order[['A', 'B', 'C', 'D'].indexOf(displayLetter)];
    const isCorrect = originalOption === current.answer;
    setActiveSubmission({ id: current.id, mode, displayOption: displayLetter, correct: isCorrect });
    setProgress(p => {
      const withOrder = { ...p, optionOrders: { ...p.optionOrders, [current.id]: order } };
      const updated = recordSubmission(withOrder, current, originalOption, isCorrect, mode);
      const latest = updated.records[current.id];
      latest.history[latest.history.length - 1].displayOption = displayLetter;
      return updated;
    });
    setToast(isCorrect ? 'Correct answer' : 'Incorrect answer');
  }

  const answeredNow = activeSubmission?.id === current.id && activeSubmission?.mode === mode;
  const selectedDisplay = answeredNow ? activeSubmission.displayOption : null;
  const currentCorrect = answeredNow && activeSubmission.correct;

  function preserve(id = current.id) {
    setProgress(p => {
      if (p.preservedIds.includes(id)) return { ...p, preservedIds: p.preservedIds.filter(x => x !== id) };
      const rec = p.records[id];
      if (!rec?.firstCorrect && !p.reattemptedIds.includes(id)) return p;
      return { ...p, preservedIds: [...p.preservedIds, id], wrongIds: p.wrongIds.filter(x => x !== id), revisionQueue: p.revisionQueue.filter(x => x.id !== id) };
    });
  }
  function toggleReview(id = current.id) {
    setProgress(p => ({ ...p, reviewIds: p.reviewIds.includes(id) ? p.reviewIds.filter(x => x !== id) : [...p.reviewIds, id] }));
  }
  function startRevision(id) {
    setQuestion(id, 'revision');
  }
  function exportProgress() {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'mcq-progress-backup.json'; a.click(); URL.revokeObjectURL(url);
  }
  function importProgress(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!validateImport(data)) throw new Error('Invalid backup format');
        const validIds = new Set(questions.map(q => q.id));
        for (const key of ['preservedIds', 'wrongIds', 'reattemptedIds', 'reviewIds']) data[key] = data[key].filter(id => validIds.has(id));
        data.currentId = validIds.has(data.currentId) ? data.currentId : 1;
        setProgress({ ...freshState(), ...data }); setToast('Progress imported successfully');
      } catch { setToast('Could not import this backup file'); }
      event.target.value = '';
    };
    reader.readAsText(file);
  }
  function resetProgress() {
    if (window.confirm('Reset all saved progress? This cannot be undone unless you exported a backup.')) {
      setProgress(freshState()); setMode('practice'); setPage('practice'); setToast('Progress reset');
    }
  }

  const paletteIds = questions.filter(q => {
    if (filter === 'All') return true;
    if (filter === 'Marked for Review') return progress.reviewIds.includes(q.id);
    return statusOf(q.id) === filter;
  });

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">M</div><div><strong>MCQ Practice</strong><span>QUESTION WORKSPACE</span></div></div>
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-item ${page === 'practice' ? 'active' : ''}`} onClick={() => { setPage('practice'); setMode('practice'); setActiveSubmission(null); }}> <span>▦</span> Practice</button>
      <button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}><span>◫</span> Dashboard</button>
      <button className={`nav-item ${page === 'wrong' ? 'active' : ''}`} onClick={() => setPage('wrong')}><span>↻</span> Wrong questions <b className="nav-count">{stats.wrong}</b></button>
      <button className={`nav-item ${page === 'review' ? 'active' : ''}`} onClick={() => setPage('review')}><span>☆</span> Marked for review <b className="nav-count">{stats.review}</b></button>
      <div className="sidebar-bottom">
        <div className="storage-note"><span className="live-dot"/> Progress saved locally</div>
        <button className="nav-item" onClick={exportProgress}><span>⇩</span> Export progress</button>
        <button className="nav-item" onClick={() => importRef.current?.click()}><span>⇧</span> Import progress</button>
        <button className="nav-item danger-text" onClick={resetProgress}><span>⌫</span> Reset progress</button>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importProgress}/>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">YOUR STUDY SESSION</div><h1>{page === 'practice' ? 'Practice questions' : page === 'dashboard' ? 'Your dashboard' : page === 'wrong' ? 'Wrong questions' : 'Marked for review'}</h1></div><div className="topbar-right"><span className="question-total">{questions.length} QUESTIONS</span><div className="avatar">{Math.min(99, Math.round(stats.accuracy))}<small>%</small></div></div></header>

      {page === 'practice' && <>
        <section className="stats-strip">
          <MiniStat label="UNATTEMPTED" value={stats.unattempted} tone="muted"/>
          <MiniStat label="PRESERVED" value={stats.preserved} tone="green"/>
          <MiniStat label="WRONG" value={stats.wrong} tone="red"/>
          <MiniStat label="REATTEMPTED CORRECT" value={stats.reattempted} tone="blue"/>
          <MiniStat label="ACCURACY" value={`${stats.accuracy}%`} tone="green"/>
        </section>
        <div className="practice-layout">
          <section className="question-column">
            <div className="question-toolbar"><div className="question-index"><span>QUESTION</span><strong>{String(current.id).padStart(3,'0')}</strong><span className="of-total">/ {questions.length}</span></div><div className="toolbar-actions">
              {mode === 'revision' && <span className="revision-pill">REVISION</span>}
              <button className={`icon-button ${progress.reviewIds.includes(current.id) ? 'selected' : ''}`} title="Mark for review" onClick={() => toggleReview()}>☆</button>
              {(record?.firstCorrect || progress.reattemptedIds.includes(current.id) || progress.preservedIds.includes(current.id)) && <button className={`icon-button ${progress.preservedIds.includes(current.id) ? 'selected' : ''}`} title="Preserve question" onClick={() => preserve()}>◆</button>}
            </div></div>
            <article className="question-card">
              <div className="card-meta"><span>{statusOf(current.id).toUpperCase()}</span>{mode === 'revision' && <span className="revision-meta">SCHEDULED REVISION</span>}</div>
              <h2>{current.question}</h2>
              <div className="options-list">
                {['A','B','C','D'].map((displayLetter, idx) => {
                  const originalLetter = order[idx]; const isAnswer = originalLetter === current.answer;
                  let cls = 'option';
                  if (answeredNow && isAnswer) cls += ' correct';
                  if (answeredNow && selectedDisplay === displayLetter && !currentCorrect) cls += ' incorrect';
                  if (selectedDisplay === displayLetter) cls += ' chosen';
                  return <button key={displayLetter} className={cls} disabled={!!answeredNow || progress.preservedIds.includes(current.id)} onClick={() => submit(displayLetter)}><span className="option-letter">{displayLetter}</span><span className="option-text">{current.options[originalLetter]}</span>{answeredNow && isAnswer && <span className="option-result">✓</span>}{answeredNow && selectedDisplay === displayLetter && !currentCorrect && <span className="option-result">×</span>}</button>;
                })}
              </div>
              {answeredNow && <div className={`answer-feedback ${currentCorrect ? 'good' : 'bad'}`}><span>{currentCorrect ? '✓' : '!'}</span><div><strong>{currentCorrect ? 'Correct' : 'Not quite'}</strong><small>{currentCorrect ? 'You selected the correct answer.' : `Correct answer: ${current.answer}. ${current.options[current.answer]}`}</small></div></div>}
              {(record?.firstCorrect || progress.reattemptedIds.includes(current.id)) && !progress.preservedIds.includes(current.id) && <button className="preserve-inline" onClick={() => preserve()}>◆ Preserve this question</button>}
              {progress.preservedIds.includes(current.id) && <button className="preserve-inline preserved" onClick={() => preserve()}>✓ Preserved · Unpreserve</button>}
            </article>
            <div className="question-footer"><button className="secondary-button" onClick={() => move(-1)} disabled={current.id === 1}>← Previous</button><div className="footer-center">{stats.attempts} total submissions</div><button className="primary-button" onClick={() => move(1)} disabled={current.id === questions.length}>Next question →</button></div>
            <div className="goto-row"><label htmlFor="goto">GO TO QUESTION</label><form onSubmit={e => { e.preventDefault(); setQuestion(goTo); }}><input id="goto" type="number" min="1" max={questions.length} placeholder="Enter question number" value={goTo} onChange={e => setGoTo(e.target.value)}/><button type="submit">Go</button></form></div>
          </section>
          <aside className="palette-panel"><div className="panel-heading"><div><strong>Question palette</strong><span>Jump to any question</span></div><span className="palette-total">{questions.length}</span></div>
            <div className="palette-legend"><span><i className="legend-dot green-bg"/> Correct</span><span><i className="legend-dot red-bg"/> Wrong</span><span><i className="legend-dot purple-bg"/> Preserved</span></div>
            <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)}><option>All</option><option>Unattempted</option><option>Correct</option><option>Wrong</option><option>Preserved</option><option>Reattempted Correct</option><option>Marked for Review</option></select>
            <div className="palette-grid">{paletteIds.map(q => <button key={q.id} className={`palette-number ${statusClass(statusOf(q.id))} ${q.id === current.id ? 'current' : ''} ${progress.reviewIds.includes(q.id) ? 'bookmarked' : ''}`} title={`Question ${q.id} · ${statusOf(q.id)}`} onClick={() => setQuestion(q.id)}>{q.id}</button>)}</div>
            <div className="revision-box"><div><span className="revision-icon">↻</span><div><strong>Revision queue</strong><small>{due.length} due · {progress.revisionQueue.length} scheduled</small></div></div>{due.length > 0 ? <button onClick={() => startRevision(due[0].id)}>Start revision →</button> : <small className="waiting-copy">Revisions appear after 10 subsequent submissions.</small>}</div>
          </aside>
        </div>
      </>}

      {page === 'dashboard' && <div className="page-panel"><div className="dashboard-grid"><StatCard label="Total questions" value={stats.total} hint="In your question bank"/><StatCard label="Unattempted" value={stats.unattempted} hint="Waiting to be practised"/><StatCard label="Preserved" value={stats.preserved} hint="Saved for later reference"/><StatCard label="Wrong" value={stats.wrong} hint="Awaiting successful revision"/><StatCard label="Reattempted correct" value={stats.reattempted} hint="Cleared during revision"/><StatCard label="Correct · not preserved" value={stats.correctUnpreserved} hint="Answered correctly once"/><StatCard label="Marked for review" value={stats.review} hint="Independent bookmarks"/><StatCard label="Total attempts" value={stats.attempts} hint="Submitted answers"/></div><div className="accuracy-panel"><div><span className="eyebrow">OVERALL PERFORMANCE</span><h2>{stats.accuracy}% <small>accuracy</small></h2><p>{Object.values(progress.records).reduce((n,r)=>n+r.history.filter(h=>h.correct).length,0)} correct submissions out of {stats.attempts} total</p></div><div className="accuracy-track"><div style={{width:`${stats.accuracy}%`}}/></div></div><div className="dashboard-actions"><button className="secondary-button" onClick={exportProgress}>↓ Export progress</button><button className="secondary-button" onClick={() => importRef.current?.click()}>↑ Import progress</button></div></div>}

      {page === 'wrong' && <ListPage title="Unresolved incorrect answers" subtitle="Questions stay here until answered correctly during a scheduled revision." ids={progress.wrongIds} questions={questions} progress={progress} onOpen={id => progress.revisionQueue.some(x => x.id === id && x.dueAt <= progress.totalAttempts) ? startRevision(id) : setQuestion(id)} empty="No unresolved wrong questions. Nice work."/>}
      {page === 'review' && <ListPage title="Your review list" subtitle="Bookmarks are independent of question correctness and preservation." ids={progress.reviewIds} questions={questions} progress={progress} onOpen={id => setQuestion(id)} empty="You have not marked any questions for review."/>}
    </main>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function statusClass(status) { return ({'Unattempted':'unattempted','Correct':'correct-status','Wrong':'wrong-status','Preserved':'preserved-status','Reattempted Correct':'reattempted-status'})[status] || ''; }
function MiniStat({label,value,tone}) { return <div className="mini-stat"><span>{label}</span><strong className={tone}>{value}</strong></div>; }
function StatCard({label,value,hint}) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function ListPage({title,subtitle,ids,questions,progress,onOpen,empty}) {
  const [search,setSearch] = useState('');
  const list = ids.map(id => questions.find(q => q.id === id)).filter(q => q && (`${q.id} ${q.question}`.toLowerCase().includes(search.toLowerCase())));
  return <div className="page-panel"><div className="list-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="list-count">{ids.length} QUESTIONS</span></div><input className="search-input" placeholder="Search by number or question text..." value={search} onChange={e=>setSearch(e.target.value)}/>{list.length ? <div className="question-list">{list.map(q => <div className="list-row" key={q.id}><div className="list-id">{String(q.id).padStart(3,'0')}</div><div className="list-question"><strong>{q.question}</strong><small>{progress.records[q.id]?.incorrectAttempts || 0} incorrect attempts · {progress.revisionQueue.some(x=>x.id===q.id && x.dueAt <= progress.totalAttempts) ? 'Revision due' : 'Scheduled for revision'}</small></div><button className="secondary-button" onClick={()=>onOpen(q.id)}>Open question →</button></div>)}</div> : <div className="empty-state"><div>✓</div><strong>{empty}</strong></div>}</div>;
}
