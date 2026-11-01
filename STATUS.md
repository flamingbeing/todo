# Status

## Now

- A task manager for one person's own tasks, on app-ui 1.0.0-rc.79's kit shell (2026-11-01). Done so far (part 1 of 4):
  the data model (tasks with projects, sections, subtasks, priority 1-4, due dates with time and repeat rules, labels,
  filters; the Inbox is the project `inbox`), its rules and rules tests; five tabs (Inbox, Today, Upcoming, Search,
  Browse; opens on Today); the project page with sections; task rows, the quick add, the task sheet with subtasks, the
  project sheet, Completed (a Browse row) and Settings (Browse's gear, as a pushed screen); its own icon and look.
- Part 2 of 4 (2026-11-01): the quick add marks the words that set a date, time, priority, project, section, label or
  repeat as they are typed and fills the chips; repeat rules (recur.js), with a repeating task moving to its next date
  when ticked; the scheduler sheet (quick days, a month calendar, time, repeat menu and a custom repeat); swiping a row
  (right completes, left schedules, per device in Settings > General); holding a row opens its menu (Select task,
  Schedule, Priority, Move to, Delete) and select mode with bulk Date, Move, Priority, Duplicate, Complete and Delete;
  dragging a held row to reorder it or (pulled right) to make it a subtask, Today's own order, the + button dragged to
  add a task at a place or a new section; Browse > Manage projects to put projects in order.
- Known gaps: no auto-scroll while dragging near a list's edge; on Today and Upcoming a drag moves a row within the
  flat day list only (no subtasks there); Today and Upcoming have no "Select tasks" in their menu (a held row starts it);
  the labels row in the task sheet only shows them; Back on a tab other than Inbox goes to Inbox (the kit's first-tab
  rule) though the app opens on Today; a tab tapped while a Settings page is open first closes that page.
- Startup and shared fixes (2026-10-28): no sign-in flash, last list painted at once, modulepreload, no pinch zoom, PNG
  icons and theme colours. On app-sync 1.5.5 and app-devkit 1.16.0 (2026-10-30).

## Waiting on the owner

- <nothing>

## Next

- Part 3: labels and filters pages, the label picker. Part 4: views (board), import, the rest of Settings.

## Decisions (dated)

- <date>: <decision>
