# Agency Data Hub

Build Phase 1 of an internal operations dashboard for our agency.

IMPORTANT CONTEXT

I already have Teamwork API capability working in another tool built with Loveable. Reuse that authentication and connection pattern as much as possible instead of inventing a new one.

Do NOT build the full analytics dashboard yet.

Do NOT focus on visual polish yet.

This phase is about data ingestion, normalization, sync, and stable internal endpoints.

PHASE 1 OBJECTIVE

Create the integration layer and normalized backend structure for:

- Teamwork

- Teamwork Desk

The output of this phase should be a stable internal data layer that future reporting screens can use.

CORE USE CASE

We need to pull in support/ticket/work item data and normalize it into one internal structure so later we can calculate hours, cost, billable value, company usage, and care plan allocations.

DATA WE NEED TO SUPPORT

We will eventually need:

- Company name

- Ticket ID

- Ticket dates

- Ticket title

- Status

- Type

- Assigned

- Customer name

- Inbox

- Tags

- Ticket URL

- Time data if available

PHASE 1 SCOPE

Build only:

1. integration settings

2. source adapters

3. normalization service

4. sync service

5. database schema

6. internal API endpoints

7. basic validation screens

DO NOT BUILD YET

- profitability calculations

- rate calculations

- tag hour allocation logic

- full executive dashboard

- team KPI reporting

- polished charts

ARCHITECTURE REQUIREMENT

Use modular architecture with:

- adapters

- services

- db models

- internal api routes

- simple admin/test pages

Create separate adapters:

- teamworkAdapter

- teamworkDeskAdapter

Each adapter should hide source-specific API complexity and return structured raw data to the normalization layer.

DATABASE TABLES

Create these initial tables:

integration_connections

- id

- source_name

- is_enabled

- base_url

- api_key_or_token

- auth_type

- last_tested_at

- last_sync_at

- status

- notes

- created_at

- updated_at

tickets

- id

- source_system

- external_ticket_id

- external_company_id

- company_name

- ticket_title

- status

- type

- assigned_name_raw

- assigned_external_id

- customer_name

- inbox

- tags

- ticket_url

- created_at_source

- updated_at_source

- closed_at_source

- actual_logged_time

- raw_payload

- created_at

- updated_at

companies

- id

- source_name

- external_company_id

- company_name

- active_status

- created_at

- updated_at

assigned_name_mappings

- id

- source_name

- raw_assigned_name

- raw_assigned_id

- normalized_team_member_name

- notes

- created_at

- updated_at

sync_runs

- id

- source_name

- sync_type

- status

- started_at

- finished_at

- records_received

- records_created

- records_updated

- error_count

- error_details

- created_at

- updated_at

SOURCE ADAPTERS

1. Teamwork Adapter

Build a Teamwork adapter that can:

- authenticate

- test connection

- fetch companies if available

- fetch relevant work/ticket/task records needed for later reporting

- fetch dates

- fetch assigned user info

- fetch tags if available

- fetch URLs if available

- return structured raw records

IMPORTANT

Since I already have Teamwork working in another Loveable tool, reuse that pattern and structure wherever possible.

2. Teamwork Desk Adapter

Build a Teamwork Desk adapter that can:

- authenticate

- test connection

- fetch tickets

- fetch customer/company info if available

- fetch inbox

- fetch tags

- fetch assigned info

- fetch status

- fetch type

- fetch dates

- fetch ticket URL

- return structured raw records

NORMALIZATION LAYER

Create a normalization service that maps raw records from both adapters into one shared internal ticket model.

Normalized ticket model:

- source_system

- external_ticket_id

- external_company_id

- company_name

- ticket_title

- status

- type

- assigned_name_raw

- assigned_external_id

- customer_name

- inbox

- tags

- ticket_url

- created_at_source

- updated_at_source

- closed_at_source

- actual_logged_time

- raw_payload

Store raw_payload for debugging and source traceability.

SYNC SERVICE

Create a sync orchestration service that:

- reads enabled integrations

- calls the appropriate adapter

- receives raw records

- normalizes them

- upserts into tickets

- creates or updates companies where possible

- logs every run in sync_runs

SYNC RULES

- prevent duplicates using source_system + external_ticket_id

- update changed records on re-sync

- support manual sync first

- structure for scheduled sync later

- log connection errors and parsing errors

- save counts for records received, created, updated, and errors

INTERNAL API ENDPOINTS

Build these endpoints:

GET /api/integrations

- return integration settings records

POST /api/integrations/test

- test a specific source connection

POST /api/integrations/sync

- trigger sync for one source or all enabled sources

GET /api/tickets

Support filters for:

- source_system

- company_name

- assigned_name_raw

- status

- type

- inbox

- tag

- date_from

- date_to

GET /api/tickets/:id

- return full normalized ticket and raw payload

GET /api/companies

- return companies list

GET /api/sync-runs

- return sync history

VALIDATION UI ONLY

Build simple, functional admin pages only:

1. Integrations Page

- Teamwork connection card

- Teamwork Desk connection card

- credential fields

- save settings

- test connection

- manual sync button

2. Tickets Page

- filter bar

- normalized tickets table

Columns:

- source system

- company name

- external ticket id

- ticket title

- status

- type

- assigned raw name

- customer name

- inbox

- tags

- created date

- updated date

- clickable ticket URL

3. Sync Runs Page

- source

- sync type

- started

- finished

- status

- records received

- records created

- records updated

- error count

- error details

CODE ORGANIZATION

Use a clean structure like:

- /adapters

- /services

- /db

- /api

- /pages or /views

Suggested files/services:

- teamworkAdapter

- teamworkDeskAdapter

- ticketNormalizer

- syncService

- integrationService

- ticketsService

SECURITY / CONFIG

- store credentials securely using the best secret/config pattern available in Loveable

- do not expose tokens to the UI after save

- allow editing/replacing credentials

SEEDING / DEVELOPMENT SUPPORT

If needed, scaffold with mock data first, but build the code so real API credentials can be dropped in immediately.

DELIVERABLES FOR PHASE 1

When done, I should have:

1. integration settings page

2. Teamwork adapter scaffold

3. Teamwork Desk adapter scaffold

4. normalization layer

5. sync orchestration service

6. normalized tickets database

7. internal endpoints for tickets/integrations/sync-runs

8. basic validation screens for integrations, tickets, and sync runs

BEFORE FULL IMPLEMENTATION

First show me:

1. proposed schema

2. adapter interface structure

3. normalized ticket object

4. endpoint list

5. assumptions about Teamwork vs Teamwork Desk objects

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7e00575f-e226-40f6-89ca-dfcad9b5a85a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
