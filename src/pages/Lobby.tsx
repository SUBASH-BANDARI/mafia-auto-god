import { useEffect, useMemo, useState } from 'react'
import { Button, Card, CardContent, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Divider, Stack, Typography, IconButton, Tooltip, Box, Chip, Alert } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PersonIcon from '@mui/icons-material/Person'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import { auth, db } from '../lib/firebase'
import { assignRoles } from '../lib/roles'
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore'
import { Phase, PlayerDoc, Room } from '../types'
import { clearRoomData, saveRoomData } from '../lib/storage'
import RoleAvatar from '../components/RoleAvatar'
import { showNotification } from '../App'

export default function Lobby({ roomId, toGame, toHome }: { roomId:string, toGame:(id:string)=>void, toHome:()=>void }) {
  const [room, setRoom] = useState<Room|null>(null)
  const [players, setPlayers] = useState<Record<string, PlayerDoc>>({})
  const [exitDialogOpen, setExitDialogOpen] = useState(false)

  useEffect(() => {
    const unsubRoom = onSnapshot(
      doc(db, 'rooms', roomId), 
      (d)=> {
        if (d.exists()) {
          const roomData = d.data() as Room
          setRoom(roomData)
          
          // Auto-navigate to game when phase changes from lobby to any game phase
          // Also navigate if player is rejoining and game is already in progress
          if (roomData.phase !== 'lobby' && roomData.phase !== 'ended' && roomData.phase !== 'assign_roles') {
            console.log('Room phase changed to:', roomData.phase, '- navigating to game')
            // Small delay to ensure state is updated
            setTimeout(() => {
              toGame(roomId)
            }, 100)
          }
        }
      },
      (error) => {
        console.error('Error listening to room:', error)
      }
    )
    const unsubPlayers = onSnapshot(
      collection(db, 'rooms', roomId, 'players'), 
      (snap)=> {
        const map: Record<string, PlayerDoc> = {}
        snap.forEach(doc => { 
          if (doc.exists()) {
            map[doc.id] = doc.data() as PlayerDoc 
          }
        })
        const playerInfo = Object.entries(map).map(([uid, p]) => `${p.displayName} (${uid.substring(0, 8)}...)`)
        console.log('Players updated:', Object.keys(map).length, 'players:', playerInfo)
        console.log('Current user UID:', auth.currentUser?.uid?.substring(0, 8) + '...')
        setPlayers(map)
      },
      (error) => {
        console.error('Error listening to players:', error)
        showNotification('Error loading players. Please check Firestore rules allow reading all players in a room.', 'error')
      }
    )
    return () => { unsubRoom(); unsubPlayers(); }
  }, [roomId, toGame])

  const isHost = room?.createdBy === auth.currentUser?.uid
  // Sort players: host first, then by name
  const playerList = useMemo(()=> {
    const entries = Object.entries(players)
    return entries.sort(([uidA, pA], [uidB, pB]) => {
      // Host first
      if (uidA === room?.createdBy) return -1
      if (uidB === room?.createdBy) return 1
      // Then by name
      return (pA.displayName || '').localeCompare(pB.displayName || '')
    })
  }, [players, room?.createdBy])

  async function startGame() {
    if (!isHost || !room) {
      console.error('Cannot start game: not host or room missing')
      return
    }
    const uids = Object.entries(players).map(([uid, p]) => uid)
    if (uids.length < 4) { 
      showNotification('Need at least 4 players to start', 'warning')
      return 
    }
    
    try {
      console.log('Starting game with players:', uids)
      const map = assignRoles(uids)
      console.log('Assigned roles:', map)
      
      // write each player's role - host can now update all player docs
      for (const uid of uids) {
        const pRef = doc(db, 'rooms', roomId, 'players', uid)
        await setDoc(pRef, { 
          role: map[uid], 
          isAlive: true, 
          nightVote: null, 
          healTarget: null, 
          dayVote: null,
          policeGuess: null
        }, { merge: true })
        console.log(`Assigned role ${map[uid]} to player ${uid}`)
      }
      
      await updateDoc(doc(db, 'rooms', roomId), { 
        phase: 'night_mafia', 
        status: 'in_progress', 
        round: 1 
      })
      console.log('Game started, navigating to game screen')
      toGame(roomId)
    } catch (error: any) {
      console.error('Error starting game:', error)
      showNotification('Failed to start game: ' + (error.message || 'Unknown error'), 'error')
    }
  }

  const playerCount = playerList.length
  const canStart = playerCount >= 4

  async function copyRoomCode() {
    if (room?.code) {
      await navigator.clipboard.writeText(room.code)
      showNotification('Room code copied to clipboard!', 'success')
    }
  }

  async function exitRoom() {
    const userId = auth.currentUser?.uid
    if (!userId) return

    try {
      // Remove player from Firestore
      const playerDoc = doc(db, 'rooms', roomId, 'players', userId)
      await deleteDoc(playerDoc)
      
      // Clear localStorage
      clearRoomData()
      
      showNotification('You have left the room', 'info')
      toHome()
    } catch (error: any) {
      console.error('Error exiting room:', error)
      showNotification('Failed to exit room: ' + (error.message || 'Unknown error'), 'error')
    }
  }

  function handleExitClick() {
    if (isHost) {
      // Host needs confirmation
      setExitDialogOpen(true)
    } else {
      // Regular player can exit directly
      exitRoom()
    }
  }

  async function refreshPlayers() {
    try {
      const playersRef = collection(db, 'rooms', roomId, 'players')
      const snap = await getDocs(playersRef)
      const map: Record<string, PlayerDoc> = {}
      snap.forEach(doc => {
        if (doc.exists()) {
          map[doc.id] = doc.data() as PlayerDoc
        }
      })
      const playerInfo = Object.entries(map).map(([uid, p]) => `${p.displayName} (${uid.substring(0, 8)}...)`)
      console.log('Manual refresh - Players found:', Object.keys(map).length, 'players:', playerInfo)
      console.log('Current user UID:', auth.currentUser?.uid?.substring(0, 8) + '...')
      setPlayers(map)
    } catch (error) {
      console.error('Error refreshing players:', error)
      showNotification('Error refreshing players', 'error')
    }
  }

  return (
    <>
      {/* Exit Room Confirmation Dialog */}
      <Dialog
        open={exitDialogOpen}
        onClose={() => setExitDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: '#1a1a1a',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        }}
      >
        <DialogTitle sx={{ color: 'text.primary', fontWeight: 600 }}>
          Exit Room?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            {isHost 
              ? "You are the host. If you exit, you'll need to create a new room. Are you sure you want to exit?"
              : "Are you sure you want to leave this room?"}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExitDialogOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              setExitDialogOpen(false)
              exitRoom()
            }} 
            variant="contained"
            sx={{ bgcolor: 'error.main', '&:hover': { bgcolor: 'error.dark' } }}
          >
            Exit
          </Button>
        </DialogActions>
      </Dialog>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Game Lobby</Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ExitToAppIcon />}
                onClick={handleExitClick}
                sx={{
                  borderColor: 'error.main',
                  color: 'error.light',
                  '&:hover': {
                    borderColor: 'error.dark',
                    bgcolor: 'rgba(239, 68, 68, 0.1)',
                  },
                }}
              >
                Exit Room
              </Button>
            </Box>
            
            {/* Room Code Section */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Room Code:
                </Typography>
                <Typography variant="h6" component="span" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {room?.code || '...'}
                </Typography>
                <Tooltip title="Copy room code">
                  <IconButton size="small" onClick={copyRoomCode}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Share this code with other players to join
              </Typography>
            </Box>

          <Divider />

          {/* Player Count Alert */}
          <Alert 
            severity={canStart ? 'success' : 'warning'} 
            icon={<PersonIcon />}
            sx={{ 
              fontSize: '0.85rem',
              py: 1,
              '& .MuiAlert-message': { fontSize: '0.85rem' },
            }}
          >
            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
              <strong>{playerCount} player{playerCount !== 1 ? 's' : ''} joined</strong>
              {canStart ? (
                ' ✓ Ready to start!'
              ) : (
                ` • Need ${4 - playerCount} more player${4 - playerCount > 1 ? 's' : ''} to start`
              )}
            </Typography>
          </Alert>

          {/* Player List */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">
                Players in room ({playerCount}):
              </Typography>
              <Tooltip title="Refresh player list">
                <IconButton size="small" onClick={refreshPlayers}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            {playerList.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No players yet... Waiting for players to join...
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {playerList.map(([uid, p]) => (
                  <Box 
                    key={uid} 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      p: 1.5,
                      bgcolor: uid === auth.currentUser?.uid ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${uid === auth.currentUser?.uid ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                      borderRadius: 2,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.05)',
                        transform: 'translateX(4px)',
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1 }}>
                      <RoleAvatar role={p.role || null} size={40} isAlive={p.isAlive} />
                      <Typography variant="body1" sx={{ fontWeight: uid === auth.currentUser?.uid ? 600 : 400 }}>
                        {p.displayName || 'Player'}
                      </Typography>
                      {uid === room?.createdBy && (
                        <Chip 
                          label="Host" 
                          size="small" 
                          sx={{ 
                            bgcolor: 'rgba(99, 102, 241, 0.2)',
                            color: '#818cf8',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            fontWeight: 600,
                          }}
                        />
                      )}
                      {uid === auth.currentUser?.uid && (
                        <Chip 
                          label="You" 
                          size="small" 
                          variant="outlined"
                          sx={{ 
                            borderColor: 'rgba(99, 102, 241, 0.5)',
                            color: '#818cf8',
                            fontWeight: 500,
                          }}
                        />
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          <Divider />

          {/* Start Game Button (Host Only) */}
          {isHost ? (
            <Stack spacing={1}>
              <Button 
                variant="contained" 
                size="large"
                onClick={startGame}
                disabled={!canStart}
                fullWidth
                sx={{ py: 1.5 }}
              >
                {canStart ? (
                  '🚀 Start Game'
                ) : (
                  `⏳ Need ${4 - playerCount} more player${4 - playerCount > 1 ? 's' : ''} to start`
                )}
              </Button>
              {!canStart && (
                <Typography variant="caption" color="text.secondary" align="center">
                  Minimum 4 players required to start the game
                </Typography>
              )}
            </Stack>
          ) : (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body2" color="text.secondary">
                ⏳ Waiting for host to start the game...
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                The game will begin automatically when the host clicks "Start Game"
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
    </>
  )
}
