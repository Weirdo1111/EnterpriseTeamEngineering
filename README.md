# Smart Healthcare Doctor Service System

A Vue 3, TypeScript, and Element Plus doctor workspace prototype with a compact clinical workstation layout and end-to-end interactive workflows.

## Feature Scope

- Multi-method sign-in and role demos: password with verification code, SMS verification, and facial verification
- Doctor dashboard: daily tasks, consultation queue, priority patients, and referral tasks
- Patient management: multi-field search, profile editing, bulk grouping, and health trends
- Online consultation: session queue, uploads, history export, summaries, and record drafts
- Electronic medical records: structured records, editable orders, tiered review, and archiving
- Remote consultation: requests, acceptance, specialist assignment, opinions, and report generation
- Health management: care plans, reminders, monitoring trends, and periodic assessments
- AI assistant: record drafts, consultation summaries, similar records, and order risk checks
- Role-scoped audit logs: personal, department, or platform-wide visibility

All business data and external services are local demonstrations. The app does not connect to real patient systems, SMS providers, facial recognition, or medical AI services.

## Technology Stack

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Element Plus
- ECharts
- @lucide/vue

## Local Development

```bash
npm install
npm run dev
```

Default URL:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```
