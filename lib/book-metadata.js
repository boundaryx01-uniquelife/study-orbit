// Only explicit numeric metadata is accepted; never infer counts from descriptions.
export function positiveCount(...values) {
  for (const value of values) {
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    if (!String(value).trim()) continue;
    const count = Number(value);
    if (Number.isInteger(count) && count > 0 && count <= 2147483647) return count;
  }
  return null;
}

export function bookCounts(book) {
  return {
    total_pages: positiveCount(book.total_pages, book.page_count, book.pageCount, book.pages),
    total_problems: positiveCount(book.total_problems, book.problem_count, book.problemCount, book.question_count)
  };
}
