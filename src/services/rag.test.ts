import { describe, expect, it } from 'vitest'
import { ragQueryBody } from './rag'

describe('ragQueryBody', () => {
  it('keeps the selected retrieval scope explicit', () => {
    expect(ragQueryBody('What are the review requirements?', { scope: 'project' })).toEqual({
      question: 'What are the review requirements?', scope: 'project',
    })
  })

  it('binds synthetic retrieval to one patient document', () => {
    expect(ragQueryBody('Summarize recorded conditions', { scope: 'synthetic-patient', documentId: 'KD-1' })).toEqual({
      question: 'Summarize recorded conditions', scope: 'synthetic-patient', documentId: 'KD-1',
    })
  })
})
