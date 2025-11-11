import { PlayerDoc } from '../types'

export function tally(votes: Record<string,string|null|undefined>, alive: Record<string,boolean>) {
  const counts: Record<string, number> = {}
  Object.entries(votes).forEach(([voter, target]) => {
    if (!target) return
    if (!alive[voter]) return
    counts[target] = (counts[target] || 0) + 1
  })
  let top: {target:string, votes:number} | null = null
  for (const [t, c] of Object.entries(counts)) {
    if (!top || c > top.votes) top = { target: t, votes: c }
  }
  return top
}

export function winCheck(players: Record<string, PlayerDoc>) {
  let mafiaAlive = 0, othersAlive = 0
  let playersWithoutRole = 0
  
  for (const p of Object.values(players)) {
    // Skip dead players
    if (!p.isAlive) continue
    
    // Skip players without roles assigned (shouldn't happen, but defensive check)
    if (!p.role) {
      playersWithoutRole++
      console.warn('winCheck: Found player without role:', p.displayName)
      continue
    }
    
    if (p.role === 'mafia') {
      mafiaAlive++
    } else {
      othersAlive++
    }
  }
  
  // Log for debugging
  console.log('winCheck:', { mafiaAlive, othersAlive, playersWithoutRole, totalAlive: mafiaAlive + othersAlive })
  
  // If there are players without roles, don't end the game (data might be incomplete)
  if (playersWithoutRole > 0) {
    console.warn('winCheck: Players without roles detected, returning null to prevent premature end')
    return null
  }
  
  // Town wins if all mafia are dead
  if (mafiaAlive <= 0) {
    console.log('winCheck: Town wins - no mafia alive')
    return 'town'
  }
  
  // Mafia wins if they equal or outnumber others (they can vote together)
  if (mafiaAlive >= othersAlive) {
    console.log('winCheck: Mafia wins - mafia count >= others')
    return 'mafia'
  }
  
  // Game continues
  return null
}
