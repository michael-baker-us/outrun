# Project Ideas

Quick reference for all project ideas explored with Claude Code. Each entry has a status:
`idea` | `active` | `done`

---

## Games

### OutRun-Style Racer `active`

Pseudo-3D road racing game in the style of the 1986 OutRun arcade cabinet.

- **Tech:** Vanilla JS + HTML Canvas, no build step
- **Run:** Open `outrun/index.html` in a browser
- **Stretch:** GitHub Pages deployment, Steam Deck via browser or Tauri wrap
- **Location:** `outrun/`

### Terminal Snake `idea`

Classic snake game rendered in the terminal.

- **Tech:** Python (curses) or Go (tcell)
- **Stretch:** High score leaderboard saved to file

### Wordle Clone `idea`

Wordle in the terminal with color-coded output and streak tracking.

- **Tech:** Python or Node.js CLI
- **Stretch:** Hard mode, custom word lists

### Blackjack CLI `idea`

Card game with proper state machine, basic strategy hints.

- **Tech:** Python or Node.js
- **Stretch:** Multiplayer (local), card counting trainer mode

### ASCII Roguelike `idea`

Tiny dungeon with rooms, enemies, and items. Scales well as a long-running project.

- **Tech:** Python (curses) or JavaScript (terminal)
- **Stretch:** Procedural level generation, save/load

---

## CLI Tools

### Git Standup Generator `idea`

Reads `git log` for the last 24hrs across local repos and formats a standup summary.

- **Tech:** Node.js or Bash
- **Stretch:** Multi-repo support, Slack-formatted output

### PR Summary CLI `idea`

Calls the GitHub API and summarizes open PRs for a team or org.

- **Tech:** Node.js + GitHub REST API
- **Stretch:** Digest email, Slack post, filter by label/author

### Infra Cost Diff Tool `idea`

Given two Terraform plan outputs or AWS cost reports, highlights what changed and why.

- **Tech:** Python or Node.js
- **Stretch:** Threshold alerts, weekly trend chart

### Load Test Harness `idea`

Minimal HTTP load tester — a tiny self-built alternative to k6/wrk.

- **Tech:** Go or Node.js
- **Stretch:** Latency histogram, concurrent workers, report output

---

## Web Apps

### Markdown Kanban Board `idea`

Tasks stored as plain `.md` files, rendered as a kanban board in a local web app.

- **Tech:** Vanilla JS or Svelte, no backend
- **Stretch:** Drag-and-drop, local storage sync

### Personal Git Dashboard `idea`

Local web page showing activity and open PRs across your repos.

- **Tech:** Node.js server + HTML, GitHub API
- **Stretch:** CI status, deployment indicators
