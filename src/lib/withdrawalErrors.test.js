import { describe, it, expect } from 'vitest';
import { withdrawErrorMessage } from './withdrawalErrors.js';

const err = (data) => ({ response: { data } });

describe('withdrawErrorMessage', () => {
  it('maps known codes to Arabic', () => {
    expect(withdrawErrorMessage(err({ code: 'wrong_password', detail: 'Incorrect password' }), true)).toBe('كلمة المرور غير صحيحة.');
  });

  it('maps known codes to English', () => {
    expect(withdrawErrorMessage(err({ code: 'university_id_mismatch' }), false)).toBe('This university ID does not match your account.');
  });

  it('falls back to server detail', () => {
    expect(withdrawErrorMessage(err({ detail: 'Something else' }), true)).toBe('Something else');
  });

  it('falls back to a generic message', () => {
    expect(withdrawErrorMessage(new Error('network'), true)).toBe('تعذّر إتمام العملية');
  });
});
