# Lịch hẹn (Appointments) — Remaining Core Features

Designer handoff for the appointments UI revamp.
Scope: everything staying after dead-code removal. **⚠ = staying, but needs cleanup.**

Date: 2026-08-01

---

## Calendar page (`/appointments`)

| Feature | Description |
|---|---|
| ⚠ **Week calendar grid** | Seven-day time-grid showing appointments as positioned blocks with overlap handling |
| ⚠ **List / agenda view** | Alternative flat view grouped by day; the only usable layout on screens under 900px |
| ⚠ **Appointment detail panel** | Side panel showing full appointment info and the status actions |
| **Mini-calendar** | Month picker in the sidebar for jumping to a date, with dots marking days that have appointments |
| **Week navigation** | Previous/next week arrows plus a "Hôm nay" jump-to-today control |
| **Click-empty-slot to create** | Clicking any blank time slot opens the create form pre-filled with that date and time |
| **Keyboard shortcuts** | N to create, ←/→ to change week, T for today, Esc to close panels |
| **Responsive sidebar drawer** | Sidebar collapses into a slide-over drawer on narrow screens |

## Filtering

| Feature | Description |
|---|---|
| **Scope filter** | Switch between my appointments, my team's, or the whole organisation |
| **Sale filter list** | Per-salesperson checkboxes, each with a consistent assigned colour |
| **Source filter** | Show all appointments, only Zalo-generated ones, or only manually created ones |
| **Status filter** | Multi-select across the five appointment statuses, with live counts |
| **Type filter** | Multi-select across the four appointment types, with live counts |
| ⚠ **Active filter chips** | Strip summarising every filter currently applied; overlaps the controls above and should be consolidated |

## Creating & editing

| Feature | Description |
|---|---|
| ⚠ **Appointment editor modal** | Single unified form for both creating and editing an appointment |
| **Contact search & link** | Search and attach a customer to the appointment from within the editor |
| **Assignee picker** | Choose which salesperson owns the appointment |
| **AI prefill from text** | Parses a note or chat message into a draft appointment and opens the editor pre-filled |

## Appointment content & states

| Feature | Description |
|---|---|
| **Five statuses** | Scheduled, overdue, completed, cancelled, and no-show |
| **Four types** | Call, message, meeting, and follow-up — each with its own icon and colour |
| **Source badge** | Marks whether an appointment came from Zalo automatically or was created by hand |
| **Core fields** | Title, date, time, duration, location, and free-text notes |
| **Owner identity** | Assigned salesperson shown with a consistent per-person colour and initials |
| **Customer identity** | Contact avatar, name, and phone number shown on every appointment |
| **Status audit line** | Records who last changed the status and when |
| ⚠ **Double-booking warning** | Flags overlapping appointments on the same day; currently only visible in one view |
| ⚠ **Overdue highlighting** | Visually marks appointments whose time has passed; currently inconsistent between views |

## Status actions

| Feature | Description |
|---|---|
| **Mark complete** | Close out an appointment that happened |
| **Cancel** | Call off an appointment that will not happen |
| **Mark no-show** | Record that the customer did not attend |
| **Reschedule** | Reopen the editor to move an appointment to a new time |

## Chat panel surface

| Feature | Description |
|---|---|
| **In-chat appointment list** | Compact list of a customer's appointments inside the chat contact panel |
| **Quick-create from chat** | Calendar button in the chat toolbar that opens the editor for the current customer |
| **Inline quick actions** | Complete, no-show, and cancel buttons directly on each appointment in the panel |

## Automated behaviours the UI reflects

| Feature | Description |
|---|---|
| **Zalo auto-capture** | Reminder cards sent in Zalo chat automatically become appointments in the CRM |
| **Daily reminder push** | Morning notification sent to each salesperson listing their appointments |
| **Manager overdue digest** | Summary sent to managers covering appointments their team has repeatedly missed |
| **Auto-overdue flip** | Appointments automatically move to overdue once their time passes |
| **Public confirm link** | Standalone page letting someone mark an appointment done or cancelled from a link, without logging in |

## Settings

| Feature | Description |
|---|---|
| **Appointment settings page** | Organisation-level configuration for appointment reminders and defaults |

## Appears in other parts of the app

| Feature | Description |
|---|---|
| **Dashboard KPI tile** | "Lịch hẹn hôm nay" count on the main dashboard |
| **Dashboard action hub** | Today's and overdue appointments listed as actionable items |
| **Notification bell items** | Appointment reminders surfaced in the notification dropdown |
| **Global search results** | Appointments returned in cross-app search |
| **Reports tab & export** | Dedicated appointments report with Excel download |
| **Analytics metrics** | Appointments-completed figures in team performance and custom reports |
| **Inbox filters** | Filter conversations by upcoming or overdue appointments |
| **Contact profile fields** | Total appointment count and next appointment date on the customer record |
| **Note-to-appointment badge** | Marker on a note showing it generated an appointment |
| **User handoff transfer** | Bulk-reassigns appointments when a salesperson leaves |

---

## Note for the designer

The three ⚠ items under **Calendar page** are the substantive rework:

1. The week grid's event rendering
2. Turning the list view into a proper agenda — it must survive on mobile
3. Converting the detail panel into a click popover

The two ⚠ items under **Appointment content & states** are existing inconsistencies to resolve, not new design work.
