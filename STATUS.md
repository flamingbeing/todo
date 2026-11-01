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
- Part 3 of 4 (2026-11-01): Browse > Filters & Labels (each held and dragged into order, each with its page); labels
  picked in the task sheet and the quick add; saved filters with a query language (dates, priorities, #project,
  /section, @label, words, & | ! and brackets, commas for one list per part) whose sheet counts the matches as typed or
  says what is wrong; favourite labels and filters in Browse; the Search tab (results as tasks, projects, labels and
  filters; recent searches on this device); a project as a board (a column per section, cards dragged between them);
  Display per list on this device (layout, completed tasks, grouping, sorting, direction, a priority, label or date
  filter); Reschedule on Overdue (Today and Upcoming, with Undo); Upcoming's month and week strip (swipes by week,
  dots, tap goes to the day, a task dragged onto a day moves to it; the month opens a month picker).
- Known gaps: no auto-scroll while dragging near a list's edge (a board scrolls sideways); on Today and Upcoming a drag
  moves a row within the flat day list only (no subtasks there); in a sorted or grouped list a drag does not reorder;
  board cards have no swipe actions; Back on a tab other than Inbox goes to Inbox (the kit's first-tab rule) though the
  app opens on Today; a tab tapped while a Settings page is open first closes that page; in dark mode the accent
  buttons (+, Done) use the kit's lighter accent.
- Startup and shared fixes (2026-10-28): no sign-in flash, last list painted at once, modulepreload, no pinch zoom, PNG
  icons and theme colours. On app-sync 1.5.5 and app-devkit 1.16.0 (2026-10-30).

## Waiting on the owner

- <nothing>

## Next

- Part 4: import, the rest of Settings, Calendar layout.

## Decisions (dated)

- <date>: <decision>
