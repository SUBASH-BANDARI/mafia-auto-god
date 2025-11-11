export type Role = 'mafia' | 'villager' | 'police' | 'healer'

export interface RoleInfo {
  name: string
  emoji: string
  color: string
  lightColor: string
  darkColor: string
}

export function getRoleInfo(role?: Role | null): RoleInfo {
  switch (role) {
    case 'mafia':
      return {
        name: 'Mafia',
        emoji: '🔪',
        color: '#ef4444',
        lightColor: '#f87171',
        darkColor: '#dc2626',
      }
    case 'police':
      return {
        name: 'Police',
        emoji: '👮',
        color: '#3b82f6',
        lightColor: '#60a5fa',
        darkColor: '#2563eb',
      }
    case 'healer':
      return {
        name: 'Healer',
        emoji: '💊',
        color: '#10b981',
        lightColor: '#34d399',
        darkColor: '#059669',
      }
    case 'villager':
      return {
        name: 'Villager',
        emoji: '👤',
        color: '#6366f1',
        lightColor: '#818cf8',
        darkColor: '#4f46e5',
      }
    default:
      return {
        name: 'Unknown',
        emoji: '❓',
        color: '#a3a3a3',
        lightColor: '#d4d4d4',
        darkColor: '#737373',
      }
  }
}

