# Game Design Document: Chaos Machine

## 1. Overview
**Game Title:** Chaos Machine  
**Genre:** Casual Stealth-Action / Sniper Shooter  
**Platform:** Mobile (iOS/Android) / Casual PC  
**Camera View:** 1st Person (Sniping/Action) / 3rd Person (Movement/Assassinations)  
**Session Length:** 3–5 minutes per round.  

### 1.1 Core Concept
*Chaos Machine* combines the methodical, satisfying sniper gameplay of *Western Sniper* with the vertical, stealth-based fortress infiltration of *Assassin's Creed: Odyssey*. The player controls a highly advanced, sleek Mech infiltrating heavily fortified enemy bases. The player can choose to clear the base entirely via stealth (silenced headshots, drop assassinations, silent blade backstabs) or go loud with heavy weaponry (miniguns, rocket launchers) when spotted or overwhelmed.

### 1.2 Aesthetic & Theme
**World:** A futuristic "War Machine" sci-fi setting.
**UI/UX:** A "Cyberpunk / Synthwave" theme featuring 90s neon pink, vibrant cyan, and deep purples. The UI is holographic and punky, contrasting with the heavy, gritty metal of the machines. 

---

## 2. Gameplay Mechanics

### 2.1 The Stealth Phase (Infiltration)
The game begins with the base unaware of the player's presence.
*   **Movement:** The Mech moves completely silently. Players navigate using simple touch controls to move between cover points, climb towers, and walk on tightropes/cables.
*   **The Sniper:** A silenced, high-tech sniper rifle. Scoping in shifts the game to first-person.
    *   *Strategy:* Snipe human guards and air surveillance drones first. Destroying drones prevents them from alerting heavy machines.
*   **Close Quarters Stealth:** 
    *   *Hidden Blade:* A completely silent, retractable energy blade on the right arm.
    *   *Assassinations:* Context-sensitive prompts allow backstabs from behind, or "Drop Assassinations" from ledges, towers, or ropes. 
*   **Decoys:** The player can deploy holographic decoys (cyan/pink neon projections) to distract humans and machines, opening them up for backstabs or grouping them for an explosive attack.
*   **Detection (after *Odyssey*'s fort guards):** A guard who glimpses the Mech fills a white mark slowly (a glance is forgiven; slower crouched, at the cone's edge and in shadow); yellow, it walks to where it saw something; red, it is sure: it shouts (the guards round it join the fight) and the nearest guard runs to light an alarm beacon. Stop the runner, or sabotage the beacons first, and the base never reaches full alert. Lost, the guards search the last known position, then return to their rounds warier. Things out of place (a stripped pile, a light shot out) are noticed; bodies can be dragged into containers; crouched in a thicket the Mech is unseen unless a guard is right on top of it.
*   **Training ground:** A wordless tutorial of ten small rooms, each opened by a ghost of the Mech showing the lesson (twice, and again on request).

### 2.2 The Action Phase (Chaos)
If the player misses a shot, leaves a body in plain sight, or makes too much noise, the **Alert Level** rises. If the base goes on full alert, the gameplay shifts drastically.
*   **Crowd Control:** Human soldiers swarm, and heavily armored defense machines power up.
*   **Heavy Arsenal:** 
    *   *Mini-gun:* High fire rate, shreds human crowds and light drones. Requires spool-up time.
    *   *Rocket Launcher:* High splash damage. Necessary to crack the armor of Heavy Mechs that awaken during an alert.
*   **Survival:** The player must survive the wave, utilizing cover and high mobility, transitioning from a predator to a one-mech army.

### 2.3 The Kill-Cam System
To reward precision and add cinematic flair, the game features a dynamic kill-cam system:
*   **Trigger Rates:** A kill is scored by distance, the target's movement and the body part; the better the shot, the likelier the kill-cam (from about a quarter for a plain close body shot to about four in five for a moving headshot at range). The first headshot of a player's life is always shown; a boss's last blow gets its own slow orbit; after two kills in quick succession a good one gets a short cam and a plain one none.
*   **Visuals:** Bullet-time tracking, x-ray damage on heavy machines, and dramatic camera angles for hidden blade assassinations.

---

## 3. Game Loop & Meta-Progression

Inspired by *Elder Scrolls: Blades*, the game features a deep, satisfying meta-loop that keeps players returning.

### 3.1 The Core Loop
1. **Briefing:** Select a fortress on the holomap. (Intro cutscene of the Mech dropping in).
2. **Infiltration:** 3-5 minutes of gameplay. Sneak, snipe, or shoot through the base.
3. **Extraction:** (Outro cutscene of the Mech escaping as the base explodes or powers down).
4. **Rewards:** Gain "Tech Scrap," "Data Cores," and Blueprints.
5. **Upgrade:** Return to the Mobile Command Base to craft and upgrade gear.

### 3.2 Mobile Command Base (The Hub)
A visual hub menu (rendered in the pink/cyan UI) where the player upgrades their Mech.
*   **The Armory:** Upgrade the Sniper (zoom, damage, silence level), Mini-gun (cooling rate, damage), and Rocket Launcher (blast radius, ammo capacity).
*   **Chassis Bay:** Upgrade the Mech's armor (for the loud phases), movement speed (level 1 also quiets the sprint), Decoy duration (level 1 also packs one more decoy) and the grappling hook's reach.
*   **The base learns:** The last raid's habits are answered in the next (helmets after many headshots, box checkers after much use of the hide box, a searchlight on the perch after snipes from it), and the threat card says so.
*   **The Forge:** Wait-timers (which can be sped up with premium currency) to construct new weapon tiers from gathered blueprints.

---

## 4. Enemies & AI

| Enemy Type | Behavior | Weakness | Threat Level |
| :--- | :--- | :--- | :--- |
| **Human Guard** | Patrols base (some stop to chat). Notices bodies and things out of place; runs for alarm beacons. | Headshots (a body takes two rounds, the legs three), Backstabs | Low |
| **Sentry** | Watches from a tower. Calls the alarm far and wide; a poor shot. | Silenced Sniper | Low |
| **Engineer** | A guard who mends sabotaged beacons and shot-out searchlights. | Headshots, Backstabs | Low |
| **Scrap Hound** | A robot dog: follows the Mech's scent and noises, smells bodies through walls, barks the guards over, bites. | Any round | Medium |
| **Surveillance Drone** | Flies in patterns. Spots player in cover. | Silenced Sniper | Medium (Summons Heavies) |
| **Enforcer Mech** | Powers up only during Alerts. Suppressive fire. | Rockets, Mini-gun to joints | High |
| **Goliath Tank** | Boss enemy at the end of large bases. Overheats after three shells, its vents swinging toward the Mech. | Decoys (it shells itself) + its rear vents + Rockets | Extreme |
| **The Warden** | The base commander, a boss on the keep's roof. A powered shield from level IV; past half health he drops it and dashes with a glint. | Cut his generator; step aside from the dash | High |

---

## 5. Controls (Mobile Touch Interface)

*   **Left Screen (Swipe):** Move Mech (3rd person) or Aim Reticle (1st person).
*   **Right Screen (Tap/Hold):** 
    *   *Tap:* Contextual Assassinate (when near an enemy).
    *   *Hold:* Aim Down Sights (Sniper). Release to fire.
*   **HUD Buttons:**
    *   Weapon Wheel toggle (Sniper / Mini-gun / Rockets).
    *   Deploy Decoy.
    *   Crouch/Stand toggle.
*   **Feedback:** Haptic feedback on mobile devices for every hidden blade stab, sniper recoil, and rocket explosion.

---

## 6. Narrative & Presentation

*   **Intro Sequence:** A slick, unskippable (but short) 5-second cinematic showing the player's customized Mech dropping from a stealth ship, landing silently on a gargoyle or tower overlooking the fortress.
*   **Outro Sequence:** Upon killing the final enemy or base commander, the Mech turns its back to the camera, deploying a grapple line to extract while the neon UI tallies the score (Stealth Kills, Headshots, Time Bonus).
*   **Audio Design:** 
    *   *Stealth:* Low synth-bass hums, muffled footsteps, crisp "thwip" of the silenced sniper.
    *   *Action:* Pounding 90s synthwave/cyberpunk beats, deafening mini-gun roar, metallic crunches.