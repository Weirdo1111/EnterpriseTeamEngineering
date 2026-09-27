# Medication safety knowledge integration (Mainland China)

The order-check engine is an advisory workflow, not a prescribing authorization. It never returns "safe to prescribe". With no configured catalog, it can flag an exact documented ingredient allergy but reports interaction, cross-allergy, and dose as unassessed. The repository contains no real medication rules or licensed drug database.

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
