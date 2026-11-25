// Pipeline stages are labels. A proposal's status comes from what actually happened to it:
//   Sent — sent from ForgePt, sent for e-signature, or confirmed sent after a PDF download
//   Won / Lost — the only statuses a stage sets (stages named "Won" / "Lost")
// Moving between any other stages never changes the status.

export const isWonStage = (stage) => stage?.name === 'Won'
export const isLostStage = (stage) => stage?.name === 'Lost'

/** The status a proposal should have after moving to `stage`. */
export function statusForStage(stage, proposal) {
  if (isWonStage(stage)) return 'Won'
  if (isLostStage(stage)) return 'Lost'
  // Reopening a closed deal: back to Sent if it was ever sent, otherwise Draft
  if (proposal?.status === 'Won' || proposal?.status === 'Lost') return proposal?.sent_at ? 'Sent' : 'Draft'
  return proposal?.status || 'Draft'
}

const SENT_STAGE_NAMES = ['Quote Submitted', 'Proposal Submitted', 'Proposal Sent']

/** Stage a proposal with no pipeline_stage_id is shown in, based on its status. */
export function defaultStageFor(proposal, stages) {
  if (!stages?.length) return null
  const open = stages.filter(s => !isWonStage(s) && !isLostStage(s))
  if (proposal?.status === 'Won') return stages.find(isWonStage) || null
  if (proposal?.status === 'Lost') return stages.find(isLostStage) || null
  if (proposal?.status === 'Sent') return stages.find(s => SENT_STAGE_NAMES.includes(s.name)) || open[open.length - 1] || null
  return open[0] || null
}

/** The stage a proposal belongs in: its own, or the default for its status. */
export function stageOf(proposal, stages) {
  return (proposal?.pipeline_stage_id && stages?.find(s => s.id === proposal.pipeline_stage_id)) || defaultStageFor(proposal, stages)
}
