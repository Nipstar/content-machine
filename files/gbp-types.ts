/**
 * Google Business Profile — Type definitions
 */

import type { Pillar } from "./types.js";

export type GBPCTAType = "LEARN_MORE" | "CALL" | "BOOK" | "ORDER" | "SIGN_UP";

export type GBPPostStatus = "queued" | "posted" | "failed";

export type GBPTemplateVariant = "stat" | "tip" | "quote" | "question";

export interface StatImageData {
  stat_number: string;
  stat_context: string;
  supporting_line_1: string;
  supporting_line_2: string;
}

export interface TipImageData {
  tip_headline: string;
  tip_detail_1: string;
  tip_detail_2: string;
}

export interface QuoteImageData {
  quote_line_1: string;
  quote_line_2: string;
  quote_line_3: string;
  continuation_1: string;
  continuation_2: string;
}

export interface QuestionImageData {
  question_line_1: string;
  question_line_2: string;
  question_line_3: string;
  supporting_line_1: string;
  supporting_line_2: string;
}

export type GBPImageData = StatImageData | TipImageData | QuoteImageData | QuestionImageData;

export interface GBPPost {
  id: string;
  post_text: string;
  image_url: string;
  cta_type: GBPCTAType;
  cta_url: string;
  source_url: string;
  scheduled_date: string;
  scheduled_display: string;
  status: GBPPostStatus;
  topic: string;
  pillar: Pillar;
  template_variant: GBPTemplateVariant;
  image_data: GBPImageData;
}
