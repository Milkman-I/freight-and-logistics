/**
 * Notification sound files (src/assets/*.wav) — generated offline, wired
 * through <audio> clones so overlapping cues each play independently.
 * Autoplay policy: the files are prewarmed (play+pause, muted) on the
 * first user gesture so later plays are unlocked; any failure is silent.
 */

import errorUrl from '../assets/error.wav'
import successUrl from '../assets/success.wav'

let unlocked = false

function play(url: string, volume: number) {
  const a = new Audio(url)
  a.volume = volume
  void a.play().catch(() => {})
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    if (unlocked) return
    unlocked = true
    for (const url of [errorUrl, successUrl]) {
      const a = new Audio(url)
      a.muted = true
      void a.play().then((p) => (a.pause(), (a.currentTime = 0), void p)).catch(() => {})
    }
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

export function playError() {
  play(errorUrl, 0.65)
}

export function playSuccess() {
  play(successUrl, 0.6)
}
