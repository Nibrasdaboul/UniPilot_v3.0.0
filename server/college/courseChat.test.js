import { describe, it, expect } from 'vitest';
import { parseCourseChatBody, COURSE_CHAT_BODY_MAX } from './courseChat.js';

describe('course staff chat helpers', () => {
  it('requires a non-empty message within the limit', () => {
    expect(parseCourseChatBody('  موعد العملي  ').body).toBe('موعد العملي');
    expect(parseCourseChatBody('').error).toMatch(/required/);
    expect(parseCourseChatBody('x'.repeat(COURSE_CHAT_BODY_MAX + 1)).error).toMatch(/4000/);
  });
});
