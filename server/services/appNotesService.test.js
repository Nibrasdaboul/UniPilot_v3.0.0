import { describe, it, expect } from 'vitest';
import { buildAppNoteContent } from './appNotesService.js';

describe('published course-work app notes', () => {
  it('writes the vice-dean publish line plus status and encouragement', () => {
    const text = buildAppNoteContent('شبكات', 78, { published: true });
    expect(text).toMatch(/نُشرت علامات هذه المادة من نائب العميد/);
    expect(text).toMatch(/المادة: شبكات/);
    expect(text).toMatch(/العلامة: 78/);
    expect(text).toMatch(/وضع عادي/);
    expect(text).toMatch(/تشجيع/);
  });

  it('adds a risk recommendation below 70', () => {
    const text = buildAppNoteContent('برمجة', 55, { published: true });
    expect(text).toMatch(/خطر عالي/);
    expect(text).toMatch(/توصية/);
  });
});
