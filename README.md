# StickBuddies
## Created by my 9 year old son with Claude Code and his very creative imagination.

Stick figures that live on your Windows desktop, inspired by Alan Becker's *Animation vs. Animator* and *Animation vs. Minecraft*. TSC, Red, Green, Blue and Yellow walk around your screen, stand on top of your open windows, and run on a homemade AI: small neural networks written from scratch in plain JavaScript. There's no API key and no internet connection. They start out as beginners and learn by themselves.

> **Unofficial fan project.** TSC, Red, Green, Blue and Yellow are characters created by Alan Becker. This project isn't affiliated with or endorsed by Alan Becker. It's a non-commercial tribute made by a young fan who was learning to code.

## What they do

- **Explore your desktop** with gravity. The top edge of every open window is a floor. Drag a window and they ride along. Close it and they fall.
- **Learn to jump.** A small neural network learns how hard to jump and when to double-jump to land on a window. If a window is too high, one buddy asks a teammate for a boost.
- **Decide what to do.** A Q-learning neural network picks between exploring, resting, playing tag, sparring, high fives, coding and more, based on how each choice made them feel.
- **Talk with gestures only**, like in the videos: pointing, nodding, shaking their head, shrugging, cheering.
- **Watch with you.** When a video or game is on, they sit down together and watch.
- **Hear music.** They listen to the computer's sound (locally) for a steady beat. When a song plays, they get up and dance to it: their own routines built from real moves, timed to the beat, acting out what the song is about.
- **Have their own taste.** They form opinions about apps, websites and activities (*AWESOME!*, *this is fine*, *ugh, this sucks*) from their personalities and experience.
- **Write their own code.** They snap code blocks together into small JavaScript programs, run them with Node, and keep the ones they think are good.
- **Help a little.** They stay quiet during schoolwork, and one of them points at the clock after an hour of games or videos.
- **Remember everything.** What they learn is saved locally in `memory.json`.

## Requirements

- Windows 10 or 11
- [Node.js](https://nodejs.org) (LTS version)
- About 300 MB of disk space and an internet connection for the first setup (to download Electron)

## Setup

1. Download or clone this repository.
2. Install Node.js if you don't have it.
3. Double-click **`SETUP (run this first).bat`** (or run `npm install` in this folder).

## Usage

| Action | How |
|---|---|
| Start | Double-click `Start StickBuddies.bat` (or `npm start`) |
| Stop (saves their memories first) | Double-click `Stop StickBuddies.bat`, or press **Ctrl+Alt+Q** |
| See their brains | **Ctrl+Alt+B** |
| Hide / show | **Ctrl+Alt+H** |
| Music on / off | **Ctrl+Alt+M** (put your own audio files in `music/`) |
| Run the programs they wrote | `Run Their Code.bat` |

Pick them up with the mouse, gently. If you fling them, they learn not to trust you.

## The brain view (Ctrl+Alt+B)

Press **Ctrl+Alt+B** to open a panel in the top-left corner showing what each buddy is thinking and what it has learned so far. Press it again to hide the panel. Each buddy gets a block like this:

```
Red  ·  playing tag
decisions: 754  ·  still guessing 6%  ·  last reward +1.36
jumps landed 24/44  ·  loves: epic battle music  ·  hates: schoolwork
```

| What you see | What it means |
|---|---|
| **playing tag** (after the name) | What the buddy is doing right now |
| **decisions** | How many choices its decision-making neural network has learned from. Higher means more experience. |
| **still guessing %** | How often it tries something at random instead of doing what it has learned works. A brand-new buddy guesses 100% of the time; this drops a little after every decision, down to 5%. |
| **last reward** | How much better (+) or worse (−) its last choice made it feel. This is the number the network learns from. |
| **jumps landed** | Score for its separate jumping neural network: successful landings out of attempts |
| **loves / hates** | Its strongest opinions so far, about apps, websites, music or its own activities |

The full list of opinions is saved in `what they like.txt` in the app folder.

## How they learn

Nothing here is scripted with fixed answers. Each buddy learns from its own experience, with small neural networks written from scratch in `nn.js`.

**1. Needs.** Every buddy has four needs that change over time: **energy**, **fun**, **social** and **curiosity**. Exploring uses energy, being alone makes them lonely, and new things make them curious. Personality changes how much each need matters: Red lives for action, Blue is calm, Yellow is curious.

**2. Choosing what to do (Q-learning).** When a buddy finishes something, its decision network looks at its needs and surroundings as numbers: how tired it is, whether a teammate is nearby, whether a video is playing, whether you're doing schoolwork, and so on. The network predicts how good each possible activity would be and picks one: explore, rest, play tag, spar, high five, code, watch, and more. At first it mostly guesses (the *still guessing %*).

**3. The reward.** When the activity ends, the buddy checks whether it feels better. Fixing a big need gives a big reward. For example, resting when exhausted feels great, and resting when already rested does nothing. Being flung by the mouse or failing at something gives a negative reward. The network adjusts its predictions a little after every decision (backpropagation with the Adam optimizer), so good choices become more likely. Expect them to get noticeably smarter over roughly the first 15–30 minutes of running.

**4. Learning to jump.** A second neural network learns how hard to jump and when to double-jump to land on top of a window. Early on they miss a lot. As they practice, their predictions improve. Once one has at least 8 jumps of experience and predicts it has less than a 15% chance of making a jump, it asks a teammate for a boost instead.

**5. Other things they learn**

- **Trust in you.** Setting them down gently raises their trust in your mouse; flinging them lowers it. Teammates who see it happen are affected too. A buddy with low trust keeps its distance from your cursor.
- **Opinions.** What they think of an app, website or song starts from their personality, and then shifts with how they actually feel while it's on screen. An opinion forms after watching or using something for a little while. Opinions about their own activities come from the rewards those activities gave them, after at least 3 tries.
- **Coding.** They write programs by snapping code blocks together and running them with Node. Every crash makes them more careful: their chance of making a beginner mistake drops each time. Blocks that led to good programs get used more, and a program is only saved if it's better than their previous best.
- **Dancing.** Each buddy makes up its own dance routines from the move library, tries small changes, and keeps a change only if it suits its style better. They sometimes remix a teammate's routine.

**6. Memory.** Everything they learn is saved to `memory.json` every 10 seconds and when you stop the app, and loaded again the next time they start. Each time they start, their decision network goes back to guessing at least 25% of the time for a while, then settles down again as it makes new decisions. To start completely over as beginners, close StickBuddies and delete `memory.json`.

## Privacy

Everything stays on your computer. Nothing is sent over the internet.

- **Windows:** a small PowerShell helper reads the positions of open windows (so the buddies can stand on them) and the name and title of the window in front (so they can tell a game from a video).
- **Sound:** the app listens to the computer's audio output to detect a beat. Audio is analyzed in memory and never recorded or saved.
- **Files it writes (all inside this folder):** `memory.json`, `what they like.txt`, `debug.log`, and the `their code/` folder. These are listed in `.gitignore` so personal data isn't committed by accident.

## How it's built

| File | What it does |
|---|---|
| `main.js` | Electron app: the see-through, always-on-top window, window watcher, saving files |
| `preload.js` | The only bridge between the page and the computer |
| `world.js` | Physics, floors (window tops), drawing the stick figures and their poses |
| `brain.js` | The AI: needs, goals, plans, teamwork, opinions, watching and dancing |
| `nn.js` | Tiny neural network library written from scratch (backpropagation and Adam), plus Q-learning and the jump learner |
| `ears.js` | Beat detection with onset autocorrelation, tempo, and music-or-not decisions |
| `moves.js` | Hand-animated dance-move library the buddies build routines from |
| `coder.js` | How the buddies write, run, judge and improve their own programs |
| `app.js` | Main loop, mouse, music player, brain view, saving memories |

## License

[MIT](LICENSE)
