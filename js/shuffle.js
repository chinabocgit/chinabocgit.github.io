// Shuffling of answer choices and order items for display.
// Used by practice and redo; exams will use it too, so the correct answer is not always in the same place.
export const shuffle = a => {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
};

// Returns a copy of the question payload with its options (choice) or items (order) shuffled.
//  - payload.shuffle === false : keep the given option order (older question versions).
//  - payload.keep_last === true : shuffle every option except the last one, which stays last
//    (for options such as "三個人一樣多" or "看不出來" that read oddly in the middle).
export function shufflePayload(q) {
  const p = JSON.parse(JSON.stringify(q.payload || {}));
  if (q.qtype === "choice" && p.shuffle !== false && Array.isArray(p.options)) {
    p.options = p.keep_last === true && p.options.length > 2
      ? [...shuffle(p.options.slice(0, -1)), p.options[p.options.length - 1]]
      : shuffle(p.options);
  }
  if (q.qtype === "order" && Array.isArray(p.items)) p.items = shuffle(p.items);
  return p;
}
