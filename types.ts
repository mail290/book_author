
export interface BookConfig {
  title: string;
  theme: string;
  bookType: string; // Fakta, Kunnskap, Læring, Non-fiction, etc.
  series: string;
  genre: string;
  style: string;
  length: string; // "short", "medium", "long"
  language: string;
}

export interface Chapter {
  id: number;
  title: string;
  content: string;
}

export interface Book {
  id: string;
  config: BookConfig;
  foreword: string;
  chapters: Chapter[];
  afterword: string;
  frontCoverUrl?: string;
  backCoverUrl?: string;
  internalImages: string[];
  status: 'draft' | 'generating' | 'completed';
}

export interface GenerationStep {
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}
