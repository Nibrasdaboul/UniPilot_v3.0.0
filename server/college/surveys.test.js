import { describe, it, expect } from 'vitest';
import {
  parseSurveyQuestions,
  canPublishSurvey,
  surveyPublishError,
  parseSurveyAnswers,
  tallyOptionResults,
} from './surveys.js';

describe('college MCQ surveys', () => {
  it('keeps only filled prompts and choice texts', () => {
    expect(parseSurveyQuestions([
      { prompt: 'ما تقييم المقرر؟', options: ['ممتاز', '  ', 'جيد', { text: 'ضعيف' }] },
      { prompt: '  ', options: [] },
    ])).toEqual([
      { prompt: 'ما تقييم المقرر؟', options: ['ممتاز', 'جيد', 'ضعيف'] },
    ]);
  });

  it('blocks publish until every question is a real MCQ', () => {
    expect(canPublishSurvey({ title: 'تقييم', questions: [] })).toBe(false);
    expect(surveyPublishError({
      title: 'تقييم',
      questions: [{ prompt: 'س1', options: ['أ'] }],
    })).toMatch(/at least 2 choices/);
    expect(canPublishSurvey({
      title: 'تقييم الفصل',
      questions: [
        { prompt: 'وضوح المحاضرات', options: ['عالية', 'متوسطة', 'ضعيفة'] },
      ],
    })).toBe(true);
  });

  it('accepts one valid choice per question and rejects a missing or foreign option', () => {
    const questions = [
      { id: 1, option_rows: [{ id: 10 }, { id: 11 }] },
      { id: 2, option_rows: [{ id: 20 }, { id: 21 }] },
    ];
    expect(parseSurveyAnswers([
      { question_id: 1, option_id: 10 },
      { question_id: 2, option_id: 21 },
    ], questions).error).toBe(null);
    expect(parseSurveyAnswers([{ question_id: 1, option_id: 10 }], questions).error).toMatch(/every question/);
    expect(parseSurveyAnswers([
      { question_id: 1, option_id: 10 },
      { question_id: 2, option_id: 99 },
    ], questions).error).toMatch(/every question/);
  });

  it('turns answer counts into percentages for the vice dean', () => {
    expect(tallyOptionResults(
      [{ id: 1, option_text: 'نعم' }, { id: 2, option_text: 'لا' }],
      { 1: 3, 2: 1 },
      4,
    )).toEqual([
      { id: 1, option_text: 'نعم', count: 3, percent: 75 },
      { id: 2, option_text: 'لا', count: 1, percent: 25 },
    ]);
    expect(tallyOptionResults([{ id: 1, option_text: 'نعم' }], {}, 0)[0].percent).toBe(0);
  });
});
