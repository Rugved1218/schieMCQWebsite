export function scheduleRevision(revisionQueue, questionId, totalAttempts) {
  const next = revisionQueue.filter(item => item.id !== questionId);
  next.push({ id: questionId, dueAt: totalAttempts + 10 });
  return next;
}

export function dueRevisions(revisionQueue, totalAttempts) {
  return revisionQueue.filter(item => item.dueAt <= totalAttempts).sort((a, b) => a.dueAt - b.dueAt);
}

export function recordSubmission(previous, question, originalOption, isCorrect, mode = 'practice') {
  const next = structuredClone(previous);
  const id = question.id;
  const old = next.records[id] || { attempts: 0, incorrectAttempts: 0, history: [], firstCorrect: false };
  next.totalAttempts += 1;
  old.attempts += 1;
  old.history.push({ option: originalOption, correct: isCorrect, mode, attempt: next.totalAttempts, at: new Date().toISOString() });

  if (isCorrect) {
    if (mode === 'revision' && next.wrongIds.includes(id)) {
      next.wrongIds = next.wrongIds.filter(x => x !== id);
      next.revisionQueue = next.revisionQueue.filter(x => x.id !== id);
      if (!next.reattemptedIds.includes(id)) next.reattemptedIds.push(id);
    }
    old.firstCorrect = true;
    old.lastCorrect = true;
  } else {
    old.incorrectAttempts += 1;
    old.lastCorrect = false;
    if (!next.wrongIds.includes(id)) next.wrongIds.push(id);
    next.reattemptedIds = next.reattemptedIds.filter(x => x !== id);
    next.revisionQueue = scheduleRevision(next.revisionQueue, id, next.totalAttempts);
  }
  next.records[id] = old;
  return next;
}
