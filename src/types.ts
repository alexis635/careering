export const STAGES = ['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Closed'] as const;
export type Stage = (typeof STAGES)[number];
export const OUTCOMES = ['Won', 'Lost', 'Withdrawn'] as const;
export const LANE_COLORS = ['#567C8D', '#2F4058', '#8FB0C7', '#B08968', '#7A9E7E', '#A66A6A'];

export interface Lane {
  id: number; name: string; target_date: string | null; status: 'active' | 'paused' | 'achieved';
  notes: string; color: string; position: number;
  counts?: { stage: Stage; n: number }[];
}
export interface Job {
  id: number; lane_id: number; type: 'application' | 'logistics'; company: string; role_title: string;
  source_link: string; stage: Stage; closed_outcome: string | null; salary_range: string; location: string;
  remote_type: string; applied_date: string | null; deadline: string | null; contact_person: string;
  contact_notes: string; posting_text: string; match_notes: string; interview_prep: string;
  resume_version_id: number | null; updated_at: string;
  posting_parsed: { summary?: string; requirements?: string[]; nice_to_haves?: string[]; keywords?: string[] } | null;
}
export interface JobDoc { id: number; kind: string; title: string; body: string; version: number; source: string; created_at: string }
export interface JobNote { id: number; body: string; kind: string; created_at: string }
export interface JobAction { id: number; text: string; done: boolean; due_date: string | null }
export interface LibItem { id: number; kind: 'bullet' | 'resume' | 'bio' | 'snippet'; title: string; body: string; tags: string[] }
export interface JobContact { id: number; name: string; title: string; email: string; source: string; notes: string }
export interface JobEmail { id: number; direction: 'sent' | 'received'; from_addr: string; to_addr: string; subject: string; body: string; sent_at: string; gmail_thread_id: string | null }
