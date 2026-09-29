# Medication safety knowledge integration (Mainland China)

The order-check engine is an advisory workflow, not a prescribing authorization. It never returns "safe to prescribe". With no configured product catalog, it can flag an exact documented ingredient allergy and a narrow preliminary amoxicillin-versus-penicillin allergy warning. A separate optional DDInter index can flag published drug-drug interaction pairs, but does not establish complete interaction coverage. Product-specific cross-allergy, geriatric prescribing, and dose remain unassessed. The repository contains no pharmacist-reviewed Mainland China product catalog.

## Optional DDInter 2.0 course-demo index

From `backend/`, run `npm run ddinter:prepare` before `npm start`. The script downloads a pinned upstream snapshot, verifies its SHA-256 hash, and writes `data/ddinter/interactions.json`. That directory is Git-ignored. The generated file retains only generic drug names, pair severity, and mechanism text; it excludes CIEL mappings, disease tables, inferred chains, and brand-name lists. `DDINTER_KNOWLEDGE_PATH` may point to a prepared index at another location. The backend loads the index once at startup; restart after updating it.

The source is [DDInter 2.0](https://ddinter2.scbdd.com/) via the [OpenMRS knowledge-base packaging project](https://github.com/pbiondich/openmrs-ddi-knowledge-base). Citation: Xiong G, et al. "DDInter 2.0: an enhanced drug interaction resource with expanded data coverage, new interaction types, and improved user interface." *Nucleic Acids Research* 2025;53(D1):D1356-D1364. DDInter's [terms](https://ddinter.scbdd.com/terms/) specify CC BY-NC-SA 4.0 and non-commercial use; this integration is for non-commercial coursework only. The packaging project's code license does not override the upstream data terms. Do not publish the generated index or use it in a commercial or clinical deployment without separate review of rights and clinical suitability.

To demonstrate a known interaction, select a physician account, enter `Metoprolol` as the proposed ingredient, add `Verapamil` under **Additional medication details > Current medications**, confirm the current medication list, then run the check. DDInter rates this pair `Major`; the result displays its mechanism, source, and remaining coverage gaps. Unconfirmed lists, ambiguous names, unrecognized drugs, and absent pairs never produce a safety clearance. The dataset does not evaluate dose, eGFR, Beers criteria, or the patient's indication.

The preliminary warning recognizes `Penicillin`/`青霉素` and `Amoxicillin`/`阿莫西林`, including a single trailing dose and route such as `Amoxicillin 0.5g oral`. It is based on the [Xinjiang Drug Administration public safety notice](https://mpa.xinjiang.gov.cn/xjyjj/yyaq/202310/39284ff54a27437bbca06a4ab42ecaa1.shtml), not a product-specific approved label or a locally pharmacist-reviewed rule. It is a stop-and-verify alert, not a comprehensive cross-allergy classifier. The parser also recognizes `Azithromycin`/`阿奇霉素` and `Metoprolol`/`美托洛尔` as distinct ingredients, but does not assert that either is low risk. Unknown names and combination products remain unresolved. The dedicated route, dose, frequency, current-medicine, and eGFR fields still need verified values; text entered into the ingredient field does not prove those values.

For a patient whose structured disease tags include diabetes, metoprolol also produces a preliminary condition warning based on a [DailyMed product label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0ccb9d3c-3f9a-486d-9b27-dc6f3ef6f4ed): beta blockers may mask an early sign of hypoglycemia. This is a sourced educational prompt, not a verified Mainland China product rule, a diagnosis, or a reason to declare the proposed order unsafe or safe without clinician review.

## Review pipeline

```text
Resolve a single known ingredient or a reviewed catalog entry.
Compare documented allergies by exact name and known Chinese/English aliases.
Apply the narrow, source-linked amoxicillin-versus-penicillin warning.
If a confirmed current medication list and DDInter index are available, look up uniquely resolved drug pairs.
Apply pharmacist-reviewed product rules only when approval number and required context match.
Report missing medication reconciliation, interaction coverage, dose inputs, renal values, and geriatric rules.
Show the most severe finding and all remaining gaps; never infer that no finding means a safe prescription.
```

For a 72-year-old with a recorded penicillin allergy but no confirmed current medicines or eGFR: `Amoxicillin 0.5g oral` produces a critical preliminary class warning and unresolved checks; `Azithromycin 0.25g oral` and `Metoprolol 25mg oral` produce no penicillin-allergy finding but remain incomplete. These are behavior examples, not prescribing recommendations. The [azithromycin label](https://www.dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=45410338-6bff-476b-b8e1-6c6238205a99&type=pdf) identifies cardiac QT concerns in older adults; the [metoprolol label](https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=0ccb9d3c-3f9a-486d-9b27-dc6f3ef6f4ed&version=1) identifies bradycardia and diabetes-related precautions. The [AGS Beers Criteria](https://agsjournals.onlinelibrary.wiley.com/doi/epdf/10.1111/jgs.18372) require contextual review and are not a substitute for locally applicable product rules.

Set `MEDICATION_KNOWLEDGE_PATH` in `backend/.env` to an absolute JSON path only after a clinical pharmacist approves the source, product mapping, rules, and usage rights. The server validates and loads the file at startup; a malformed file prevents startup. Updating it requires a controlled release and server restart. The rules are not extracted directly from a RAG answer or LLM text.

## Provider contract

```json
{
  "formatVersion": 1,
  "jurisdiction": "CN",
  "version": "organization-reviewed-release-id",
  "medications": [
    {
      "ingredient": "FICTIONAL DRUG A",
      "approvalNumber": "FICTIONAL-APPROVAL-A",
      "aliases": ["FICTIONAL ALIAS A"],
      "interactions": [{
        "withIngredient": "FICTIONAL DRUG B",
        "message": "Fictional test interaction; not clinical advice.",
        "severity": "critical",
        "evidence": {
          "title": "Fictional test label",
          "url": "https://example.org/fictional-label",
          "version": "test-1",
          "reviewedBy": "Test Pharmacist",
          "reviewedAt": "2026-01-01"
        }
      }],
      "crossAllergies": [],
      "doseRules": [{
        "route": "oral",
        "maxDailyMg": 100,
        "minAge": 65,
        "maxEgfr": 30,
        "message": "Fictional test dose limit exceeded.",
        "evidence": {
          "title": "Fictional test label",
          "url": "https://example.org/fictional-label",
          "version": "test-1",
          "reviewedBy": "Test Pharmacist",
          "reviewedAt": "2026-01-01"
        }
      }]
    }
  ]
}
```

The example is synthetic and must never be installed for clinical use. A real provider must supply product approval numbers, ingredient aliases, pairwise interactions, explicitly reviewed cross-allergy pairs, and product-/route-specific dose limits with dated source links. `doseRules` use milligrams per day; the UI converts g and mcg. Current medicines are ingredient names, so unmatched products and incomplete pair coverage are disclosed. eGFR is optional input; renal rules are marked unassessed when it is missing. A negative result only means no loaded rule matched the supplied data.

Before release, connect a licensed Chinese drug knowledge provider or a hospital-maintained, pharmacist-reviewed formulary. Establish source rights, update frequency, product/strength/route mapping, renal and hepatic rules, interaction severity, cross-allergy evidence, duplicate therapy, and validation against representative cases. Store patient medicines and labs in an authorized server-side record rather than trusting browser-local data; maintain pharmacist review and clinician override/audit. The current UI does not collect all of these inputs and should not be presented as complete medication reconciliation.

The [National Health Commission prescription rules](https://www.nhc.gov.cn/wjw/c100221/202201/6a4ee53e4a3a407fbd9f520e1e2662c5.shtml) require pharmacists to review dose, route, duplicate therapy, and clinically significant interactions. The [electronic medical record functional specification](https://www.nhc.gov.cn/wjw/gfxwj/201101/a769b5f4b9ca4415a72fa9888bce0bc1.shtml) also describes automated allergy and interaction alerts, including new orders against current medication. These requirements are broader than the current implementation.
