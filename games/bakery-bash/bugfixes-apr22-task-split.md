# Bakery Bash — Outstanding Tasks (Wed Apr 22)

> This document lists all pending changes requested for the Bakery Bash game, organized by team. Changes that are already fully implemented are excluded. Partially implemented features are noted where relevant.

---

## Frontend Tasks

### Mail / CSV History Button

- Replace the current mail/download icon with a more visually prominent button that clearly communicates its purpose.
- Clicking this button should open a scrollable popup/panel that lists all CSVs the team has acquired — including the results CSV generated at the end of each round and any purchasable data CSVs the team has bought during the game.
- The popup should not trigger an immediate download; it should display the list and allow the player to choose which file to download.
- Update the **How to Play** screen to describe that the mail button opens this panel of acquired CSVs.

---

### Date System (Throughout the Game)

- The game is set to start on January 1st (no year needed). Each round corresponds to one calendar month.
- Round 1 = January, Round 2 = February, etc. Each month should use its correct number of days (e.g., January = 31 days, February = 28 days).
- The **round transition screen** (the screen that announces which round the game is proceeding to) should display the corresponding month name below the round number (e.g., "Round 2 — February").
- All event reporting (burglaries, food safety inspections) should display the date(s) they occurred within that month.
- The **results CSV** should contain one row per day of the simulation (not one row per round). Each row represents one day of that month's operation.

---

### Game Progress Bar

- Add a visual progress bar to the game UI that shows players where they are in the overall game loop.
- The bar should match the existing color theme.
- The **progress tracker** (the moving indicator) should be a croissant asset.
- The bar should be divided into sections representing each round/phase. Sections for completed rounds should be filled with **high-opacity yellow** with a high-opacity croissant. Sections for upcoming rounds should use **low-opacity yellow** with a low-opacity croissant placed on the bar.

---

### Purchasable Data — Specialty Chef CSVs

**Tier 1 (cheaper):**
- Add a purchasable data option that provides a table showing which chef nationalities specialize in which baked goods/products.
- The table should display the chef character assets (male and female variants), their nationality, and their product specialties.

**Tier 2 (more expensive):**
- Add a purchasable data option that provides a comprehensive CSV of chef profiles.
- Each row should represent one chef and include: nationality, skill level, average quantity of each product produced monthly, average chef satisfaction score, number of sous chefs worked with, average cleanliness of the store, purchase price (from bidding), and average monthly revenue generated.
- This CSV should contain **at least 30 chefs per nationality**, and production levels should reflect each nationality's specialization and the chef's skill level.

---

### Professor Control Panel

- The **+1 Minute** button should be disabled (unclickable and visually opaque/greyed out) when the game has not yet started, matching the style of other unavailable buttons.
- The professor control panel needs a **colored background** so that text and controls are clearly readable.
- **Remove the "Reset Game" button**. Keep only the **"End Game"** button, which should serve the same combined function.
- The professor panel is currently locked/blocked when the game is transitioning between rounds (showing a timer like the player screens). **Remove this restriction** — the professor should never be locked out by the round-transition timer.

---

### Join Screen — Team Creation Flow

- Replace the current team number buttons (1–8) with two buttons: **"Create Team"** and **"Join Team"**.
- **Create Team flow:** Clicking "Create Team" opens a popup where the player can enter their team name and optionally upload a team logo. The popup has two buttons: "Submit Team" (sends the team into the system) and "Cancel" (closes the popup in case a teammate already created the team).
- Once a team is created, the team's logo and team name should be displayed above the "Join Game" button on that player's screen.
- **Join Team flow:** Clicking "Join Team" opens a popup with a scrollable list of all teams that have been submitted. Each row shows the team number, team name, and the names of players who have already joined that team.
- **Remove** the team logo upload from the main Join Game panel, since it is now handled inside the "Create Team" popup.

---

### How to Play — Content Updates

- Update the sequence of rounds to reflect the correct order: **Ad Auction → Chef Auction → Decisions → Simulation → Results**.
- **Ad Auction section:** Change "Your Advertising Teammate Submits This" to **"Your Bidder Teammate Submits This"**. Add a note: *"Keep in mind, each advertisement type yields a different level of foot traffic — something your team will need to figure out from your predictive model."*
- **Chef Auction section:** Update the description to clarify that specialized chefs are not assigned to a station — their production contributes to the overall output. Only sous chefs are assigned to specific stations. Note that specialized chefs specialize in different foods, which players can discover by purchasing the relevant data CSV. Add a table displaying the three chef tiers and their corresponding production multipliers.
- **Simulation section:** Add a "Simulation Round" entry with the description: *"See your bakery come to life! Spectate a simulation of your bakery over the course of a month."*
- **Results section:** Add that this is where players can download a CSV containing data from that round, with one row per day of the simulation. Also list the various curveball events that might occur during a round.

---

### Chef & Ad Auction

- **Ad bidding — "0" input issue:** The advertisement bid input currently shows "0" and does not clear when the player starts typing. Fix this so the "0" disappears when the player focuses the field, matching the behavior already implemented for chef bidding.
- **Chef auction cards:** Update the chef bidding cards to use horizontal card layouts with the chef character asset displayed to the left of the card details (names and assets need to be added — Kavin has the card layout ready).
- **Minimum Bid display:** Each chef card should display a **"Minimum Bid"** field below the "Top Bid" — replacing or supplementing any existing label. If a player submits a bid below the minimum bid, show a red error message: *"Bid above the minimum bid."* Do not allow the bid to be submitted.
- Investigate and resolve the **"Chef bidding must be an array"** error that prevents chef bid submission in some cases.

---

### Your Team Screen

- Players should be able to **deselect** a role they have already selected (currently not clear or not working).
- Players should be able to **select multiple roles** that have not yet been taken — this supports smaller teams of 2 players who need to cover more than one role each.

---

### Kitchen Roster Screen

- Remove the "Head Chef" label/display entirely. The roster should only display **specialty chefs**.

---

### Decisions Screen

- **Remove the "Ad Winners" section** from the Decisions phase for all rounds after Round 1. This section compresses the decisions panel and makes it difficult to interact with the decision inputs.

---

### Curveball Events — Display & Cards

- Add a dedicated **"Events"** section to the Results screen. This section should contain cards representing each curveball event that occurred during the simulation round.
- **Burglary card:** Should display a burglar asset, the date(s) the robbery occurred, and the amount stolen each time.
- **Food Safety Inspection card:** Should display a food inspector asset, the date(s) the bakery was inspected, the cleanliness percentage reported, and the rating category (see rating scale below — align this with whatever thresholds the backend uses).
- Add appropriate character/event assets for both the burglar and the food inspector.

---

### Round 1 Transition Screen

- The Round 1 screen should **automatically advance** after 5 seconds without requiring any player interaction.

---

### Simulation Screen — Full Rework

- The simulation needs significant visual development:
  - Replace the current emoji-based customer representation with **gender and race neutral graphical assets** for customers.
  - The simulation should show the **full bakery interior**, including: specialty chefs, sous chefs (count represented visually), and maintenance staff — using character assets for each.
  - The bakery set should include: a register, counter, pastry display case, oven, and a barista bar with coffee and matcha.
  - The **menu display** should show each menu item, the quantity remaining, and a visual "sold out" stamp when a product sells out — this should update in real time during the simulation.
  - The simulation currently runs too briefly. It should visually represent the full month in a way that feels meaningful to watch.

---

### Results Screen

- Change the countdown text from **"Last Chance to Submit: __ s"** to **"Seconds until next round: __ s"** since there are no decisions to submit on the results screen.

---

### Game Over Screen

- The Game Over screen needs significant UI improvement. Current state is underdeveloped — it needs a polished, complete design consistent with the rest of the game's visual theme.

---

## Backend Tasks

### Date System

- Implement a date tracking system tied to rounds. Round 1 = January 1–31, Round 2 = February 1–28, etc.
- When recording curveball events (burglaries, food safety inspections), log the specific date(s) within the month that the event occurred.
- The daily simulation data written to the database should include a date field corresponding to the actual calendar date of that simulated day.

### Results CSV — Per-Day Rows

- Update the data output for each round so that the generated CSV contains **one row per day** of that month's simulation, rather than one row per round. Each row should represent a single simulated day and include the relevant daily metrics.

### Purchasable Data — Chef CSVs

- Implement the backend generation and delivery logic for both tiers of purchasable chef data:
  - **Tier 1:** A structured data file mapping chef nationalities to their product specialties.
  - **Tier 2:** A comprehensive synthetic dataset of at least 30 chefs per nationality, with all specified fields: nationality, skill level, average per-product monthly quantity, average chef satisfaction score, sous chef count, average store cleanliness, purchase price, and average monthly revenue. Production values should reflect nationality specializations and individual skill level.

### Food Safety Inspection Event

- Implement food safety inspection as a curveball event triggered by cleanliness score thresholds.
- **Rating tiers** (align with frontend display):
  - Below 39%: Poor
  - 40–69%: Sufficient
  - 70–84%: Good
  - 85%+: Excellent
- Each rating tier should reduce foot traffic by an additional amount (exact scaling to be determined in coordination with the frontend team based on the curveball spec).
- Record the date(s) the inspection occurred and the cleanliness percentage at time of inspection. Write this to the round result for the frontend to display.

### Burglar Event — Probability & Scaling

- The burglary event should be **randomly generated** with probability scaling based on leaderboard rank.
- Top-ranked teams should have an ~8% chance of being robbed in a given round; the lowest-ranked team should have ~0.05%. The range should scale proportionally across rankings.
- When a burglary occurs, the team loses a **random 5–15% of that month's revenue**.
- Record the date(s) of the burglary and the amount stolen. Write this to the round result for the frontend to display on the results card.

### Minimum Bid Enforcement — Chef Auction

- Enforce a minimum bid floor on the backend for chef bidding. If a player submits a bid below the minimum bid for a chef, reject the submission and return an appropriate error.
- Investigate and resolve the **"Chef bidding must be an array"** error that occurs during chef bid submission.

### Ad Auction — Foot Traffic by Ad Type

- Ensure that different advertisement types produce meaningfully different levels of foot traffic in the simulation. The differences should be discoverable through data analysis but not immediately obvious to players.

### Specialty Chef Production Logic

- Ensure the simulation correctly models that **specialty chefs are not assigned to stations** — their production is a general contribution to overall output.
- Only sous chefs are assigned to specific stations (bakery, deli, barista).
- Production output for specialty chefs should reflect their nationality's specialization and their skill tier multiplier.
