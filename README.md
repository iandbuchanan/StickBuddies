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
