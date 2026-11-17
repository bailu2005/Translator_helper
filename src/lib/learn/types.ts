export interface LearningWord {
  surface: string;
  reading: string;
  pos: string;
  meaning: string;
  usage: string;
  example: string;
}

export interface LearningGrammar {
  pattern: string;
  meaning: string;
  nuance: string;
  example: string;
}

export interface LearningCard {
  words: LearningWord[];
  grammar: LearningGrammar[];
}

export interface LearningResult {
  card: LearningCard;
  engine: string;
  durationMs: number;
}
