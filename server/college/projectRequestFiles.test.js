import { describe, it, expect } from 'vitest';
import { parseProjectPdfPayload } from './projectRequestFiles.js';

const MINIMAL_PDF = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');

describe('project request PDF', () => {
  it('accepts a PDF payload and rejects missing or non-PDF files', () => {
    const ok = parseProjectPdfPayload(`data:application/pdf;base64,${MINIMAL_PDF}`, 'خطة.pdf');
    expect(ok.filename).toBe('خطة.pdf');
    expect(ok.buffer.slice(0, 4).toString()).toBe('%PDF');
    expect(() => parseProjectPdfPayload('', 'a.pdf')).toThrow(/required/i);
    expect(() => parseProjectPdfPayload(Buffer.from('hello').toString('base64'), 'notes.txt')).toThrow(/PDF/i);
  });
});
