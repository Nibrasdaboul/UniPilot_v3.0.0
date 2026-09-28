export const COURSE_CHAT_BODY_MAX = 4000;

export function parseCourseChatBody(value) {
  const body = String(value || '').trim();
  if (!body) return { error: 'message is required' };
  if (body.length > COURSE_CHAT_BODY_MAX) {
    return { error: `message must be ${COURSE_CHAT_BODY_MAX} characters or fewer` };
  }
  return { error: null, body };
}
