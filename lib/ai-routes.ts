import { q } from './db.js';
import { HttpError, ask, libraryContext, loadJob, parseJson, postingOrThrow, saveDoc } from './ai.js';

type Body = { job_id?: number; instructions?: string; kind?: string; contact_name?: string; contact_title?: string; resume_id?: number };

const jobHeader = (j: any) => `Company: ${j.company}\nRole: ${j.role_title}\nLocation: ${j.location} ${j.remote_type}`.trim();

export async function aiRoute(action: string, body: Body): Promise<any> {
  const jobId = Number(body.job_id);
  if (!jobId) throw new HttpError(400, 'job_id required');
  const job = await loadJob(jobId);
  const posting = postingOrThrow(job);

  // 1. Posting parser
  if (action === 'parse') {
    const out = parseJson<any>(
      await ask(
        'Extract structured data from a job posting. Respond with ONLY a JSON object with keys: ' +
          'role (string), company (string), location (string), remote_type (string: remote/hybrid/onsite/unknown), salary_range (string, empty if not stated), ' +
          'summary (2 sentence plain summary), requirements (string[] of must-haves), nice_to_haves (string[]), keywords (string[] of skills/terms an ATS would scan for), deadline (YYYY-MM-DD or empty).',
        posting,
      ),
    );
    const sets: string[] = ['posting_parsed = $1', 'updated_at = now()'];
    const vals: any[] = [JSON.stringify(out)];
    // Fill blanks only, never overwrite what she typed.
    for (const [col, val] of [['company', out.company], ['role_title', out.role], ['location', out.location], ['salary_range', out.salary_range], ['remote_type', out.remote_type]] as const) {
      if (val && !job[col]) { vals.push(val); sets.push(`${col} = $${vals.length}`); }
    }
    if (out.deadline && /^\d{4}-\d{2}-\d{2}$/.test(out.deadline) && !job.deadline) { vals.push(out.deadline); sets.push(`deadline = $${vals.length}`); }
    vals.push(jobId);
    return (await q(`UPDATE jobs SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals))[0];
  }

  const lib = await libraryContext();
  if (lib.empty && action !== 'outreach') throw new HttpError(400, 'Add some bullets and a resume version to the Library first');

  // 2. Match / gap check
  if (action === 'match') {
    const out = parseJson<{ summary: string; strengths: string[]; gaps: string[]; suggested_resume_id: number | null }>(
      await ask(
        'Compare the job posting to the candidate material. Respond with ONLY a JSON object: ' +
          'summary (3-4 sentence honest fit assessment), strengths (string[] of requirements the material clearly supports), gaps (string[] of requirements it does not support), ' +
          'suggested_resume_id (number id of the best RESUME VERSION as shown in [#id], or null if none fit).',
        `${jobHeader(job)}\n\nJOB POSTING:\n${posting}\n\nCANDIDATE MATERIAL:\n${lib.text}`,
      ),
    );
    const notes = `${out.summary}\n\nStrengths:\n${out.strengths.map((s) => `- ${s}`).join('\n')}\n\nGaps:\n${out.gaps.map((s) => `- ${s}`).join('\n')}`;
    const valid = lib.resumes.some((r: any) => r.id === out.suggested_resume_id);
    return (
      await q(`UPDATE jobs SET match_notes=$1, resume_version_id=COALESCE($2, resume_version_id), updated_at=now() WHERE id=$3 RETURNING *`, [notes, valid ? out.suggested_resume_id : null, jobId])
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
      3500,
    );
    return saveDoc(jobId, 'resume', `Tailored resume for ${job.company || 'job'}`, text);
  }

  // 4. Cover letter or outreach email
  if (action === 'cover_letter' || action === 'outreach') {
    const isOutreach = action === 'outreach';
    const text = await ask(
      isOutreach
        ? 'Write a short outreach email (under 130 words) to a hiring manager or recruiter. First line: "Subject: ...". Open with a specific reason for reaching out, give one or two relevant proof points from the candidate material, and end with a low-pressure ask. Sound like a person, not a template.'
        : 'Write a cover letter (250-330 words). Open with a specific hook about the company or role, connect two or three real accomplishments from the candidate material to the posting\'s top needs, close briefly. No "I am writing to apply" opener.',
      `${jobHeader(job)}\n${isOutreach && body.contact_name ? `Recipient: ${body.contact_name}${body.contact_title ? `, ${body.contact_title}` : ''}\n` : ''}\nJOB POSTING:\n${posting}\n\nCANDIDATE MATERIAL:\n${lib.text}${body.instructions ? `\n\nExtra instructions: ${body.instructions}` : ''}`,
      1500,
    );
    return saveDoc(jobId, isOutreach ? 'outreach' : 'cover_letter', `${isOutreach ? 'Outreach email' : 'Cover letter'} for ${job.company || 'job'}`, text);
  }

  throw new HttpError(404, 'Unknown AI action');
}
