# 0015: One space per person

Status: accepted (2026-11-04).

Decision: each person's records live in their own space, `spaces/<uid>/...` (the sync scope is the signed-in uid). The
rules let only a space's owner read it (any role) or change it (admin or member); an admin is "everyone else" in
another person's space. Roles still come from the single group `_` in the claims. The old shared space `spaces/_` is
kept, read only by admins, and an admin's first sign-in on a device with an empty own space copies it in once
(`app/src/move-shared.js`).

Why: the app is a personal task list handed to more than one person; with one shared space every member saw and
changed everyone's tasks.

What follows: a viewer sees only their own (empty) space, so the role has little use here. The files and bin recipes
still take one fixed space and their rules use `can(g, ...)`: both need a per-person space (and `mine(g, ...)`) before
either is installed. Reminders read the task from the person's own space. Tests name a space with `space()` (e2e) or
`spaces/u-<role>` (rules).
