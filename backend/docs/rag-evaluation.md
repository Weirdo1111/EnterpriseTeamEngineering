# RAG Evaluation

The benchmark in `src/rag/evaluation-cases.ts` contains 29 in-scope questions and one out-of-scope medication-dose question. It covers project requirements, CDC older-adult fall guidance, and fact retrieval from de-identified Synthea records. Relevant documents and source locations are explicitly labeled so reviewers can inspect the ground truth. The answer generator never grades itself.

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

### Sparse-label ceiling and actual returned evidence

The unchanged 29 retrieval questions label 60 relevant source locations in total: seven questions have one location, thirteen have two, and nine have three. Since Precision@8 retains the fixed denominator eight even if fewer results are returned, its maximum macro-average on these labels is `60 / (29 * 8) = 25.86%`. The historical 25.4% is close to that ceiling; it must not be interpreted as 25.4% answer accuracy or, by itself, as proof of poor retrieval. Unlabeled supplementary evidence still does not receive relevance credit.

The evaluator now reports the same fixed-cutoff metrics at 1, 3, 5, and 8, the label-implied precision ceiling, actual-returned precision, mean returned count, and empty-result rate. Actual-returned precision divides unique labeled hits by actual returned results, not by k; empty results score zero. Always read it alongside recall and empty-result rate: returning one relevant source can improve that ratio while omitting necessary evidence. The existing questions, relevance labels, and Precision@8 formula are unchanged.

## Precision candidate strategy

`source-group` remains the default. An experimental `precision` strategy applies [MiniSearch](https://github.com/lucaong/minisearch) full-text ranking to already scope-filtered source groups and fuses the lexical and semantic rankings using weighted reciprocal ranks. Text normalization uses NFKC and `Intl.Segmenter` to retain Chinese word boundaries and short tokens such as `mg`. Prefix/fuzzy matching is disabled, and no benchmark question or expected page is hardcoded into the ranker.

Candidates must first satisfy the existing evidence-score floor (default 0.15). Rank fusion never promotes a below-floor result into sufficient evidence. The experimental selector retains candidates within 70% of the best fused score, up to eight, rather than padding the result list. If no lexical matches exist, it falls back to semantic ranking with the same floor and a relative cutoff. These initial cutoffs are heuristics, not calibrated clinical confidence; they can reduce recall, especially when required evidence uses different terminology, and require full-corpus validation before rollout.

Run `npm run build` and `npm run eval:rag -- --details` to compare fragment baseline, the deployed source-group strategy, and the precision candidate using identical query embeddings and labels. The report includes per-case candidate recall, actual returned count, rankings, and additional local rerank latency. It makes no additional embedding or chat calls for candidate ranking. `--strategy=precision` selects the strategy only for optional `--generate` answer evaluation. Configure `RAG_RETRIEVAL_STRATEGY=precision` only after manual review, then restart the backend; unset it or use `source-group` to restore the deployed ranking.

Promotion requires complete evaluation coverage, no unexplained recall loss, satisfactory top-1/top-3 ranking, and human review of removed evidence. An increase in actual-returned precision alone is not sufficient. RAG responses and audit records identify the retrieval strategy; the source `score` retains the original evidence score and optional `rerankScore` is only an ordering score.

Implementation check on 2026-09-28: 61 backend tests pass, including 13 additional ranking, selection, scope, and metric regressions. The full corpus run was attempted but blocked by MariaDB `ER_HOST_NOT_PRIVILEGED` (localhost connection refused by the database authorization layer). No new full-corpus precision, recall, latency, or generation improvement is claimed, and the default strategy was not changed.

## Reference Run

The table below is the pre-expansion baseline and remains here for comparison with later corpus runs.

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

## Expanded Corpus Run

Run date: 2026-09-27. Corpus: 12 documents and 416 stored fragments, including one CDC public-domain guide and eight de-identified Synthea records. Evaluation set: 29 retrieval questions and 1 out-of-scope question. Because the evaluation set and retrieval scoping changed, compare this run with the reference run directionally rather than as a controlled before-and-after experiment.

| Metric | Fragment baseline | Scoped source-location aggregation |
| --- | ---: | ---: |
| Precision@5 | 35.2% | 37.9% |
| Recall@5 | 87.4% | 93.7% |
| Precision@8 | 23.7% | 25.4% |
| Recall@8 | 92.5% | 98.3% |
| MRR@8 | 92.2% | 96.0% |
| nDCG@8 | 87.0% | 92.2% |
| Retrieval latency P50 | - | 650 ms |
| Retrieval latency P95 | - | 1,532 ms |
| Error rate | - | 0.0% |

Scoped Recall@8 is 96.9% for project requirements and 100% for both clinical guidance and synthetic-patient retrieval. Cross-domain contamination is 0% in all three domains. Use `npm run eval:rag -- --details` for per-case results or add `--case=CASE_ID` to debug one case. Generation metrics were not rerun for this corpus because that operation sends retrieved internal project passages to the configured external model and requires separate informed approval.

## Interpretation Limits

These figures measure this small, versioned requirements corpus and must not be presented as clinical-accuracy results. Precision is conservative because only manually labeled primary slides count as relevant; useful supplementary slides count as false positives. Phrase-based concept coverage is reproducible but does not prove semantic correctness. Citation validity checks that citation numbers resolve, not that each cited passage entails every claim. The single abstention case is a safety smoke test, not a statistically meaningful clinical-safety estimate. Latency varies with network and provider load; compare repeated runs and report sample counts before making capacity claims.
