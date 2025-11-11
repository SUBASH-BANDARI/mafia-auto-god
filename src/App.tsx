import { useEffect, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { Box, Container, CssBaseline, Typography } from '@mui/material'
import Home from './pages/Home'
import Lobby from './pages/Lobby'
import Game from './pages/Game'
import { ensureAnon } from './lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from './lib/firebase'
import { ErrorBoundary } from './ErrorBoundary'
import { getSavedRoomData, clearRoomData } from './lib/storage'
import { doc, getDoc } from 'firebase/firestore'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366f1', // Indigo
      light: '#818cf8',
      dark: '#4f46e5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ec4899', // Pink
      light: '#f472b6',
      dark: '#db2777',
      contrastText: '#ffffff',
    },
    background: {
      default: '#000000', // Pure black
      paper: '#1a1a1a', // Dark gray for cards
    },
    text: {
      primary: '#f5f5f5', // Light gray for primary text
      secondary: '#a3a3a3', // Medium gray for secondary text
    },
    success: {
      main: '#10b981', // Green
      light: '#34d399',
      dark: '#059669',
    },
    error: {
      main: '#ef4444', // Red
      light: '#f87171',
      dark: '#dc2626',
    },
    warning: {
      main: '#f59e0b', // Amber
      light: '#fbbf24',
      dark: '#d97706',
    },
    info: {
      main: '#3b82f6', // Blue
      light: '#60a5fa',
      dark: '#2563eb',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
      letterSpacing: '0.01em',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          padding: '10px 24px',
          fontSize: '0.95rem',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.3)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#6366f1',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255, 255, 255, 0.2)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255, 255, 255, 0.3)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#6366f1',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          fontWeight: 500,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.12)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
      },
    },
  },
})

type Page = { name: 'home' } | { name: 'lobby', roomId: string } | { name: 'game', roomId: string }

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'home' })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Wait for auth state to be restored from persistence, then ensure anonymous auth
    const initAuth = async () => {
      try {
        // Wait for auth state to be ready (restores from localStorage if available)
        await auth.authStateReady()
        // Ensure user is authenticated (creates new anonymous user if needed)
        await ensureAnon()
        
        // Check for saved room data and auto-restore
        const savedRoom = getSavedRoomData()
        if (savedRoom) {
          console.log('Found saved room data, checking room status:', savedRoom.roomId)
          try {
            const roomDoc = await getDoc(doc(db, 'rooms', savedRoom.roomId))
            if (roomDoc.exists()) {
              const roomData = roomDoc.data()
              console.log('Room exists, status:', roomData.status, 'phase:', roomData.phase)
              
              // Check if user is still in the room
              const userId = auth.currentUser?.uid
              if (userId) {
                const playerDoc = await getDoc(doc(db, 'rooms', savedRoom.roomId, 'players', userId))
                if (playerDoc.exists()) {
                  // User is still in the room, auto-navigate
                  if (roomData.status === 'in_progress' || (roomData.phase && roomData.phase !== 'lobby' && roomData.phase !== 'ended')) {
                    console.log('Auto-restoring to game screen')
                    setPage({ name: 'game', roomId: savedRoom.roomId })
                  } else if (roomData.status === 'open' || roomData.phase === 'lobby') {
                    console.log('Auto-restoring to lobby')
                    setPage({ name: 'lobby', roomId: savedRoom.roomId })
                  } else if (roomData.status === 'ended') {
                    console.log('Game ended, clearing saved room data')
                    clearRoomData()
                  }
                } else {
                  // User is not in the room anymore, clear saved data
                  console.log('User not found in room, clearing saved data')
                  clearRoomData()
                }
              }
            } else {
              // Room doesn't exist, clear saved data
              console.log('Room not found, clearing saved data')
              clearRoomData()
            }
          } catch (error) {
            console.error('Error checking saved room:', error)
            // On error, clear saved data to avoid getting stuck
            clearRoomData()
          }
        }
        
        setReady(true)
      } catch (error) {
        console.error('Auth initialization error:', error)
        setReady(true) // Still show UI even if auth fails
      }
    }
    
    initAuth()
    // Also listen for auth state changes
    const unsub = onAuthStateChanged(auth, () => {
      setReady(true)
    })
    return () => unsub()
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Box sx={{ minHeight: '100vh', backgroundColor: '#000000' }}>
          <Container maxWidth="sm">
            <Box sx={{ py: 4 }}>
              <Typography 
                variant="h4" 
                gutterBottom 
                sx={{ 
                  fontWeight: 700, 
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  mb: 3
                }}
              >
                Mafia Auto-God
              </Typography>
              {!ready ? (
                <Typography sx={{ textAlign: 'center', color: 'text.secondary' }}>Loading…</Typography>
              ) : (
                page.name === 'home' ? <Home 
                  toLobby={(roomId)=>setPage({name:'lobby', roomId})} 
                  toGame={(roomId)=>setPage({name:'game', roomId})}
                />
                : page.name === 'lobby' ? <Lobby 
                  roomId={page.roomId} 
                  toGame={(id)=>{console.log('Navigating to game with roomId:', id); setPage({name:'game', roomId:id})}} 
                />
                : (() => {console.log('Rendering Game component with roomId:', page.roomId); return <Game roomId={page.roomId} />})()
              )}
            </Box>
          </Container>
        </Box>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
