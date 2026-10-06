import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { database } from '../../../../../../lib/approvals';
import { authorizeProject, readBearerToken } from '../../../../../../lib/creation-projects';

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ message: 'Project credential required.' });
  const db = database(req.scope), project = await authorizeProject(db, req.params.id, token);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  const input = req.body as { revisionId?: unknown; requestId?: unknown };
  if (typeof input?.revisionId !== 'string' || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) return res.status(400).json({ message: 'Invalid edit request.' });
  const jobId = `image_${input.requestId}`;
  const outcome = await db.transaction(async (trx) => {
    const owner = await trx('flo_creation_project').where({ id: project.id }).forUpdate().first();
    if (owner.payment_state !== 'captured') return 402;
    const revision = await trx('flo_creation_revision').where({ id: input.revisionId, project_id: project.id }).first();
    if (!revision || revision.status === 'APPROVED') return 409;
    if (await trx('flo_generation_job').where({ id: jobId }).first()) return 409;
    const count = await trx('flo_generation_job').where({ project_id: project.id, kind: 'IMAGE_EDIT' }).count<{ count: string }>('id as count').first();
    if (Number(count?.count ?? 0) >= 20) return 429;
    await trx('flo_generation_job').insert({ id: jobId, project_id: project.id, revision_id: revision.id, kind: 'IMAGE_EDIT', status: 'RUNNING', progress: 10, provider_model: 'gemini-3.1-flash-image', entitlement: JSON.stringify({ paymentState: owner.payment_state, kind: 'IMAGE_EDIT' }) });
    return 201;
  });
  return res.status(outcome).json(outcome === 201 ? { jobId } : { message: 'Edit is not available.' });
}
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ message: 'Project credential required.' });
  const db = database(req.scope), project = await authorizeProject(db, req.params.id, token);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  const input = req.body as { jobId?: unknown; status?: unknown };
  if (typeof input?.jobId !== 'string' || !['READY', 'FAILED'].includes(String(input.status))) return res.status(400).json({ message: 'Invalid status.' });
  const changed = await db('flo_generation_job').where({ id: input.jobId, project_id: project.id, kind: 'IMAGE_EDIT', status: 'RUNNING' }).update({ status: input.status, progress: 100, updated_at: db.fn.now() });
  return res.status(changed ? 200 : 409).json({ updated: changed === 1 });
}
