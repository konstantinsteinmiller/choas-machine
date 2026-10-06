- [x] #1 ✅ The game needs better ULTRA-HIGH-CTR(20%+) cover images painted with
  Gemini for all the platforms (800x800, 1920x1080, 1080x1920(only jpg), 800x1200(only webp), 1360x850(only with logo, only jpg), 800x450(only with logo, only webp), 400x225(only with logo, only jpg),
  512x512(only with logo, only jpg), 628x628(only with logo, only jpg), 512x384(only with logo, only jpg), 512x340(only with logo, only jpg) in jpg, and webp, once without a logo, once with a logo somewhere that is not in the top left corner as CG banners are placed in top left corner up to the middle of the image horizontally).
  Create 4 different new cover image scenarios (like the current non-painted ones), paint them once in Gemini and compare them with the old cover images(not painted) for the CTR value. Go with the best results that would potentially and based on web-search evidence yield the best CTR results on web game platforms and Steam.
  Done 2026-10-02 (commit 28e895b, `pnpm art:promotion`): 19 covers + the logo in
  `src/assets/promotion/`, every size above with / without the logo. Four scenarios
  painted and compared at 250 px; `ambush` ships, `scope` is the runner-up
  (`art-todo.md`, "Store art"). Deferred: there were no older unpainted covers to
  compare with, so each painting was compared with its own plate; the pick is a
  judgement against the portals' own guidance, not a measured CTR; `scope` is
  painted at 1:1 only (run it as the B of an A/B when a portal offers one).


- [ ] #35 Let's start on using the voice-over pipeline to create VOs with Chatterbox for each NPC.
  DON'T START WITHOUT MY WON INITIATED REQUEST TO START IT.

- [x] #36 ✅ let's do another round of optimizing hot-path loading during start up, postponing non-critical assets to lazy loading after all critical assets were loaded for the current scene based on player progress and level position.  
  That should make the game startup faster and happier players (should not create asset pop-ins)
  DON'T START WITHOUT MY OWN INITIATED REQUEST TO START IT.

- [x] #37 ✅ not shooting the flying drone in the eye should make it suspicious and not die instandly. Only weakpoint kill instantly with enough fire power. will change on later, stronger enemies.
- [x] #38 ✅ Currently the first fortress has no challenge as the sniped out bodies are never found by other patroling units and therefore no spotting happens, thats boring and challenging, use a cardbox or metal shield apperatus to hide from enemies sight.
- [x] #39 ✅ the player should jump off the jet-powered robo dog when entering the fortress scene. Improve the rope walk animation, currently the robot just slides over it.
- [x] #40 ✅ There should be 1-2 bosses (vary in strengh and mechanics among levels) or mini-bosses per level, that cannot be oneshotted by a sniper, but would alarm the whole fortress instead, so the player has first to sneak around the fortress and take out the weaker humans and drones.
- [x] #41 ✅ make a blind playtest with 3 headed chrome sonnet subagents that play the game to understand and find the fun in it, they should point out what is fun and what is not. meanwhile you do a web-search on how to improve the current loop, enemy and level design to make this a standout 
 Stealth and rumble, shoot&sniper FPS. Present me the results in a structured report in the browser pointing out multiple design decisions about level layout, enemy design and enemy logic and enemy behaviour that would make this a super fun game. Kill cams should be fun already.

- [x] #42 ✅ go ahead with the design review's Now list, start with the camera fix, do all the report's findings; player detection like the fortress guards in Assassin's Creed: Odyssey. Worked through as R16–R28 in `game-implementation-plan.md`:
- [x] #43 ✅ Camera never inside the mech; the view's middle kept clear (R16)
- [x] #44 ✅ Detection like Odyssey: white → yellow (investigate) → red, arcs round the centre, icons over guards, last known position (R17)
- [x] #45 ✅ Alarms: a red guard shouts; alarm beacons a guard runs to and lights; sabotage them; drones ping guards (R18)
- [x] #46 ✅ Losing them: search the last known position, give up, alert patrol (R19)
- [x] #47 ✅ The loud half: suppressing fire, more armour at I, armour shards, hit markers, boss numbers, weapon chips, touch fire button, scope sensitivity (R20)
- [x] #48 ✅ Retry on the perch, checkpoint, fairer defeat pay, cheaper first upgrades and new verbs, shoot lesson, language on pause (R21)
- [x] #49 ✅ Behaviour: scope tags with routes, routines, guards notice changes, drag bodies, box pokes, roles (R22)
- [x] #50 ✅ New enemies: the Scrap Hound and the Engineer (R23)
- [x] #51 ✅ The Bastion rebuilt: safe start, teaching corner, rings and routes, cover and shadows, hiding thickets, beacons, pile puzzles, per-run rotation, boss arena (R24)
- [x] #52 ✅ Bosses: stealth prep, phases and tells (R25)
- [x] #53 ✅ An adaptive base between raids (R26)
- [x] #54 ✅ Kill-cams scored, rested, a boss's own (R27)
- [x] #55 ✅ Round 3 regression: translations, docs, e2e, clips, perf (R28)
- [x] #56 ✅ Player should not be detectable through walls with eyesight and lighting cone, same for other barriers that physically stop line of sight.
- [x] #57 ✅ Weapons switch with mousewheel is never explained or how to switch the weapon, try to make a wordless lesson that the player has to finish before starting the first mission. It should be made clear that the rocket launcher has limited ammo and the player has to reload it after each shot, and that the sniper rifle has a scope that can be used to zoom in and out. The player should also be made aware of the melee attack and how to use it effectively in close combat situations. The lesson should also cover the use of gadgets such as the grappling hook and decoy, and how they can be used to gain an advantage in combat. The lesson should be interactive and engaging, allowing the player to practice these mechanics in a safe environment before entering the first mission.
- [x] #58 ✅ Create a tutorial level that introduces the player the core mechanic with "show, dont tell" style of lessons, preferably with automated and animated demos, 2 repitions per lesson, the player can always request more repititions with a button during the lesson while he has not successfully finished the lesson. Create small tutorial rooms that can be quickly trespassed after finishing a tutorial piece. 
 going through weapons and how to switch and use them and when, backstab from sneaking, decoy usage, salvaging scrap (salvage tutorial comes in the base, here text will help to tell why we collect scrap, so we can upgrade weapons late), grappling hook usage over wall, then extraction point. If I forgot something crucial fill in.
- [x] #59 ✅ do another pass on the quality of the props and the level, the first fortress should have a more convincable setting than a flying island (improve the sky props around it, keep it low poly rounded to avoid performance bottlenecks), Improve the first fortress layout overall, right now there are 2 sections on the same level and theoretically the player can snipe every human and drone from his first tower, make it more delicate and interesting castle/fortress design, maybe a third elevated area that you have to get up to first. Maybe a grapling hook opportunity for an early high point for better sniping. All enemies must be able to shoot the player even at high distances if they detect the player.
- [x] #60 ✅ a sniper shot at the body of a human guard should not instantly kill otherwise headshots have no meaning, actually they can take 3 hits into the limbs and alarm nearby units to search for the shooter or cna take up to 2 sniper shots in the body or 1 shot into the head. 
- [x] #61 ✅ after sniping out a spotlight, I dont get detected in the spotlight anymore, but the lightcone stays in the level, which is a bug and unprofessional.
- [x] #62 ✅ upon detection the humans should screen "Intruder! Alarm!", the machines shout "Enemy detected! Erase intruder!" with a speech bubble (later will be VOed gracefully)
- [ ] #63
- [x] #64 ✅ humans currently do a backflip when hit by a rocket, while that is fun the first time around, it feels very mechanical after the first one, add different animations, humans hit by a rockets should be flying off like a ragdoll, if killed by a sniper shot they sink down like a ragdoll. After the backstab animation finished the human body sinks down like a ragdoll. Minigun should blow the dead human ragdool away or sometimes in a killcam apart.
  Do something equivalent for machines/robots, but machines are allowed to tear into chunks of metal and fly apart as they have no blood.
- [x] #65 ✅ Let's start on using the voice-over pipeline to create VOs with Chatterbox for each NPC.
- [x] #66 ✅ GameMonetize readiness: make the game ready for a GameMonetize release using the new-web-game-playbook
  - Open: `VITE_GAME_ID` in `.env.gamemonetize.local` is empty: create the game in the GameMonetize panel and paste its id; the build refuses to run without it.
- [x] #67 ✅ run another blind playtest with 3 different players, that have never seen the game before, and let them play the game for max 7 minutes each, record their gameplay and reactions, and ask them to fill out a survey about their experience. The survey should cover the following topics: overall enjoyment, difficulty, controls, graphics, sound, and any suggestions for improvement. Analyze the results and present them in a structured report in the browser pointing out multiple design decisions about level layout, enemy design and enemy logic and enemy behaviour that would make this a super fun game.
  Report: https://claude.ai/artifact/8JT34ct6jMjv5of4kNpwSy (the soft-lock it found is fixed in c498d95; the other decisions await a go).
- [x] #68 ✅ Enemies in the vicinity of the bullets and the gun usage and impacts warn enemies that there might be an intruder, so they start searching unless they obviously see the player with direct line of sight (during that "focused" phase they see 3x that far as the usual vision cone) 
- [x] #69 ✅ Symbol Gesichter, marking enemies is ok, light cones shouldn't penetrate walls, nobody should be able to shoot through walls and obstacles.
- [x] #70 ✅ Enemies don't shoot back if player is too far up or too far away, Enemies don't see you too high up, make enemies smarter in reasoning where the shot might have come from and where to search first, so it is more challenging to be a sniper.
- [x] #71 ✅ Enemies should gang up with mechs/machines/tanks and other humans to track down and fight the player nearby, an alarm sends all enemies at the player position.
- [x] #72 ✅ Creat enemy Roombas robots with guns and shotguns for close vecinity fights. Tank placements should be better so they have line of sight to fire, currently is easy to glitch them from a wall over them.
- [x] #73 ✅ if a machine finds you and the machines survives (show progressbar) then an alarm sounds without the alarm post ringing, humans run to the alarm post.
- [x] #74 ✅ health bars missing over the models head/top edge (high-quality with a mechanical look).
- [x] #75 ✅ remove the mini-game for upgrading, keep the salvaging minigame. 
 the cost of the upgrades is quite low as the player gets quite big amounts of bolt/scrap early on. Rebalance please. 
 Upgrading rifle with a fortune wheel, infinite but descreasing effect and chance to happen, rewarded ad for a garantued upgrade.
- [x] #76 ✅ Player needs to collect ammunition from dead bodies and weapon piles, otherwise its too easy to snipe everyone out or go rampage with the minigun (minigun amunition also needs to be collected once the first round is empty, player can upgrade starting ammunition stack size of all weapons, teach in tutorial that ammunition is limited).
- [x] #77 ✅ normal human guards should always be killed by one headshot, currently some survive on level 3-5. Make the kill-cam headshot on humans more cool with a bullet trail effect(in general and every sniper shot) and when the bullet hits the head or body, it penetrates and comes out on the other side of the head, making it more epic to kill with headshots.
- [x] #78 ✅ exploding barrels (there is a barrel model already, improve it and make it look like an exploding barrel that sits above ground, and explodes when shot or hit by a rocket). Spread them in the levels.
- [x] #79 ✅ Fix all the holes in the wall. Add new levels that don't look the same all the time
- [x] #80 ✅ when aiming up at a drone with the mini-gun, right when holding fire the aim jumps downwards and you have to adjust the aiming, this is a bug, all weapons need to aim correctly. Probably the same problem with the rocket launcher.
- [x] #81 ✅ When aiming then the weapon model in the players hand and the hand itself need to animate and must follow naturally and point in the shooting direction, currently it happens that the weapons point upwards with their nose while the bullet flies into the crosshair direction.
- [x] #82 ✅ It's not possible to click in icons on the desktop screen in pointerlock, it needs another solution like shortcut keys, e.g. key 1-9 for activating something on the screen.
- [x] #83 ✅ no "[E] to salvage" billboard appears upon closing by the salvage pile, it should appear and disappear when the player is close enough to the salvage pile.
- [x] #84 ✅ rocket launcher has a reload time, but nothing indicated it, it should be very obvious to the player that he is reloading, add an player animation for the reloading and add a progressbar at a perfect place where the player sees it easily.
- [x] #85 ✅ No kill-cam on spotlight kills with sniper, kill cam is only necessary during stealth mode, when the player has not been spotted yet, or is not searched after, only kill-cam on headshots on humans and machines that are hit in the weakspot, not for ambience things like exploding barrels and spotlights.
- [x] #86 ✅ The alarming system is not really great right now, overhaul it and make it as great as Assassins Creed Odyssee alarming system that lets enemies cooperate to find and extinguish the intruder.
- [x] #87 ✅ The grapling hook is not explained in a tutorial. Use a hologram tutorial. All tutorials need to show the teaching in a hologram scene and how they are used, so the player can replicate it, the hologram scenario loops during the tutorial until fullfilled. 
- [x] #88 ✅ The player should have more space around the outer wall of the fortress to run around and hide and escape.
- [x] #89 ✅ Player should be able to go stealth again after being spotted and the enemies either go killed or lost track of the player.
- [x] #90 ✅ More enemies with shields, enemies with grenades, Sniper towers that force you to go stealth (high damage)
- [x] #91 ✅ kill-cam needs to stop the game during the kill-cam, right now it's not.
- [x] #92 ✅ enemies should not walk in a straight line, but in a swarm trying to surrender the player from all sides, to make fighting them harder.
- [x] #93 ✅ build one level by placing rooms first with Splinter Cell like layouts on all three axis, then connect all rooms with connection hallways or tunnels.
- [x] #94 ✅ there should be more ropes in the levels and the player gets a rope shooting gun to place own ropes from platforms to the target. introduce the rope gun in a hologram tutorial.
- [x] #95 ✅ The player needs a jump on Spacebar (and mobile).
- [x] #96 ✅ Add some roofs with holes in them (level 2+), so that the player cant see the hole level and snipe everyone from a million miles away.
- [x] #97 ✅ Player should be able to transform into a toaster (rewarded ads unlock for other transformations, clown box, trojan horse, Snake-Style crate, or a bush with green leaves branches, a teddy bear).
- [x] #98 ✅ If any enemy finds a corpse they should get cautious and start roaming the area to find an intruder, but only for a minute, after that their suspicion goes again.
- [x] #99 ✅ Player should be able to use a flamethrower to burn down corpses to ash and machines to melted metal (only billbaord use, not a weapon). Teach this to the player in the first tutorial level with a wordless hologram after a human has been killed to erase corpse traces.
- [x] #100 ✅ Create a sound storyline in story.md, derive an Intro, outro and cutscenes with (the cutscenes should have no text but environmental story telling with cool action heavy scenes. The intro needs to show off all the abilities that the player robot has like grapling hook, rope gun, decoy, sniper, minigun and rocket launcher weapons), 
  The intro, outro and cutscenes should also be showing the story in a cinematic way without text and subtitles or VOs, but with fitting high-quality music that does not hurt in the ear, but fits well to the current scene.
- [x] #101 ✅ Player heals too easily, the player should instead only heal with repair kits (screws and wrenches 3d model) found in the fortress level, no instant health regeneration.
- [x] #102 ✅ The grapling hook should be manually aimable, not just a upward list near a wall.
- [x] #103 ✅ After the player has cleared level 1 and 2, a cutscene clips away and shows the player robot salvaging destroyed mechs and tanks and scrap piles, for 10 seconds (Skippable, all cutscenes, intro and outro are skippable with an easy to see button (holding spacebar for 0.5 seconds as a shortcut))
- [x] #104 ✅ the first level should start with the player landing behind a human guard (extend the starting platform to have more space and a crate behind which the player lands) a few feet away, then automatically the player robot goes into sneak mode, closes in on the guard from behind and backstabs the guard, then the pulls out the sniper weapon and shoots a human on other side of the rope at the starting point. That should give a nice intro to the gameplay for the player to get inspired. 
- [x] #105 ✅ In the intro /landing cutscene the player flies through a solid wall, fix it. 
- [x] #106 ✅ The player jump feels a bit stiff, try to animate the legs slowly while mid-air to not make his look like hes dead mid-air, give him some character. The player should not be able to fire while jumping.
- [x] #107 ✅ The players robot legs and feet still look like they are clipped below the ground when crunching/sneaking.
- [x] #108 ✅ I shot one guard standing right to another guard with a headshot but the second guard who did not look at the dead guard did not get cautious, as if he didnt hear the bullet impact within the close vicinity of him and didnt hear the other guard collapse on the ground. A dead body falling down should be making some noise that is hearbale by nearby team members like guards and machines. 
- [x] #109 ✅ In the room with the 3 guards with the hologram attacking (should show hologram guards dying from his bullets) nothing happens after I killed all the guards, the next gate didnt open for me.
- [x] #110 ✅ the hologram lesson teaching the backstab should show the          
  choreographed  backstab animation with another hologram guard on   
  repeat, not just a sneak behind a guard and attack him(which is    
  misleading as the player has no sword to use for normal attacks,   
  he needs to silently kill the guards or use a ranged weapon).
  Shooting close by a guard or by the head should always make the guards suspicious, searching for the source of the noise and eventuall notifying very close guards and machines to help searching(they can trace bullet directions and follow in  that source direction).
- [x] #111 ✅ In the room with the ammunition, its not clear that ammunition was picked up, better show how amunition was empty and show a pictogram that the amunition 3d models is filling up the ammunition bar, Improve the ammunition bar and make it give better player feedback with a red flash upon loosing an ammo and a green flash when receiving ammo, also the ammo 3d models should animate and fly over to the amunition bar and disappear inside it while shrinking.
  Also teach reloading in the ammunition lesson with the hologram and a pictogram showing that relaoding fills the ammunition loaded bar. the bar should also show a number value indicating total ammo and how many are left.
  One room also needs to teach the salvaging of bolts with a pictogram showing bolt are used for upgrades.
- [x] #112 ✅ The player now enters the tutorial room not through a wall, but the camera has problems displaying and stutters between the player and the wall, just move the landing point more in the middle of the room so the camera has room, by anyways built a springarm on the camera to prevent such scenarios in tight spaces, so the camera can fit there and solve such tight space situations with the camera with better camera work.
- [x] #113 ✅ There seems to be 2 rooms for the backstab tutorial, this is repetitive
- [x] #114 ✅ The decoy tutorials doesnt show a decoy as a hologram and therefore is absolutely puzzling what the lesson is supposed to do (show a "Q" or the decoy button flying upwards over the hologram robots head when he places the decoy, it should also happen for all other button presses as the hologram in the tutorial level.). The hologram in the backstab tutorial is not perfectly syncronized, the blade of the hologram robot does not penetrate the body/stomach, which looks like a bug. Player should have infinite decoys, but on a 20 seconds cooldown timer.
- [x] #115 ✅ The decoy tutorial is still not great, the decoy is placed quite far away, but there is no hologram guard that gets curious and inspecting the decoy, also the robot should then sneak up on the curious guard and use the synchronized backstab. The player cant place decoys over the wall, this is hard, the player should be able to hold Q to preview where the decoy would be placed, then the player can use mouse/camera movement to place the decoy closer or further away from the player.
- [x] #116 ✅ Walking in close vicinity of a guard does raise his cautiousness because he might hear the steps, only sneaking is completely silent and not hearable by enemies unless the player was spotted visually. The start of the rope gun tutorial lesson is not well telegraphed the hologram climbs up while on the platform, skip that and go to the rope shooting with T, that part looks good.
  Add a cheat to jump to a specific tutorial lesson room using SHIFT + STRG + F1...F10, only works with cheat=true in localStorage on which can be toggled by typing "cmonc" in succession. 
- [x] #117 ✅ In the intro you don't see the mini-gun shots, only the impacts of them, also the bullets are sometimes missing at all, e.g. for the sniper, the rocket shot is low-quality and does not match the in-game rocket projectile with vfx.
  The robo dogs feet are clipping into the platform he lands on, this is a bug. Check the full tutorial in a chrome headed browser and verify every 3 frames, the scene is consistent, as there are many things missing.
- [x] #118 ✅ the player exits the tutorial level by flying through the solid wall, this is a bug. 
- [x] #119 ✅ There is still a camera hickup at the start of the tutorial level, use a headed chrome browser and record every frame for the first 10 seconds, your see the camera hickup, fix that to never happen again, not on any situation (not only on the tutorial level).
- [ ] #122
- [ ] #123
- [ ] #124
- [x] #125 ✅ In the intro the rope gun is again not working correctly, its not connected on the edges of the platforms, the robo dog jet is flying away through the solid wall, instead of upwards or back.
- [x] #126 ✅ The player needs some kind of commenting with speech bubbles and english VOs using Chatterbox. The comments should sound cool and make him a clown-like star of the show, e.g. when burning a human corpse or melting a machine, he could say (whispering) "Rest in peace. Or burn in hell?"
  When sniping a human or a surveillance drone with a 1-hit headshot, he could say: (whispering) "Another one bites the dust!".
  But he should never be too chatty, between each comment should be at least 10 seconds (only if the headshot or the burning happen), preferably 15+.
  When the alarm is raised and everything is chasing the player robot(lets call him CM-07), he could say: "6, 7".
  When he is really low health and nobody alarmed or cautious he could say: "Time to tighten my screws!".
  When low on ammunition, he might say: "Almost out of ammo, looking for stones to throw.".
  Think of other scenarios where a comment would help to lighten the mood and make the situation funnier, but if he is in stealth and not yet spotted, he should always whisper his comment to not unimmersively talk loud while enemies are searching for him. Only allow loud versions if the player is already spotted and has nothing to loose by speaking.
- [ ] #127 
- [x] #129 ✅ Currently the intro feels a bit robotic, each scene plays after another and there is basically no natural movement and walking in the scene, like normal humans on patrol would behave and machines that are guarding an area, adjust the intro in that regard.
- [x] #130 ✅ Create 10 screenshot from scenarios at 1920x1080 and 1280x720 where the gameplay is best shown: Rocket launcher, sneak kill-cam kill, rope balancing, robo dog flying in, explosive barrels going off and all the other high action screenshots. 
- [x] #131 ✅ Improve the Intro with a correct show off of all the enemies in this game, those enemies should be animated and not clipping anything and patrol like they do in the game, show off some of their features, especially of the mechs, the tanks and the robo dogs, improve animation quality and correctness of animations in the intro and on the in-game enemy units too. Prevent enemies running into each other and clipping, show part of fortress one where one guard is investigating a decoy from the player and CM-07 jumps down from a rope above him and assassinates the guard there.
- [x] #132 [Image #18] Improve the detail quality of the ship in the          
  background of the base screen, also improve the detail quality of  
  the whole scene including the base platform and the background,    
  as it looks low effort right now, but could feature a futuristic   
  furnace and weapons lab for the weapon modification and the        
  unlocked disguise cosmetics on a futuristic shelf. Make it a       
  believable scenary with high detail quality models. Show  Show     
  the jet powered robo dog flying by every 10-20 seconds randomly    
  in different arc in the background sky.
- [x] #X1 ✅ Create a cinematic trailer using the gameplay-preview-pipeline (but use a seperate package.json script called "cinematic-trailer" with the file name called trailer to chaos-machine-cinematic-trailer.mp4) which shows off the correct in game behaviour to the watching audience and make it epic with correct bullet use, correct kill-cam, the most actionable scenes with edgy video cuts to make it appeal to a 10-15 year old. Let CM-07 speak some of his cool lines in english(no text bubbles in the video). Show of the coolest features of the game and the coolest enemies, all enemies must behave like in the game (curious state, alarmed state, investigating noise and chasing the player on alarm). . The cinematic trailer should be around 60-90 seconds long
- [x] #133 ✅  why cant I shoot my rope gun here[Image #10]? The player should be
  able to shoot the rope gun to connect to platform edges when he    
  stands near an edge and aims at another (max 10 meters away)       
  platform (by platform I mean that it's an elevated area) edge.
- [x] #134 ✅ the player should be able to lower the alarm level deactivating ringing alarm posts with E, deactivating all alarm        
  posts should allow the enemies to get the sense the intruder is   
  gone, but they keep searching in cautious state for another 30     
  seconds, then return to their patrol. The enemies can lose track of the player if the player is hiding behind walls for more than 20 seconds and no enemy sees the player, then they keep searching, preferably at the last spotted location, but they dont magically run to the player actual current location. Player can go stealth again that way if the does not make noise and hides from spotlights, line of sight of enemies and doesnt blow up anything or kills any enemies while the enemies are in alarmed state.
- [x] #135 ✅ I have an incognito Brave tab open, use debugging tools to control the window and publish the trailer publically with perfect tag selection and title and description and not child directed answer with my youtube account on https://studio.youtube.com/channel/UCHwJCJfgB7AnyMiz15uisXg/content. Derive a user-level skill called "publish-cinematic-trailer" from that to publish a cinematic trailer or gameplay video to my hyperg8 youtube account. Repeated package.json script execution should update the video.   
- [x] #136 ✅ The Intro still has some inconsistencies, the jet robo dogs feet clip into the ground and the robo dog at some point is half clipped into the ground as if the landed there, but let him fly away once he dropped of CM-07 to prevent such mistakes. Also one guard shooting the player with his rifle aims really bad especially after CM-07 goes attacking with the mini-gun, but the guard still shooting at the same spot where nobody is anymore which is not immersive and a clear bug to the player.
- [x] #137 ✅ harvest the UI design into an situational user-level skill that can design a futuristic UI, fix the remaining UI issues first, like cut off edges that should have edge fillings like on the FLogoProgress progress bar, this also happens on other UI elements, check every one with a screenshot in chrome mcp.
- [x] #138 ✅ Design the itch.io page background(not title logo or anything) for the game jam submission, use similar art style like the game and UI element design, I will log you into itch.io. Keep the page simple, showing off the core assets and coolness of the game. 
- [x] #139 ✅ Why is CM-07 missing the sniper shot on the surveillance drone drone, instead it could be a nice drone follows shot up until the drone in hit in the red eye (not full up close, so the drone falling apart is shown). If we dont have this yet, add a destroyed state for mechs and machines, which instead of just ragdolling on the ground, break apart in subparts (must look like real subparts of that machine, so someone technically could reassemble the machine.), the melting of that scrap is still possible like before for machines. This should also be visible in the scenematic trailer.
  - Deferred: in the cinematic trailer once it is rebuilt (the drone shot is staged for it; waiting for your go).
- [ ] #140 Explore co-op multiplayer on CG (different player models will be needed with rewarded ads to unlock them.)
- [ ] #141 Explore All vs All game mode and 1vs1 ranked matches in a league with  
  exploding barrels and ammunition in several spaces, tight ammunition budget. 
  multiplayer on CG
- [x] #142 ✅ flying fortress Airship for later stages (high quality detail 3d model that is fancy to look at and perfectly synchronized bullet and rocket emission points)
- [x] #143 ✅ re-balance the ammunition per level/mission/threat level, player must upgrade ammunition stock to get more, 10 sniper shots, 100 mini-gun and 2 rockets, rest must be upgraded and picked up.
- [x] #144 ✅ One 4th Level with a tower like structure, so the player has to go higher and higher to reach the extraction point. reuse all the available props like exploding barrels, ropes, alarm posts etc. and add 1 new thing like an undestructable spotlight tower that constantly scans the area for threat and immediately rings alarm state if finds you, but the spotlight is very slow and easy to dodge if you dont forget it exists.
- [x] #145 ✅ Overhaul the UI, improve the HP bar with 10%...90% markers techy ornaments and a techy bar frame, improve the HP bar icon too. Move the HP bar to the top left corner right of the CM-07 portrait like in most action-rpgs a frame around the portrait covers also the hp bar and the ammunition display in one bigger frame, e.g. like in WoW, make it stand out with a techy style and in our tech UI look but fancier.
  Do the same for the alarm state and the cautiousness level bar, the should be sitting below the ammunition bar in the top left corner inside the player portrait and hp bar frame. Move the Salvage objective to the right side of the edge a little bit higher than the bottom right buttons, but fitting based on available space, it should be positioned like quick quest logs from other RPG games.
  There should be some kind of notice that the player is going low on ammunition and is close or completely run out, those are two different states and this needs to be signaled with wordless cues so the player doesn't oversee it, because he is taught in the tutorial level about this too.
- [x] #146 ✅ a rocket launcher tutorial that can hit enemies/a mech behind an obstacle, that no other weapon type can reach and the player cant walk there, so he has to use the rocket launcher(automatic bullet refresh if out of ammo, by respawning the player in that room), again here a hologram scenario shows how to switch to rocket launcher and how the hologram rocket leaves the rocket launcher nose and flies towards the hologram mech and destroys him into pieces.
- [x] #147 ✅ Go over all 3d assets in the game and check if the quality level is good enough or could be improved to match the highest detail assets, keep draw calls as low as possible by merging static assets into batches in levels. Improve the assets detail quality where needed, I think the human guard need a bit more polish.
- [x] #148 ✅ improve the overall 3d animation of all enemies and the players 3d model in terms of animation quality, make the run and walk and kneel down and activate things and burn things like a realistic human would do, tanks and enemy mechs can stay robotically mechanic, but robo dogs should have a dog like walk and run cycle.
- [x] #149 ✅ fly over the map and check for inconsistencies in the level map, fix holes in the level, even from the outside of the level, where the player rarely looks at.
- [x] #150 ✅ Show a reddish "wasted" (on death) and blueish "Level Cleared" label on the screen in exactly the same fashion as in Mega Droid project, copy it from there.
- [x] #151 ✅ The shield guard is almost too easy to kill as his head is looking over the shield, he should be using his shield to protect himself and other guards behind the shield as a tactical advantage of this unit, he only looks out occasionally from behind his shield if he is not attacked for 5 seconds and want to fire with his handgun, but he should approach from afar with his shield up and trying to run in front of other guards to give them more protection.
- [x] #152 ✅ Playtesters tried to do a double headshot, but were disappointed that the bullet is not penetrating and killing the second enemy, this should be possible as I said before, make the bullet penetrate the human body and exit on the other side, especially on a kill-cam(cant trigger 2 kill-cams for 1 shot, only the first hit can trigger a kill-cam). Show some non-blood vfx emitted on the side the bullet comes out off after the penetrate, show a small decal showing the entry and outry point of the bullet hitting human flesh or machine metal(should be a different on for metal on machines).
- [x] #153 ✅ One playtester didn't understand that he had to kill the 3 human guard with a headshot or a backstab in the 3rd tutorial room.
- [x] #154 ✅ Two playtesters quit the tutorial level in the first room after falling into the gap and not knowing how to get out, also CM-07 wasnt seen anymore on the screen, show a hologram using the grapling hook and the "G"(keyboard detected as always for all keys) key to get out of the gap in the first room.
- [x] #155 ✅ One playtester quit the tutorial level in the second room after trying to snipe the first guard while standing right in front of the boxes that are supposed to hide him and he didnt realise he had to go back a bit to hit the guard over the boxes, so lets lower the height of the boxes enough so even when the player stands rigth in front of them he should be able to land a headshot over the boxes in the first room. The smae player also categorically ignored to crouch in that room and was surprised that he got teleported back, better show a text message why the tutorial room was reset to help the player do it right the next time.
- [x] #156 ✅ One playtester quit the tutorial level in the backstab lesson room after trying to snipe and gun down the guards and getting frustrated that he could not kill them without backstab. Lets show a big "Backstab them" label after the player is trying to kill them with ranged weapons, repeat that message every 3 seconds if he continues shooting them. 
- [x] #157 ✅ Not sure if that's already fixed, but looking at a guards idle animation made me realise his feel slide left and right (or sway left and right, check it in action in a headed chrome with screenshot if you dont understand) during being on guard and idle (tutorial room), the characters should behave like real humans and the feed need to be standing on the ground and touching ground if they dont walk and raise their feet for it, it should look natural and not like a ghost movement.
- [x] #158 ✅ One Playtester never backstabbed anyone, is the "[E] backstab" billboard missing? in the backstab tutorial lesson room, show the hologram in the middle of the room and not in the top left corner, so people dont overlook it, also freeze the player movement after entering the room and zoom in on the middle of the room and let them see 2 iterations of the backstack hologram cycle (should show E to backstab button going up, keyboard detected of course).
- [x] #159 ✅ Its really frustrating if a player runs out of ammo during a tutorial where he has to shoot. a reset should always refill the tutorial ammo and if the player runs out of ammo, show "Ammo depleted! Try again!" label on the screen 
- [x] #160 ✅ Mobile players dont seem to get the same hologram button press hints in the tutorial levels and when approaching ledges etc., so they struggle a lot more, color code (and shape code each button -> accessibility) each mobile/tablet version button to allow easy display which button was pressed by the hologram exactly like in the desktop version. Thats also why most players dont crouch in the second room or dont use grapling hook when they fall into the gap in the first room. harvest the lessons into a skill linked in new-web-game-playbook.  
- [x] #161 ✅ There should be a stronger visual change on the selected weapons button, lets add very detailed weapon shapes that replace the normal button shape for that button and color code the weapons, the rocket launcher gets a reddish color, the gatling gun a blueish/violetish color, the sniper gets a cyanish color. Each weapon selection show than the weapon without the usual button borders and ornaments but still shows the mousewheel/Tab hint and on mobile shows a very detailed icon showing clearly that the weapons can be rotated, or just spread them out on mobile and the player can quick select them like in a button switch. 
- [x] #162 ✅ For some reason the burn corpse to dust does not work after a first activation everywhere, as if the fuel is empty and the player resorts to dragging corpes, but thats inefficient here, I want to be able to burn every evidence down and not carry corpses around.
- [x] #163 ✅ in the disguise tutorial room one player just went to the spotlight and crushed it without the need to ever disguise, rework this lesson, so the player has no chance to shoot or destroy the spotlight(maybe behind unbreakable glass in a cage.) and that forces the player to outwait the spotlight to pass over his disguised head and not be able to go around the spotlight like it currently is possible. if the player fails in this room, show "Disguise yourself, to not get spotted" label in the same fashion as the other lecture warnings. 
- [x] #164 ✅ The grapling hook visuals got updated, but the rope gun shot(placed rope) is still a cyan tube without texture, improve the visual quality while not going overboard with the complexity, it should just look more realistically.
- [x] #165 ✅ The decoy lesson has not been learnt by any player, they just jump on the boxes and shoot the guard, if the player gets spotted the first time say: "Use a decoy [Q], backstab when distracted", if the player then still refuses to learn, allow him to kill him in any way to finish this room.
- [x] #166 ✅ All players have restarted the first fortress after finishing it, even though the second fortress should have been available, I wonder why, maybe preselect fortress 2 (with a frame that tells the player this is the next mission) after fortress one is solved and show fortress 1 in a slighly dimmed down color.
- [x] #167 ✅ The visual 3d models should match the color and shape of the UI weapon selected, please redo the 3d models with higher detail quality and dont forget to adjust weapons bullet exit points everwhere in case the bullet exit point changes with the weapon redesign, I mean everywhere, Intro, Outro, holograms, tutorials, fortress mission etc. (I probably forgot some)
- [x] #168 ✅ The 3 people in the room does not have any hologram animations anymore(also the door opens with all 3 alive, but the player should kill them there before he can proceed and the hologram should should that) and the next room has a mech, but nothing happens there, there is no hologram tutorial teaching anything and the door opens automatically (this happens if you ran through the open door before and did not kill the 3 guards in the previous room). The "H" Help button does not open anything anymore. The rocket launcher tutorial does not require the player to kill the mech, but should to open the door(it opens automatically sometimes now, show the buttons used to switch to the rocket launcher in this holograms tutorial, also the hologram sometimes does not show at all. THe hologram should appear every time the player gets close to the blue hologram start circle on the ground especially on first entry of the room but not trigger through a closed door)
- [x] #169 ✅ The new player portrait badge in the top left corner is a bit too big(CM-07 does not need to be printed there, there should be less space wasted between the rows, reduce the portrai size by 25% to make the overall badge smaller). The redo button (during the tutorials) needs a Shortcut key on desktop, e.g."K", the mouse movement indicator is best shown with a infinity icon where a finger points and moves along the line indicating 360 deg movement (even on desktop replacing the mouse move animation).
- [x] #170 ✅ The SettingsMenu  should be fully navigatable with Keyboard controls like TAB, left, right, up, down, space and Enter buttons, which are keyboard layout agnostic, harvest this lesson into a skill that is linked to new-web-game-playbook.
- [x] #171 ✅ The crouch lesson room should not open the door unless the player has crouched once, if he runs into any lesson door (show a text saying the lesson requirements in short words). When Entering the backstab tutorial room, the camera is jumping wildly, better switch to another camera pointing at the hologramm lesson a little bit from the left to not have the camera clip or jump through walls or the players body. The door in the decoy lesson room is opening immediately without the player having to do the tutorial lesson, this is stupid, the door should only open after the player backstabed him on first try or killed him in any manner on 2nd+ try. If I run into the spotlight on the disguise tutorial I get setback to the blue circle with the warning, but there I am again in the spotlight and the warning and setback loop stunlocks me. The guards and mechs and machines that get curious about a decoy should stay for 4 seconds watching it and shooting once at it, once they arrived at it, otherwise the crouching CM-07 has no chance to follow up on the backstab kill. The spotlight cone on the disguise tutorial room is a bit too big, make it 40% smaller to allow the player more comfortably to run away after the spotlight passed over the disguised CM-07.
- [x] #172 ✅ The backstabs have 3 variations now, but still in every one of the a big part of the CM-07 body clips into the killed guard body, fix this and make it look like a real assassination with more fluid movement, currently it feels like the blade almost instantly lands in the body, than the camera watches the scene, better to have the actual swing and head hold animation happen fast, but visible, maybe its also a camera angle thing as the camera cuts to the kill-cam position fast and by then the player is already in the blade in body position. improve that to make it look natural and fluid. Also the sound need to be improved, it feels that the backstab uses blade to metal sounds on killing humans, same for close combat E usage. 
- [x] #173 ✅ One of the guards in the 3 guards room bursted into pieces(even though he is a human and should fall down as a ragdoll), bursting to pieces can only appear for mechs and machines. 
- [x] #174 ✅ Now mosts of the backstab animations have the blade or some parts of the hand/arm be clipped with the blade during the animation, that should look better, current version still looks bugged, get inspired by how Assassins Creed does it, do a web-search and use frame by frame references to copy the assassination animations, prevent clipping of any body parts. I saw that CM-07 unnaturally swings his shoulder joint around to make the stab, which is simply not a real assassins kill move, aside from clipping the arm through his own body.
- [x] #175 ✅ The Intro cutscene is not skippable while the player is in pointerlock, remove pointerlock during cutscenes and readd afterwords for desktop users. Add an additional 1.5 second press on Space to skip a cutscene, show that on the Skip button like the other button labels, but holding it raises a circular progressbar like red dead redemption 2 does it.
- [ ] #176


## NOT DEFINED YET: - Night fighting -> Spotlights will be more present.
## NOT DEFINED YET: - Roboter K9 hunting you. 
## NOT DEFINED YET: - Mission briefing per Y messenger (X/Twitter copy/parody).

## Playtest round 1 (2026-10-02)

From the first playtest. Worked through in `game-implementation-plan.md`,
"Round 2"; each is ticked here when its phase is committed.

- [x] #21 ✅ Sneaking puts the mech into the ground: the crouch pose must stand
  on the floor.

- [x] #22 ✅ Sprint on Shift.

- [x] #23 ✅ Key rebinding tab in the Settings / Pause menu, with the keyboard
  layout detected automatically (keyboard-layout-bindings skill).

- [x] #24 ✅ The first level looks boring: make it a futuristic scrapyard
  fortress (metal walls, searchlights sweeping set positions; inspiration:
  Wind Waker's Forsaken Fortress). Higher quality props and level geometry,
  bevelled edges instead of cubes.

- [x] #25 ✅ A grappling hook to climb over a wall from below. Its landing makes
  a little noise: nearby guards and machines wonder for 2 seconds (looking
  around) where it came from, then inspect the spot. The player can cancel
  the hook in that time to stay unnoticed.

- [x] #26 ✅ NPC and machine animation, significantly better: humans walk and
  act like humans, far less robotic.

- [x] #27 ✅ Satisfying death animations for every NPC and for the mech.
  Machines sometimes burst into pieces that drop to the ground and stay
  there, where another patrol can find them as a clue that an intruder is in.

- [x] #28 ✅ The backstab as a choreographed close-up: the hidden blade jumps
  out of the arm and goes through the target, the tip showing at the stomach;
  a kill cam; the target does not drop until the mech pulls the blade out
  (then the body falls, or a machine falls to rounded cubes).

- [x] #29 ✅ Salvage is the goal of a fortress: salvage material lies in piles
  through the fortress and the player collects it to improve weapons.

- [x] #30 ✅ Extraction by a jet-powered robo dog that transforms into a
  skateboard-like jet platform and flies the mech away.

- [x] #31 ✅ Upgrading is a minigame: a furnace that melts scrap, then futuristic
  smithing, 2-3 steps with short production times between them. Fun, not a
  chore. For weapons and defense.

- [x] #32 ✅ The UI needs a more futuristic and cute look; it reads as clean and
  programmatically built.

- [x] #33 ✅ Wordless tutorials for the mechanics and controls, so a 10-year-old
  understands how to move and attack and misses nothing.


## Retention roadmap (added 2026-10-02, after the first playable)

Ordered by what it buys per week of work. None of these is started. Left out
on purpose, per the brief: battle pass, achievements, daily logins, daily
missions, rewarded-ad buttons, treasure chests.

- [ ] #2 **Fortress 2 and 3.** The one-fortress build proves the loop; day-2
  return needs somewhere new to go. Each fortress is one data file on the
  existing kit (`data/fortresses/`), with one new idea each: a harbour with
  patrol boats and long sight lines for the sniper, a rail yard whose moving
  trains are cover that leaves. Five threat levels each, same medals.

- [ ] #3 **A weekly fortress with its own board.** A seeded remix of an
  existing layout (patrols, towers and the Commander's route reshuffled), the
  same for every player for seven days, on its own leaderboard that resets.
  Gives a reason to come back on a fixed day without a login reward.

- [ ] #4 **Contracts: optional rules per run.** Picked at the Deploy panel:
  "never seen", "blade only", "under three minutes", "no decoys". Each pays
  extra Data Cores once. Turns a cleared threat level into three more runs.

- [ ] #5 **Ghost of your best run.** A faint mech replays the best run's path
  and shots on the same level. The save already keeps the best score per
  level; this adds the route. Self-competition is the cheapest rival there is.

- [ ] #6 **Mech paint and kill-cam trails.** Cosmetics earned by medals, not
  bought: a paint per fortress mastered, a tracer colour per 50 headshots.
  Shown in the Chassis Bay and in every kill-cam, which is where a player
  looks hardest.

- [ ] #7 **Two more gadgets.** An EMP dart (silences a drone or a searchlight
  for ten seconds) and a smoke canister (breaks every cone for a moment when
  the alarm goes). Each opens a new answer to the same fortress, which is what
  makes a stealth level replayable.

- [ ] #8 **Weapon variants in the Forge.** One alternative per slot (a
  burst-fire marksman rifle, a shotgun arm, a cluster rocket), built from
  blueprints over the Forge's timers. The wait timers then have something a
  player wants at the end of them, beyond a higher number.

- [ ] #9 **Mastery stars and a sixth threat level.** Three stars per level
  from the medals that already exist (Ghost, Marksman, Swift). All fifteen in
  a fortress open "Nightmare": no "?" grace, twice the garrison. A long goal
  for the players who finish the campaign in two evenings.

- [ ] #10 **Siege mode.** Skip the stealth: the alarm is already on, waves
  keep coming, the score is how long the mech lasts. Reuses the reserve and
  wave system built for the action phase. A second leaderboard, and the mode
  for a five-minute session.

- [ ] #11 **A share card of the best kill-cam.** One tap after a mission: the
  x-ray frame of the best shot, the score and the rank, as an image through
  the Web Share API (copy-link fallback). Free reach, and a reason to chase a
  better frame.

- [ ] #12 **The Commander remembers.** A Commander who survived an alarm, or
  who killed the mech, comes back at the next threat level with a name, a
  trait ("wears a helmet now", "doubles the patrols") and a bounty. A light
  nemesis system over data the garrison already has.

- [ ] #13 **The Command Base grows.** The hangar gains a gantry, a tool wall,
  a trophy from each Commander, the dropship gets its paint. Progress the
  player can see every time the game opens, at no cost to play time.

- [ ] #14 **A hot streak.** Missions won in a row without a defeat raise a
  scrap multiplier (x1.1 to x1.5), shown on the Deploy button. Losing it is a
  reason to play one more, carefully. Session length, not day count.

- [ ] #15 **Side operations.** Sixty to ninety seconds each: shoot down five
  drones from the perch, carry a data core out unseen, escort a decoy. The
  only source of a second kind of blueprint, so they stay worth doing.

- [ ] #16 **A Forge worth returning to.** Two jobs in the queue instead of
  one, and the base opens on the Forge when a job finished while the player
  was away. The timers exist; today nothing tells a returning player that
  one is done.

- [ ] #17 **Goliath variants as fortress finales.** A walker that climbs
  walls, a gunship that owns the sky. One per fortress, each with its own
  weak point and its own lesson glyph.

- [ ] #18 **A firing range in the base.** Moving targets, a timer, a personal
  best per weapon. Where a new upgrade is tried out, and where the wordless
  lessons can be replayed on purpose.

- [ ] #19 **Gamepad, and aim options.** Controller support for the portals
  that reach TVs and handhelds, an aim-assist slider, a colour-blind palette
  for the vision cones. Players who cannot play comfortably do not return.

- [ ] #20 **A name and a flag on the board.** A chosen display name and a
  country flag next to the rank badge, and "you passed N players this week"
  on the Command Base. The board is the only social surface the game has;
  make it personal.
