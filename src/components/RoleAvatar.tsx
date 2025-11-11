import { Box, SxProps, Theme } from '@mui/material'

interface RoleAvatarProps {
  role?: 'mafia' | 'villager' | 'police' | 'healer' | null
  size?: number
  isAlive?: boolean
  sx?: SxProps<Theme>
}

export default function RoleAvatar({ role, size = 48, isAlive = true, sx }: RoleAvatarProps) {
  const opacity = isAlive ? 1 : 0.5
  const grayscale = isAlive ? 0 : 1

  const getAvatar = () => {
    switch (role) {
      case 'mafia':
        return (
          <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Background circle */}
            <circle cx="50" cy="50" r="48" fill="#1a1a1a" stroke="#ef4444" strokeWidth="2"/>
            {/* Mafia mask/face */}
            <circle cx="50" cy="40" r="18" fill="#2a1a1a" opacity={opacity}/>
            {/* Eyes */}
            <circle cx="42" cy="38" r="3" fill="#ef4444" opacity={opacity}/>
            <circle cx="58" cy="38" r="3" fill="#ef4444" opacity={opacity}/>
            {/* Knife */}
            <path d="M50 50 L50 70 L45 75 L50 70 L55 75 Z" fill="#dc2626" opacity={opacity}/>
            <rect x="48" y="50" width="4" height="20" fill="#f87171" opacity={opacity}/>
            {/* Hat shadow */}
            <ellipse cx="50" cy="25" rx="20" ry="8" fill="#000000" opacity={0.6 * opacity}/>
          </svg>
        )
      case 'police':
        return (
          <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Background circle */}
            <circle cx="50" cy="50" r="48" fill="#1a1a1a" stroke="#3b82f6" strokeWidth="2"/>
            {/* Head */}
            <circle cx="50" cy="40" r="18" fill="#2a2a3a" opacity={opacity}/>
            {/* Police hat */}
            <rect x="35" y="25" width="30" height="8" rx="2" fill="#3b82f6" opacity={opacity}/>
            <rect x="40" y="20" width="20" height="8" rx="2" fill="#2563eb" opacity={opacity}/>
            {/* Badge */}
            <circle cx="50" cy="35" r="6" fill="#fbbf24" opacity={opacity}/>
            <path d="M50 32 L52 35 L50 38 L48 35 Z" fill="#f59e0b" opacity={opacity}/>
            {/* Eyes */}
            <circle cx="44" cy="40" r="2.5" fill="#ffffff" opacity={opacity}/>
            <circle cx="56" cy="40" r="2.5" fill="#ffffff" opacity={opacity}/>
            {/* Mustache */}
            <path d="M45 45 Q50 47 55 45" stroke="#ffffff" strokeWidth="2" fill="none" opacity={opacity}/>
          </svg>
        )
      case 'healer':
        return (
          <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Background circle */}
            <circle cx="50" cy="50" r="48" fill="#1a1a1a" stroke="#10b981" strokeWidth="2"/>
            {/* Head */}
            <circle cx="50" cy="40" r="18" fill="#2a3a2a" opacity={opacity}/>
            {/* Hair */}
            <path d="M32 35 Q50 25 68 35 Q68 30 50 28 Q32 30 32 35" fill="#059669" opacity={opacity}/>
            {/* Medical cross */}
            <rect x="47" y="30" width="6" height="20" rx="1" fill="#10b981" opacity={opacity}/>
            <rect x="40" y="37" width="20" height="6" rx="1" fill="#10b981" opacity={opacity}/>
            {/* Eyes */}
            <circle cx="44" cy="40" r="2.5" fill="#34d399" opacity={opacity}/>
            <circle cx="56" cy="40" r="2.5" fill="#34d399" opacity={opacity}/>
            {/* Smile */}
            <path d="M44 47 Q50 50 56 47" stroke="#34d399" strokeWidth="2" fill="none" strokeLinecap="round" opacity={opacity}/>
          </svg>
        )
      case 'villager':
        return (
          <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Background circle */}
            <circle cx="50" cy="50" r="48" fill="#1a1a1a" stroke="#6366f1" strokeWidth="2"/>
            {/* Head */}
            <circle cx="50" cy="40" r="18" fill="#3a3a2a" opacity={opacity}/>
            {/* Hair */}
            <path d="M32 35 Q50 25 68 35 Q68 30 50 28 Q32 30 32 35" fill="#4f46e5" opacity={opacity}/>
            {/* Simple hat/cap */}
            <ellipse cx="50" cy="28" rx="15" ry="6" fill="#818cf8" opacity={opacity}/>
            {/* Eyes */}
            <circle cx="44" cy="40" r="2.5" fill="#ffffff" opacity={opacity}/>
            <circle cx="56" cy="40" r="2.5" fill="#ffffff" opacity={opacity}/>
            {/* Smile */}
            <path d="M44 47 Q50 50 56 47" stroke="#a3a3a3" strokeWidth="2" fill="none" strokeLinecap="round" opacity={opacity}/>
          </svg>
        )
      default:
        // Mystery/Unknown avatar - used when role should be hidden
        return (
          <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" fill="#1a1a1a" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 4"/>
            <circle cx="50" cy="40" r="18" fill="#2a2a2a" opacity={opacity}/>
            {/* Question mark */}
            <text x="50" y="50" fontSize="24" fill="#6366f1" textAnchor="middle" dominantBaseline="middle" fontWeight="bold" opacity={opacity}>?</text>
            {/* Eyes hidden with mask */}
            <circle cx="44" cy="38" r="3" fill="#6366f1" opacity={opacity * 0.3}/>
            <circle cx="56" cy="38" r="3" fill="#6366f1" opacity={opacity * 0.3}/>
          </svg>
        )
    }
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: `grayscale(${grayscale})`,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'scale(1.05)',
        },
        ...sx,
      }}
    >
      {getAvatar()}
    </Box>
  )
}

