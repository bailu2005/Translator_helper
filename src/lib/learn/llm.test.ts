import { describe, expect, it } from 'vitest';
import { parseLearningCard } from './llm';

describe('parseLearningCard', () => {
  it('parses JSON inside code fences', () => {
    const card = parseLearningCard(
      '```json\n{"words":[{"surface":"食べる","reading":"たべる","pos":"动词","meaning":"吃"}],"grammar":[{"pattern":"〜ている","meaning":"正在"}]}\n```',
    );

    expect(card?.words[0]?.surface).toBe('食べる');
    expect(card?.grammar[0]?.pattern).toBe('〜ている');
  });

  it('extracts JSON from surrounding text', () => {
    const card = parseLearningCard(
      '结果如下：{"words":[{"surface":"A","meaning":"B"}],"grammar":[]}',
    );
    expect(card?.words).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parseLearningCard('not json')).toBeNull();
  });

  it('drops entries without required fields', () => {
    const card = parseLearningCard(
      '{"words":[{"surface":"","meaning":"x"},{"surface":"A","meaning":"B"}],"grammar":[]}',
    );
    expect(card?.words.map((word) => word.surface)).toEqual(['A']);
  });

  it('limits the number of entries', () => {
    const words = Array.from({ length: 20 }, (_, index) => ({
      surface: `w${index}`,
      meaning: 'm',
    }));
    const card = parseLearningCard(JSON.stringify({ words, grammar: [] }));
    expect(card?.words).toHaveLength(8);
  });
});
