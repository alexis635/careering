import { q } from './db.js';
import { fetchPosting } from './posting.js';
import { caseRoute } from './cases.js';
import { deckAngles, deckRoute } from './decks.js';
import { search } from './search.js';
import { noDash } from '../src/lib/noDash.js';
import { HttpError, ask, libraryContext, loadJob, parseJson, postingOrThrow, saveDoc } from './ai.js';

type Body = { job_id?: number; instructions?: string; kind?: string; contact_name?: string; contact_title?: string; resume_id?: number };

const jobHeader = (j: any) => `Company: ${j.company}\nRole: ${j.role_title}\nLocation: ${j.location} ${j.remote_type}`.trim();

async function parseJob(job: any, posting: string) {
  const jobId = job.id;
  const out = parseJson<any>(
    await ask(
      'Extract structured data from a job posting. Respond with ONLY a JSON object with keys: ' +
        'role (string), company (string), location (string), remote_type (string: remote/hybrid/onsite/unknown), salary_range (string, empty if not stated), ' +
        'summary (2 sentence plain summary), requirements (string[] of must-have skills, experience, and qualifications only; leave out physical demands, work schedule or travel boilerplate, and benefits), nice_to_haves (string[]), keywords (string[] of skills/terms an ATS would scan for), deadline (YYYY-MM-DD or empty), ' +
        'contact_person (name of a named recruiter or hiring manager if the posting gives one, otherwise empty).',
      posting,
    ),
  );
  const sets: string[] = ['posting_parsed = $1', 'updated_at = now()'];
  const vals: any[] = [JSON.stringify(out)];
  // Fill blanks only, never overwrite what she typed.
  for (const [col, val] of [['company', out.company], ['role_title', out.role], ['location', out.location], ['salary_range', out.salary_range], ['remote_type', out.remote_type], ['contact_person', out.contact_person]] as const) {
    if (val && !String(job[col] ?? '').trim()) { vals.push(val); sets.push(`${col} = $${vals.length}`); }
  }
  if (out.deadline && /^\d{4}-\d{2}-\d{2}$/.test(out.deadline) && !job.deadline) { vals.push(out.deadline); sets.push(`deadline = $${vals.length}`); }
  vals.push(jobId);
  return (await q(`UPDATE jobs SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals))[0];
}

export async function aiRoute(action: string, body: Body): Promise<any> {
  if (action === 'ask') return askRoute(body);
  if (action === 'resume') return resumeRoute(body as any);
  if (action === 'case') return caseRoute(body as any);
  if (action === 'deck') return deckRoute(body as any);
  if (action === 'deck-angles') return deckAngles(body as any);
  const jobId = Number(body.job_id);
  if (!jobId) throw new HttpError(400, 'job_id required');
  const job = await loadJob(jobId);

  // Fetch the posting text from the job's link
  if (action === 'fetch') {
    const text = await fetchPosting(job.source_link);
    return (await q(`UPDATE jobs SET posting_text=$1, updated_at=now() WHERE id=$2 RETURNING *`, [text, jobId]))[0];
  }

  // One step: read the link, then parse it, so only the link has to be typed by hand
  if (action === 'import') {
    const text = await fetchPosting(job.source_link);
    const updated = (await q(`UPDATE jobs SET posting_text=$1, updated_at=now() WHERE id=$2 RETURNING *`, [text, jobId]))[0];
    return parseJob(updated, text);
  }
  const posting = postingOrThrow(job);

  // 1. Posting parser
  if (action === 'parse') return parseJob(job, posting);

  const lib = await libraryContext();
  if (lib.empty && !['outreach', 'follow_up', 'thank_you'].includes(action)) throw new HttpError(400, 'Add some bullets and a resume version to the Library first');

  // 2. Match / gap check
  if (action === 'match') {
    const out = parseJson<{ summary: string; strengths: string[]; gaps: string[]; suggested_resume_id: number | null; fit: string }>(
      await ask(
        'Compare the job posting to the candidate material. Respond with ONLY a JSON object: ' +
          'summary (3-4 sentence honest fit assessment), strengths (string[] of requirements the material clearly supports), gaps (string[] of requirements it does not support), ' +
          'suggested_resume_id (number id of the best RESUME VERSION as shown in [#id], or null if none fit), ' +
          'fit (exactly one of "strong", "moderate", "weak": strong = most requirements clearly supported, weak = core requirements unsupported).',
        `${jobHeader(job)}\n\nJOB POSTING:\n${posting}\n\nCANDIDATE MATERIAL:\n${lib.text}`,
      ),
    );
    const notes = `${out.summary}\n\nStrengths:\n${out.strengths.map((s) => `- ${s}`).join('\n')}\n\nGaps:\n${out.gaps.map((s) => `- ${s}`).join('\n')}`;
    const valid = lib.resumes.some((r: any) => r.id === out.suggested_resume_id);
    const fit = ['strong', 'moderate', 'weak'].includes(out.fit) ? out.fit : null;
    return (
      await q(`UPDATE jobs SET match_notes=$1, resume_version_id=COALESCE($2, resume_version_id), fit=COALESCE($3, fit), updated_at=now() WHERE id=$4 RETURNING *`, [notes, valid ? out.suggested_resume_id : null, fit, jobId])
    )[0];
  }

  // 3. Resume tailoring
  if (action === 'tailor') {
    const framing = lib.resumes.find((r: any) => r.id === (body.resume_id ?? job.resume_version_id));
    const text = await ask(
      'Write a tailored one-page resume in EXACTLY this plain-text layout, nothing else (no code fences, no commentary):\n' +
        'Line 1: the candidate\'s full name. Line 2: a short headline for the role being targeted. Line 3: one contact line (email · phone), all copied from the base resume or career facts; if missing use [YOUR NAME] and [email · phone]. Never add a location.\n' +
        'Then sections, each starting with "## " and an uppercase title, e.g. "## SUMMARY", "## EXPERIENCE", "## EDUCATION", "## SKILLS". Order sections by what best fits the role.\n' +
        'Inside a section, each job or school is one line "### Title | Dates", then one line "> Organization · City, ST", then bullets that each start with "- ". Summary and skills are plain lines. Use the exact titles and dates from the CAREER FACTS bio.\n' +
        'Choose and lightly reword bullets from the BULLET BANK and the chosen resume version so they speak to the posting. Mirror the posting\'s keywords only where the material supports them. Keep facts, dates, and numbers unchanged. Strongest matches first. Must fit one page.' +
        (body.instructions ? `\n\nExtra instructions: ${body.instructions}` : ''),
      `${jobHeader(job)}\n\nJOB POSTING:\n${posting}\n\nBASE RESUME FRAMING:\n${framing ? framing.body : '(none chosen, use the bullet bank)'}\n\nCANDIDATE MATERIAL:\n${lib.text}`,
      9000,
    );
    return saveDoc(jobId, 'resume', `Tailored resume for ${job.company || 'job'}`, text);
  }

  // 3b. Interview prep sheet
  if (action === 'prep') {
    const sent = await q(`SELECT kind, title, left(body, 2500) AS body FROM job_documents WHERE job_id=$1 AND deleted_at IS NULL AND kind IN ('resume','cover_letter') ORDER BY created_at DESC LIMIT 2`, [jobId]);
    const text = await ask(
      'Prepare the candidate for an interview with this employer. Write an interview prep sheet in EXACTLY this plain-text layout, nothing else (no code fences, no intro):\n' +
        '## LIKELY QUESTIONS\n' +
        '8 to 10 questions. Each is one line "### 1. The question" followed by 2 to 4 bullets starting with "- " that are talking points. Cover: the opener (tell me about yourself, why this role, why this company), questions drawn from the posting\'s top requirements, two or three behavioral questions, and one or two about any real gap. ' +
        'EVERY talking point must come from the candidate material: name the real employer or project and use its real numbers. Where a story fits, give it as situation, action, result in one bullet. Never invent experience, employers, numbers, or skills.\n' +
        '## GAPS TO PREPARE FOR\n' +
        'Only real gaps between the posting and the candidate material. Each is one line "### The gap" followed by bullets: how to frame it honestly, and the closest real experience to cite. Omit this whole section if there is no real gap.\n' +
        '## QUESTIONS TO ASK THEM\n' +
        '6 thoughtful, specific questions as bullets starting with "- ".\n' +
        '## BEFORE THE INTERVIEW\n' +
        '5 short checklist bullets specific to this posting: what to research, what to have ready, logistics.' +
        (body.instructions ? `\n\nExtra instructions: ${body.instructions}` : ''),
      `${jobHeader(job)}\n\nJOB POSTING:\n${posting}\n\nMATCH NOTES (strengths and gaps already found):\n${job.match_notes || '(none yet)'}\n\nCANDIDATE MATERIAL:\n${lib.text}\n\nDRAFTS SUBMITTED FOR THIS JOB:\n${sent.map((d: any) => `[${d.kind}] ${d.body}`).join('\n\n') || '(none)'}`,
      9000,
    );
    return saveDoc(jobId, 'interview_prep', `Interview prep for ${job.company || 'job'}`, text);
  }

  // 4. Emails: outreach, follow up, and thank you (all return "Subject: ..." then the body, saved as a versioned draft)
  if (action === 'outreach' || action === 'follow_up' || action === 'thank_you') {
    const who = body.contact_name ? `Recipient: ${body.contact_name}${body.contact_title ? `, ${body.contact_title}` : ''}\n` : '';
    const prior = await q(`SELECT direction, subject, left(body, 700) AS body, to_char(sent_at,'Mon DD, YYYY') AS sent FROM job_emails WHERE job_id=$1 ORDER BY sent_at DESC LIMIT 6`, [jobId]);
    const history = prior.length ? `EMAIL HISTORY ON THIS JOB (newest first):\n${prior.map((e: any) => `[${e.direction} ${e.sent}] ${e.subject}\n${e.body}`).join('\n---\n')}\n\n` : '';
    const SIGN = ' End with a plain sign off ("Best," then the candidate\'s full name from the CAREER FACTS). Never use a placeholder like [Your Name].';
    const prompts: Record<string, string> = {
      outreach: 'Write a short outreach email (under 130 words) to a hiring manager or recruiter. First line: "Subject: ...". Open with a specific reason for reaching out, give one or two relevant proof points from the candidate material, and end with a low-pressure ask. Sound like a person, not a template.' + SIGN,
      follow_up: 'Write a short follow up email (under 110 words). First line: "Subject: ...". Refer briefly to the earlier message shown in the email history (when it was sent), add ONE new piece of value or a fresh reason to reply, and make a gentle, specific ask. Do not repeat the whole first pitch. If the history shows a reply, respond to what they said instead. Sound like a person, not a template.' + SIGN,
      thank_you: 'Write a brief thank you email after an interview (under 120 words). First line: "Subject: ...". Thank them, mention one specific topic that came up or that fits the role (use the interview notes if given, otherwise the posting), restate in one sentence why the candidate is a strong fit using real material, and note the next step. Do not claim anything was said in the interview unless it appears in the interview notes. Describe the role as the posting describes it (for example "the role\'s focus on ..."), never as something they told the candidate.' + SIGN,
    };
    const text = await ask(
      prompts[action],
      `${jobHeader(job)}\n${who}\nJOB POSTING:\n${posting}\n\n${history}${job.interview_prep ? `INTERVIEW NOTES:\n${job.interview_prep}\n\n` : ''}CANDIDATE MATERIAL:\n${lib.text}${body.instructions ? `\n\nExtra instructions: ${body.instructions}` : ''}`,
      6000,
    );
    const label = action === 'outreach' ? 'Outreach email' : action === 'follow_up' ? 'Follow up email' : 'Thank you email';
    return saveDoc(jobId, 'outreach', `${label} for ${job.company || 'job'}`, text);
  }

  // 5. Cover letter
  if (action === 'cover_letter') {
    const text = await ask(
      'Write a cover letter as a finished document. Line 1: the candidate\'s full name. Line 2: contact line (email · phone), both from the CAREER FACTS or base resume, never a location. Then a blank line, then the letter: a greeting ("Dear Hiring Team," if no name is known), 3 short paragraphs totalling 250 to 330 words, and a closing "Sincerely," on its own line followed by the candidate\'s name. ' +
        'Open with a specific hook about the company or role, connect two or three real accomplishments from the candidate material to the posting\'s top needs, close briefly. No "I am writing to apply" opener. Plain paragraphs only, separated by blank lines.',
      `${jobHeader(job)}\n\nJOB POSTING:\n${posting}\n\nCANDIDATE MATERIAL:\n${lib.text}${body.instructions ? `\n\nExtra instructions: ${body.instructions}` : ''}`,
      6000,
    );
    return saveDoc(jobId, 'cover_letter', `Cover letter for ${job.company || 'job'}`, text);
  }

  throw new HttpError(404, 'Unknown AI action');
}

/** "Ask anything": answers from the current job first, then the rest of the app. */
async function askRoute(body: Body & { q?: string }) {
  const question = (body.q || '').trim();
  if (!question) throw new HttpError(400, 'Ask a question first');
  const parts: string[] = [];
  if (body.job_id) {
    const job = await loadJob(Number(body.job_id));
    const [docs, notes, actions, contacts, emails] = await Promise.all([
      q(`SELECT kind, title, left(body, 1800) AS body FROM job_documents WHERE job_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 6`, [job.id]),
      q(`SELECT body, created_at FROM job_notes WHERE job_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 15`, [job.id]),
      q(`SELECT text, done FROM job_actions WHERE job_id=$1 AND deleted_at IS NULL`, [job.id]),
      q(`SELECT name, title, email, notes FROM job_contacts WHERE job_id=$1 AND deleted_at IS NULL`, [job.id]),
      q(`SELECT direction, from_addr, to_addr, subject, left(body, 800) AS body, sent_at FROM job_emails WHERE job_id=$1 ORDER BY sent_at DESC LIMIT 10`, [job.id]),
    ]);
    parts.push(`CURRENT JOB\n${JSON.stringify({ ...job, posting_text: String(job.posting_text).slice(0, 6000), posting_parsed: undefined })}\nDOCUMENTS: ${JSON.stringify(docs)}\nNOTES: ${JSON.stringify(notes)}\nNEXT ACTIONS: ${JSON.stringify(actions)}\nCONTACTS: ${JSON.stringify(contacts)}\nEMAILS: ${JSON.stringify(emails)}`);
  }
  const hits = (await search(question.split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join(' ') || question, body.job_id ? Number(body.job_id) : null)).slice(0, 10);
  if (hits.length) parts.push(`OTHER MATCHES ACROSS THE APP\n${hits.map((h) => `[${h.type}] ${h.label}: ${h.snippet}`).join('\n')}`);
  const lane = await q(`SELECT l.name, count(j.id)::int AS jobs FROM lanes l LEFT JOIN jobs j ON j.lane_id=l.id AND j.deleted_at IS NULL WHERE l.deleted_at IS NULL GROUP BY l.id, l.name ORDER BY l.position`);
  parts.push(`LANES: ${JSON.stringify(lane)}`);
  const answer = await ask(
    'Answer the user\'s question about their job search using only the material below. Be brief and specific. Name the job or lane you are talking about. If the material does not contain the answer, say so.',
    `${parts.join('\n\n')}\n\nQUESTION: ${question}`,
    4000,
  );
  return { answer };
}

/** Resume builder: describe the resume you need, no job required. Every result (and every refinement) is saved to the Library as its own item. */
const RESUME_FORMAT =
  'Write a one page resume in EXACTLY this plain-text layout, nothing else (no code fences, no commentary):\n' +
  'Line 1: the candidate\'s full name. Line 2: a short headline for the target role. Line 3: one contact line (email · phone) from the CAREER FACTS. Never add a location.\n' +
  'Then sections, each starting with "## " and an uppercase title, such as "## SUMMARY", "## EXPERIENCE", "## EDUCATION", "## KEY COMPETENCIES". Order the sections by what fits the request best.\n' +
  'Inside a section, each job or school is one line "### Title | Dates", then one line "> Organization · City, ST", then bullets that each start with "- ". Summary and competencies are plain lines.\n' +
  'Use the exact employers, titles, and dates from the CAREER FACTS, and never leave a gap in the timeline. Choose and lightly reword bullets from the BULLET BANK and the master resumes so they serve the request; older or less relevant roles can shrink to one bullet. Keep every fact, date, and number exactly as written. It must fit one page with comfortable, readable text: 15 to 19 bullets in total, each under 30 words, and a summary of 2 to 3 sentences.';

async function resumeRoute(body: { request?: string; feedback?: string; item_id?: number; base_id?: number }) {
  const lib = await libraryContext();
  if (lib.empty) throw new HttpError(400, 'Add your resumes and bullets to the Library first');
  let prev: any = null;
  if (body.item_id) prev = (await q(`SELECT id, title, body FROM library_items WHERE id=$1 AND kind='resume'`, [body.item_id]))[0];
  const request = (body.request || '').trim();
  const feedback = (body.feedback || '').trim();
  if (!prev && !request) throw new HttpError(400, 'Describe the resume you need first');
  if (prev && !feedback) throw new HttpError(400, 'Say what to change first');

  const base = body.base_id ? (await q(`SELECT title, body FROM library_items WHERE id=$1 AND kind='resume' AND deleted_at IS NULL`, [body.base_id]))[0] : null;
  const text = await ask(
    prev ? `${RESUME_FORMAT}\n\nRevise the CURRENT RESUME below according to the feedback. Change only what the feedback asks for, and keep the same layout.` : RESUME_FORMAT,
    prev
      ? `CURRENT RESUME:\n${prev.body}\n\nFEEDBACK: ${feedback}\n\nCANDIDATE MATERIAL:\n${lib.text}`
      : `WHAT THE RESUME IS FOR: ${request}\n\n${base ? `START FROM THIS RESUME'S FRAMING (${base.title}):\n${base.body}\n\n` : ''}CANDIDATE MATERIAL:\n${lib.text}`,
    9000,
  );

  // Save every version, never overwrite: "Custom: <request>" then "... v2", "... v3" for refinements.
  const rootTitle = prev ? String(prev.title).replace(/ v\d+$/, '') : `Custom: ${request.replace(/\s+/g, ' ').slice(0, 60)}`;
  const n = (await q(`SELECT count(*)::int AS n FROM library_items WHERE kind='resume' AND (title = $1 OR title LIKE $2)`, [rootTitle, `${rootTitle} v%`]))[0].n;
  const title = noDash(n ? `${rootTitle} v${n + 1}` : rootTitle);
  return (await q(`INSERT INTO library_items (kind, title, body, tags) VALUES ('resume', $1, $2, $3) RETURNING *`, [title, text, ['generated']]))[0];
}
