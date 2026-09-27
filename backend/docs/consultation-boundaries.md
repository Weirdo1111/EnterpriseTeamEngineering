# Two consultation workflows

The teacher's requirements describe two different clinical encounters. They should never share one conversation state or be presented as interchangeable.

| | Patient online visit | Physician group case review |
| --- | --- | --- |
| Participants | Patient and treating physician | Requesting physician and invited specialists; the patient is the case subject, not a discussion participant |
| Trigger | Patient seeks care or follow-up | Physician requests colleagues' opinions on a specific case |
| Core record | Patient-physician messages, attachments, visit status | Case request, shared materials, participants, each specialist's contribution, shared conclusion and report |
| Completion | Treating physician closes the visit and prepares a medical record | Invited specialists provide opinions; responsible physician records the conclusion and follow-up responsibility |
| Current project | Text conversation demo plus AI record-draft handoff | Local workflow demo with request, named specialist contributions, shared conclusion and report; no live conference or individually signed opinions |

The doctor requirements PPT distinguishes Online Consultation (slide 5) from Remote Consultation / multidisciplinary collaboration (slide 7). The four-week development PPT includes remote consultation among the core modules shipped this phase (slide 6); only HD video/recording and doctor social-community features are deferred to Phase 2. The current group-review page is a workflow demo, not a completed real-time multidisciplinary conference: there is no multi-user messaging, verified specialist identity, individual opinion approval, durable case-room storage, or live video.

For a future production implementation, use separate patient-visit and group-review entities and permissions. A case review may reference an existing patient visit or record but must not expose the patient chat as a doctor-only discussion thread. Record who viewed shared materials, who wrote each opinion, who accepted the final report, and what information was available at that time.
