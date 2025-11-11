function rndInt(n: number) {
  const a = new Uint32Array(1)
  let x = 0
  let limit = Math.floor(0x100000000 / n) * n
  do {
    crypto.getRandomValues(a)
    x = a[0] >>> 0
  } while (x >= limit)
  return x % n
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rndInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export type Role = 'mafia'|'villager'|'police'|'healer'

export function assignRoles(uids: string[]): Record<string, Role> {
  const N = uids.length
  if (N < 4) {
    throw new Error('Need at least 4 players')
  }
  
  // Determine mafia count based on player count
  let mafiaCount: number
  if (N === 4) {
    mafiaCount = 1
  } else if (N >= 5 && N <= 8) {
    mafiaCount = 2
  } else {
    // 9+ players: 3 mafia
    mafiaCount = 3
  }
  
  const pool: Role[] = []
  
  // Always add: 1 police, 1 healer
  pool.push('police')
  pool.push('healer')
  
  // Add mafia
  for (let i = 0; i < mafiaCount; i++) {
    pool.push('mafia')
  }
  
  // Fill rest with villagers
  while (pool.length < N) {
    pool.push('villager')
  }
  
  shuffle(pool)
  shuffle(uids)
  
  const out: Record<string, Role> = {}
  uids.forEach((u, i) => out[u] = pool[i])
  return out
}
