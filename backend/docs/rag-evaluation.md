# RAG Evaluation

The benchmark in `src/rag/evaluation-cases.ts` contains eight in-scope requirements questions and one out-of-scope medication-dose question. Relevant documents and slides are explicitly labeled so reviewers can inspect the ground truth. The answer generator never grades itself.

## Metrics

- **Precision@8:** unique labeled relevant sources in the first eight results, divided by eight.
- **Recall@8:** labeled relevant sources retrieved in the first eight, divided by all labeled relevant sources.
- **MRR@8:** reciprocal rank of the first labeled relevant result, averaged across questions.
- **nDCG@8:** ranking quality with higher credit for relevant results near the top.
- **Concept coverage:** proportion of predefined answer concepts matched by deterministic phrase groups.
- **Citation validity:** proportion of citation numbers that point to a returned source.
- **Citation presence:** proportion of answers containing at least one source citation.
- **Response decision accuracy:** correct answer-versus-abstain behavior on the labeled cases.
- **P50/P95 latency:** median and 95th-percentile observed wall-clock latency.
- **Error rate:** failed evaluation requests divided by all evaluation requests.

## Reference Run

Run date: 2026-09-24. Corpus: 3 documents, 272 stored fragments. Evaluation set: 8 retrieval questions and 1 out-of-scope question.

| Metric | Fragment baseline | Source-page aggregation |
| --- | ---: | ---: |
| Precision@8 | 23.4% | 28.1% |
| Recall@8 | 83.3% | 100.0% |
| MRR@8 | 84.4% | 90.6% |
| nDCG@8 | 76.8% | 85.1% |

Generation reference run with Doubao Seed 2.0 Lite:

| Metric | Result |
| --- | ---: |
| Concept coverage | 92.2% |
| Citation validity | 100.0% |
| Citation presence | 100.0% |
| Response decision accuracy | 100.0% (9/9) |
| Generation latency P50 | 8.2 s |
| Generation latency P95 | 12.1 s |
| Error rate | 0.0% |

## Interpretation Limits

These figures measure this small, versioned requirements corpus and must not be presented as clinical-accuracy results. Precision is conservative because only manually labeled primary slides count as relevant; useful supplementary slides count as false positives. Phrase-based concept coverage is reproducible but does not prove semantic correctness. Citation validity checks that citation numbers resolve, not that each cited passage entails every claim. The single abstention case is a safety smoke test, not a statistically meaningful clinical-safety estimate. Latency varies with network and provider load; compare repeated runs and report sample counts before making capacity claims.
